// ============================================================
// Execution Tracker — GET & POST /api/pies/[id]/referrals
// ============================================================
// CONFIG-016: a referral fee is not earned until the referred hire has
// stayed the configured waiting period.
//
// A referral is RECORDED the moment it is entered, as a row holding no
// slices and no value, carrying the date it becomes grantable
// (`referral_grants_on`). Nothing about it touches the cap table until
// then — which is the point: an unvested referral must not dilute
// anybody.
//
// GET  → the referrals still waiting, and when each one switches on.
// POST → grant every referral whose date has arrived, by appending a
//        second row that carries the slices. The pending row is left
//        exactly as it was (§21), so the history reads as
//        "recorded on X, granted on Y".
//
// The grant row is NOT a correction row: it does not set `reverses_id`.
// `reverses_id` means "this row cancels out that one", and the pending
// row is not being cancelled — it was written correctly for the day it
// was written, holding nothing because nothing had been earned yet. All
// the departure and buyout routes do carry deltas that net their
// original out; if this row claimed the same link, a later drill-down
// would report a grant as a correction and any aggregation grouped by
// `reverses_id` would double-count it. The link that does exist —
// "this grant pays out that pending row" — is `inputs.vests_referral`,
// and migration 0005 makes it unique so a referral can never be granted
// twice, whatever the application does.
//
// The grant is computed from the settings FROZEN ON THE PENDING ROW, not
// from settings as they stand today — the referral was earned under the
// terms in force when it was logged, and later changes to the rate or
// the waiting period must not retroactively rewrite it.
//
// Admin only.
// ============================================================

import { createClient } from "@/lib/supabase";
import {
  ok,
  fail,
  requireUser,
  requireAdminApi,
  writeAudit,
  isUuid,
  todayISO,
} from "@/lib/slicing-pie/server/context";
import { computeSlices } from "@/lib/slicing-pie/engine/calculate";
import type { Contribution, PieSettings } from "@/types/slicing-pie";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** A pending referral, as stored. */
interface PendingReferral extends Contribution {
  inputs: {
    referral_pending?: boolean;
    referral_grants_on?: string;
    fee_minor?: number;
    hired_on?: string;
    [key: string]: unknown;
  };
}

/** Load this Pie's referral rows that hold no slices yet. */
async function loadPendingReferrals(
  supabase: Awaited<ReturnType<typeof createClient>>,
  pieId: string
): Promise<PendingReferral[]> {
  const { data, error } = await supabase
    .from("contributions")
    .select("*")
    .eq("pie_id", pieId)
    .eq("type", "referral")
    .eq("inputs->>referral_pending", "true");
  if (error) throw error;
  return (data ?? []) as PendingReferral[];
}

/** Whether a pending referral has already been granted. */
async function alreadyGranted(
  supabase: Awaited<ReturnType<typeof createClient>>,
  pendingId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("contributions")
    .select("id")
    .eq("inputs->>vests_referral", pendingId)
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { response } = await requireUser();
    if (response) return response;

    const { id } = await context.params;
    if (!isUuid(id)) return fail("Invalid pie id", 400);

    const supabase = await createClient();
    const pending = await loadPendingReferrals(supabase, id);

    const today = todayISO();
    const rows = [];
    for (const p of pending) {
      const grantsOn = p.inputs.referral_grants_on ?? null;
      rows.push({
        contribution_id: p.id,
        participant_id: p.participant_id,
        event_date: p.event_date,
        hired_on: p.inputs.hired_on ?? null,
        grants_on: grantsOn,
        fee_minor: p.inputs.fee_minor ?? null,
        granted: await alreadyGranted(supabase, p.id),
        // Must agree with POST's gate exactly: a row with no grant date
        // is never due, so the count on the button can't promise a grant
        // that POST would then skip.
        due: grantsOn !== null && grantsOn > "" && grantsOn <= today,
      });
    }

    return ok(rows);
  } catch (err) {
    console.error("Unexpected error in GET referrals:", err);
    return fail("Internal server error", 500);
  }
}

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { user, response } = await requireAdminApi();
    if (response) return response;

    const { id } = await context.params;
    if (!isUuid(id)) return fail("Invalid pie id", 400);

    const supabase = await createClient();

    const { data: pie } = await supabase
      .from("pies")
      .select("id, status")
      .eq("id", id)
      .single();
    if (!pie) return fail("Pie not found", 404);
    if (pie.status === "frozen") {
      return fail("Pie is frozen — no new slices may be granted", 409);
    }

    const today = todayISO();
    const pending = await loadPendingReferrals(supabase, id);

    const granted: {
      contribution: Contribution;
      referral_id: string;
      slices: number;
    }[] = [];
    const skipped: { referral_id: string; reason: string }[] = [];

    for (const p of pending) {
      const grantsOn = p.inputs.referral_grants_on;
      if (!grantsOn || grantsOn > today) {
        skipped.push({
          referral_id: p.id,
          reason: `Not due until ${grantsOn ?? "an unspecified date"}.`,
        });
        continue;
      }
      if (await alreadyGranted(supabase, p.id)) {
        skipped.push({ referral_id: p.id, reason: "Already granted." });
        continue;
      }

      // Frozen settings from the pending row — see the header.
      const settings = p.config_snapshot as PieSettings;
      const computation = computeSlices(
        {
          type: "referral",
          fee_minor:
            typeof p.inputs.fee_minor === "number"
              ? p.inputs.fee_minor
              : undefined,
        },
        settings
      );

      const { data: row, error } = await supabase
        .from("contributions")
        .insert({
          pie_id: id,
          participant_id: p.participant_id,
          type: "referral",
          // Dated to the day it was earned, not the day it was granted:
          // the waiting period delays when the slices appear, it does
          // not move when the contribution happened.
          event_date: p.event_date,
          inputs: {
            vests_referral: p.id,
            referral_grants_on: grantsOn,
            hired_on: p.inputs.hired_on,
            fee_minor: p.inputs.fee_minor,
          },
          config_snapshot: settings,
          fmv_minor: computation.fmv_minor,
          multiplier_kind: computation.multiplier_kind,
          multiplier_applied: computation.multiplier_applied,
          slices: computation.slices,
          notes: `Referral granted — waiting period ended ${grantsOn}.`,
          status: "active",
          // Deliberately no `reverses_id`: this row does not reverse the
          // pending row, it pays out what the pending row withheld. The
          // link back is `inputs.vests_referral`. See the file header.
          created_by: user.id,
        })
        .select("*")
        .single();

      // Note: grants are committed one at a time, so a hard failure
      // part-way leaves the earlier ones granted and returns 500. That is
      // recoverable rather than damaging, because granting is idempotent —
      // every already-granted referral is skipped on the next run — but it
      // is worth knowing before treating a 500 here as "nothing happened".
      if (error) {
        // 23505 = unique_violation, from the partial unique index added in
        // migration 0005. It means a concurrent request granted this
        // referral first. That is the database guarantee working, not a
        // failure.
        if (error.code === "23505") {
          skipped.push({ referral_id: p.id, reason: "Already granted." });
          continue;
        }
        console.error("Error granting referral:", error);
        return fail("Failed to grant a referral", 500);
      }
      if (!row) {
        console.error("Error granting referral: insert returned no row");
        return fail("Failed to grant a referral", 500);
      }

      granted.push({
        contribution: row as Contribution,
        referral_id: p.id,
        slices: computation.slices,
      });

      await writeAudit({
        pieId: id,
        actorId: user.id,
        action: "referral.grant",
        entityType: "contribution",
        entityId: row.id,
        after: {
          referral_id: p.id,
          participant_id: p.participant_id,
          grants_on: grantsOn,
          slices: computation.slices,
        },
        effectiveFrom: p.event_date,
      });
    }

    return ok({ granted, skipped, granted_count: granted.length });
  } catch (err) {
    console.error("Unexpected error in POST referrals:", err);
    return fail("Internal server error", 500);
  }
}
