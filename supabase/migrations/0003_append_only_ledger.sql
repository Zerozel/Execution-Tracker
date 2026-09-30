-- ============================================================
-- 0003 — Append-only ledger (architecture decision A1)
-- ============================================================
-- The ownership maths is only defensible if the inputs can never be
-- silently rewritten. Before this migration a contribution could be
-- UPDATEd (its slice count changed, its status flipped) or DELETEd,
-- which means an ownership percentage could change with no trace of
-- why. This migration makes the two historical tables physically
-- append-only:
--
--   contributions   — the ledger ownership is computed from
--   pie_audit_log   — the record of who did what
--
-- Corrections now happen ONLY by inserting a new row that carries a
-- `reverses_id` pointing at the row it corrects. The cap table sums
-- every row, so a correcting row with a negative slice count nets the
-- original out arithmetically while BOTH rows survive for audit.
--
-- This migration also converts any rows written under the old model
-- (status 'reversed' / 'recalculated', which the old cap table filtered
-- out) into their append-only equivalent, so no existing history is
-- lost or double-counted.
-- ============================================================

-- ============================================================
-- 1. Convert legacy rows to the append-only model
-- ============================================================
-- Old model: a voided row was marked 'reversed' or 'recalculated' and
-- then EXCLUDED by the cap table. Its effect had to be re-expressed as
-- a separate row.
--
--   'reversed'      → the row was voided entirely      (net 0)
--   'recalculated'  → the row was replaced by one or more rows
--                     pointing back at it via `reverses_id`; those
--                     replacements carried the retained slices.
--
-- New model: the original row counts again (status is informational),
-- and a compensating row supplies the negative delta needed to reach
-- the same net. Both rows then remain visible forever.
--
-- Idempotent: the `not exists` guard means re-running inserts nothing.

-- 1a. 'reversed' → net must be 0, so compensate the full slice count.
insert into contributions (
  pie_id, participant_id, type, event_date, inputs, config_snapshot,
  fmv_minor, multiplier_kind, multiplier_applied, slices,
  notes, status, reverses_id, created_by
)
select
  c.pie_id,
  c.participant_id,
  c.type,
  c.event_date,
  jsonb_build_object('legacy_conversion', true, 'legacy_status', c.status),
  c.config_snapshot,
  0,                     -- no new money at risk
  'none',
  1,                     -- already at cash value; de-multiplier is a no-op
  -c.slices,
  'Append-only conversion (0003): compensates a legacy ''reversed'' row.',
  'active',
  c.id,
  c.created_by
from contributions c
where c.status = 'reversed'
  and not exists (
    select 1 from contributions r
    where r.reverses_id = c.id
      and r.notes like 'Append-only conversion (0003%'
  );

-- 1b. 'recalculated' → net must equal the sum of its replacement rows.
-- The replacements (already inserted by the old departure route) point
-- at the original through `reverses_id`; we subtract the original's
-- full count and add them back.
insert into contributions (
  pie_id, participant_id, type, event_date, inputs, config_snapshot,
  fmv_minor, multiplier_kind, multiplier_applied, slices,
  notes, status, reverses_id, created_by
)
select
  c.pie_id,
  c.participant_id,
  c.type,
  c.event_date,
  jsonb_build_object('legacy_conversion', true, 'legacy_status', c.status),
  c.config_snapshot,
  0,
  'none',
  1,
  -c.slices + coalesce(kept.total, 0),
  'Append-only conversion (0003): compensates a legacy ''recalculated'' row.',
  'active',
  c.id,
  c.created_by
from contributions c
left join lateral (
  select sum(r.slices) as total
  from contributions r
  where r.reverses_id = c.id
    and r.status = 'active'
    and r.notes not like 'Append-only conversion (0003%'
) kept on true
where c.status = 'recalculated'
  and not exists (
    select 1 from contributions r
    where r.reverses_id = c.id
      and r.notes like 'Append-only conversion (0003%'
  );

-- 1c. The original rows are now ordinary ledger rows again.
-- (Run BEFORE the triggers below are installed.)
update contributions
set status = 'active'
where status in ('reversed', 'recalculated');

-- 1d. Also flip the legacy replacement rows' `multiplier_applied` from
-- 0 to 1 for the same reason as 1a: they are already-de-multiplied
-- retained amounts, and a 0 multiplier would make `deMultipliedSlices`
-- treat them as a divide-by-zero case.
update contributions
set multiplier_applied = 1
where multiplier_applied = 0
  and status = 'active'
  and reverses_id is not null;

-- ============================================================
-- 2. Tighten the guard rails
-- ============================================================
-- A trigger is used rather than REVOKE because the roles differ
-- between environments (Supabase grants table privileges to
-- `authenticated`), and a trigger can raise a message that names the
-- offending row and tells the operator what to do instead.

create or replace function public.pie_ledger_append_only()
returns trigger
language plpgsql
as $$
begin
  -- Cascading deletes arrive here at trigger depth > 1: a Pie (or a
  -- participant) being removed takes its history with it. That is a
  -- deliberate administrative act on the parent, not a silent edit of
  -- the ledger, so it is allowed through.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;

  raise exception
    using
      errcode = 'restrict_violation',
      message = format(
        'The %s ledger is append-only; row %s cannot be %s.',
        tg_table_name,
        coalesce(old.id::text, '<new>'),
        lower(tg_op)
      ),
      detail = case
        when tg_table_name = 'contributions' then
          'Insert a new row instead: set `reverses_id` to the row you are correcting and give it the slice delta (negative to remove slices). The cap table sums every row, so the original and the correction cancel out arithmetically and both remain auditable.'
        else
          'The audit log records what happened; it cannot be rewritten. Append a new entry.'
      end,
      hint = 'See supabase/migrations/0003_append_only_ledger.sql.';
end $$;

drop trigger if exists contributions_append_only on contributions;
create trigger contributions_append_only
  before update or delete on contributions
  for each row execute function public.pie_ledger_append_only();

drop trigger if exists pie_audit_log_append_only on pie_audit_log;
create trigger pie_audit_log_append_only
  before update or delete on pie_audit_log
  for each row execute function public.pie_ledger_append_only();

-- ============================================================
-- 3. Supporting index
-- ============================================================
-- Corrections are looked up by the row they reverse (cap-table
-- drill-down, the legacy-conversion guards above, and the audit view).
create index if not exists idx_contributions_reverses
  on contributions(reverses_id)
  where reverses_id is not null;

-- Drop the now-misleading old index: `status` is informational only and
-- is no longer used as a filter anywhere in the app.
drop index if exists idx_contributions_participant;
create index if not exists idx_contributions_participant
  on contributions(participant_id, event_date);
