// ============================================================
// Execution Tracker — Slicing Pie: Cap Table Aggregation
// ============================================================
// Turns the immutable contribution ledger into an ownership snapshot
// (the "cap table"). This is the dynamic Pie: each participant's
// share = their net slices / total net slices (§2, §12).
//
// THE LEDGER IS APPEND-ONLY. A contribution is never edited or
// deleted — corrections are inserted as NEW rows carrying a negative
// (or reduced) slice count and a `reverses_id` pointing at the row
// they correct. So the cap table simply SUMS EVERY ROW: reversals net
// themselves out arithmetically, and the full history stays intact for
// audit (§21, and the "defensible if challenged" requirement).
//
// `status` is therefore informational only — it is NOT a filter.
//
// Pure function: given rows + participants, always returns the same
// CapTable. No I/O.
// ============================================================

import type {
  CapTable,
  Contribution,
  ContributionType,
  OwnershipRow,
  PieParticipant,
} from "@/types/slicing-pie";
import { roundPercent, roundSlices, safeDivide } from "../format";

export interface CapTableOptions {
  /** Precision for slice totals (defaults to 4). */
  sliceDecimalPlaces?: number;
  /** Precision for percentages (defaults to 2). */
  percentDecimalPlaces?: number;
  /** Snapshot label; defaults to today's ISO date. */
  asOf?: string;
  /** Whether the Pie is frozen at this snapshot. */
  frozen?: boolean;
}

/**
 * Build a cap table from participants and their contributions.
 *
 * @param participants  All participants in the Pie.
 * @param contributions All contribution rows (any status).
 */
export function buildCapTable(
  pieId: string,
  participants: PieParticipant[],
  contributions: Contribution[],
  options: CapTableOptions = {}
): CapTable {
  const sliceDp = options.sliceDecimalPlaces ?? 4;
  const pctDp = options.percentDecimalPlaces ?? 2;

  // Aggregate active slices per participant, and per type for drill-down.
  const sliceByParticipant = new Map<string, number>();
  const byTypeByParticipant = new Map<
    string,
    Partial<Record<ContributionType, number>>
  >();

  for (const c of contributions) {
    // No status filter — reversal rows are negative and net out.
    const prev = sliceByParticipant.get(c.participant_id) ?? 0;
    sliceByParticipant.set(c.participant_id, prev + c.slices);

    const typeMap = byTypeByParticipant.get(c.participant_id) ?? {};
    typeMap[c.type] = (typeMap[c.type] ?? 0) + c.slices;
    byTypeByParticipant.set(c.participant_id, typeMap);
  }

  // Total across the whole Pie.
  let total = 0;
  for (const v of sliceByParticipant.values()) total += v;
  const totalSlices = roundSlices(total, sliceDp);

  // Build a row per participant (include zero-slice participants so
  // candidates/absentees are visible in the UI).
  const rows: OwnershipRow[] = participants.map((p) => {
    const slices = roundSlices(sliceByParticipant.get(p.id) ?? 0, sliceDp);
    const pct = roundPercent(safeDivide(slices, totalSlices) * 100, pctDp);
    const rawByType = byTypeByParticipant.get(p.id) ?? {};
    const by_type: Partial<Record<ContributionType, number>> = {};
    (Object.keys(rawByType) as ContributionType[]).forEach((t) => {
      by_type[t] = roundSlices(rawByType[t] ?? 0, sliceDp);
    });

    return {
      participant_id: p.id,
      display_name: p.display_name,
      pie_role: p.pie_role,
      status: p.status,
      slices,
      pct,
      by_type,
    };
  });

  // Sort by slices desc so the biggest owners are on top.
  rows.sort((a, b) => b.slices - a.slices);

  return {
    pie_id: pieId,
    as_of: options.asOf ?? new Date().toISOString().split("T")[0],
    total_slices: totalSlices,
    frozen: options.frozen ?? false,
    rows,
  };
}

/**
 * The cap table as it stood on a given date.
 *
 * The ledger makes this cheap and honest: ownership at any past moment is
 * the sum of the rows dated on or before that moment. Nothing is stored,
 * nothing is approximated — the same rows that produced today's numbers
 * are simply cut off earlier.
 *
 * Corrections behave correctly under this rule without special handling.
 * A correction dated after the date being asked about is excluded, so a
 * departure recorded in June does not retroactively change what ownership
 * looked like in May — which is what "as of" has to mean to be worth
 * anything.
 *
 * @param asOf ISO date (inclusive). Rows dated after it are ignored.
 */
export function capTableAsOf(
  pieId: string,
  participants: PieParticipant[],
  contributions: Contribution[],
  asOf: string,
  options: CapTableOptions = {}
): CapTable {
  const cutoff = asOf.slice(0, 10);
  const upTo = contributions.filter(
    (c) => c.event_date.slice(0, 10) <= cutoff
  );
  return buildCapTable(pieId, participants, upTo, { ...options, asOf: cutoff });
}

/**
 * Net slices for a single participant — the sum of every ledger row
 * (reversals carry negative counts), used by buyout and clawback math.
 */
export function participantSlices(
  participantId: string,
  contributions: Contribution[]
): number {
  return contributions
    .filter((c) => c.participant_id === participantId)
    .reduce((sum, c) => sum + c.slices, 0);
}

/**
 * Net slices across the whole Pie (denominator for %).
 */
export function totalActiveSlices(contributions: Contribution[]): number {
  return contributions.reduce((sum, c) => sum + c.slices, 0);
}

/**
 * A participant's current ownership fraction (0..1).
 */
export function ownershipFraction(
  participantId: string,
  contributions: Contribution[]
): number {
  return safeDivide(
    participantSlices(participantId, contributions),
    totalActiveSlices(contributions)
  );
}
