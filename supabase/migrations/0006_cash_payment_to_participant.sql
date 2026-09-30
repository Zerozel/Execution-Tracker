-- ============================================================
-- 0006 — §15/§20: cash payments to a participant
-- ============================================================
-- A payment made BY the Pie TO a participant draws their slices down.
-- It is recorded in the same append-only ledger as everything else, as a
-- row whose `fmv_minor` and `slices` are NEGATIVE. The cap table sums
-- every row, so the payment nets out on its own — no UPDATE, no DELETE
-- and no reversing row are needed. This is exactly the pattern 0003
-- already uses for its own conversions.
--
-- HARD-VAL-004 ("the model will not allocate negative slices") governs
-- how much a payment may remove: it draws cash-type contributions down
-- first and then non-cash, and whatever is left over when the
-- participant's at-risk balance reaches zero is recorded on the row but
-- converted to no slices. The balance floors at zero; the sign
-- convention described above is about the ROW, not the balance.
--
-- There is deliberately no CHECK constraint forbidding negative values
-- on this table: a negative row has been the correct representation of a
-- correction since 0003, and adding one now would reject the very rows
-- that migration relies on.
--
-- Backfill: none is needed. A Pie that has never edited its contribution
-- type list stores no `enabled_contribution_types` override at all
-- (`diffFromDefaults` persists only what differs from the shipped
-- defaults), so it resolves to ALL_CONTRIBUTION_TYPES and picks this type
-- up by itself. A Pie whose admin explicitly curated its type list keeps
-- that list untouched, which is the right outcome — they chose it.
-- ============================================================

-- `alter type ... add value` is permitted inside a transaction from
-- PostgreSQL 12 onwards, but the new value may not be USED in that same
-- transaction. Supabase runs each migration file as its own transaction,
-- so this file must not insert or reference a 'cash_payment_to_participant'
-- row. `comment on type` only touches the catalogue and is safe here.
alter type contribution_type
  add value if not exists 'cash_payment_to_participant';

comment on type contribution_type is
  'Contribution categories (§4). Sign convention: every type is a POSITIVE accrual except cash_payment_to_participant, which is a WITHDRAWAL — a payment out of the Pie to a participant, stored with negative fmv_minor and negative slices so the cap table (which sums every row) nets it out (§15, §20 HARD-VAL-004).';

comment on column contributions.fmv_minor is
  'Fair-market value frozen at calculation time, in minor units. Positive for every accrual; negative for a withdrawal such as cash_payment_to_participant. Authoritative for de-multiplied (cash-value) recovery calculations — see deMultipliedSlices() in lib/slicing-pie/engine/recovery-categories.ts.';

comment on column contributions.inputs is
  'Raw type-specific inputs, plus any server-resolved values the entry depended on: advisor_time stores cumulative_hours_before (the §4.3 gate), and cash_payment_to_participant stores cash_drawdown_minor / non_cash_drawdown_minor / overflow_minor (the planned HARD-VAL-004 split), so the arithmetic can be reconstructed without rebuilding the balance as it stood that day.';
