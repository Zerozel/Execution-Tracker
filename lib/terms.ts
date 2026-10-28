// ============================================================
// Execution Tracker — Terms & Conditions helpers
// ============================================================
// The single source of truth for:
//   • The current terms version and its effective date
//   • Whether a specific user has accepted the current version
//   • Reading and updating acceptance progress
//
// To bump the terms:
//   1. Add content/terms/v<new>.md
//   2. Change CURRENT_TERMS_VERSION below
//   3. Change CURRENT_TERMS_EFFECTIVE_DATE below
//   4. Deploy
//
// Every user is then prompted on their next visit to read and
// accept the new version. Their prior acceptances remain on record.
// ============================================================

import { createClient } from "@/lib/supabase";

// ------------------------------------------------------------
// Current version constants
// ------------------------------------------------------------
// Bump these together when the terms text changes.
export const CURRENT_TERMS_VERSION = "1.0" as const;
export const CURRENT_TERMS_EFFECTIVE_DATE = "2026-10-28" as const;

// How many confirmations the user must make before acceptance is
// recorded. Each confirmation is a separate POST to the server, on a
// freshly loaded page. This is what makes the acceptance deliberate.
export const TERMS_CONFIRMATION_STEPS = 3;

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

export interface TermsStatus {
  /** The current version constant. */
  current_version: string;
  /** When this version took effect. */
  effective_date: string;
  /** True if the user has accepted the current version. */
  accepted: boolean;
  /** When the user accepted the current version, if accepted. */
  accepted_at: string | null;
  /** If not accepted, how many steps the user has completed (0..3). */
  steps_completed: number;
  /** Total confirmations required before completion. */
  steps_required: number;
  /** True if the admin has recorded a physical signed copy for this user. */
  physical_signed: boolean;
}

// ------------------------------------------------------------
// Status reader
// ------------------------------------------------------------

/**
 * Read the current terms status for a user. Used by:
 *   • GET /api/terms/status
 *   • The /terms page, before rendering the form
 *   • The dashboard layout, to decide whether to redirect
 *
 * Safe to call from server components and route handlers.
 */
export async function getTermsStatus(userId: string): Promise<TermsStatus> {
  const supabase = await createClient();

  // 1. Has the user accepted the current version?
  const { data: acceptance } = await supabase
    .from("terms_acceptances")
    .select("accepted_at")
    .eq("user_id", userId)
    .eq("terms_version", CURRENT_TERMS_VERSION)
    .maybeSingle();

  // 2. Is the user mid-acceptance for the current version?
  //    (pending row exists only for in-progress flows)
  const { data: pending } = await supabase
    .from("terms_pending_acceptance")
    .select("steps_completed, terms_version")
    .eq("user_id", userId)
    .maybeSingle();

  // The pending row is only relevant if it matches the current version.
  const stepsCompleted =
    pending && pending.terms_version === CURRENT_TERMS_VERSION
      ? (pending.steps_completed ?? 0)
      : 0;

  // 3. Has the admin confirmed a physical signature?
  const { data: userRow } = await supabase
    .from("users")
    .select("terms_physical_signed_at")
    .eq("id", userId)
    .maybeSingle();

  return {
    current_version: CURRENT_TERMS_VERSION,
    effective_date: CURRENT_TERMS_EFFECTIVE_DATE,
    accepted: !!acceptance,
    accepted_at: acceptance?.accepted_at ?? null,
    steps_completed: stepsCompleted,
    steps_required: TERMS_CONFIRMATION_STEPS,
    physical_signed: !!userRow?.terms_physical_signed_at,
  };
}

// ------------------------------------------------------------
// Progress writer
// ------------------------------------------------------------

/**
 * Record one confirmation. Called by POST /api/terms/accept-step.
 *
 * The state machine:
 *   no pending row       → create with steps_completed = 1
 *   pending, steps = 1   → update to 2
 *   pending, steps = 2   → update to 3
 *   pending, steps = 3   → COMPLETE:
 *                            • insert terms_acceptances
 *                            • delete terms_pending_acceptance
 *                            • return { completed: true }
 *
 * Idempotency: if the user already has an acceptance for the current
 * version, no work is done — return { completed: true } so the caller
 * can redirect. This handles double-submits.
 *
 * Returns the new step count (1..3) or `completed: true`.
 */
export async function recordConfirmationStep(
  userId: string,
  ipAddress: string | null,
  userAgent: string | null
): Promise<
  | { completed: true; accepted_at: string }
  | { completed: false; steps_completed: number; steps_required: number }
> {
  const supabase = await createClient();

  // Idempotency: if the user is already accepted for the current
  // version, short-circuit. (Double-submit, or a stale page.)
  const { data: existing } = await supabase
    .from("terms_acceptances")
    .select("accepted_at")
    .eq("user_id", userId)
    .eq("terms_version", CURRENT_TERMS_VERSION)
    .maybeSingle();

  if (existing) {
    return { completed: true, accepted_at: existing.accepted_at };
  }

  // Load any pending row.
  const { data: pending } = await supabase
    .from("terms_pending_acceptance")
    .select("steps_completed, terms_version")
    .eq("user_id", userId)
    .maybeSingle();

  // If the pending row is for a stale version, reset it.
  const currentSteps =
    pending && pending.terms_version === CURRENT_TERMS_VERSION
      ? (pending.steps_completed ?? 0)
      : 0;

  const nextSteps = currentSteps + 1;

  // Case A: this confirmation completes the flow.
  if (nextSteps >= TERMS_CONFIRMATION_STEPS) {
    const now = new Date().toISOString();

    // Insert the acceptance record.
    const { error: acceptError } = await supabase
      .from("terms_acceptances")
      .insert({
        user_id: userId,
        terms_version: CURRENT_TERMS_VERSION,
        accepts_physical: true,
        ip_address: ipAddress,
        user_agent: userAgent,
      });

    if (acceptError) {
      throw new Error(
        `Failed to record terms acceptance: ${acceptError.message}`
      );
    }

    // Delete the pending row (if any).
    await supabase
      .from("terms_pending_acceptance")
      .delete()
      .eq("user_id", userId);

    return { completed: true, accepted_at: now };
  }

  // Case B: still in progress. Upsert the pending row with the new count.
  const { error: pendingError } = await supabase
    .from("terms_pending_acceptance")
    .upsert(
      {
        user_id: userId,
        terms_version: CURRENT_TERMS_VERSION,
        steps_completed: nextSteps,
        last_step_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (pendingError) {
    throw new Error(
      `Failed to record terms step: ${pendingError.message}`
    );
  }

  return {
    completed: false,
    steps_completed: nextSteps,
    steps_required: TERMS_CONFIRMATION_STEPS,
  };
}

// ------------------------------------------------------------
// Small helpers for other parts of the app
// ------------------------------------------------------------

/**
 * Convenience: has this user accepted the current version?
 * Used by middleware-adjacent code (dashboard layout, login route).
 */
export async function userHasAcceptedCurrentTerms(
  userId: string
): Promise<boolean> {
  const status = await getTermsStatus(userId);
  return status.accepted;
}

/**
 * The version-and-date badge shown on the /terms page header.
 * Returned as a string so tests can assert it.
 */
export function termsVersionLabel(): string {
  return `v${CURRENT_TERMS_VERSION} — effective ${CURRENT_TERMS_EFFECTIVE_DATE}`;
}
