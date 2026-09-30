-- ============================================================
-- 0004 — Row Level Security: scope reads to the people entitled
-- ============================================================
-- 0001 granted every authenticated user SELECT on every Pie table:
--
--     for select to authenticated using (true);
--
-- The API routes already gate writes behind `requireAdminApi()`, but
-- that is an *application-layer* check. Anyone with a valid session
-- could bypass the app entirely and read the whole Pie — every
-- participant's slices, ownership percentage, salary terms and
-- departure justification — straight from the Supabase REST API using
-- their own token. For a system whose whole purpose is to settle
-- ownership disputes ("defensible if challenged"), that is the single
-- most serious gap in the codebase.
--
-- The rule this migration enforces (decision D1: members log their own
-- time; only admins see the Pie):
--
--   pies, pie_settings_versions   admin, or a member of that Pie
--                                 (settings carry no personal data and
--                                 the member's own page needs the
--                                 project-tag list)
--   pie_participants              admin, or the participant's own row
--   everything else               admin only
--   time_logs                     admin, or the logger's own rows
--
-- Reads are scoped per-Pie rather than globally authenticated.
-- ============================================================

-- ============================================================
-- 0. Make is_admin() independent of RLS on public.users
-- ============================================================
-- Every policy below calls `public.is_admin()`, and so does 0001's
-- write policy. It reads `public.users`, which is a pre-existing table
-- whose own RLS is not defined in these migrations. If `users` ever
-- gets RLS without a self-read policy, the lookup inside `is_admin()`
-- would return nothing and every admin would silently lose access —
-- a lockout whose cause is nowhere near the symptom.
--
-- SECURITY DEFINER (plus a pinned search_path, so the function cannot
-- be redirected by a caller-controlled schema) makes the lookup run as
-- the function owner and therefore not depend on `users`' policies.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  );
$$;

-- ============================================================
-- 1. Per-Pie membership helper
-- ============================================================
-- A policy on `pies` has to ask "is the caller a participant in this
-- Pie?", which means reading `pie_participants` — whose own policy
-- would then be evaluated, and could in turn reference `pies`. That
-- recursion is what SECURITY DEFINER exists to break: the function
-- runs as its owner, so the lookup inside it is not subject to RLS.
create or replace function public.is_pie_participant(p_pie_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from pie_participants pp
    where pp.pie_id = p_pie_id
      and pp.user_id = auth.uid()
  );
$$;

comment on function public.is_pie_participant(uuid) is
  'True when the current user is a participant in the given Pie. SECURITY DEFINER so RLS policies can use it without recursing through pie_participants.';

-- ============================================================
-- 2. Replace the global read policies
-- ============================================================

-- ---------- pies: admins, or members of THAT Pie ----------
-- Note `pies` keys its own id as `id`, not `pie_id`, so it cannot share
-- the loop below.
drop policy if exists pies_read on pies;
create policy pies_member_read on pies
  for select to authenticated
  using (public.is_admin() or public.is_pie_participant(id));

-- ---------- pie_settings_versions: admins, or members of THAT Pie ----------
drop policy if exists pie_settings_versions_read on pie_settings_versions;
create policy pie_settings_versions_member_read on pie_settings_versions
  for select to authenticated
  using (public.is_admin() or public.is_pie_participant(pie_id));

-- ---------- pie_participants: admins, or your own row ----------
drop policy if exists pie_participants_read on pie_participants;
create policy pie_participants_member_read on pie_participants
  for select to authenticated
  using (public.is_admin() or user_id = auth.uid());

-- ---------- Everything else: admins only ----------
-- These tables hold other people's money and terms. There is no
-- member-facing screen that reads them, so a member has no business
-- seeing any row.
do $$
declare t text;
begin
  foreach t in array array[
    'participant_terms_versions',  -- salary / terms versions
    'contributions',               -- the ledger: slices, FMV, evidence
    'wells',                       -- the Well balance
    'well_transactions',           -- who drew down what
    'departures',                  -- separation justification + evidence
    'buyouts',                     -- buyout amounts
    'pie_freezes',                 -- ownership snapshots
    'pie_audit_log'                -- before/after history
  ] loop
    execute format('drop policy if exists %I on %I;', t || '_read', t);
    execute format(
      'create policy %I on %I for select to authenticated
         using (public.is_admin());',
      t || '_admin_read', t);
  end loop;
end $$;

-- ============================================================
-- 3. time_logs — members see and create only their own rows
-- ============================================================
-- 0002's insert policy was `with check (true)`: a member could write a
-- time log attributed to ANY user. Raw hours are the input to equity,
-- so the stamp is enforced here as well as in the route.

drop policy if exists time_logs_read on time_logs;
create policy time_logs_read on time_logs
  for select to authenticated
  using (public.is_admin() or user_id = auth.uid());

drop policy if exists time_logs_insert on time_logs;
create policy time_logs_insert on time_logs
  for insert to authenticated
  with check (public.is_admin() or user_id = auth.uid());

-- ============================================================
-- 4. payday_runs — admins only
-- ============================================================
drop policy if exists payday_runs_read on payday_runs;
create policy payday_runs_admin_read on payday_runs
  for select to authenticated
  using (public.is_admin());

-- ============================================================
-- 5. Indexes the new policies depend on
-- ============================================================
-- `is_pie_participant()` is called once per candidate row on `pies`
-- and `pie_settings_versions`, and `user_id = auth.uid()` is checked
-- on every participant/time_log read.
create index if not exists idx_participants_user
  on pie_participants(user_id)
  where user_id is not null;

create index if not exists idx_time_logs_user
  on time_logs(user_id)
  where user_id is not null;
