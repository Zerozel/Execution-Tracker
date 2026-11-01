-- ============================================================
-- 0014 — Prevent duplicate participants per Pie
-- ============================================================
-- A user should be a participant in a Pie at most once. External
-- participants (no linked user) can share display names because
-- they are real people who might not be in the app.
--
-- The partial unique index allows:
--   • One row per (pie_id, user_id) when user_id is not null
--   • Many rows with user_id null (external participants)
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_unique_user_per_pie
  ON pie_participants(pie_id, user_id)
  WHERE user_id IS NOT NULL;

COMMENT ON INDEX public.idx_participants_unique_user_per_pie IS
  'A linked user can participate in a Pie only once. External participants (user_id IS NULL) are exempt. Added by migration 0014 to prevent the duplicate-participant bug caused by network retries and double-clicks.';
