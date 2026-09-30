// ============================================================
// Execution Tracker — GET & POST /api/pies/[id]/departures
// ============================================================
// Records a participant's separation (§14) and runs recovery:
//   1. Check the §20 policy guards — a capped advisor cannot be
//      terminated (HARD-VAL-002), and a contractor is outside the
//      Recovery Framework entirely (HARD-VAL-003).
//   2. Classify good/bad leaver from the reason.
//   3. Recompute retained vs forfeited slices (engine).
//   4. Apply the result by APPENDING compensating rows to the ledger —
//      never by editing the rows it affects (§21). The original rows
//      and the corrections both stay visible forever.
//   5. Compute (but do not execute) a buyout quote for retained slices.
//   6. Mark the participant "departed" and store a recovery snapshot.
// Admin only.
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
  classifyLeaver,
  computeRecovery,
  computeBuyout,
  planRecoveryEntries,
} from "@/lib/slicing-pie/engine/departure";
import {
  canApplyStandardRecovery,
  canTerminate,
} from "@/lib/slicing-pie/engine/policy";
import type {
  Contribution,
  DepartureReason,
  PieParticipant,
} from "@/types/slicing-pie";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const VALID_REASONS: DepartureReason[] = [
  "fired_good_reason",
  "fired_no_good_reason",
  "resigned_good_reason",
  "resigned_no_good_reason",
];

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { response } = await requireUser();
    if (response) return response;

    const { id } = await context.params;
    if (!isUuid(id)) return fail("Invalid pie id", 400);

    const supabase = await createClient();
    // Departures join through participants to a Pie.
    const { data: participants } = await supabase
      .from("pie_participants")
      .select("id")
      .eq("pie_id", id);
    const ids = (participants ?? []).map((p) => p.id);
    if (ids.length === 0) return ok([]);

    const { data, error } = await supabase
      .from("departures")
      .select("*")
      .in("participant_id", ids)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching departures:", error);
      return fail("Failed to fetch departures", 500);
    }
    return ok(data ?? []);
  } catch (err) {
    console.error("Unexpected error in GET departures:", err);
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
      reason,
      departure_date,
      justification,
      evidence_url,
      loyal_months_met,
      preview,
    } = body as {
      participant_id?: string;
      reason?: DepartureReason;
      departure_date?: string;
      justification?: string;
      evidence_url?: string;
      loyal_months_met?: boolean;
      /** Dry run — compute and return the recovery without writing anything. */
      preview?: boolean;
    };

    if (!participant_id || !isUuid(participant_id)) {
      return fail("A valid participant_id is required", 400);
    }
    if (!reason || !VALID_REASONS.includes(reason)) {
      return fail(`reason must be one of: ${VALID_REASONS.join(", ")}`, 400);
    }

    const supabase = await createClient();
    const depDate = departure_date || todayISO();

    // Load the participant — recovery policy depends on their role.
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

    // A participant can only leave once. Running recovery a second time
    // would compute it over an already-recovered ledger and append a
    // second round of corrections.
    if (participant.status === "departed" || participant.status === "bought_out") {
      return fail(
        `${participant.display_name} has already been recorded as ${participant.status.replace("_", " ")}. Log a separate event rather than re-running recovery.`,
        409
      );
    }

    // §20 policy guards, shared with the UI so both report the same
    // reason (see lib/slicing-pie/engine/policy).
    const termination = canTerminate(participant);
    if (!termination.allowed) {
      return fail(termination.reason ?? "Termination not permitted", 422, {
        rule: termination.ruleRef,
      });
    }
    const recoveryGuard = canApplyStandardRecovery(participant);
    if (!recoveryGuard.allowed) {
      return fail(recoveryGuard.reason ?? "Recovery not permitted", 422, {
        rule: recoveryGuard.ruleRef,
      });
    }

    // Load the participant's ledger. No status filter: the ledger is
    // append-only, and any reversing rows already in it must be part of
    // the arithmetic (they carry negative slices).
    const { data: rows, error: rowsErr } = await supabase
      .from("contributions")
      .select("*")
      .eq("pie_id", id)
      .eq("participant_id", participant_id);
    if (rowsErr) {
      console.error("Error loading contributions:", rowsErr);
      return fail("Failed to load contributions", 500);
    }
    const contributions = (rows ?? []) as Contribution[];

    // Recovery uses current settings (the policy in force at departure).
    const { settings } = await resolvePieConfig(id, depDate);
    const recovery = computeRecovery(reason, contributions, settings, {
      loyalMonthsMet: loyal_months_met,
    });

    // Refuse BEFORE anything is written. computeRecovery returns blockers
    // when the ledger holds rows it cannot adjudicate (currently, a cash
    // payment to this participant — see the note in that function). Its
    // retained/forfeited figures are placeholders in that case, so
    // recording the departure or applying the entries would put a wrong
    // number into an append-only ledger, where it would then look
    // perfectly consistent and never be questioned again.
    if (recovery.blockers.length > 0) {
      return fail(
        `Cannot record this departure yet. ${recovery.blockers[0].reason}`,
        409,
        {
          rule: "HARD-VAL-004",
          blockers: recovery.blockers,
        }
      );
    }

    const buyout = computeBuyout(recovery.retained_slices, settings);
    const entries = planRecoveryEntries(recovery, contributions, settings);

    // ---- Dry run ------------------------------------------------------
    // Recording a departure is irreversible: it appends corrections to an
    // append-only ledger and marks the participant departed. Everything
    // above this line is pure calculation and everything below it writes,
    // so returning here hands back the exact figures AND the exact ledger
    // rows that confirming would produce, with nothing persisted.
    //
    // This exists because the alternative is an admin discovering the
    // consequence after the fact: the reasons are counter-intuitive
    // ("fired_good_reason" is a BAD leaver) and the recovery can move a
    // large number of slices.
    if (preview === true) {
      return ok({
        preview: true,
        participant: {
          id: participant.id,
          display_name: participant.display_name,
        },
        reason,
        leaver_kind: classifyLeaver(reason),
        recovery,
        buyout,
        ledger_entries: entries,
      });
    }

    // Record the departure with its recovery snapshot.
    const { data: departure, error: depErr } = await supabase
      .from("departures")
      .insert({
        participant_id,
        reason,
        leaver_kind: classifyLeaver(reason),
        departure_date: depDate,
        justification: justification?.trim() || null,
        evidence_url: evidence_url?.trim() || null,
        recovery_snapshot: {
          retained_slices: recovery.retained_slices,
          forfeited_slices: recovery.forfeited_slices,
          detail: recovery.detail,
          ledger_entries: entries,
          buyout_quote: buyout,
        },
        created_by: user.id,
      })
      .select("*")
      .single();

    if (depErr || !departure) {
      console.error("Error recording departure:", depErr);
      return fail("Failed to record departure", 500);
    }

    // Apply the recovery by APPENDING corrections. The originals are
    // left exactly as they are; each new row names the row it corrects
    // and carries the delta, so the cap table (which sums every row)
    // lands on the retained amount and a reviewer can still see both
    // sides of every change.
    if (entries.length > 0) {
      const { error: applyErr } = await supabase
        .from("contributions")
        .insert(
          entries.map((e) => ({
            pie_id: id,
            participant_id,
            type: e.type,
            event_date: depDate,
            inputs: {
              recovery_of: e.contribution_id,
              departure_reason: reason,
              // Correction rows carry DELTAS, so the hours delta lives in
              // the same `hours` field a normal row uses — the §4.3
              // cumulative-hours gate can then be replayed from the
              // ledger alone and still net the corrected hours out.
              ...(e.hours !== undefined ? { hours: e.hours } : {}),
            },
            config_snapshot: settings,
            fmv_minor: e.fmv_minor,
            // The delta is expressed in plain slices; no multiplier is
            // re-applied to a correction.
            multiplier_kind: "none" as const,
            multiplier_applied: 1,
            slices: e.slices,
            notes: `Recovery on ${reason}: ${e.reason}`,
            status: "active" as const,
            reverses_id: e.contribution_id,
            created_by: user.id,
          }))
        );
      if (applyErr) {
        console.error("Error applying recovery entries:", applyErr);
        return fail(
          "The departure was recorded but applying the recovery to the ledger failed. Record a manual correction — the ledger cannot be edited after the fact.",
          500
        );
      }
    }

    // Mark participant departed.
    await supabase
      .from("pie_participants")
      .update({ status: "departed" })
      .eq("id", participant_id);

    await writeAudit({
      pieId: id,
      actorId: user.id,
      action: "departure.record",
      entityType: "departure",
      entityId: departure.id,
      after: {
        reason,
        leaver_kind: departure.leaver_kind,
        retained: recovery.retained_slices,
        forfeited: recovery.forfeited_slices,
        ledger_entries: entries,
      },
      effectiveFrom: depDate,
    });

    return ok({ departure, recovery, buyout, ledger_entries: entries }, 201);
  } catch (err) {
    console.error("Unexpected error in POST departures:", err);
    return fail("Internal server error", 500);
  }
}
