// ============================================================
// Execution Tracker — GET /api/pies/[id]/work-sessions/active
// ============================================================
// Returns the caller's work-session state on this Pie:
//
//   active                — the currently open session, or null
//   entries               — the entries attached to that session
//   awaiting_explanation  — ended sessions where the entry total
//                           falls short of counted_minutes and no
//                           explanation has been submitted yet
//
// Applies the lazy timeout check to the active session before
// returning. Sessions awaiting explanation are listed newest first.
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

interface EntryRow {
  id: string;
  session_id: string;
  logged_at: string;
  minutes: number;
  description: string;
}

const GRACE_MS = 2 * 60 * 60 * 1000;   // 2h no-heartbeat → timeout
const MAX_MS = 12 * 60 * 60 * 1000;    // 12h cap
const GAP_GRACE_MINUTES = 15;          // trivial gap — do not prompt

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { user, response } = await requireUser();
    if (response) return response;

    const { id } = await context.params;
    if (!isUuid(id)) return fail("Invalid pie id", 400);

    const me = await participantForUser(id, user.id);
    if (!me) {
      return ok({ active: null, entries: [], awaiting_explanation: [] });
    }

    const supabase = await createClient();

    // 1. The active session (if any) and its entries.
    const { data: activeData, error: activeError } = await supabase
      .from("work_sessions")
      .select("*")
      .eq("pie_id", id)
      .eq("participant_id", me.id)
      .is("ended_at", null)
      .maybeSingle();

    if (activeError) {
      console.error("Error fetching active session:", activeError);
      return fail("Failed to fetch active session", 500);
    }

    let active: SessionRow | null = (activeData as SessionRow) ?? null;
    let entries: EntryRow[] = [];

    if (active) {
      // Lazy timeout check — a stale session closes before we return.
      const closed = await resolveSessionState(supabase, active);
      if (closed.ended_at) {
        // Session was just auto-closed by the resolver.
        active = null;
      } else {
        active = closed;
        const { data: entryData } = await supabase
          .from("work_session_entries")
          .select("*")
          .eq("session_id", active.id)
          .order("logged_at", { ascending: true });
        entries = (entryData ?? []) as EntryRow[];
      }
    }

    // 2. Ended sessions awaiting explanation.
    // Only the caller's own sessions, only unexplained, newest first.
    const { data: endedData } = await supabase
      .from("work_sessions")
      .select("*")
      .eq("pie_id", id)
      .eq("participant_id", me.id)
      .not("ended_at", "is", null)
      .is("explained_at", null)
      .order("started_at", { ascending: false })
      .limit(20);

    const endedRows = (endedData ?? []) as SessionRow[];
    const awaiting: Array<
      SessionRow & { entry_total_minutes: number; gap_minutes: number }
    > = [];

    for (const s of endedRows) {
      const { data: entryRows } = await supabase
        .from("work_session_entries")
        .select("minutes")
        .eq("session_id", s.id);

      const entryTotal = (entryRows ?? []).reduce(
        (sum, e) => sum + (e.minutes ?? 0),
        0
      );
      const countedTotal = s.counted_minutes ?? 0;
      const gap = countedTotal - entryTotal;

      // Meaningful gap → worth prompting
      const hasGap =
        gap > GAP_GRACE_MINUTES ||
        (countedTotal === 0 && entryTotal === 0);

      if (hasGap) {
        awaiting.push({
          ...s,
          entry_total_minutes: entryTotal,
          gap_minutes: gap,
        });
      }
    }

    return ok({
      active,
      entries,
      awaiting_explanation: awaiting,
    });
  } catch (err) {
    console.error("Unexpected error in active:", err);
    return fail("Internal server error", 500);
  }
}

// ------------------------------------------------------------
// Lazy timeout resolver
// ------------------------------------------------------------
// Same rules as working-now: 2h without heartbeat closes the session
// at the last heartbeat; sessions with no entries and over 2h old
// close with zero minutes; sessions running over 12h are capped.
//
// When the resolver closes a session, it does NOT create a time_logs
// row. Under the explanation model, an unexplained close is a prompt
// to the member, not an automatic log. The member submits the
// explanation, and the explain endpoint creates the log.

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

  return {
    ...session,
    ended_at: endedAt,
    end_reason: endReason,
    counted_minutes: finalCounted,
  };
}
