// ============================================================
// Execution Tracker — GET & POST /api/pies/[id]/settings
// ============================================================
// GET  → the full settings-version history + the currently resolved
//        settings and the shipped defaults (so the Console can show
//        "what differs from default").
// POST → append a NEW effective-dated settings version (admin only).
//        Only the diff-from-defaults is persisted, honoring the
//        PROSPECTIVE-ONLY guarantee: existing contributions keep the
//        frozen config_snapshot they were computed with.
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
  todayISO,
} from "@/lib/slicing-pie/server/context";
import { DEFAULT_PIE_SETTINGS } from "@/lib/slicing-pie/config/schema";
import {
  diffFromDefaults,
  resolveConfig,
  settingsDelta,
} from "@/lib/slicing-pie/config/resolve";
import type { PieSettings, PieSettingsVersion } from "@/types/slicing-pie";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { response } = await requireUser();
    if (response) return response;

    const { id } = await context.params;
    if (!isUuid(id)) return fail("Invalid pie id", 400);

    const { settings, versions } = await resolvePieConfig(id);

    // Sort versions newest-first for display.
    const history = [...versions].sort((a, b) =>
      (b.effective_from || "").localeCompare(a.effective_from || "")
    );

    return ok({
      resolved: settings,
      defaults: DEFAULT_PIE_SETTINGS,
      versions: history,
    });
  } catch (err) {
    console.error("Unexpected error in GET /api/pies/[id]/settings:", err);
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
    const {
      settings: nextSettings,
      effective_from,
      note,
    } = body as {
      settings?: Partial<PieSettings>;
      effective_from?: string;
      note?: string;
    };

    if (!nextSettings || typeof nextSettings !== "object") {
      return fail("A `settings` object is required", 400);
    }

    // effective_from must not be in the past (prospective-only). Allow
    // today or a future date.
    const effFrom = effective_from || todayISO();
    if (effFrom < todayISO()) {
      return fail(
        "effective_from cannot be in the past — settings changes are prospective only",
        400
      );
    }

    const supabase = await createClient();

    // Resolve current settings to compute a human-readable delta.
    const { data: existing, error: loadErr } = await supabase
      .from("pie_settings_versions")
      .select("*")
      .eq("pie_id", id);
    if (loadErr) {
      console.error("Error loading settings versions:", loadErr);
      return fail("Failed to load current settings", 500);
    }
    const versions = (existing ?? []) as PieSettingsVersion[];
    const before = resolveConfig(versions, effFrom);

    // Merge the requested changes onto the currently-resolved settings,
    // then store only the diff from shipped defaults.
    const merged: PieSettings = { ...before, ...nextSettings };
    if (nextSettings.finder_fee) {
      merged.finder_fee = { ...before.finder_fee, ...nextSettings.finder_fee };
    }
    if (nextSettings.loyal_employee_clause) {
      merged.loyal_employee_clause = {
        ...before.loyal_employee_clause,
        ...nextSettings.loyal_employee_clause,
      };
    }
    const override = diffFromDefaults(merged);
    const delta = settingsDelta(before, merged);

    const { data: version, error } = await supabase
      .from("pie_settings_versions")
      .insert({
        pie_id: id,
        settings: override,
        effective_from: effFrom,
        note: note?.trim() || null,
        created_by: user.id,
      })
      .select("*")
      .single();

    if (error || !version) {
      console.error("Error creating settings version:", error);
      return fail("Failed to save settings version", 500);
    }

    await writeAudit({
      pieId: id,
      actorId: user.id,
      action: "settings.version.create",
      entityType: "pie_settings_version",
      entityId: version.id,
      before: { changed: delta.map((d) => d.key) },
      after: { delta },
      effectiveFrom: effFrom,
    });

    return ok({ version, delta }, 201);
  } catch (err) {
    console.error("Unexpected error in POST /api/pies/[id]/settings:", err);
    return fail("Internal server error", 500);
  }
}
