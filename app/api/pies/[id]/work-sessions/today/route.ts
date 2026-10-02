// ============================================================
// Execution Tracker — GET /api/pies/[id]/work-sessions/today
// ============================================================
// Admin-only. Returns every session that started today, with the
// participant's display name joined, and the entries inline.
// Runs the lazy timeout resolver on each open session first.
// ============================================================

import { createClient } from "@/lib/supabase";
import { ok, fail, requireAdminApi, isUuid, todayISO } from "@/lib/slicing-pie/server/context";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { response } = await requireAdminApi();
    if (response) return response;

    const { id } = await context.params;
    if (!isUuid(id)) return fail("Invalid pie id", 400);

    const supabase = await createClient();
    const today = todayISO();

    const { data: sessions, error } = await supabase
      .from("work_sessions")
      .select("*")
      .eq("pie_id", id)
      .gte("started_at", `${today}T00:00:00.000Z`)
      .order("started_at", { ascending: false });

    if (error) {
      console.error("Error fetching today's sessions:", error);
      return fail("Failed to fetch today's sessions", 500);
    }

    const rows = sessions ?? [];
    const participantIds = Array.from(new Set(rows.map((s) => s.participant_id)));
    const sessionIds = rows.map((s) => s.id);

    const [{ data: participants }, { data: entries }] = await Promise.all([
      participantIds.length > 0
        ? supabase
            .from("pie_participants")
            .select("id, display_name, pie_role")
            .in("id", participantIds)
        : Promise.resolve({ data: [] as Array<{ id: string; display_name: string; pie_role: string }> }),
      sessionIds.length > 0
        ? supabase
            .from("work_session_entries")
            .select("*")
            .in("session_id", sessionIds)
            .order("logged_at", { ascending: true })
        : Promise.resolve({ data: [] as Array<{ id: string; session_id: string; logged_at: string; minutes: number; description: string }> }),
    ]);

    const nameById = new Map((participants ?? []).map((p) => [p.id, p.display_name]));
    const roleById = new Map((participants ?? []).map((p) => [p.id, p.pie_role]));
    const entriesBySession = new Map<string, typeof entries>();
    for (const e of entries ?? []) {
      const list = entriesBySession.get(e.session_id) ?? [];
      list.push(e);
      entriesBySession.set(e.session_id, list);
    }

    const enriched = rows.map((s) => ({
      ...s,
      participant_name: nameById.get(s.participant_id) ?? "Unknown",
      participant_role: roleById.get(s.participant_id) ?? null,
      entries: entriesBySession.get(s.id) ?? [],
    }));

    return ok(enriched);
  } catch (err) {
    console.error("Unexpected error in today:", err);
    return fail("Internal server error", 500);
  }
}
