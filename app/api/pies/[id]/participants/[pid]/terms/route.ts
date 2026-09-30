// ============================================================
// Execution Tracker — GET & POST /api/pies/[id]/participants/[pid]/terms
// ============================================================
// Admin sets a participant's compensation terms — most importantly
// the FAIR-MARKET SALARY that payday uses to convert logged hours
// into slices (§4.1 / TIME-002).
//
// GET  → the participant's terms history (newest first).
// POST → append a NEW effective-dated terms version (admin only).
//        Edits are PROSPECTIVE: prior contributions keep their frozen
//        snapshot; only future paydays see the new salary (§21).
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

interface RouteContext {
  params: Promise<{ id: string; pid: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { response } = await requireUser();
    if (response) return response;

    const { id, pid } = await context.params;
    if (!isUuid(id) || !isUuid(pid)) return fail("Invalid id", 400);

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("participant_terms_versions")
      .select("*")
      .eq("participant_id", pid)
      .order("effective_from", { ascending: false });

    if (error) {
      console.error("Error fetching terms:", error);
      return fail("Failed to fetch terms", 500);
    }
    return ok(data ?? []);
  } catch (err) {
    console.error("Unexpected error in GET terms:", err);
    return fail("Internal server error", 500);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { user, response } = await requireAdminApi();
    if (response) return response;

    const { id, pid } = await context.params;
    if (!isUuid(id) || !isUuid(pid)) return fail("Invalid id", 400);

    const body = await request.json();
    const {
      fair_market_salary_minor,
      contractor_rate_minor,
      working_hours_override,
      effective_from,
      note,
    } = body as Record<string, unknown>;

    const salary =
      fair_market_salary_minor == null
        ? null
        : Number(fair_market_salary_minor);
    const rate =
      contractor_rate_minor == null ? null : Number(contractor_rate_minor);
    const hours =
      working_hours_override == null ? null : Number(working_hours_override);

    if (salary == null && rate == null && hours == null) {
      return fail(
        "Provide at least one of: fair_market_salary_minor, contractor_rate_minor, working_hours_override",
        400
      );
    }
    if (salary != null && (!Number.isFinite(salary) || salary < 0)) {
      return fail("fair_market_salary_minor must be a non-negative integer", 400);
    }
    if (rate != null && (!Number.isFinite(rate) || rate < 0)) {
      return fail("contractor_rate_minor must be a non-negative integer", 400);
    }
    if (hours != null && (!Number.isFinite(hours) || hours <= 0)) {
      return fail("working_hours_override must be a positive number", 400);
    }

    const supabase = await createClient();

    // Guard: participant must belong to this Pie.
    const { data: participant } = await supabase
      .from("pie_participants")
      .select("id, pie_id, display_name")
      .eq("id", pid)
      .single();
    if (!participant || participant.pie_id !== id) {
      return fail("Participant not found in this Pie", 404);
    }

    const { data: version, error } = await supabase
      .from("participant_terms_versions")
      .insert({
        participant_id: pid,
        fair_market_salary_minor: salary,
        contractor_rate_minor: rate,
        working_hours_override: hours,
        effective_from: (effective_from as string) || todayISO(),
        note: typeof note === "string" ? note.trim() || null : null,
        created_by: user.id,
      })
      .select("*")
      .single();

    if (error || !version) {
      console.error("Error creating terms version:", error);
      return fail("Failed to save terms", 500);
    }

    await writeAudit({
      pieId: id,
      actorId: user.id,
      action: "participant.terms.update",
      entityType: "participant_terms_version",
      entityId: version.id,
      after: {
        participant_id: pid,
        fair_market_salary_minor: salary,
        contractor_rate_minor: rate,
        working_hours_override: hours,
      },
      effectiveFrom: version.effective_from,
    });

    return ok(version, 201);
  } catch (err) {
    console.error("Unexpected error in POST terms:", err);
    return fail("Internal server error", 500);
  }
}
