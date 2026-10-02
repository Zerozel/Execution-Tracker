// ============================================================
// Execution Tracker — POST /api/pies/[id]/work-sessions/[sid]/stop
// ============================================================
// Closes a session manually. Computes counted_minutes from the last
// heartbeat, then creates a pending time_logs row for admin review.
//
// counted_minutes is zero when no entries were submitted: a session
// with no evidence of work does not earn any credit.
// ============================================================

import { createClient } from "@/lib/supabase";
import { ok, fail, requireUser, isUuid } from "@/lib/slicing-pie/server/context";

interface RouteContext {
  params: Promise<{ id: string; sid: string }>;
}

const MAX_SESSION_HOURS = 12;

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { user, response } = await requireUser();
    if (response) return response;

    const { id, sid } = await context.params;
    if (!isUuid(id) || !isUuid(sid)) return fail("Invalid id", 400);

    const supabase = await createClient();

    const { data: session, error } = await supabase
      .from("work_sessions")
      .select("*")
      .eq("id", sid)
      .eq("pie_id", id)
      .single();

    if (error || !session) return fail("Session not found", 404);
    if (session.ended_at) return fail("Session has already ended", 409);

    const isOwner = session.user_id === user.id;
    if (!isOwner && user.role !== "admin") {
      return fail("You cannot stop this session", 403);
    }

    // Compute counted minutes from started_at → last_heartbeat_at.
    const started = new Date(session.started_at).getTime();
    const lastHb = new Date(session.last_heartbeat_at).getTime();
    const rawMinutes = Math.max(0, Math.floor((lastHb - started) / 60000));
    const capped = Math.min(rawMinutes, MAX_SESSION_HOURS * 60);

    // No entries → no credit. The session still closes, but it counts
    // zero minutes and does not produce a time_logs row.
    const hasEntries = !!session.last_entry_at;
    const countedMinutes = hasEntries ? capped : 0;

    const now = new Date().toISOString();
    const { error: stopError } = await supabase
      .from("work_sessions")
      .update({
        ended_at: now,
        end_reason: "manual",
        counted_minutes: countedMinutes,
      })
      .eq("id", sid);

    if (stopError) {
      console.error("Error stopping session:", stopError);
      return fail("Failed to stop session", 500);
    }

    let logId: string | null = null;

    if (countedMinutes > 0) {
      const workDate = new Date(session.started_at).toISOString().split("T")[0];
      const { data: log, error: logError } = await supabase
        .from("time_logs")
        .insert({
          pie_id: session.pie_id,
          participant_id: session.participant_id,
          user_id: session.user_id,
          work_date: workDate,
          hours: countedMinutes / 60,
          notes: "Session closed",
          status: "pending",
          session_id: session.id,
          review_status: "pending",
          created_by: session.user_id,
        })
        .select("id")
        .single();

      if (logError) {
        console.error("Error creating time log from session:", logError);
      } else {
        logId = log?.id ?? null;
      }
    }

    return ok({ session_id: sid, counted_minutes: countedMinutes, log_id: logId });
  } catch (err) {
    console.error("Unexpected error in stop:", err);
    return fail("Internal server error", 500);
  }
}
