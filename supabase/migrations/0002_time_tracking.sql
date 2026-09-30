-- ============================================================
-- Execution Tracker — Slicing Pie: Time Tracking & Payday
-- ============================================================
-- Adds self-service hourly time logging plus a month-end "payday"
-- that converts pending logs into immutable `time` contributions
-- (slices) using each participant's fair-market salary.
--
-- Design notes:
--   • time_logs are lightweight, member-writable rows. They hold
--     RAW hours only — no slice math — until payday converts them.
--   • client_uuid gives OFFLINE idempotency: a queued log synced
--     twice is de-duplicated by the unique constraint.
--   • Conversion is prospective & auditable: each log becomes its
--     own `time` contribution at its work_date, using the FMV/config
--     effective on that date (mirrors §21 / EDGE-024).
-- ============================================================

do $$ begin
  create type time_log_status as enum ('pending', 'converted', 'void');
exception when duplicate_object then null; end $$;

-- ---------- Self-service time logs ----------
create table if not exists time_logs (
  id              uuid primary key default gen_random_uuid(),
  pie_id          uuid not null references pies(id) on delete cascade,
  participant_id  uuid not null references pie_participants(id) on delete cascade,
  user_id         uuid references auth.users(id) on delete set null,
  work_date       date not null,
  hours           numeric(6,2) not null check (hours > 0 and hours <= 24),
  notes           text,
  project_tag     text,
  status          time_log_status not null default 'pending',
  contribution_id uuid references contributions(id) on delete set null,
  payday_run_id   uuid,                       -- set when converted (see below)
  client_uuid     uuid unique,                -- offline idempotency key
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_time_logs_pie_status
  on time_logs(pie_id, status);
create index if not exists idx_time_logs_participant
  on time_logs(participant_id, work_date);

-- ---------- Payday runs (audit of each conversion batch) ----------
create table if not exists payday_runs (
  id                 uuid primary key default gen_random_uuid(),
  pie_id             uuid not null references pies(id) on delete cascade,
  period_start       date not null,
  period_end         date not null,
  logs_converted     integer not null default 0,
  participants_count integer not null default 0,
  total_hours        numeric(12,2) not null default 0,
  total_slices       numeric(20,4) not null default 0,
  note               text,
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now()
);
create index if not exists idx_payday_runs_pie on payday_runs(pie_id, period_end);

-- Link converted logs back to their run.
do $$ begin
  alter table time_logs
    add constraint time_logs_payday_run_fk
    foreign key (payday_run_id) references payday_runs(id) on delete set null;
exception when duplicate_object then null; end $$;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table time_logs    enable row level security;
alter table payday_runs  enable row level security;

-- payday_runs: authenticated read, admin write (matches 0001 convention).
do $$ begin
  create policy payday_runs_read on payday_runs
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy payday_runs_admin_write on payday_runs
    for all to authenticated
    using (public.is_admin()) with check (public.is_admin());
exception when duplicate_object then null; end $$;

-- time_logs: authenticated read; members may INSERT their own logs
-- (ownership is enforced at the API layer, which stamps user_id from
-- the session); only admins may UPDATE/DELETE (payday marks converted).
do $$ begin
  create policy time_logs_read on time_logs
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy time_logs_insert on time_logs
    for insert to authenticated with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy time_logs_admin_update on time_logs
    for update to authenticated
    using (public.is_admin()) with check (public.is_admin());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy time_logs_admin_delete on time_logs
    for delete to authenticated using (public.is_admin());
exception when duplicate_object then null; end $$;
