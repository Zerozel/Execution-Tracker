// ============================================================
// Execution Tracker — POST /api/pies/[id]/work-sessions/[sid]/explain
// ============================================================
// The member's explanation for a session that ended with a gap
// between its counted duration and the sum of its entries.
//
// The explanation becomes the evidence for a new time_logs row that
// enters the admin review queue. The member cannot grant themselves
// credit — they can only declare what they did, why they didn't log,
// and how long they worked. The admin decides.
//
// Rules:
//   • Session must exist, must have ended, must belong to the caller.
//   • Session must not already have been explained.
//   • There must be a meaningful gap (entry total < counted - 15m,
//     OR counted = 0 and no entries at all).
//   • Declaration cannot exceed the session's elapsed duration.
//   • Explanation is required and capped at 2000 characters.
// ============================================================

import { createClient } from "@/lib/supabase";
import {
  ok,
  fail,
  requireUser,
  isUuid,
} from "@/lib/slicing-pie/server/context";

interface RouteContext {
  params: Promise<{ id: string; sid: string }>;
}

const MAX_EXPLANATION = 2000;
const GAP_GRACE_MINUTES = 15;

export async function POST(request: Request, context: RouteContext) {
  try {
    const { user, response } = await requireUser();
    if (response) return response;

    const { id, sid } = await context.params;
    if (!isUuid(id) || !isUuid(sid)) return fail("Invalid id", 400);

    const body = await request.json().catch(() => ({}));
    const explanation =
      typeof body?.explanation === "string" ? body.explanation.trim() : "";
    const declaredMinutesRaw = body?.declared_minutes;
    const declaredMinutes = Number(declaredMinutesRaw);

    if (!explanation) {
      return fail("Explanation is required", 400);
    }
    if (explanation.length > MAX_EXPLANATION) {
      return fail(
        `Explanation must be under ${MAX_EXPLANATION} characters`,
        400
      );
    }
    if (
      !Number.isFinite(declaredMinutes) ||
      declaredMinutes < 1 ||
      !Number.isInteger(declaredMinutes)
    ) {
      return fail("declared_minutes must be a positive integer", 400);
    }

    const supabase = await createClient();

    // Load the session and verify it belongs to the caller.
    const { data: session, error: sessError } = await supabase
      .from("work_sessions")
      .select("*")
      .eq("id", sid)
      .eq("pie_id", id)
      .single();

    if (sessError || !session) return fail("Session not found", 404);

    const isOwner = session.user_id === user.id;
    if (!isOwner && user.role !== "admin") {
      return fail("You cannot explain this session", 403);
    }

    if (!session.ended_at) {
      return fail("Session is still active — stop it before explaining", 409);
    }
    if (session.explained_at) {
      return fail("This session has already been explained", 409);
    }

    // Compute the gap: sum of entries vs. counted minutes.
    const { data: entryRows } = await supabase
      .from("work_session_entries")
      .select("minutes")
      .eq("session_id", sid);

    const entryTotal = (entryRows ?? []).reduce(
      (sum, e) => sum + (e.minutes ?? 0),
      0
    );
    const countedTotal = session.counted_minutes ?? 0;
    const gap = countedTotal - entryTotal;

    // Is there a meaningful gap worth explaining?
    const hasGap =
      gap > GAP_GRACE_MINUTES ||
      (countedTotal === 0 && entryTotal === 0);

    if (!hasGap) {
      return fail(
        "This session does not need an explanation — its entries match its duration",
        400
      );
    }

    // The declaration cannot exceed the session's actual elapsed time.
    const startedMs = new Date(session.started_at).getTime();
    const endedMs = new Date(session.ended_at).getTime();
    const sessionMinutes = Math.max(0, Math.floor((endedMs - startedMs) / 60000));

    if (declaredMinutes > sessionMinutes) {
      return fail(
        `You cannot declare more than the session's ${sessionMinutes} elapsed minutes`,
        400
      );
    }

    const now = new Date().toISOString();

    // 1. Save the explanation onto the session.
    const { error: updateError } = await supabase
      .from("work_sessions")
      .update({
        member_explanation: explanation,
        declared_minutes: declaredMinutes,
        explained_at: now,
      })
      .eq("id", sid);

    if (updateError) {
      console.error("Error saving explanation:", updateError);
      return fail("Failed to save explanation", 500);
    }

    // 2. Create a time_logs row for admin review.
    const workDate = new Date(session.started_at).toISOString().split("T")[0];
    const { data: log, error: logError } = await supabase
      .from("time_logs")
      .insert({
        pie_id: session.pie_id,
        participant_id: session.participant_id,
        user_id: session.user_id,
        work_date: workDate,
        hours: declaredMinutes / 60,
        notes: `Member explanation — see session for details`,
        status: "pending",
        session_id: session.id,
        review_status: "pending",
        created_by: session.user_id,
      })
      .select("id")
      .single();

    if (logError || !log) {
      console.error("Error creating log from explanation:", logError);
      return fail("Explanation saved but failed to create review log", 500);
    }

    return ok(
      {
        session_id: sid,
        declared_minutes: declaredMinutes,
        log_id: log.id,
      },
      201
    );
  } catch (err) {
    console.error("Unexpected error in explain:", err);
    return fail("Internal server error", 500);
  }
}
