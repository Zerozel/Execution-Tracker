-- ============================================================
-- 0008 — Lock the Pie tables to the service role
-- ============================================================
-- 0004 tightened RLS so that reads were scoped to "an admin, or a
-- member of that Pie", evaluated through `public.is_admin()` and
-- `public.is_pie_participant()` — both of which call `auth.uid()`.
--
-- That is the right kind of rule for an app that uses Supabase Auth.
-- This app does not. It authenticates with its own cookie (see
-- lib/auth.ts), so `auth.uid()` is null on every request, and the anon
-- key matches no policy in either 0001 or 0004:
--
--   • `to authenticated` never matches a caller with no session;
--   • per-user scoping has no user to scope to.
--
-- Which means the Pie feature reads nothing at all through the anon
-- key. The app therefore reads with the SERVICE ROLE (lib/supabase.ts),
-- which is not subject to RLS, and enforces "only admins see the Pie"
-- in the application layer, where the role logic already lives:
-- `requireAdminApi()`, `requireUser()`, and per-route scoping.
--
-- This migration makes that arrangement explicit and safe:
--
--   1. `anon` is revoked outright. The anon key ships inside the
--      browser bundle, so it is public by construction; it must unlock
--      NOTHING. Today it unlocks nothing by accident of policy shape —
--      this makes it a decision.
--   2. The 0004 policies are left in place. They are inert now, and
--      they become correct the day someone puts the app behind
--      Supabase Auth, which is the only change that would make
--      per-user scoping possible at the database layer.
--
-- Verifying this by hand (Supabase SQL editor):
--
--   -- as anon: must return 0 rows for every one of these
--   select count(*) from contributions;
--   select count(*) from pie_participants;
--   select count(*) from pies;
--
--   -- as an authenticated non-admin: must return 0 rows for the
--   -- tables listed in 0004 §2 (contributions, wells, departures, …)
--   -- and only their own row from pie_participants.
-- ============================================================

-- ============================================================
-- 1. Revoke the anon role from every Pie table
-- ============================================================
-- RLS policies deny by default when no policy matches, so this is
-- belt-and-braces. It is worth both: a policy can be edited by mistake,
-- and a GRANT is the coarser, more obvious statement of intent.
do $$
declare t text;
begin
  foreach t in array array[
    'pies',
    'pie_settings_versions',
    'pie_participants',
    'participant_terms_versions',
    'contributions',
    'wells',
    'well_transactions',
    'departures',
    'buyouts',
    'pie_freezes',
    'pie_audit_log',
    'time_logs',
    'payday_runs'
  ] loop
    execute format('revoke all on table %I from anon;', t);
  end loop;
end $$;

-- Sequences, if any of these tables ever grows a serial column.
do $$
declare s text;
begin
  for s in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'S'
  loop
    execute format('revoke all on sequence %I from anon;', s);
  end loop;
end $$;

-- ============================================================
-- 2. Say it in the schema, not only in this file
-- ============================================================
comment on table public.contributions is
  'Append-only ledger of Pie contributions (A1). Read by the app server through the service role; RLS denies anon and unauthenticated callers entirely — see migration 0008.';

comment on table public.pie_participants is
  'Membership of a Pie. The app server scopes reads to the caller''s own row for member-facing views (D1); RLS is the backstop, not the mechanism — see migration 0008.';
