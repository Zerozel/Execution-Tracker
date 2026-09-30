// ============================================================
// Execution Tracker — Slicing Pie: Server Helpers
// ============================================================
// Shared server-side utilities for the Slicing Pie API routes:
//   • JSON response helpers matching the app-wide { data, error }.
//   • Auth guards that return JSON 401/403 (API-friendly, unlike the
//     redirect-based requireAdmin used by server components).
//   • Config resolution straight from the DB (settings versions →
//     resolved PieSettings at a date).
//   • A small audit-log writer (§18).
//
// These keep every route thin and consistent.
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";
import type { AuthUser } from "@/types";
import type {
  PieParticipant,
  PieSettings,
  PieSettingsVersion,
} from "@/types/slicing-pie";
import { resolveConfig } from "@/lib/slicing-pie/config/resolve";

// ------------------------------------------------------------
// Response helpers
// ------------------------------------------------------------
export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data, error: null }, { status });
}

/**
 * Extra machine-readable detail on a failure, for callers that want to
 * react to WHY rather than just show the message.
 */
export interface FailMeta {
  /** The §20 rule id, when the refusal came from a policy guard. */
  rule?: string;
  [key: string]: unknown;
}

export function fail(
  message: string,
  status = 400,
  meta?: FailMeta
): NextResponse {
  return NextResponse.json(
    { data: null, error: message, ...(meta ? { meta } : {}) },
    { status }
  );
}

// ------------------------------------------------------------
// Auth guards (API-friendly — return JSON instead of redirecting)
// ------------------------------------------------------------

/** Result of an auth guard: either an authorized user or a response to return. */
type Guard =
  | { user: AuthUser; response: null }
  | { user: null; response: NextResponse };

export async function requireUser(): Promise<Guard> {
  const user = await getCurrentUser();
  if (!user) {
    return { user: null, response: fail("Authentication required", 401) };
  }
  return { user, response: null };
}

export async function requireAdminApi(): Promise<Guard> {
  const user = await getCurrentUser();
  if (!user) {
    return { user: null, response: fail("Authentication required", 401) };
  }
  if (user.role !== "admin") {
    return { user: null, response: fail("Admin privileges required", 403) };
  }
  return { user, response: null };
}

// ------------------------------------------------------------
// Membership
// ------------------------------------------------------------

/**
 * The participant row linking a user to a Pie, or null when that user is
 * not a member of it.
 *
 * This is the only way a member-facing screen should decide what a
 * caller may see: ask for the caller's OWN participant id, then scope
 * every other query to it. The read goes through the service role (see
 * lib/supabase.ts), so RLS will not do that scoping for us — an
 * unscoped query here would hand one member another member's rows.
 */
export async function participantForUser(
  pieId: string,
  userId: string
): Promise<PieParticipant | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pie_participants")
    .select("*")
    .eq("pie_id", pieId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as PieParticipant | null) ?? null;
}

// ------------------------------------------------------------
// Config resolution from the database
// ------------------------------------------------------------

/**
 * Load all settings versions for a Pie and resolve the effective
 * PieSettings at `atDate` (defaults to today). Returns the resolved
 * settings plus the raw versions (useful for history views).
 */
export async function resolvePieConfig(
  pieId: string,
  atDate?: string
): Promise<{ settings: PieSettings; versions: PieSettingsVersion[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pie_settings_versions")
    .select("*")
    .eq("pie_id", pieId);

  if (error) {
    throw new Error(`Failed to load settings versions: ${error.message}`);
  }

  const versions = (data ?? []) as PieSettingsVersion[];
  const settings = resolveConfig(versions, atDate ?? new Date());
  return { settings, versions };
}

// ------------------------------------------------------------
// Audit log (§18)
// ------------------------------------------------------------

export interface AuditInput {
  pieId: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  effectiveFrom?: string | null;
}

/**
 * Best-effort append to the immutable audit log. Never throws — a
 * failed audit write must not break the underlying mutation, but is
 * logged to the server console for investigation.
 */
export async function writeAudit(entry: AuditInput): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.from("pie_audit_log").insert({
      pie_id: entry.pieId,
      actor_id: entry.actorId,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
      effective_from: entry.effectiveFrom ?? null,
    });
  } catch (err) {
    console.error("Audit log write failed:", err);
  }
}

// ------------------------------------------------------------
// Misc
// ------------------------------------------------------------

/** Today's date as an ISO YYYY-MM-DD string. */
export function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

/** Validate a UUID-ish string to avoid needless DB round-trips. */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}
