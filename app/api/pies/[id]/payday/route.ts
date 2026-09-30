// ============================================================
// Execution Tracker — GET & POST /api/pies/[id]/payday
// ============================================================
// The month-end conversion of logged hours into slices.
//
// GET  → a read-only PROJECTION (admin): how many slices each
//        participant's pending logs would earn if run now. Optional
//        ?period_start / ?period_end bound the window.
// POST → COMMIT the payday (admin only): converts pending logs in the
//        window into immutable `time` contributions, marks them
//        converted, and records a payday_runs audit row.
//
// Frozen Pies reject the commit (no new slice accrual, §17).
// ============================================================

import { createClient } from "@/lib/supabase";
import {
  ok,
  fail,
  requireUser,
  requireAdminApi,
  writeAudit,
  isUuid,
  todayISO,
} from "@/lib/slicing-pie/server/context";
import { projectPayday, runPayday } from "@/lib/slicing-pie/server/payday";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    // Projection is admin-only (it exposes everyone's totals).
    const { response } = await requireAdminApi();
    if (response) return response;

    const { id } = await context.params;
    if (!isUuid(id)) return fail("Invalid pie id", 400);

    const { searchParams } = new URL(request.url);
    const periodStart = searchParams.get("period_start") ?? undefined;
    const periodEnd = searchParams.get("period_end") ?? undefined;

    const preview = await projectPayday(id, periodStart, periodEnd);
    return ok(preview);
  } catch (err) {
    console.error("Unexpected error in GET payday:", err);
    return fail("Internal server error", 500);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { user, response } = await requireAdminApi();
    if (response) return response;

    const { id } = await context.params;
    if (!isUuid(id)) return fail("Invalid pie id", 400);

    const supabase = await createClient();
    const { data: pie } = await supabase
      .from("pies")
      .select("id, status")
      .eq("id", id)
      .single();
    if (!pie) return fail("Pie not found", 404);
    if (pie.status === "frozen") {
      return fail("Pie is frozen — payday cannot run", 409);
    }

    const body = await request.json().catch(() => ({}));
    const {
      period_start,
      period_end,
      note,
    } = body as { period_start?: string; period_end?: string; note?: string };

    // Default window: everything up to today.
    const periodEnd = period_end || todayISO();
    // If no explicit start, use a sentinel far-past date so all pending
    // logs are included.
    const periodStart = period_start || "1970-01-01";

    const result = await runPayday(
      id,
      user.id,
      periodStart,
      periodEnd,
      note
    );

    // Flip the Pie to active on first successful accrual (setup → active).
    if (pie.status === "setup" && result.logsConverted > 0) {
      await supabase.from("pies").update({ status: "active" }).eq("id", id);
    }

    await writeAudit({
      pieId: id,
      actorId: user.id,
      action: "payday.run",
      entityType: "payday_run",
      entityId: result.runId,
      after: {
        period_start: periodStart,
        period_end: periodEnd,
        logs_converted: result.logsConverted,
        participants: result.participantsCount,
        total_slices: result.totalSlices,
        skipped_no_salary: result.skipped,
      },
      effectiveFrom: periodEnd,
    });

    return ok(
      {
        run_id: result.runId,
        logs_converted: result.logsConverted,
        participants_count: result.participantsCount,
        total_hours: result.totalHours,
        total_slices: result.totalSlices,
        skipped_no_salary: result.skipped,
      },
      201
    );
  } catch (err) {
    console.error("Unexpected error in POST payday:", err);
    return fail("Internal server error", 500);
  }
}
