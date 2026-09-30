// ============================================================
// Execution Tracker — GET /api/pies/[id]/captable
// ============================================================
// Returns the live ownership snapshot (the dynamic Pie): each
// participant's active slices and ownership %. Reflects a frozen
// snapshot verbatim when the Pie is frozen.
//
// ADMIN ONLY. This payload is the whole Pie — every participant's slices,
// ownership percentage and by-type breakdown — which is the one thing
// decision D1 says a member must not see. A member's own standing comes
// from /api/pies/[id]/me, which cannot be widened.
// ============================================================

import { createClient } from "@/lib/supabase";
import {
  ok,
  fail,
  requireAdminApi,
  resolvePieConfig,
  isUuid,
} from "@/lib/slicing-pie/server/context";
import { buildCapTable } from "@/lib/slicing-pie/engine/captable";
import type { Contribution, PieParticipant } from "@/types/slicing-pie";

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

    const { data: pie, error: pieErr } = await supabase
      .from("pies")
      .select("id, status")
      .eq("id", id)
      .single();
    if (pieErr || !pie) return fail("Pie not found", 404);

    // If the Pie is frozen, prefer the stored ownership snapshot so the
    // cap table is immutable post-freeze (§17).
    if (pie.status === "frozen") {
      const { data: freeze } = await supabase
        .from("pie_freezes")
        .select("*")
        .eq("pie_id", id)
        .is("reactivated_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (freeze?.ownership_snapshot) {
        return ok({
          pie_id: id,
          frozen: true,
          frozen_at: freeze.created_at,
          snapshot: freeze.ownership_snapshot,
        });
      }
    }

    const [{ data: participants }, { data: contributions }] = await Promise.all([
      supabase.from("pie_participants").select("*").eq("pie_id", id),
      supabase.from("contributions").select("*").eq("pie_id", id),
    ]);

    // Use current settings for rounding precision.
    const { settings } = await resolvePieConfig(id);

    const capTable = buildCapTable(
      id,
      (participants ?? []) as PieParticipant[],
      (contributions ?? []) as Contribution[],
      {
        sliceDecimalPlaces: settings.slice_decimal_places,
        percentDecimalPlaces: settings.percent_decimal_places,
        frozen: pie.status === "frozen",
      }
    );

    return ok(capTable);
  } catch (err) {
    console.error("Unexpected error in GET captable:", err);
    return fail("Internal server error", 500);
  }
}
