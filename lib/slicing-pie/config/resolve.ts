// ============================================================
// Execution Tracker — Slicing Pie: Config Resolver
// ============================================================
// Produces the effective PieSettings for a given point in time by
// layering effective-dated admin overrides on top of the shipped
// defaults.
//
// PROSPECTIVE-ONLY GUARANTEE (§21, EDGE-024):
// Each contribution stores the resolved settings snapshot that was
// in force ON ITS EVENT DATE. To recompute or audit any historical
// entry, resolve the config `atDate = contribution.event_date`.
// A later settings edit never changes an older snapshot.
// ============================================================

import type { PieSettings, PieSettingsVersion } from "@/types/slicing-pie";
import { DEFAULT_PIE_SETTINGS } from "./schema";

/**
 * Deep-merge a partial override onto a base settings object.
 * Only the two nested objects (finder_fee, loyal_employee_clause)
 * need special handling; everything else is a scalar/array replace.
 */
function mergeSettings(
  base: PieSettings,
  override: Partial<PieSettings>
): PieSettings {
  const merged: PieSettings = { ...base, ...override };

  if (override.finder_fee) {
    merged.finder_fee = { ...base.finder_fee, ...override.finder_fee };
  }
  if (override.loyal_employee_clause) {
    merged.loyal_employee_clause = {
      ...base.loyal_employee_clause,
      ...override.loyal_employee_clause,
    };
  }

  return merged;
}

/**
 * Resolve the effective settings for a Pie at a given date.
 *
 * @param versions  All settings versions for the Pie (any order).
 * @param atDate    ISO date (YYYY-MM-DD) or Date. Defaults to today.
 * @returns         Fully-populated PieSettings.
 *
 * Semantics: apply, in chronological order, every version whose
 * `effective_from <= atDate`, layering each on top of the previous.
 * This lets an admin schedule a future change without affecting the
 * present, and lets historical recomputation pick the correct rates.
 */
export function resolveConfig(
  versions: PieSettingsVersion[],
  atDate: string | Date = new Date()
): PieSettings {
  const cutoff = toDateString(atDate);

  const applicable = versions
    .filter((v) => toDateString(v.effective_from) <= cutoff)
    .sort((a, b) => {
      // Primary: effective_from ascending.
      const byDate = toDateString(a.effective_from).localeCompare(
        toDateString(b.effective_from)
      );
      if (byDate !== 0) return byDate;
      // Tie-break: created_at ascending (later edit wins on same day).
      return (a.created_at || "").localeCompare(b.created_at || "");
    });

  return applicable.reduce<PieSettings>(
    (acc, version) => mergeSettings(acc, version.settings || {}),
    { ...DEFAULT_PIE_SETTINGS }
  );
}

/**
 * The current effective settings (convenience wrapper for `today`).
 */
export function resolveCurrentConfig(
  versions: PieSettingsVersion[]
): PieSettings {
  return resolveConfig(versions, new Date());
}

/**
 * Compute the minimal override that, layered on defaults, yields the
 * given full settings object. Used when saving a new version so we
 * persist only what actually differs from the shipped defaults.
 */
export function diffFromDefaults(full: PieSettings): Partial<PieSettings> {
  const override: Partial<PieSettings> = {};
  (Object.keys(full) as (keyof PieSettings)[]).forEach((key) => {
    if (!deepEqual(full[key], DEFAULT_PIE_SETTINGS[key])) {
      // Cast is safe: we're copying the value under its own key.
      (override[key] as unknown) = full[key];
    }
  });
  return override;
}

/**
 * Compute the diff between two settings objects, returning the set of
 * keys that changed with before/after values — for the audit log and
 * the "what changed" UI on the settings history screen.
 */
export function settingsDelta(
  before: PieSettings,
  after: PieSettings
): { key: keyof PieSettings; before: unknown; after: unknown }[] {
  const changes: { key: keyof PieSettings; before: unknown; after: unknown }[] =
    [];
  (Object.keys(after) as (keyof PieSettings)[]).forEach((key) => {
    if (!deepEqual(before[key], after[key])) {
      changes.push({ key, before: before[key], after: after[key] });
    }
  });
  return changes;
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function toDateString(d: string | Date): string {
  if (d instanceof Date) return d.toISOString().split("T")[0];
  // Accept full ISO timestamps or plain dates.
  return d.split("T")[0];
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}
