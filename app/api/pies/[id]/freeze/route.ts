// ============================================================
// Execution Tracker — GET & POST /api/pies/[id]/freeze
// ============================================================
// Freezing the Pie (§17): at a triggering event (breakeven or a
// Series A), the dynamic Pie stops. We snapshot the ownership table
// verbatim and set the Pie status to "frozen". From then on no new
// contributions/well/buyout mutations are accepted (enforced by those
// routes), and the cap table serves the stored snapshot.
//
// POST body: { trigger: "breakeven" | "series_a", note? }
// A freeze is one-way unless settings.freeze_reversible is true, in
// which case an admin may POST { action: "reactivate" }.
// ============================================================

import { createClient } from "@/lib/supabase";
import {
  ok,
  fail,
  requireUser,
  requireAdminApi,
  resolvePieConfig,
  writeAudit,
  isUuid,
} from "@/lib/slicing-pie/server/context";
import { buildCapTable } from "@/lib/slicing-pie/engine/captable";
import type {
  Contribution,
  FreezeTrigger,
  PieParticipant,
} from "@/types/slicing-pie";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { response } = await requireUser();
    if (response) return response;

    const { id } = await context.params;
    if (!isUuid(id)) return fail("Invalid pie id", 400);

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pie_freezes")
      .select("*")
      .eq("pie_id", id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching freezes:", error);
      return fail("Failed to fetch freezes", 500);
    }
    return ok(data ?? []);
  } catch (err) {
    console.error("Unexpected error in GET freeze:", err);
    return fail("Internal server error", 500);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { user, response } = await requireAdminApi();
    if (response) return response;

    const { id } = await context.params;
    if (!isUuid(id)) return fail("Invalid pie id", 400);

    const body = await request.json();
    const { trigger, note, action } = body as {
      trigger?: FreezeTrigger;
      note?: string;
      action?: "reactivate";
    };

    const supabase = await createClient();
    const { data: pie } = await supabase
      .from("pies")
      .select("id, status")
      .eq("id", id)
      .single();
    if (!pie) return fail("Pie not found", 404);

    const { settings } = await resolvePieConfig(id);

    // ----- Reactivation path -----
    if (action === "reactivate") {
      if (!settings.freeze_reversible) {
        return fail("Freeze is configured as one-way and cannot be reversed", 409);
      }
      if (pie.status !== "frozen") {
        return fail("Pie is not frozen", 409);
      }
      await supabase.from("pies").update({ status: "active", frozen_at: null }).eq("id", id);
      await supabase
        .from("pie_freezes")
        .update({ reactivated_at: new Date().toISOString() })
        .eq("pie_id", id)
        .is("reactivated_at", null);

      await writeAudit({
        pieId: id,
        actorId: user.id,
        action: "pie.reactivate",
        entityType: "pie",
        entityId: id,
      });
      return ok({ status: "active" });
    }

    // ----- Freeze path -----
    if (trigger !== "breakeven" && trigger !== "series_a") {
      return fail("trigger must be 'breakeven' or 'series_a'", 400);
    }
    if (pie.status === "frozen") {
      return fail("Pie is already frozen", 409);
    }

    // Snapshot current ownership.
    const [{ data: participants }, { data: contributions }] = await Promise.all([
      supabase.from("pie_participants").select("*").eq("pie_id", id),
      supabase.from("contributions").select("*").eq("pie_id", id),
    ]);

    const capTable = buildCapTable(
      id,
      (participants ?? []) as PieParticipant[],
      (contributions ?? []) as Contribution[],
      {
        sliceDecimalPlaces: settings.slice_decimal_places,
        percentDecimalPlaces: settings.percent_decimal_places,
        frozen: true,
      }
    );

    const ownershipSnapshot: Record<string, { slices: number; pct: number }> = {};
    for (const row of capTable.rows) {
      ownershipSnapshot[row.participant_id] = {
        slices: row.slices,
        pct: row.pct,
      };
    }

    const { data: freeze, error: freezeErr } = await supabase
      .from("pie_freezes")
      .insert({
        pie_id: id,
        trigger,
        ownership_snapshot: ownershipSnapshot,
        reversible: settings.freeze_reversible,
        note: note?.trim() || null,
        created_by: user.id,
      })
      .select("*")
      .single();

    if (freezeErr || !freeze) {
      console.error("Error creating freeze:", freezeErr);
      return fail("Failed to freeze pie", 500);
    }

    await supabase
      .from("pies")
      .update({ status: "frozen", frozen_at: new Date().toISOString() })
      .eq("id", id);

    await writeAudit({
      pieId: id,
      actorId: user.id,
      action: "pie.freeze",
      entityType: "pie_freeze",
      entityId: freeze.id,
      after: { trigger, total_slices: capTable.total_slices },
    });

    return ok({ freeze, cap_table: capTable }, 201);
  } catch (err) {
    console.error("Unexpected error in POST freeze:", err);
    return fail("Internal server error", 500);
  }
}
