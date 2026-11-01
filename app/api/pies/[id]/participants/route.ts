// ============================================================
// Execution Tracker — GET & POST /api/pies/[id]/participants
// ============================================================
// GET  → all participants in a Pie (any authenticated user).
// POST → add a participant (admin only). Idempotent: if a
//        participant with the same (pie_id, user_id) already
//        exists, returns that row instead of inserting a new one.
//        Network retries and double-clicks are safe.
//
// Optionally seeds an initial terms version (FMV salary /
// contractor rate / hours override) used by the time and
// contractor calculators.
// ============================================================

import { createClient } from "@/lib/supabase";
import {
  ok,
  fail,
  requireUser,
  requireAdminApi,
  writeAudit,
  isUuid,
} from "@/lib/slicing-pie/server/context";
import type { PieRole, ParticipantStatus } from "@/types/slicing-pie";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const VALID_ROLES: PieRole[] = [
  "owner",
  "executive",
  "employee",
  "advisor",
  "contractor",
  "investor",
];

const VALID_STATUSES: ParticipantStatus[] = [
  "candidate",
  "active",
  "departed",
  "bought_out",
  "absentee",
];

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { response } = await requireUser();
    if (response) return response;

    const { id } = await context.params;
    if (!isUuid(id)) return fail("Invalid pie id", 400);

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pie_participants")
      .select("*")
      .eq("pie_id", id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching participants:", error);
      return fail("Failed to fetch participants", 500);
    }

    return ok(data ?? []);
  } catch (err) {
    console.error("Unexpected error in GET participants:", err);
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
      display_name,
      pie_role,
      status,
      user_id,
      advisor_cap_opt_in,
      joined_at,
      // optional initial terms
      fair_market_salary_minor,
      contractor_rate_minor,
      working_hours_override,
    } = body as Record<string, unknown>;

    if (typeof display_name !== "string" || !display_name.trim()) {
      return fail("display_name is required", 400);
    }
    if (typeof pie_role !== "string" || !VALID_ROLES.includes(pie_role as PieRole)) {
      return fail(`pie_role must be one of: ${VALID_ROLES.join(", ")}`, 400);
    }
    if (
      status !== undefined &&
      !VALID_STATUSES.includes(status as ParticipantStatus)
    ) {
      return fail(`status must be one of: ${VALID_STATUSES.join(", ")}`, 400);
    }

    const supabase = await createClient();

    // IDEMPOTENCY: if a participant with this user_id already exists
    // in this Pie, return it with a 200. The unique index on
    // (pie_id, user_id) enforces this at the database level too —
    // this check produces a friendly response instead of a 500 on
    // duplicate insert.
    if (user_id && typeof user_id === "string") {
      const { data: existing } = await supabase
        .from("pie_participants")
        .select("*")
        .eq("pie_id", id)
        .eq("user_id", user_id)
        .maybeSingle();

      if (existing) {
        // Seed terms only if they were supplied and none exist yet.
        // Do NOT overwrite existing terms.
        const { data: existingTerms } = await supabase
          .from("participant_terms_versions")
          .select("id")
          .eq("participant_id", existing.id)
          .limit(1)
          .maybeSingle();

        const hasNewTerms =
          fair_market_salary_minor != null ||
          contractor_rate_minor != null ||
          working_hours_override != null;

        if (hasNewTerms && !existingTerms) {
          await supabase.from("participant_terms_versions").insert({
            participant_id: existing.id,
            fair_market_salary_minor:
              (fair_market_salary_minor as number) ?? null,
            contractor_rate_minor: (contractor_rate_minor as number) ?? null,
            working_hours_override: (working_hours_override as number) ?? null,
            note: "Initial terms (from retry)",
            created_by: user.id,
          });
        }

        return ok(existing, 200);
      }
    }

    // Normal path: insert a new participant.
    const { data: participant, error } = await supabase
      .from("pie_participants")
      .insert({
        pie_id: id,
        user_id: (user_id as string) || null,
        display_name: display_name.trim(),
        pie_role,
        status: (status as ParticipantStatus) || "candidate",
        advisor_cap_opt_in: Boolean(advisor_cap_opt_in),
        joined_at: (joined_at as string) || null,
      })
      .select("*")
      .single();

    if (error || !participant) {
      console.error("Error creating participant:", error);
      return fail("Failed to create participant", 500);
    }

    // Seed an initial terms version if any term was supplied.
    const hasTerms =
      fair_market_salary_minor != null ||
      contractor_rate_minor != null ||
      working_hours_override != null;
    if (hasTerms) {
      const { error: termsErr } = await supabase
        .from("participant_terms_versions")
        .insert({
          participant_id: participant.id,
          fair_market_salary_minor:
            (fair_market_salary_minor as number) ?? null,
          contractor_rate_minor: (contractor_rate_minor as number) ?? null,
          working_hours_override: (working_hours_override as number) ?? null,
          note: "Initial terms",
          created_by: user.id,
        });
      if (termsErr) {
        console.error("Error creating initial terms:", termsErr);
      }
    }

    await writeAudit({
      pieId: id,
      actorId: user.id,
      action: "participant.create",
      entityType: "pie_participant",
      entityId: participant.id,
      after: participant,
    });

    return ok(participant, 201);
  } catch (err) {
    console.error("Unexpected error in POST participants:", err);
    return fail("Internal server error", 500);
  }
}
