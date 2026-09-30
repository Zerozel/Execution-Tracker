-- ============================================================
-- 0007 — Default operating currency becomes Naira (NGN)
-- ============================================================
-- CONFIG-007: a Pie runs in exactly ONE currency and no exchange rate is
-- ever applied. That makes the currency the least reversible setting in
-- the system — every contribution freezes the config it was valued
-- under — so this migration changes the DEFAULT only, and does not touch
-- any Pie that deliberately chose something else.
--
-- Two stores hold a currency, and only one of them needs a backfill:
--
--   1. pies.currency — a real column with a DB default of 'USD'. Changed
--      below, and existing rows are flipped.
--
--   2. pie_settings_versions.settings — the JSON override blob. This one
--      needs NO backfill, and that is worth understanding rather than
--      taking on faith. Only the DIFF FROM DEFAULTS is persisted, and
--      'USD' *was* the default, so any Pie that never deliberately chose
--      a currency has no `currency` key stored at all. Those Pies
--      therefore resolve to the new DEFAULT_PIE_SETTINGS.currency the
--      moment the app ships — automatically NGN.
--
-- The backfill below is the honest reading of "the default was USD": the
-- only way a row says 'USD' is that it was created by that default. If a
-- Pie genuinely needs USD, change it on the Settings screen afterwards —
-- that is now a real, audited, versioned action rather than a code edit.
-- ============================================================

alter table pies
  alter column currency set default 'NGN';

comment on column pies.currency is
  'CONFIG-007 operating currency (ISO 4217). Naira (NGN) is the shipped default. A Pie operates in exactly one currency and no FX conversion is ever applied, so changing this after contributions exist does not restate their value.';

-- Flip Pies created under the old default. Safe to re-run.
update pies
   set currency = 'NGN'
 where currency = 'USD';

-- Note: `alter table ... alter column ... set default` is a metadata-only
-- change in PostgreSQL 11+, so this does not rewrite the table.
