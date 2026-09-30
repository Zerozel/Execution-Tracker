-- ============================================================
-- 0005 — A referral can only be granted once
-- ============================================================
-- CONFIG-016 says a referral fee is not earned until the referred hire
-- has stayed the waiting period. The referral is therefore recorded on
-- the day it is entered as a row holding no slices (inputs
-- `referral_pending: true`, `referral_grants_on: <date>`), and a later
-- row carrying the slices is appended when that date arrives, linked
-- back through `inputs.vests_referral`.
--
-- That link is a read-then-write in the route: check whether a grant
-- exists, then insert one. Two admins clicking at the same moment, or
-- one admin double-clicking, both pass the read and both insert — and
-- the participant is paid the referral fee twice, which the cap table
-- would faithfully sum because summing every row is the whole point of
-- the append-only model (0003). A wrong number that the ledger records
-- consistently is worse than an error, because nothing looks broken.
--
-- So the uniqueness is enforced here instead of in application code.
-- The partial unique index below makes a second grant physically
-- impossible. The route's own check becomes a courtesy that produces a
-- friendly message rather than the mechanism that keeps the books
-- right — which is what it should have been all along.
--
-- Note this is an expression index on a jsonb field. `->>` is immutable,
-- so it is indexable, and the `where` clause keeps every ordinary
-- contribution (the overwhelming majority) out of the index entirely.
-- ============================================================

create unique index if not exists idx_contributions_vests_referral
  on contributions ((inputs ->> 'vests_referral'))
  where inputs ? 'vests_referral';

comment on index public.idx_contributions_vests_referral is
  'One grant row per pending referral (CONFIG-016). A referral recorded with inputs.referral_pending is paid out exactly once, by the row whose inputs.vests_referral points at it.';
