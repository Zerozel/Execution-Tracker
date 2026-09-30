// ============================================================
// Execution Tracker — Slicing Pie: load everything an export needs
// ============================================================
// The one place that knows which tables make up a Pie. Keeping the table
// list here rather than in the route means the CSV, the JSON archive and
// any future format all export the same Pie, and adding a table to the
// product is one edit in one file.
//
// Reads go through the service role (see lib/supabase.ts), so nothing
// here is protected by RLS. Both callers are admin-gated.
// ============================================================

import { createClient } from "@/lib/supabase";
import { resolvePieConfig } from "./context";
import type {
  Contribution,
  Pie,
  PieParticipant,
  PieSettings,
} from "@/types/slicing-pie";
import type { TimeLog } from "@/types/time-tracking";

/**
 * Every Pie-scoped table that is NOT the ledger itself.
 *
 * Listed explicitly, and read tolerantly: a database that predates one of
 * these tables must still export, so a missing table is skipped rather
 * than failing the whole download. A partial archive the founder can see
 * beats an error page they cannot act on.
 */
const OTHER_TABLES = [
  "pie_audit_log",
  "pie_freezes",
  "departures",
  "buyouts",
  "referrals",
  "wells",
  "well_transactions",
  "participant_terms",
  "pie_settings_history",
] as const;

export interface LoadedPie {
  pie: Pie;
  settings: PieSettings;
  participants: PieParticipant[];
  contributions: Contribution[];
  time_logs: TimeLog[];
  other: { table: string; rows: unknown[] }[];
}

export type LoadPieResult =
  | { ok: true; data: LoadedPie }
  | { ok: false; status: number; error: string };

/**
 * Read a Pie in full, for export or for the records screen.
 */
export async function loadPieForExport(
  pieId: string
): Promise<LoadPieResult> {
  const supabase = await createClient();

  const { data: pieRow, error: pieErr } = await supabase
    .from("pies")
    .select("*")
    .eq("id", pieId)
    .single();
  if (pieErr || !pieRow) {
    return { ok: false, status: 404, error: "Pie not found" };
  }

  const [
    { data: participants },
    { data: contributions },
    { data: timeLogs },
    config,
  ] = await Promise.all([
    supabase.from("pie_participants").select("*").eq("pie_id", pieId),
    supabase.from("contributions").select("*").eq("pie_id", pieId),
    supabase.from("time_logs").select("*").eq("pie_id", pieId),
    resolvePieConfig(pieId),
  ]);

  // The optional tables, read one by one so a missing one is survivable.
  // Sequential rather than parallel: this runs once per export, on an
  // admin's click, and a clear failure is worth more than the
  // milliseconds.
  const other: { table: string; rows: unknown[] }[] = [];
  for (const table of OTHER_TABLES) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("pie_id", pieId);
    if (error) continue;
    other.push({ table, rows: data ?? [] });
  }

  return {
    ok: true,
    data: {
      pie: pieRow as Pie,
      settings: config.settings,
      participants: (participants ?? []) as PieParticipant[],
      contributions: (contributions ?? []) as Contribution[],
      time_logs: (timeLogs ?? []) as TimeLog[],
      other,
    },
  };
}
