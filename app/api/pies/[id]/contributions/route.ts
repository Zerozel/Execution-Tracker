// ============================================================
// Execution Tracker — GET & POST /api/pies/[id]/contributions
// ============================================================
// GET  → the contribution ledger for a Pie (optionally filtered by
//        participant/type/status).
// POST → log a NEW contribution (admin only):
//          1. Resolve config AT THE EVENT DATE (prospective-only).
//          2. Pull participant terms + prior advisor hours.
//          3. Run the engine → slices, FMV, multiplier.
//          4. Persist with a FROZEN config_snapshot for audit.
//        A frozen Pie rejects new contributions (§17).
// ============================================================

import { createClient } from "@/lib/supabase";
import {
  ok,
  fail,
  requireUser,
  requireAdminApi,
  resolvePieConfig,
  writeAudit,
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
import { canReceiveContributions, planDrawdown, referralVested } from "@/lib/slicing-pie/engine/policy";
import type { ContributionType, PieParticipant } from "@/types/slicing-pie";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { response } = await requireUser();
    if (response) return response;

    const { id } = await context.params;
    if (!isUuid(id)) return fail("Invalid pie id", 400);

    const { searchParams } = new URL(request.url);
    const participantId = searchParams.get("participant_id");
    const type = searchParams.get("type");
    // Default to the WHOLE ledger. The ledger is append-only, so a
    // correction is a separate row — filtering by status would hide one
    // half of every correcting pair and make the ledger read as if the
    // original entry still stood on its own.
    const status = searchParams.get("status") ?? "all";

    const supabase = await createClient();
    let query = supabase
      .from("contributions")
      .select("*")
      .eq("pie_id", id)
      .order("event_date", { ascending: false });

    if (participantId && isUuid(participantId)) {
      query = query.eq("participant_id", participantId);
    }
    if (type) query = query.eq("type", type);
    if (status !== "all") query = query.eq("status", status);

    const { data, error } = await query;
    if (error) {
      console.error("Error fetching contributions:", error);
      return fail("Failed to fetch contributions", 500);
    }

    return ok(data ?? []);
  } catch (err) {
    console.error("Unexpected error in GET contributions:", err);
    return fail("Internal server error", 500);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { user, response } = await requireAdminApi();
    if (response) return response;

    const { id } = await context.params;
    if (!isUuid(id)) return fail("Invalid pie id", 400);

    const body = await request.json();
    const {
      participant_id,
      type,
      event_date,
      inputs,
      notes,
      evidence_url,
      project_tag,
    } = body as {
      participant_id?: string;
      type?: ContributionType;
      event_date?: string;
      inputs?: Record<string, unknown>;
      notes?: string;
      evidence_url?: string;
      project_tag?: string;
    };

    if (!participant_id || !isUuid(participant_id)) {
      return fail("A valid participant_id is required", 400);
    }
    if (!type) return fail("type is required", 400);

    const supabase = await createClient();

    // Reject writes on a frozen Pie (§17).
    const { data: pie } = await supabase
      .from("pies")
      .select("id, status")
      .eq("id", id)
      .single();
    if (!pie) return fail("Pie not found", 404);
    if (pie.status === "frozen") {
      return fail("Pie is frozen — no new contributions may be added", 409);
    }

    const eventDate = event_date || todayISO();

    // 1. Resolve settings at the EVENT date (prospective-only).
    const { settings } = await resolvePieConfig(id, eventDate);

    if (!typeEnabled(type, settings)) {
      return fail(`Contribution type "${type}" is disabled for this Pie`, 400);
    }

    // 2. Participant record + terms + prior advisor hours. The record is
    //    needed for the advisor cap opt-in (§4.3), which is a property
    //    of the person and must come from the database, never the body.
    const { data: participantRow, error: partErr } = await supabase
      .from("pie_participants")
      .select("*")
      .eq("id", participant_id)
      .eq("pie_id", id)
      .maybeSingle();
    if (partErr) {
      console.error("Error loading participant:", partErr);
      return fail("Failed to load participant", 500);
    }
    if (!participantRow) {
      return fail("Participant not found in this Pie", 404);
    }
    const participant = participantRow as PieParticipant;

    // §13: a closed participant cannot accrue new slices. The entry form
    // already withholds departed/bought-out people, but the form is not a
    // boundary — this is the path that actually writes.
    const open = canReceiveContributions(participant, type, settings);
    if (!open.allowed) {
      return fail(
        open.reason ?? "This participant cannot receive new contributions",
        409,
        { rule: open.ruleRef }
      );
    }

    const terms = await resolveParticipantTerms(participant_id, eventDate);
    const prior =
      type === "advisor_time"
        ? await priorAdvisorHours(participant_id, eventDate)
        : 0;

    // HARD-VAL-004: a payment to a participant is a WITHDRAWAL. Its row is
    // written with NEGATIVE fmv and slices so the cap table — which sums
    // every row — nets it out with no UPDATE and no reversal row. How much
    // of it draws down cash versus non-cash depends on what this person has
    // actually contributed, which the pure engine cannot see, so the split
    // is planned here and frozen onto the row next to the payment itself.
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
      const portfolio = await participantAtRiskPortfolio(
        participant_id,
        eventDate
      );
      const drawdown = planDrawdown(amount, portfolio, settings);
      engineInputs = {
        ...engineInputs,
        cash_drawdown_minor: drawdown.cash_minor,
        non_cash_drawdown_minor: drawdown.non_cash_minor,
        // The slice figures are frozen onto the row next to the money.
        // They cannot be re-derived later: a bucket holds rows at more
        // than one multiplier, so the money alone does not say how many
        // slices it removed — and departure recovery has to remove
        // exactly this many for the correction row to net out.
        cash_drawdown_slices: drawdown.cash_slices,
        non_cash_drawdown_slices: drawdown.non_cash_slices,
        overflow_minor: drawdown.overflow_minor,
      };
    }

    // CONFIG-016: a referral fee is not earned until the referred hire
    // has stayed the configured waiting period. The decision is to
    // RECORD the referral immediately and let it switch on by itself,
    // rather than refusing the entry — so an unvested referral is
    // written as a PENDING row holding no slices and no value, and a
    // separate vesting step grants them once the date arrives.
    let referralGrantsOn: string | null = null;
    if (type === "referral") {
      const hiredOn = (inputs ?? {}).hired_on;
      if (typeof hiredOn !== "string" || !hiredOn) {
        return fail(
          "A referral requires the referred hire's start date (hired_on)",
          400,
          { rule: "CONFIG-016" }
        );
      }
      const hire = new Date(`${hiredOn}T00:00:00Z`);
      if (Number.isNaN(hire.getTime())) {
        return fail("hired_on is not a valid date", 400, { rule: "CONFIG-016" });
      }
      const due = new Date(hire);
      due.setUTCDate(due.getUTCDate() + settings.referral_waiting_period_days);
      referralGrantsOn = due.toISOString().split("T")[0];

      const vested = referralVested(
        hiredOn,
        settings,
        new Date(`${eventDate}T00:00:00Z`)
      );
      if (!vested.allowed) {
        // Pending: the row exists so the referral is on record from day
        // one, but it holds nothing and so cannot touch the cap table
        // until it is vested.
        const { data: pending, error: pendErr } = await supabase
          .from("contributions")
          .insert({
            pie_id: id,
            participant_id,
            type,
            event_date: eventDate,
            inputs: {
              ...(inputs ?? {}),
              referral_pending: true,
              referral_grants_on: referralGrantsOn,
            },
            config_snapshot: settings,
            fmv_minor: 0,
            // No multiplier: nothing was earned yet, so there is nothing
            // to multiply.
            multiplier_kind: "none",
            multiplier_applied: 1,
            slices: 0,
            notes:
              notes?.trim() ||
              `Referral pending — slices are granted on ${referralGrantsOn}.`,
            evidence_url: evidence_url?.trim() || null,
            project_tag: project_tag?.trim() || null,
            status: "active",
            created_by: user.id,
          })
          .select("*")
          .single();

        if (pendErr || !pending) {
          console.error("Error creating pending referral:", pendErr);
          return fail("Failed to create referral", 500);
        }

        await writeAudit({
          pieId: id,
          actorId: user.id,
          action: "contribution.create",
          entityType: "contribution",
          entityId: pending.id,
          after: { type, pending: true, grants_on: referralGrantsOn },
          effectiveFrom: eventDate,
        });

        return ok(
          {
            contribution: pending,
            pending: true,
            grants_on: referralGrantsOn,
            reason: vested.reason,
          },
          201
        );
      }
    }

    // 3. Build typed input + run the engine.
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

    // Enforce the over-reimbursement block decision (§20) when set.
    if (
      settings.block_over_reimbursement &&
      computation.warnings.some((w) => w.includes("should be blocked"))
    ) {
      return fail(
        "Reimbursement exceeds the contributed amount (blocked by settings §20)",
        400
      );
    }

    // 4. Persist with a FROZEN snapshot.
    const { data: contribution, error } = await supabase
      .from("contributions")
      .insert({
        pie_id: id,
        participant_id,
        type,
        event_date: eventDate,
        // `engineInputs`, not the raw body: for a cash payment this carries
        // the planned cash/non-cash split, frozen onto the row so the
        // arithmetic can be reconstructed later without having to rebuild
        // the participant's balance as it stood that day.
        inputs: engineInputs,
        config_snapshot: settings,
        fmv_minor: computation.fmv_minor,
        multiplier_kind: computation.multiplier_kind,
        multiplier_applied: computation.multiplier_applied,
        slices: computation.slices,
        notes: notes?.trim() || null,
        evidence_url: evidence_url?.trim() || null,
        project_tag: project_tag?.trim() || null,
        status: "active",
        created_by: user.id,
      })
      .select("*")
      .single();

    if (error || !contribution) {
      console.error("Error creating contribution:", error);
      return fail("Failed to create contribution", 500);
    }

    await writeAudit({
      pieId: id,
      actorId: user.id,
      action: "contribution.create",
      entityType: "contribution",
      entityId: contribution.id,
      after: {
        type,
        slices: computation.slices,
        fmv_minor: computation.fmv_minor,
        // A payment's explanation spells out the cash/non-cash split it
        // applied. The row already carries that split, but the audit log is
        // the thing that survives being challenged, so the reasoning is kept
        // beside it rather than being re-derived years later.
        ...(type === "cash_payment_to_participant"
          ? { drawdown: computation.explanation }
          : {}),
      },
      effectiveFrom: eventDate,
    });

    return ok(
      {
        contribution,
        computation: {
          explanation: computation.explanation,
          warnings: computation.warnings,
        },
      },
      201
    );
  } catch (err) {
    console.error("Unexpected error in POST contributions:", err);
    return fail("Internal server error", 500);
  }
}
