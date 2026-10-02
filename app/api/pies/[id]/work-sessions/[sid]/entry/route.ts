// ============================================================
// Execution Tracker — POST /api/pies/[id]/work-sessions/[sid]/entry
// ============================================================
// Logs the hourly "what did you do". An entry refreshes BOTH the
// last_entry_at and the last_heartbeat_at — submitting an entry is
// implicitly a heartbeat, so the member does not need to also ping.
//
// Rejects if the session has ended, or if the caller is neither the
// session owner nor an admin.
// ============================================================

import { createClient } from "@/lib/supabase";
import { ok, fail, requireUser, isUuid } from "@/lib/slicing-pie/server/context";

interface RouteContext {
  params: Promise<{ id: string; sid: string }>;
}

const MAX_DESCRIPTION = 1000;
const DEFAULT_MINUTES = 60;
const MAX_MINUTES = 720;

export async function POST(request: Request, context: RouteContext) {
  try {
    const { user, response } = await requireUser();
    if (response) return response;

    const { id, sid } = await context.params;
    if (!isUuid(id) || !isUuid(sid)) return fail("Invalid id", 400);

    const body = await request.json();
    const description =
      typeof body?.description === "string" ? body.description.trim() : "";
    const minutesRaw = body?.minutes;
    const minutes =
      minutesRaw === undefined ? DEFAULT_MINUTES : Number(minutesRaw);

    if (!description) return fail("Description is required", 400);
    if (description.length > MAX_DESCRIPTION) {
      return fail(`Description must be under ${MAX_DESCRIPTION} characters`, 400);
    }
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > MAX_MINUTES) {
      return fail(`Minutes must be between 1 and ${MAX_MINUTES}`, 400);
    }

    const supabase = await createClient();

    const { data: session, error } = await supabase
      .from("work_sessions")
      .select("id, pie_id, user_id, ended_at")
      .eq("id", sid)
      .eq("pie_id", id)
      .single();

    if (error || !session) return fail("Session not found", 404);
    if (session.ended_at) return fail("Session has already ended", 409);

    const isOwner = session.user_id === user.id;
    if (!isOwner && user.role !== "admin") {
      return fail("You cannot log against this session", 403);
    }

    const now = new Date().toISOString();

    const { data: entry, error: entryError } = await supabase
      .from("work_session_entries")
      .insert({
        session_id: sid,
        logged_at: now,
        minutes: Math.round(minutes),
        description,
      })
      .select("*")
      .single();

    if (entryError || !entry) {
      console.error("Error creating entry:", entryError);
      return fail("Failed to save entry", 500);
    }

    // An entry also refreshes the heartbeat and last_entry_at.
    await supabase
      .from("work_sessions")
      .update({ last_heartbeat_at: now, last_entry_at: now })
      .eq("id", sid);

    return ok(entry, 201);
  } catch (err) {
    console.error("Unexpected error in entry:", err);
    return fail("Internal server error", 500);
  }
}
