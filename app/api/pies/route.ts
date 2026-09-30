// ============================================================
// Execution Tracker — GET & POST /api/pies
// ============================================================
// List all Pies (any authenticated user may read) and create a new
// Pie (admin only). Creating a Pie also provisions its Well and an
// initial empty settings version so resolveConfig() has a base row.
// ============================================================

import { createClient } from "@/lib/supabase";
import {
  ok,
  fail,
  requireUser,
  requireAdminApi,
  writeAudit,
} from "@/lib/slicing-pie/server/context";
import { DEFAULT_PIE_SETTINGS } from "@/lib/slicing-pie/config/schema";
import { diffFromDefaults } from "@/lib/slicing-pie/config/resolve";
import type { PieSettings } from "@/types/slicing-pie";

export async function GET() {
  try {
    const { response } = await requireUser();
    if (response) return response;

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pies")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching pies:", error);
      return fail("Failed to fetch pies", 500);
    }

    return ok(data ?? []);
  } catch (err) {
    console.error("Unexpected error in GET /api/pies:", err);
    return fail("Internal server error", 500);
  }
}

export async function POST(request: Request) {
  try {
    const { user, response } = await requireAdminApi();
    if (response) return response;

    const body = await request.json();
    const { name, currency, initial_settings } = body as {
      name?: string;
      currency?: string;
      initial_settings?: Partial<PieSettings>;
    };

    if (!name || !name.trim()) {
      return fail("Pie name is required", 400);
    }

    const supabase = await createClient();

    // 1. Create the Pie.
    const { data: pie, error: pieError } = await supabase
      .from("pies")
      .insert({
        name: name.trim(),
        currency: currency?.trim() || DEFAULT_PIE_SETTINGS.currency,
        status: "setup",
        created_by: user.id,
      })
      .select("*")
      .single();

    if (pieError || !pie) {
      console.error("Error creating pie:", pieError);
      return fail("Failed to create pie", 500);
    }

    // 2. Provision its Well (§4.5) — one per Pie.
    const { error: wellError } = await supabase
      .from("wells")
      .insert({ pie_id: pie.id, balance_minor: 0 });
    if (wellError) {
      console.error("Error creating well:", wellError);
      // Non-fatal: the Well can be created lazily later.
    }

    // 3. Persist an initial settings version (only the diff from
    //    defaults, honoring the setup wizard's confirmed decisions).
    const override = initial_settings
      ? diffFromDefaults({ ...DEFAULT_PIE_SETTINGS, ...initial_settings })
      : {};
    const { error: settingsError } = await supabase
      .from("pie_settings_versions")
      .insert({
        pie_id: pie.id,
        settings: override,
        note: "Initial settings (setup wizard)",
        created_by: user.id,
      });
    if (settingsError) {
      console.error("Error creating initial settings version:", settingsError);
    }

    await writeAudit({
      pieId: pie.id,
      actorId: user.id,
      action: "pie.create",
      entityType: "pie",
      entityId: pie.id,
      after: pie,
    });

    return ok(pie, 201);
  } catch (err) {
    console.error("Unexpected error in POST /api/pies:", err);
    return fail("Internal server error", 500);
  }
}
