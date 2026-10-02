// ============================================================
// Execution Tracker — Slicing Pie: Payday Conversion Engine
// ============================================================
// The "month-end payday": converts pending self-service time_logs
// into immutable `time` contributions (slices), using each log's
// DATE-EFFECTIVE config + participant terms (FMV salary) so history
// is faithful and prospective-only (§21 / EDGE-024).
//
//   projectPayday()  → read-only projection (drives the preview UI)
//   runPayday()      → commits: inserts contributions, marks logs
//                       converted, and records a payday_runs audit row.
//
// ONLY LOGS THE ADMIN HAS APPROVED CONVERT. A log in review_status
// 'pending' or 'flagged' is skipped; a log in 'void' is skipped. This
// is the accounting rule that makes the admin review meaningful — the
// member declares, the admin verifies, only then does the slice
// ledger move.
//
// Logs whose participant has no fair-market salary effective on the
// work date are SKIPPED (left pending) and surfaced to the admin.
// ============================================================

import { createClient } from "@/lib/supabase";
import { computeSlices } from "@/lib/slicing-pie/engine/calculate";
import { resolvePieConfig, todayISO } from "@/lib/slicing-pie/server/context";
import { resolveParticipantTerms } from "@/lib/slicing-pie/server/contributions";
import { roundSlices } from "@/lib/slicing-pie/format";
// (money helpers not needed here — slice math lives in the engine)
import type { PieSettings, ParticipantTermsVersion } from "@/types/slicing-pie";
import type { SliceComputation } from "@/types/slicing-pie";
import type {
  TimeLog,
  PaydayPreview,
  PaydayPreviewRow,
} from "@/types/time-tracking";

// ------------------------------------------------------------
// Small per-request memo caches so we resolve config/terms once
// per (date) / (participant, date) instead of once per log.
// ------------------------------------------------------------
class Resolver {
  private configByDate = new Map<string, PieSettings>();
  private termsByKey = new Map<string, ParticipantTermsVersion | null>();

  constructor(private pieId: string) {}

  async config(date: string): Promise<PieSettings> {
    const hit = this.configByDate.get(date);
    if (hit) return hit;
    const { settings } = await resolvePieConfig(this.pieId, date);
    this.configByDate.set(date, settings);
    return settings;
  }

  async terms(
    participantId: string,
    date: string
  ): Promise<ParticipantTermsVersion | null> {
    const key = `${participantId}|${date}`;
    if (this.termsByKey.has(key)) return this.termsByKey.get(key) ?? null;
    const t = await resolveParticipantTerms(participantId, date);
    this.termsByKey.set(key, t);
    return t;
  }
}

/**
 * Fetch logs eligible for conversion:
 *   • status = 'pending'            → not yet converted by a prior payday
 *   • review_status = 'approved'    → the admin has verified them
 *
 * Logs that are pending or flagged at the review layer are NOT
 * returned — the member declared, but the admin has not yet confirmed.
 * Flagged logs stay out until the admin resolves them.
 *
 * Voided logs are excluded by both filters (their status remains
 * 'pending' until payday runs, but review_status = 'void' blocks them).
 */
async function fetchPendingLogs(
  pieId: string,
  periodStart?: string,
  periodEnd?: string
): Promise<TimeLog[]> {
  const supabase = await createClient();
  let query = supabase
    .from("time_logs")
    .select("*")
    .eq("pie_id", pieId)
    .eq("status", "pending")
    .eq("review_status", "approved")
    .order("work_date", { ascending: true });

  if (periodStart) query = query.gte("work_date", periodStart);
  if (periodEnd) query = query.lte("work_date", periodEnd);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load time logs: ${error.message}`);
  return (data ?? []) as TimeLog[];
}

/** Map participant_id → display_name for the current Pie. */
async function participantNames(
  pieId: string
): Promise<Map<string, string>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pie_participants")
    .select("id, display_name")
    .eq("pie_id", pieId);
  const map = new Map<string, string>();
  for (const p of (data ?? []) as { id: string; display_name: string }[]) {
    map.set(p.id, p.display_name);
  }
  return map;
}

/**
 * Compute the slices a single log would earn, or `null` if the
 * participant has no salary on the work date (→ skip).
 *
 * Returns the whole computation, not just the slice count: the FMV and
 * the multiplier actually applied are frozen onto the contribution row
 * so that a later recovery can de-multiply it back to what the
 * participant actually earned (§14.2).
 */
async function sliceForLog(
  log: TimeLog,
  resolver: Resolver
): Promise<{ computation: SliceComputation; settings: PieSettings } | null> {
  const settings = await resolver.config(log.work_date);
  const terms = await resolver.terms(log.participant_id, log.work_date);
  const salary = terms?.fair_market_salary_minor ?? null;
  if (salary == null) return null; // no FMV → cannot convert yet

  const computation = computeSlices(
    {
      type: "time",
      hours: Number(log.hours),
      fair_market_salary_minor: salary,
      working_hours_override: terms?.working_hours_override ?? undefined,
    },
    settings
  );
  return { computation, settings };
}

// ------------------------------------------------------------
// Read-only projection (preview)
// ------------------------------------------------------------
export async function projectPayday(
  pieId: string,
  periodStart?: string,
  periodEnd?: string
): Promise<PaydayPreview> {
  const logs = await fetchPendingLogs(pieId, periodStart, periodEnd);
  const names = await participantNames(pieId);
  const resolver = new Resolver(pieId);

  const byParticipant = new Map<string, PaydayPreviewRow>();
  let totalHours = 0;
  let totalSlices = 0;
  let skipped = 0;

  for (const log of logs) {
    const row =
      byParticipant.get(log.participant_id) ??
      ({
        participant_id: log.participant_id,
        display_name: names.get(log.participant_id) ?? "Unknown",
        has_salary: true,
        log_count: 0,
        total_hours: 0,
        projected_slices: 0,
      } as PaydayPreviewRow);

    const result = await sliceForLog(log, resolver);
    row.log_count += 1;
    row.total_hours = roundSlices(row.total_hours + Number(log.hours), 2);

    if (result == null) {
      row.has_salary = false;
      row.note = "No fair-market salary set — will be skipped.";
      skipped += 1;
    } else {
      row.projected_slices = roundSlices(
        row.projected_slices + result.computation.slices,
        4
      );
      totalSlices = roundSlices(totalSlices + result.computation.slices, 4);
    }

    totalHours = roundSlices(totalHours + Number(log.hours), 2);
    byParticipant.set(log.participant_id, row);
  }

  return {
    pie_id: pieId,
    period_start: periodStart ?? "",
    period_end: periodEnd ?? todayISO(),
    rows: Array.from(byParticipant.values()).sort((a, b) =>
      a.display_name.localeCompare(b.display_name)
    ),
    total_logs: logs.length,
    total_hours: totalHours,
    total_slices: totalSlices,
    skipped_no_salary: skipped,
  };
}

// ------------------------------------------------------------
// Commit
// ------------------------------------------------------------
export interface RunPaydayResult {
  runId: string;
  logsConverted: number;
  participantsCount: number;
  totalHours: number;
  totalSlices: number;
  skipped: number;
}

export async function runPayday(
  pieId: string,
  actorId: string,
  periodStart: string,
  periodEnd: string,
  note?: string
): Promise<RunPaydayResult> {
  const supabase = await createClient();
  const logs = await fetchPendingLogs(pieId, periodStart, periodEnd);
  const resolver = new Resolver(pieId);

  // Create the run row first so converted logs can reference it.
  const { data: run, error: runErr } = await supabase
    .from("payday_runs")
    .insert({
      pie_id: pieId,
      period_start: periodStart,
      period_end: periodEnd,
      note: note?.trim() || null,
      created_by: actorId,
    })
    .select("id")
    .single();

  if (runErr || !run) {
    throw new Error(`Failed to create payday run: ${runErr?.message}`);
  }

  const participants = new Set<string>();
  let converted = 0;
  let totalHours = 0;
  let totalSlices = 0;
  let skipped = 0;

  for (const log of logs) {
    const result = await sliceForLog(log, resolver);
    if (result == null) {
      skipped += 1;
      continue; // leave pending
    }

    const { computation, settings } = result;
    // Insert the immutable time contribution for this log's date. The
    // FMV and the multiplier are frozen alongside the slices so the row
    // can be de-multiplied later (recovery, §14.2) without re-deriving
    // the salary that applied on the day.
    const { data: contribution, error: cErr } = await supabase
      .from("contributions")
      .insert({
        pie_id: pieId,
        participant_id: log.participant_id,
        type: "time",
        event_date: log.work_date,
        inputs: {
          hours: Number(log.hours),
          source: "time_log",
          time_log_id: log.id,
        },
        config_snapshot: settings,
        fmv_minor: computation.fmv_minor,
        multiplier_kind: computation.multiplier_kind,
        multiplier_applied: computation.multiplier_applied,
        slices: computation.slices,
        notes: log.notes,
        project_tag: log.project_tag,
        status: "active",
        created_by: actorId,
      })
      .select("id, fmv_minor")
      .single();

    if (cErr || !contribution) {
      console.error("Payday: failed to insert contribution", cErr);
      continue;
    }

    // Mark the log converted and link it to run + contribution.
    await supabase
      .from("time_logs")
      .update({
        status: "converted",
        contribution_id: contribution.id,
        payday_run_id: run.id,
      })
      .eq("id", log.id);

    participants.add(log.participant_id);
    converted += 1;
    totalHours = roundSlices(totalHours + Number(log.hours), 2);
    totalSlices = roundSlices(totalSlices + computation.slices, 4);
  }

  // Finalize the run with computed totals.
  await supabase
    .from("payday_runs")
    .update({
      logs_converted: converted,
      participants_count: participants.size,
      total_hours: totalHours,
      total_slices: totalSlices,
    })
    .eq("id", run.id);

  return {
    runId: run.id,
    logsConverted: converted,
    participantsCount: participants.size,
    totalHours,
    totalSlices,
    skipped,
  };
}
