// ============================================================
// Execution Tracker — GET /api/pies/[id]/work-sessions/working-now
// ============================================================
// Admin-only. Returns every currently open session on the Pie,
// with the participant name, minutes active, and minutes since last
// heartbeat. Sessions whose heartbeat is more than 60 minutes old
// are flagged in the response so the UI can warn.
//
// Runs the lazy timeout resolver on each open session first, so
// stale ones do not appear.
// ============================================================

import { createClient } from "@/lib/supabase";
import { ok, fail, requireAdminApi, isUuid } from "@/lib/slicing-pie/server/context";

interface RouteContext {
  params: Promise<{ id: string }>;
}

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
const WARN_MS = 60 * 60 * 1000;
const MAX_MS = 12 * 60 * 60 * 1000;

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { response } = await requireAdminApi();
    if (response) return response;

    const { id } = await context.params;
    if (!isUuid(id)) return fail("Invalid pie id", 400);

    const supabase = await createClient();

    const { data: sessions, error } = await supabase
      .from("work_sessions")
      .select("*")
      .eq("pie_id", id)
      .is("ended_at", null);

    if (error) {
      console.error("Error fetching active sessions:", error);
      return fail("Failed to fetch active sessions", 500);
    }

    const rows = (sessions ?? []) as SessionRow[];
    const resolved: SessionRow[] = [];

    for (const s of rows) {
      const closed = await resolveSessionState(supabase, s);
      if (!closed.ended_at) resolved.push(closed);
    }

    const participantIds = Array.from(new Set(resolved.map((s) => s.participant_id)));
    const { data: participants } = participantIds.length > 0
      ? await supabase
          .from("pie_participants")
          .select("id, display_name, pie_role")
          .in("id", participantIds)
      : { data: [] as Array<{ id: string; display_name: string; pie_role: string }> };

    const nameById = new Map((participants ?? []).map((p) => [p.id, p.display_name]));
    const roleById = new Map((participants ?? []).map((p) => [p.id, p.pie_role]));

    const now = Date.now();
    const enriched = resolved.map((s) => {
      const started = new Date(s.started_at).getTime();
      const lastHb = new Date(s.last_heartbeat_at).getTime();
      const minutesActive = Math.floor((now - started) / 60000);
      const minutesSinceHeartbeat = Math.floor((now - lastHb) / 60000);
      return {
        ...s,
        participant_name: nameById.get(s.participant_id) ?? "Unknown",
        participant_role: roleById.get(s.participant_id) ?? null,
        minutes_active: minutesActive,
        minutes_since_heartbeat: minutesSinceHeartbeat,
        warning: minutesSinceHeartbeat >= WARN_MS / 60000,
      };
    });

    return ok(enriched);
  } catch (err) {
    console.error("Unexpected error in working-now:", err);
    return fail("Internal server error", 500);
  }
}

// ------------------------------------------------------------
// Lazy timeout resolver (duplicated from active/route.ts for
// locality — the two endpoints are the only callers, and
// inlining keeps each route self-contained).
// ------------------------------------------------------------

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
