// ============================================================
// Execution Tracker — POST /api/pies/[id]/contributions/preview
// ============================================================
// Live-preview endpoint: runs the SAME engine as the real POST but
// PERSISTS NOTHING. Powers the "you will earn N slices" preview shown
// in entry forms before submit. Admin only (mirrors write access).
// ============================================================

import { createClient } from "@/lib/supabase";
import {
  ok,
  fail,
  requireAdminApi,
  resolvePieConfig,
  isUuid,
  todayISO,
} from "@/lib/slicing-pie/server/context";
import {
  buildEngineInput,
  resolveParticipantTerms,
  priorAdvisorHours,
  participantAtRiskPortfolio,
  typeEnabled,
} from "@/lib/slicing-pie/server/contributions";
import { computeSlices } from "@/lib/slicing-pie/engine/calculate";
import {
  canReceiveContributions,
  planDrawdown,
  referralVested,
} from "@/lib/slicing-pie/engine/policy";
import type { ContributionType, PieParticipant } from "@/types/slicing-pie";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { response } = await requireAdminApi();
    if (response) return response;

    const { id } = await context.params;
    if (!isUuid(id)) return fail("Invalid pie id", 400);

    const body = await request.json();
    const { participant_id, type, event_date, inputs } = body as {
      participant_id?: string;
      type?: ContributionType;
      event_date?: string;
      inputs?: Record<string, unknown>;
    };

    if (!type) return fail("type is required", 400);

    const eventDate = event_date || todayISO();
    const { settings } = await resolvePieConfig(id, eventDate);

    if (!typeEnabled(type, settings)) {
      return fail(`Contribution type "${type}" is disabled for this Pie`, 400);
    }

    // Terms + advisor-hours lookups only when a participant is known.
    const terms =
      participant_id && isUuid(participant_id)
        ? await resolveParticipantTerms(participant_id, eventDate)
        : null;
    const prior =
      type === "advisor_time" && participant_id && isUuid(participant_id)
        ? await priorAdvisorHours(participant_id, eventDate)
        : 0;

    // The advisor cap opt-in (§4.3) lives on the participant record, so
    // the preview must read the same record the real POST reads — a
    // preview that guessed would promise slices the save then refuses.
    let participant: PieParticipant | null = null;
    if (participant_id && isUuid(participant_id)) {
      const supabase = await createClient();
      const { data } = await supabase
        .from("pie_participants")
        .select("*")
        .eq("id", participant_id)
        .eq("pie_id", id)
        .maybeSingle();
      participant = (data ?? null) as PieParticipant | null;
    }

    // §13: the preview refuses exactly what the save refuses, so a closed
    // participant shows the reason here instead of a slice figure that
    // the save would then reject with a 409.
    if (participant) {
      const open = canReceiveContributions(participant, type, settings);
      if (!open.allowed) {
        return fail(
          open.reason ?? "This participant cannot receive new contributions",
          409,
          { rule: open.ruleRef }
        );
      }
    }

    // HARD-VAL-004: the preview must plan the SAME drawdown the save will
    // apply — against the participant's live at-risk balance, cash first,
    // floored at zero — otherwise the figure on screen is not the figure
    // that gets written. Nothing is persisted here.
    let engineInputs: Record<string, unknown> = inputs ?? {};
    if (type === "cash_payment_to_participant") {
      const amount = Number(engineInputs.amount_minor);
      if (!Number.isFinite(amount) || amount <= 0) {
        return fail(
          "A valid, positive amount_minor is required for a payment to a participant",
          400,
          { rule: "HARD-VAL-004" }
        );
      }
      if (!participant_id || !isUuid(participant_id)) {
        return fail("A valid participant_id is required", 400);
      }
      const portfolio = await participantAtRiskPortfolio(
        participant_id,
        eventDate
      );
      const drawdown = planDrawdown(amount, portfolio, settings);
      engineInputs = {
        ...engineInputs,
        cash_drawdown_minor: drawdown.cash_minor,
        non_cash_drawdown_minor: drawdown.non_cash_minor,
        cash_drawdown_slices: drawdown.cash_slices,
        non_cash_drawdown_slices: drawdown.non_cash_slices,
        overflow_minor: drawdown.overflow_minor,
      };
    }

    // CONFIG-016: the preview must not promise slices that will not be
    // on the cap table yet. An unvested referral is RECORDED as soon as
    // it is entered but holds nothing until it vests, so the preview
    // returns the eventual figure plus a `pending` flag and the date it
    // switches on. Flags are returned, not refused: refusing here would
    // hide the number the founder is trying to sanity-check.
    let referralGrantsOn: string | null = null;
    let referralPending = false;
    let referralReason: string | undefined;
    if (type === "referral") {
      const hiredOn = (inputs ?? {}).hired_on;
      // Refuse exactly as the real POST does. The point of the preview is
      // that the number shown is the number that gets saved; quietly
      // computing slices for a referral the POST would then reject with a
      // 400 is the same lie as promising slices that will not be granted,
      // just in the other direction.
      if (typeof hiredOn !== "string" || !hiredOn) {
        return fail(
          "A referral requires the referred hire's start date (hired_on)",
          400,
          { rule: "CONFIG-016" }
        );
      }
      const hire = new Date(`${hiredOn}T00:00:00Z`);
      if (Number.isNaN(hire.getTime())) {
        return fail("hired_on is not a valid date", 400, {
          rule: "CONFIG-016",
        });
      }
      const due = new Date(hire);
      due.setUTCDate(due.getUTCDate() + settings.referral_waiting_period_days);
      referralGrantsOn = due.toISOString().split("T")[0];

      const vested = referralVested(
        hiredOn,
        settings,
        new Date(`${eventDate}T00:00:00Z`)
      );
      referralPending = !vested.allowed;
      referralReason = vested.reason;
    }

    const { input, error: buildErr } = buildEngineInput(
      type,
      engineInputs,
      terms,
      prior,
      settings,
      participant
    );
    if (buildErr || !input) {
      return fail(buildErr ?? "Invalid contribution inputs", 400);
    }

    const computation = computeSlices(input, settings);
    if (type === "referral") {
      return ok({
        computation,
        pending: referralPending,
        grants_on: referralGrantsOn,
        reason: referralReason,
      });
    }
    return ok({ computation });
  } catch (err) {
    console.error("Unexpected error in POST preview:", err);
    return fail("Internal server error", 500);
  }
}
