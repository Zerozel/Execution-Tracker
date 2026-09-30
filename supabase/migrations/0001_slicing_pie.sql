-- ============================================================
-- Execution Tracker — Slicing Pie Module: Initial Schema
-- ============================================================
-- Design notes:
--   • Money is stored as INTEGER minor units (cents). No floats.
--   • Every contribution carries a frozen `config_snapshot` (jsonb)
--     so historical rows are never affected by later setting edits
--     (PROSPECTIVE-ONLY guarantee, requirements §21 / EDGE-024).
--   • Settings live in effective-dated version rows; the app layers
--     them over shipped defaults via resolveConfig().
--   • RLS mirrors the app convention: admins write, members read.
-- ============================================================

-- ---------- Enums ----------
do $$ begin
  create type pie_status as enum ('setup', 'active', 'frozen');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pie_role as enum
    ('owner', 'executive', 'employee', 'advisor', 'contractor', 'investor');
exception when duplicate_object then null; end $$;

do $$ begin
  create type participant_status as enum
    ('candidate', 'active', 'departed', 'bought_out', 'absentee');
exception when duplicate_object then null; end $$;

do $$ begin
  create type contribution_type as enum (
    'time', 'contractor_time', 'advisor_time', 'expense',
    'well_deposit', 'well_withdrawal', 'loan_payment', 'loan_missed_payment',
    'equipment', 'idea_royalty', 'commission', 'finder_fee',
    'partner_vendor', 'referral', 'facilities', 'personal_car', 'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type contribution_status as enum ('active', 'reversed', 'recalculated');
exception when duplicate_object then null; end $$;

do $$ begin
  create type multiplier_kind as enum ('cash', 'non_cash', 'none');
exception when duplicate_object then null; end $$;

do $$ begin
  create type departure_reason as enum
    ('fired_good_reason', 'fired_no_good_reason',
     'resigned_good_reason', 'resigned_no_good_reason');
exception when duplicate_object then null; end $$;

do $$ begin
  create type leaver_kind as enum ('bad', 'good');
exception when duplicate_object then null; end $$;

do $$ begin
  create type buyout_kind as enum ('forced', 'voluntary');
exception when duplicate_object then null; end $$;

do $$ begin
  create type freeze_trigger as enum ('breakeven', 'series_a');
exception when duplicate_object then null; end $$;

-- ---------- Core tables ----------
create table if not exists pies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  currency    text not null default 'USD',
  status      pie_status not null default 'setup',
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  frozen_at   timestamptz
);

create table if not exists pie_settings_versions (
  id             uuid primary key default gen_random_uuid(),
  pie_id         uuid not null references pies(id) on delete cascade,
  settings       jsonb not null default '{}'::jsonb, -- partial overrides only
  effective_from date not null default current_date,
  note           text,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists idx_settings_versions_pie
  on pie_settings_versions(pie_id, effective_from);

create table if not exists pie_participants (
  id                uuid primary key default gen_random_uuid(),
  pie_id            uuid not null references pies(id) on delete cascade,
  user_id           uuid references auth.users(id) on delete set null,
  display_name      text not null,
  pie_role          pie_role not null,
  status            participant_status not null default 'candidate',
  advisor_cap_opt_in boolean not null default false,
  joined_at         date,
  created_at        timestamptz not null default now()
);
create index if not exists idx_participants_pie on pie_participants(pie_id);

create table if not exists participant_terms_versions (
  id                       uuid primary key default gen_random_uuid(),
  participant_id           uuid not null references pie_participants(id) on delete cascade,
  fair_market_salary_minor bigint,   -- annual, for time contributions
  contractor_rate_minor    bigint,   -- hourly, for contractors
  working_hours_override   integer,  -- per-participant hours/yr (if enabled)
  effective_from           date not null default current_date,
  note                     text,
  created_by               uuid references auth.users(id) on delete set null,
  created_at               timestamptz not null default now()
);
create index if not exists idx_terms_versions_participant
  on participant_terms_versions(participant_id, effective_from);

-- ---------- The immutable ledger ----------
create table if not exists contributions (
  id                uuid primary key default gen_random_uuid(),
  pie_id            uuid not null references pies(id) on delete cascade,
  participant_id    uuid not null references pie_participants(id) on delete cascade,
  type              contribution_type not null,
  event_date        date not null,
  inputs            jsonb not null default '{}'::jsonb,
  config_snapshot   jsonb not null,           -- frozen PieSettings at calc time
  fmv_minor         bigint not null default 0,
  multiplier_kind   multiplier_kind not null default 'none',
  multiplier_applied numeric(10,4) not null default 0,
  slices            numeric(20,4) not null default 0,
  notes             text,
  evidence_url      text,
  project_tag       text,
  status            contribution_status not null default 'active',
  reverses_id       uuid references contributions(id) on delete set null,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now()
);
create index if not exists idx_contributions_pie on contributions(pie_id, event_date);
create index if not exists idx_contributions_participant
  on contributions(participant_id, status);

-- ---------- The Well (§4.5) ----------
create table if not exists wells (
  id         uuid primary key default gen_random_uuid(),
  pie_id     uuid not null unique references pies(id) on delete cascade,
  balance_minor bigint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists well_transactions (
  id                     uuid primary key default gen_random_uuid(),
  well_id                uuid not null references wells(id) on delete cascade,
  participant_id         uuid references pie_participants(id) on delete set null,
  kind                   text not null check (kind in ('deposit','withdrawal')),
  amount_minor           bigint not null,
  finder_fee_recipient_id uuid references pie_participants(id) on delete set null,
  allocation_snapshot    jsonb,
  note                   text,
  created_by             uuid references auth.users(id) on delete set null,
  created_at             timestamptz not null default now()
);
create index if not exists idx_well_tx_well on well_transactions(well_id);

-- ---------- Departures / buyouts / freeze (§14, §17) ----------
create table if not exists departures (
  id                uuid primary key default gen_random_uuid(),
  participant_id    uuid not null references pie_participants(id) on delete cascade,
  reason            departure_reason not null,
  leaver_kind       leaver_kind not null,
  departure_date    date not null,
  justification     text,
  evidence_url      text,
  recovery_snapshot jsonb,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now()
);
create index if not exists idx_departures_participant on departures(participant_id);

create table if not exists buyouts (
  id                   uuid primary key default gen_random_uuid(),
  participant_id       uuid not null references pie_participants(id) on delete cascade,
  kind                 buyout_kind not null,
  slices_bought        numeric(20,4) not null default 0,
  rate_per_slice_minor bigint not null default 0,
  amount_minor         bigint not null default 0,
  executed_at          timestamptz,
  clawback_until       date,
  clawback_paid_minor  bigint,
  created_by           uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now()
);
create index if not exists idx_buyouts_participant on buyouts(participant_id);

create table if not exists pie_freezes (
  id                 uuid primary key default gen_random_uuid(),
  pie_id             uuid not null references pies(id) on delete cascade,
  trigger            freeze_trigger not null,
  ownership_snapshot jsonb not null,
  reversible         boolean not null default false,
  reactivated_at     timestamptz,
  note               text,
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now()
);
create index if not exists idx_freezes_pie on pie_freezes(pie_id);

-- ---------- Audit log (§18) ----------
create table if not exists pie_audit_log (
  id             uuid primary key default gen_random_uuid(),
  pie_id         uuid not null references pies(id) on delete cascade,
  actor_id       uuid references auth.users(id) on delete set null,
  action         text not null,
  entity_type    text not null,
  entity_id      uuid,
  before         jsonb,
  after          jsonb,
  effective_from date,
  created_at     timestamptz not null default now()
);
create index if not exists idx_audit_pie on pie_audit_log(pie_id, created_at);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table pies                        enable row level security;
alter table pie_settings_versions       enable row level security;
alter table pie_participants            enable row level security;
alter table participant_terms_versions  enable row level security;
alter table contributions               enable row level security;
alter table wells                       enable row level security;
alter table well_transactions           enable row level security;
alter table departures                  enable row level security;
alter table buyouts                     enable row level security;
alter table pie_freezes                 enable row level security;
alter table pie_audit_log               enable row level security;

-- Helper: is the current user an app admin?
-- Mirrors the existing app convention (public.users.role = 'admin').
create or replace function public.is_admin()
returns boolean language sql stable as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  );
$$;

-- Authenticated users may READ pie data; only admins may WRITE.
do $$
declare t text;
begin
  foreach t in array array[
    'pies','pie_settings_versions','pie_participants',
    'participant_terms_versions','contributions','wells',
    'well_transactions','departures','buyouts','pie_freezes','pie_audit_log'
  ] loop
    execute format(
      'create policy %I on %I for select to authenticated using (true);',
      t || '_read', t);
    execute format(
      'create policy %I on %I for all to authenticated using (public.is_admin()) with check (public.is_admin());',
      t || '_admin_write', t);
  end loop;
end $$;
