// ============================================================
// Execution Tracker — GET & PATCH /api/pies/[id]
// ============================================================
// GET returns the Pie plus its currently-effective resolved settings
// (and optionally the settings at a historical ?date=YYYY-MM-DD).
// PATCH updates top-level Pie fields (name, status) — admin only.
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
import type { PieStatus } from "@/types/slicing-pie";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { response } = await requireUser();
    if (response) return response;

    const { id } = await context.params;
    if (!isUuid(id)) return fail("Invalid pie id", 400);

    const supabase = await createClient();
    const { data: pie, error } = await supabase
      .from("pies")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !pie) return fail("Pie not found", 404);

    const { searchParams } = new URL(request.url);
    const atDate = searchParams.get("date") ?? undefined;

    const { settings, versions } = await resolvePieConfig(id, atDate);

    return ok({ pie, settings, settings_version_count: versions.length });
  } catch (err) {
    console.error("Unexpected error in GET /api/pies/[id]:", err);
    return fail("Internal server error", 500);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { user, response } = await requireAdminApi();
    if (response) return response;

    const { id } = await context.params;
    if (!isUuid(id)) return fail("Invalid pie id", 400);

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (typeof body.name === "string" && body.name.trim()) {
      updates.name = body.name.trim();
    }
    if (typeof body.status === "string") {
      const valid: PieStatus[] = ["setup", "active", "frozen"];
      if (!valid.includes(body.status as PieStatus)) {
        return fail("Invalid status", 400);
      }
      updates.status = body.status;
    }

    if (Object.keys(updates).length === 0) {
      return fail("No valid fields to update", 400);
    }

    const supabase = await createClient();
    const { data: before } = await supabase
      .from("pies")
      .select("*")
      .eq("id", id)
      .single();

    const { data: pie, error } = await supabase
      .from("pies")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();

    if (error || !pie) {
      console.error("Error updating pie:", error);
      return fail("Failed to update pie", 500);
    }

    await writeAudit({
      pieId: id,
      actorId: user.id,
      action: "pie.update",
      entityType: "pie",
      entityId: id,
      before: before ?? null,
      after: pie,
    });

    return ok(pie);
  } catch (err) {
    console.error("Unexpected error in PATCH /api/pies/[id]:", err);
    return fail("Internal server error", 500);
  }
}
