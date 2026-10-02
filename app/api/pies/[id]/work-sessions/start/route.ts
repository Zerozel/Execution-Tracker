// ============================================================
// Execution Tracker — POST /api/pies/[id]/work-sessions/start
// ============================================================
// Opens a work session for the calling member. Rejects if the Pie is
// frozen or if the caller already has an open session on this Pie.
//
// The session is the container; heartbeats keep it alive, hourly
// entries are the evidence, and its close produces a pending
// time_logs row for admin review.
// ============================================================

import { createClient } from "@/lib/supabase";
import {
  ok,
  fail,
  requireUser,
  participantForUser,
  isUuid,
} from "@/lib/slicing-pie/server/context";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { user, response } = await requireUser();
    if (response) return response;

    const { id } = await context.params;
    if (!isUuid(id)) return fail("Invalid pie id", 400);

    const supabase = await createClient();

    // 1. Pie must exist and not be frozen.
    const { data: pie, error: pieError } = await supabase
      .from("pies")
      .select("id, status")
      .eq("id", id)
      .single();

    if (pieError || !pie) return fail("Pie not found", 404);
    if (pie.status === "frozen") {
      return fail("Pie is frozen — new sessions cannot be started", 409);
    }

    // 2. Caller must be a participant in this Pie.
    const me = await participantForUser(id, user.id);
    if (!me) {
      return fail("You are not a participant in this Pie", 403);
    }

    // 3. Reject if the caller already has an open session on this Pie.
    const { data: existing } = await supabase
      .from("work_sessions")
      .select("id, started_at")
      .eq("pie_id", id)
      .eq("participant_id", me.id)
      .is("ended_at", null)
      .maybeSingle();

    if (existing) {
      return fail(
        "You already have an open session. Stop it before starting a new one.",
        409,
        { session_id: existing.id, started_at: existing.started_at }
      );
    }

    // 4. Create the session.
    const { data: session, error: insertError } = await supabase
      .from("work_sessions")
      .insert({
        pie_id: id,
        participant_id: me.id,
        user_id: user.id,
      })
      .select("*")
      .single();

    if (insertError || !session) {
      console.error("Error starting work session:", insertError);
      return fail("Failed to start session", 500);
    }

    return ok(session, 201);
  } catch (err) {
    console.error("Unexpected error in POST work-sessions/start:", err);
    return fail("Internal server error", 500);
  }
}
