// ============================================================
// Execution Tracker — POST /api/pies/[id]/work-sessions/[sid]/extend
// ============================================================
// Extends a session that ended with end_reason = 'timeout' or
// 'no_entries'. The member declares they kept working after the
// timeout; the extension is recorded as a new entry and the linked
// time_logs row's hours are updated to the new total.
//
// Extended time still goes through admin review — the member is
// declaring, not deciding.
// ============================================================

import { createClient } from "@/lib/supabase";
import { ok, fail, requireUser, isUuid } from "@/lib/slicing-pie/server/context";

interface RouteContext {
  params: Promise<{ id: string; sid: string }>;
}

const MAX_DESCRIPTION = 1000;
const MAX_SESSION_HOURS = 12;

export async function POST(request: Request, context: RouteContext) {
  try {
    const { user, response } = await requireUser();
    if (response) return response;

    const { id, sid } = await context.params;
    if (!isUuid(id) || !isUuid(sid)) return fail("Invalid id", 400);

    const body = await request.json();
    const newEndedAtRaw = body?.new_ended_at;
    const description =
      typeof body?.description === "string" ? body.description.trim() : "";

    if (typeof newEndedAtRaw !== "string") {
      return fail("new_ended_at is required (ISO 8601)", 400);
    }
    if (!description) return fail("Description is required", 400);
    if (description.length > MAX_DESCRIPTION) {
      return fail(`Description must be under ${MAX_DESCRIPTION} characters`, 400);
    }

    const newEndedAt = new Date(newEndedAtRaw);
    if (Number.isNaN(newEndedAt.getTime())) {
      return fail("new_ended_at must be a valid ISO timestamp", 400);
    }
    if (newEndedAt.getTime() > Date.now() + 60_000) {
      return fail("new_ended_at cannot be in the future", 400);
    }

    const supabase = await createClient();

    const { data: session, error } = await supabase
      .from("work_sessions")
      .select("*")
      .eq("id", sid)
      .eq("pie_id", id)
      .single();

    if (error || !session) return fail("Session not found", 404);

    const isOwner = session.user_id === user.id;
    if (!isOwner && user.role !== "admin") {
      return fail("You cannot extend this session", 403);
    }

    if (!session.ended_at) {
      return fail("Session is still active; stop it first", 409);
    }
    if (session.end_reason !== "timeout" && session.end_reason !== "no_entries") {
      return fail("Only timed-out sessions can be extended", 400);
    }

    const oldEnd = new Date(session.ended_at).getTime();
    if (newEndedAt.getTime() <= oldEnd) {
      return fail("new_ended_at must be after the session's original end", 400);
    }

    // Compute the extension minutes (bounded by the 12h cap).
    const started = new Date(session.started_at).getTime();
    const maxEnd = started + MAX_SESSION_HOURS * 60 * 60 * 1000;
    const effectiveEnd = Math.min(newEndedAt.getTime(), maxEnd);
    const newCountedMinutes = Math.floor((effectiveEnd - started) / 60000);
    const additionalMinutes = Math.max(
      0,
      newCountedMinutes - (session.counted_minutes ?? 0)
    );

    if (additionalMinutes <= 0) {
      return fail("No additional time to add", 400);
    }

    // 1. Record the extension as an entry.
    const { error: entryError } = await supabase
      .from("work_session_entries")
      .insert({
        session_id: sid,
        logged_at: new Date().toISOString(),
        minutes: additionalMinutes,
        description: `[Extension] ${description}`,
      });

    if (entryError) {
      console.error("Error recording extension entry:", entryError);
      return fail("Failed to record extension", 500);
    }

    // 2. Update the session's ended_at and counted_minutes.
    const { error: updateError } = await supabase
      .from("work_sessions")
      .update({
        ended_at: new Date(effectiveEnd).toISOString(),
        counted_minutes: newCountedMinutes,
        last_entry_at: new Date().toISOString(),
      })
      .eq("id", sid);

    if (updateError) {
      console.error("Error updating session after extension:", updateError);
      return fail("Failed to update session", 500);
    }

    // 3. Update the linked time_logs row's hours.
    const { error: logError } = await supabase
      .from("time_logs")
      .update({ hours: newCountedMinutes / 60 })
      .eq("session_id", sid);

    if (logError) {
      console.error("Error updating linked time log:", logError);
    }

    return ok({
      session_id: sid,
      counted_minutes: newCountedMinutes,
      added_minutes: additionalMinutes,
    });
  } catch (err) {
    console.error("Unexpected error in extend:", err);
    return fail("Internal server error", 500);
  }
}
