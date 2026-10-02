// ============================================================
// Execution Tracker — POST /api/pies/[id]/work-sessions/[sid]/heartbeat
// ============================================================
// Silent ping that keeps the session alive. Called by the client
// every 60 minutes while the tab is open, and by the entry and stop
// endpoints implicitly (they also refresh the heartbeat).
//
// Rejects if the session has ended, or if the caller is neither the
// session owner nor an admin.
// ============================================================

import { createClient } from "@/lib/supabase";
import { ok, fail, requireUser, isUuid } from "@/lib/slicing-pie/server/context";

interface RouteContext {
  params: Promise<{ id: string; sid: string }>;
}

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { user, response } = await requireUser();
    if (response) return response;

    const { id, sid } = await context.params;
    if (!isUuid(id) || !isUuid(sid)) return fail("Invalid id", 400);

    const supabase = await createClient();

    const { data: session, error } = await supabase
      .from("work_sessions")
      .select("id, pie_id, user_id, ended_at")
      .eq("id", sid)
      .eq("pie_id", id)
      .single();

    if (error || !session) return fail("Session not found", 404);
    if (session.ended_at) {
      return fail("Session has already ended", 409);
    }

    // Only the owner or an admin may heartbeat.
    const isOwner = session.user_id === user.id;
    if (!isOwner && user.role !== "admin") {
      return fail("You cannot heartbeat this session", 403);
    }

    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("work_sessions")
      .update({ last_heartbeat_at: now })
      .eq("id", sid);

    if (updateError) {
      console.error("Error updating heartbeat:", updateError);
      return fail("Failed to record heartbeat", 500);
    }

    return ok({ ok: true, last_heartbeat_at: now });
  } catch (err) {
    console.error("Unexpected error in heartbeat:", err);
    return fail("Internal server error", 500);
  }
}
