// ============================================================
// Execution Tracker — GET & POST /api/pies/[id]/time-logs
// ============================================================
// Self-service hourly time logging (the day-to-day member action).
//
// GET  → time logs for the Pie. Members see their OWN logs; admins
//        may pass ?participant_id=… or ?all=1 to see everyone's.
// POST → log time. Accepts a SINGLE entry or a BATCH (the offline
//        outbox flushes many at once). Each entry carries a
//        `client_uuid` so a log synced twice is de-duplicated — this
//        is what makes offline sync safe (§ works-offline requirement).
//
// Members may only log for THEMSELVES (their linked participant);
// admins may log on behalf of any participant. Raw hours only — the
// slice math happens later at payday.
// ============================================================

import { createClient } from "@/lib/supabase";
import {
  ok,
  fail,
  requireUser,
  participantForUser,
  isUuid,
  todayISO,
} from "@/lib/slicing-pie/server/context";
import type { TimeLogInput } from "@/types/time-tracking";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { user, response } = await requireUser();
    if (response) return response;

    const { id } = await context.params;
    if (!isUuid(id)) return fail("Invalid pie id", 400);

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status"); // pending|converted|void
    const wantsAll = searchParams.get("all") === "1";
    const participantId = searchParams.get("participant_id");

    const supabase = await createClient();
    let query = supabase
      .from("time_logs")
      .select("*")
      .eq("pie_id", id)
      .order("work_date", { ascending: false });

    if (statusFilter) query = query.eq("status", statusFilter);

    if (user.role === "admin") {
      if (participantId && isUuid(participantId)) {
        query = query.eq("participant_id", participantId);
      }
      // else: admin sees all (unless a participant filter was given)
    } else {
      // Members are restricted to their own logs regardless of params.
      const me = await participantForUser(id, user.id);
      if (!me) return ok([]); // not a participant → nothing to show
      query = query.eq("participant_id", me.id);
    }

    // `wantsAll` only widens the (already-scoped) status filter.
    if (wantsAll) query = query.limit(1000);

    const { data, error } = await query;
    if (error) {
      console.error("Error fetching time logs:", error);
      return fail("Failed to fetch time logs", 500);
    }
    return ok(data ?? []);
  } catch (err) {
    console.error("Unexpected error in GET time-logs:", err);
    return fail("Internal server error", 500);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { user, response } = await requireUser();
    if (response) return response;

    const { id } = await context.params;
    if (!isUuid(id)) return fail("Invalid pie id", 400);

    const supabase = await createClient();

    // Reject logging on a frozen Pie (no new at-risk contributions, §17).
    const { data: pie } = await supabase
      .from("pies")
      .select("id, status")
      .eq("id", id)
      .single();
    if (!pie) return fail("Pie not found", 404);
    if (pie.status === "frozen") {
      return fail("Pie is frozen — time logging is closed", 409);
    }

    const body = await request.json();
    const rawEntries: TimeLogInput[] = Array.isArray(body?.entries)
      ? body.entries
      : [body];

    if (rawEntries.length === 0) return fail("No entries provided", 400);
    if (rawEntries.length > 200) {
      return fail("Too many entries in one batch (max 200)", 400);
    }

    const isAdmin = user.role === "admin";
    const me = await participantForUser(id, user.id);

    // Preload participant list once (admins log on behalf of anyone).
    const rows: Record<string, unknown>[] = [];
    const errors: { client_uuid?: string; error: string }[] = [];

    for (const entry of rawEntries) {
      const hours = Number(entry.hours);
      if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
        errors.push({
          client_uuid: entry.client_uuid,
          error: "hours must be between 0 and 24",
        });
        continue;
      }

      // Determine the target participant.
      let participantId: string | null = null;
      if (entry.participant_id && isUuid(entry.participant_id)) {
        if (!isAdmin && (!me || me.id !== entry.participant_id)) {
          errors.push({
            client_uuid: entry.client_uuid,
            error: "You may only log time for yourself",
          });
          continue;
        }
        participantId = entry.participant_id;
      } else {
        if (!me) {
          errors.push({
            client_uuid: entry.client_uuid,
            error: "You are not a participant in this Pie",
          });
          continue;
        }
        participantId = me.id;
      }

      // Resolve the target's user_id for stamping (best effort).
      let targetUserId: string | null = user.id;
      if (participantId !== me?.id) {
        const { data: p } = await supabase
          .from("pie_participants")
          .select("user_id")
          .eq("id", participantId)
          .single();
        targetUserId = (p?.user_id as string) ?? null;
      }

      rows.push({
        pie_id: id,
        participant_id: participantId,
        user_id: targetUserId,
        work_date: entry.work_date || todayISO(),
        hours,
        notes: entry.notes?.trim() || null,
        project_tag: entry.project_tag?.trim() || null,
        status: "pending",
        client_uuid: entry.client_uuid || null,
        created_by: user.id,
      });
    }

    let inserted: unknown[] = [];
    if (rows.length > 0) {
      // Upsert on client_uuid → offline-safe idempotency (a re-synced
      // batch does not create duplicates).
      const { data, error } = await supabase
        .from("time_logs")
        .upsert(rows, { onConflict: "client_uuid", ignoreDuplicates: true })
        .select("*");

      if (error) {
        console.error("Error inserting time logs:", error);
        return fail("Failed to save time logs", 500);
      }
      inserted = data ?? [];
    }

    return ok(
      {
        inserted,
        inserted_count: inserted.length,
        errors,
      },
      errors.length && inserted.length === 0 ? 400 : 201
    );
  } catch (err) {
    console.error("Unexpected error in POST time-logs:", err);
    return fail("Internal server error", 500);
  }
}
