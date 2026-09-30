// ============================================================
// Execution Tracker — GET & POST /api/pies/[id]/buyouts
// ============================================================
// Executes a buyout of a participant's retained slices (§14.3):
//   • amount = slices bought × rate/slice (an override is allowed for
//     a voluntary buyout by mutual agreement).
//   • Removes those slices from the Pie by APPENDING reversing rows to
//     the ledger — the rows being bought out are never edited (§21).
//   • Opens the clawback monitoring window (§14.4) = departure_date +
//     clawback_window_days for GOOD leavers.
//   • Marks the participant "bought_out".
//
// Two refusals are enforced here, from the shared §20 policy guards:
//   HARD-VAL-001  a good leaver cannot be FORCED to sell.
//   CONFIG-012    a contractor's forced buyout is capped at
//                 contractor_buyout_cap_pct of base billed value, and
//                 only covers billings inside the buyout window.
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
  computeBuyout,
  contractorEligibleContributions,
  planContractorForcedBuyout,
} from "@/lib/slicing-pie/engine/departure";
import { canForceBuyout } from "@/lib/slicing-pie/engine/policy";
import { participantSlices } from "@/lib/slicing-pie/engine/captable";
import type {
  BuyoutKind,
  Contribution,
  LeaverKind,
  PieParticipant,
} from "@/types/slicing-pie";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Add days to an ISO date string, returning YYYY-MM-DD. */
function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { response } = await requireUser();
    if (response) return response;

    const { id } = await context.params;
    if (!isUuid(id)) return fail("Invalid pie id", 400);

    const supabase = await createClient();
    const { data: participants } = await supabase
      .from("pie_participants")
      .select("id")
      .eq("pie_id", id);
    const ids = (participants ?? []).map((p) => p.id);
    if (ids.length === 0) return ok([]);

    const { data, error } = await supabase
      .from("buyouts")
      .select("*")
      .in("participant_id", ids)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching buyouts:", error);
      return fail("Failed to fetch buyouts", 500);
    }
    return ok(data ?? []);
  } catch (err) {
    console.error("Unexpected error in GET buyouts:", err);
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
    const { participant_id, kind, rate_per_slice_minor, execute } = body as {
      participant_id?: string;
      kind?: BuyoutKind;
      rate_per_slice_minor?: number;
      execute?: boolean;
    };

    if (!participant_id || !isUuid(participant_id)) {
      return fail("A valid participant_id is required", 400);
    }
    const buyoutKind: BuyoutKind = kind === "voluntary" ? "voluntary" : "forced";
    const forced = buyoutKind === "forced";

    const supabase = await createClient();

    const { data: participantRow } = await supabase
      .from("pie_participants")
      .select("*")
      .eq("id", participant_id)
      .eq("pie_id", id)
      .maybeSingle();
    if (!participantRow) {
      return fail("Participant not found in this Pie", 404);
    }
    const participant = participantRow as PieParticipant;

    // The whole ledger, so the net position matches the cap table.
    const { data: rows } = await supabase
      .from("contributions")
      .select("*")
      .eq("pie_id", id)
      .eq("participant_id", participant_id);
    const contributions = (rows ?? []) as Contribution[];

    // Most recent departure, for the leaver kind and clawback anchor.
    const { data: departure } = await supabase
      .from("departures")
      .select("*")
      .eq("participant_id", participant_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const leaverKind = (departure?.leaver_kind as LeaverKind | undefined) ?? null;

    const { settings } = await resolvePieConfig(id);
    const isContractor = participant.pie_role === "contractor";

    // ---- Decide which ledger rows this buyout takes out -------------
    // For a contractor's forced buyout, only billings still inside the
    // CONFIG-012 window can be taken; the rest stay in the Pie.
    let rowsToBuy = contributions;
    let contractorPlan: ReturnType<typeof planContractorForcedBuyout> | null =
      null;

    if (forced && isContractor) {
      contractorPlan = planContractorForcedBuyout(contributions, settings);
      const { eligible } = contractorEligibleContributions(
        contributions,
        settings
      );
      rowsToBuy = eligible;

      if (contractorPlan.eligible_slices <= 0) {
        return fail(
          `The contractor buyout window has closed — every billing is more than ${settings.contractor_buyout_window_days} days old, so the buyout option has gone away (§4.2, CONFIG-012). Their slices stay in the Pie.`,
          422,
          { rule: "CONFIG-012" }
        );
      }
    }

    const slicesBought = participantSlices(participant_id, rowsToBuy);

    if (slicesBought <= 0) {
      return fail("Participant has no slices available to buy out", 400);
    }

    // ---- §20 policy guard -------------------------------------------
    // A good leaver keeps their slices and cannot be compelled to sell;
    // the company may still OFFER to buy them out ("voluntary").
    if (forced && leaverKind) {
      const guard = canForceBuyout(leaverKind);
      if (!guard.allowed) {
        return fail(guard.reason ?? "Forced buyout not permitted", 422, {
          rule: guard.ruleRef,
        });
      }
    }

    // ---- Price -------------------------------------------------------
    // A forced contractor buyout is capped (CONFIG-012); everything else
    // prices at the standing rate, or an agreed override.
    const rateQuote = computeBuyout(
      slicesBought,
      settings,
      rate_per_slice_minor
    );
    const amountMinor = contractorPlan
      ? Math.min(rateQuote.amount_minor, contractorPlan.ceiling_minor)
      : rateQuote.amount_minor;

    const quote = {
      ...rateQuote,
      // What will actually be paid, once any cap is applied.
      amount_minor: amountMinor,
      capped: amountMinor < rateQuote.amount_minor,
      contractor_plan: contractorPlan,
    };

    // Dry-run: return the quote without persisting.
    if (!execute) {
      return ok({ quote, execute: false });
    }

    const depDate = departure?.departure_date || todayISO();
    const clawbackUntil =
      leaverKind === "good"
        ? addDays(depDate, settings.clawback_window_days)
        : null;

    // Persist the buyout.
    const { data: buyout, error: buyoutErr } = await supabase
      .from("buyouts")
      .insert({
        participant_id,
        kind: buyoutKind,
        slices_bought: slicesBought,
        rate_per_slice_minor: rateQuote.rate_per_slice_minor,
        amount_minor: amountMinor,
        executed_at: new Date().toISOString(),
        clawback_until: clawbackUntil,
        created_by: user.id,
      })
      .select("*")
      .single();

    if (buyoutErr || !buyout) {
      console.error("Error executing buyout:", buyoutErr);
      return fail("Failed to execute buyout", 500);
    }

    // ---- Remove the slices by APPENDING reversals --------------------
    // One reversing row per bought billing, each naming the row it
    // corrects, so a reviewer can see exactly which billings the payment
    // bought. The originals are left untouched.
    const reversalRows = rowsToBuy
      .filter((c) => c.slices !== 0 || c.fmv_minor !== 0)
      .map((c) => {
        // A buyout reverses the row in full, so the hour delta is simply
        // the negation of whatever the original recorded. Carrying it
        // keeps the §4.3 cumulative-hours gate correct when it is
        // replayed from the ledger.
        const hours = Number(
          (c.inputs as Record<string, unknown> | null)?.hours
        );
        return {
          pie_id: id,
          participant_id,
          type: c.type,
          event_date: todayISO(),
          inputs: {
            buyout_id: buyout.id,
            bought_out_row: c.id,
            ...(Number.isFinite(hours) && hours !== 0 ? { hours: -hours } : {}),
          },
          config_snapshot: settings,
          fmv_minor: -c.fmv_minor,
          multiplier_kind: "none" as const,
          multiplier_applied: 1,
          slices: -c.slices,
          notes: `Bought out (${buyoutKind}, ${rateQuote.rate_per_slice_minor} minor/slice)`,
          status: "active" as const,
          reverses_id: c.id,
          created_by: user.id,
        };
      });

    if (reversalRows.length > 0) {
      const { error: revErr } = await supabase
        .from("contributions")
        .insert(reversalRows);
      if (revErr) {
        console.error("Error appending buyout reversals:", revErr);
        return fail(
          "The buyout was recorded but removing the slices from the ledger failed. Record a manual correction — the ledger cannot be edited after the fact.",
          500
        );
      }
    }

    // Mark participant bought out.
    await supabase
      .from("pie_participants")
      .update({ status: "bought_out" })
      .eq("id", participant_id);

    await writeAudit({
      pieId: id,
      actorId: user.id,
      action: "buyout.execute",
      entityType: "buyout",
      entityId: buyout.id,
      after: {
        kind: buyoutKind,
        slices: slicesBought,
        amount_minor: amountMinor,
        capped: quote.capped,
        clawback_until: clawbackUntil,
        rows_reversed: reversalRows.map((r) => r.reverses_id),
      },
    });

    return ok({ buyout, quote }, 201);
  } catch (err) {
    console.error("Unexpected error in POST buyouts:", err);
    return fail("Internal server error", 500);
  }
}
