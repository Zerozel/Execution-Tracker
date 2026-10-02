// ============================================================
// Execution Tracker — GET /api/pies/[id]/work-sessions/active
// ============================================================
// Returns the caller's own active session on this Pie, or null.
// Applies the lazy timeout check (see resolveSessionState) before
// returning — a stale session is closed and reported as ended.
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

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { user, response } = await requireUser();
    if (response) return response;

    const { id } = await context.params;
    if (!isUuid(id)) return fail("Invalid pie id", 400);

    const me = await participantForUser(id, user.id);
    if (!me) return ok(null);

    const supabase = await createClient();
    const { data: session, error } = await supabase
      .from("work_sessions")
      .select("*")
      .eq("pie_id", id)
      .eq("participant_id", me.id)
      .is("ended_at", null)
      .maybeSingle();

    if (error) {
      console.error("Error fetching active session:", error);
      return fail("Failed to fetch active session", 500);
    }

    if (!session) return ok(null);

    // Lazy timeout check.
    const closed = await resolveSessionState(supabase, session);
    if (closed.ended_at) {
      // Session was just closed by the resolver — return null to the
      // caller because there is no active session any more.
      return ok(null, 200);
    }

    // Attach entries for the member UI.
    const { data: entries } = await supabase
      .from("work_session_entries")
      .select("*")
      .eq("session_id", session.id)
      .order("logged_at", { ascending: true });

    return ok({ ...closed, entries: entries ?? [] });
  } catch (err) {
    console.error("Unexpected error in active:", err);
    return fail("Internal server error", 500);
  }
}

// ------------------------------------------------------------
// Lazy timeout resolver
// ------------------------------------------------------------
// Same logic the architecture document specifies: if the session
// has been without a heartbeat for 2h, close it at the last heartbeat.
// If it never had an entry and is over 2h old, close it with zero
// minutes. If it has run over 12h, cap it.

interface SessionRow {
  id: string;
  pie_id: string;
  participant_id: string;
  user_id: string | null;
  started_at: string;
  last_heartbeat_at: string;
  last_entry_at: string | null;
  ended_at: string | null;
  end_reason: string | null;
  counted_minutes: number | null;
}

const GRACE_MS = 2 * 60 * 60 * 1000;
const MAX_MS = 12 * 60 * 60 * 1000;

async function resolveSessionState(
  supabase: Awaited<ReturnType<typeof createClient>>,
  session: SessionRow
): Promise<SessionRow> {
  if (session.ended_at) return session;

  const now = Date.now();
  const started = new Date(session.started_at).getTime();
  const lastHb = new Date(session.last_heartbeat_at).getTime();
  const lastEntry = session.last_entry_at
    ? new Date(session.last_entry_at).getTime()
    : null;

  let endReason: string | null = null;

  if (now - lastHb > GRACE_MS) endReason = "timeout";
  else if (!lastEntry && now - started > GRACE_MS) endReason = "no_entries";
  else if (now - started > MAX_MS) endReason = "capped";

  if (!endReason) return session;

  const counted = Math.min(
    Math.max(0, Math.floor((lastHb - started) / 60000)),
    MAX_MS / 60000
  );
  const finalCounted = lastEntry ? counted : 0;
  const endedAt = new Date(Math.min(lastHb, now)).toISOString();

  await supabase
    .from("work_sessions")
    .update({
      ended_at: endedAt,
      end_reason: endReason,
      counted_minutes: finalCounted,
    })
    .eq("id", session.id);

  if (finalCounted > 0) {
    const workDate = new Date(session.started_at).toISOString().split("T")[0];
    await supabase.from("time_logs").insert({
      pie_id: session.pie_id,
      participant_id: session.participant_id,
      user_id: session.user_id,
      work_date: workDate,
      hours: finalCounted / 60,
      notes: `Session auto-closed (${endReason})`,
      status: "pending",
      session_id: session.id,
      review_status: "pending",
      created_by: session.user_id,
    });
  }

  return {
    ...session,
    ended_at: endedAt,
    end_reason: endReason,
    counted_minutes: finalCounted,
  };
}
