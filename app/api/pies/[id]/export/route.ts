// ============================================================
// Execution Tracker — GET /api/pies/[id]/export
// ============================================================
// Download the Pie's history. Two formats:
//
//   ?format=csv   (default) — the ledger, one row per entry, for a
//                            spreadsheet or an accountant.
//   ?format=json            — the whole Pie, complete, for a backup or a
//                            lawyer who wants everything.
//
// ADMIN ONLY, and deliberately so: the CSV is the entire ledger including
// every participant's payouts, which is the thing D1 keeps from members.
// A member's own history is already on /my-slices.
//
// This is a plain GET that returns a file rather than JSON, so it does not
// use the shared ok()/fail() helpers — but it does use the shared admin
// guard, so an unauthenticated caller gets the same 401/403 shape as
// everywhere else.
// ============================================================

import { fail, requireAdminApi, isUuid } from "@/lib/slicing-pie/server/context";
import { loadPieForExport } from "@/lib/slicing-pie/server/export";
import {
  buildLedgerCsv,
  buildPieArchive,
  exportFilename,
} from "@/lib/slicing-pie/export";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** A filename-safe UTC stamp, e.g. 20260930-142530. */
function stamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { response } = await requireAdminApi();
    if (response) return response;

    const { id } = await context.params;
    if (!isUuid(id)) return fail("Invalid pie id", 400);

    const { searchParams } = new URL(request.url);
    const format = (searchParams.get("format") ?? "csv").toLowerCase();
    if (format !== "csv" && format !== "json") {
      return fail("format must be csv or json", 400);
    }

    const loaded = await loadPieForExport(id);
    if (!loaded.ok) return fail(loaded.error, loaded.status);
    const { pie, settings, participants, contributions, time_logs, other } =
      loaded.data;

    const generatedAt = new Date().toISOString();
    const filename = exportFilename(pie.name, format === "csv" ? "ledger" : "archive", stamp());

    if (format === "json") {
      const archive = buildPieArchive({
        generated_at: generatedAt,
        pie: pie as unknown as Record<string, unknown>,
        settings,
        participants,
        contributions,
        time_logs,
        other: Object.fromEntries(other.map((o) => [o.table, o.rows])),
      });
      return new Response(JSON.stringify(archive, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const csv = buildLedgerCsv(contributions, {
      pieName: pie.name,
      currency: pie.currency,
      participants,
      generatedAt,
    });

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("Unexpected error in GET export:", err);
    return fail("Internal server error", 500);
  }
}
