// ============================================================
// Execution Tracker — Slicing Pie: Ledger reconstruction audit (W6)
// ============================================================
// "Defensible if challenged" (decision D3) has to mean something
// checkable. This module is that check.
//
// The claim the product makes is:
//
//   Every slice in the cap table came from a rule, and the rule that
//   produced it is still visible in the row that carries it.
//
// So for every ledger row, we take the row's OWN frozen inputs and its
// OWN frozen `config_snapshot` — not today's settings — and run the same
// calculator that wrote the row in the first place. If the number comes
// back the same, the row is reproducible. If it comes back different,
// either the calculator changed under history (a real defect) or the row
// was hand-written, and either way the founder needs to know.
//
// Two kinds of row are legitimately NOT rule-derived, and calling them
// mismatches would train the reader to ignore the report:
//
//   corrections   `reverses_id` set. These carry a DELTA computed by the
//                 departure engine, deliberately stamped with no
//                 multiplier. Re-running the calculator on them is a
//                 category error, so instead we check what can be
//                 checked: that the row they correct exists, in the same
//                 Pie, and belongs to the same participant.
//   conversions   rows rewritten into the append-only model by migration
//                 0003, marked in their own inputs.
//
// Everything else — every ordinary earning and every payment — must
// reproduce exactly.
//
// Pure functions. No I/O, no clock, no database.
// ============================================================

import type {
  Contribution,
  ContributionType,
  PieSettings,
} from "@/types/slicing-pie";
import { computeSlices, type PieContributionInput } from "./calculate";
import { contributionTypeLabel } from "../labels";

/** Values closer than this are the same number (slice maths is float). */
const EPSILON = 1e-6;

export type AuditVerdict =
  /** Re-running the rule on the row's own frozen inputs gives the row's own number. */
  | "reproduced"
  /** A correction: carries a delta, checked structurally instead. */
  | "correction"
  /** Rewritten into the append-only model by migration 0003. */
  | "converted"
  /** Re-derivable in principle, but the number does not come back. DEFECT. */
  | "mismatch"
  /** Could not be re-derived, and is not a recognised correction. SUSPICIOUS. */
  | "not_reproducible";

export interface RowAudit {
  id: string;
  participant_id: string;
  type: ContributionType;
  type_label: string;
  event_date: string;
  slices: number;
  verdict: AuditVerdict;
  /** The rule's own answer, when it could be run. */
  derived_slices: number | null;
  /** Why this verdict, in words a non-accountant can act on. */
  note: string;
  /** The calculator's own working, when it ran. */
  explanation: string[];
}

export interface AuditCheck {
  /** Stable identifier, e.g. "corrections-point-at-a-real-row". */
  id: string;
  /** One line, phrased as the thing being asserted. */
  claim: string;
  passed: boolean;
  /** How many things were inspected. */
  inspected: number;
  /** The rows that broke the claim (capped, for readability). */
  offenders: string[];
}

export interface LedgerAudit {
  rows_checked: number;
  /** Counts per verdict. */
  counts: Record<AuditVerdict, number>;
  /** Every row that did not come back clean — the only rows worth reading. */
  problems: RowAudit[];
  checks: AuditCheck[];
  /** True when nothing needs a human's attention. */
  ok: boolean;
}

/**
 * Was this row written by migration 0003's legacy conversion rather than
 * by the app? It marks itself in its own inputs.
 */
function isLegacyConversion(row: Contribution): boolean {
  const inputs = (row.inputs ?? {}) as Record<string, unknown>;
  return inputs.legacy_conversion === true;
}

/**
 * Can `computeSlices` even be run on this row? A row is re-derivable when
 * its stored inputs carry the fields the calculator reads for its type —
 * which, for every row the app writes, they do, because the app stores
 * the very input object it passed in.
 *
 * The check is deliberately shallow: it answers "is there an input shape
 * here at all", and lets the calculator itself be the authority on the
 * numbers. A row that passes this and still disagrees is a real finding.
 */
function isReDerivable(row: Contribution): boolean {
  const inputs = (row.inputs ?? {}) as Record<string, unknown>;
  if (inputs.legacy_conversion === true) return false;
  if (row.reverses_id) return false;

  // Every rule-derived input carries at least one numeric field; a row
  // written by hand (a bare marker object) has none.
  const hasNumber = Object.values(inputs).some(
    (v) => typeof v === "number" && Number.isFinite(v)
  );
  return hasNumber || row.type === "other";
}

/** The row's own frozen settings, falling back to nothing usable. */
function settingsFor(row: Contribution): PieSettings | null {
  const s = row.config_snapshot as PieSettings | null | undefined;
  if (!s || typeof s !== "object") return null;
  return s;
}

/**
 * Re-derive one row from its own inputs and its own frozen settings.
 */
export function auditRow(row: Contribution): RowAudit {
  const base = {
    id: row.id,
    participant_id: row.participant_id,
    type: row.type,
    type_label: contributionTypeLabel(row.type),
    event_date: row.event_date,
    slices: row.slices,
    derived_slices: null as number | null,
    explanation: [] as string[],
  };

  if (isLegacyConversion(row)) {
    return {
      ...base,
      verdict: "converted",
      note:
        "Rewritten into the append-only model by migration 0003, with its " +
        "effect on the total preserved. It has no rule of its own to re-run.",
    };
  }

  if (row.reverses_id) {
    return {
      ...base,
      verdict: "correction",
      note:
        "A correction: it carries a delta against the row it names, not a " +
        "figure computed from inputs. Checked structurally below.",
    };
  }

  const settings = settingsFor(row);
  if (!settings) {
    return {
      ...base,
      verdict: "not_reproducible",
      note:
        "No configuration was frozen onto this row, so there is no record " +
        "of the rules it was calculated under and it cannot be re-derived.",
    };
  }

  if (!isReDerivable(row)) {
    return {
      ...base,
      verdict: "not_reproducible",
      note:
        "This row carries no inputs a rule could be run against, and it " +
        "does not name a row it corrects. Its slice count cannot be " +
        "explained from what is stored.",
    };
  }

  let derived: number;
  let explanation: string[];
  try {
    const input = { type: row.type, ...(row.inputs ?? {}) } as PieContributionInput;
    const computed = computeSlices(input, settings);
    derived = computed.slices;
    explanation = computed.explanation;
  } catch (err) {
    return {
      ...base,
      verdict: "not_reproducible",
      note:
        "Re-running this row's own rule failed: " +
        (err instanceof Error ? err.message : String(err)),
    };
  }

  const matches = Math.abs(derived - row.slices) <= EPSILON;
  return {
    ...base,
    derived_slices: derived,
    explanation,
    verdict: matches ? "reproduced" : "mismatch",
    note: matches
      ? "Recalculated from this row's own stored inputs and frozen rules; the figure matches."
      : `Recalculating this row from its own stored inputs gives ${derived}, ` +
        `but the ledger holds ${row.slices}. One of the two is wrong and the ` +
        `difference is unexplained.`,
  };
}

/**
 * The whole ledger, checked and summarised.
 *
 * @param rows Every contribution row in the Pie — including corrections.
 */
export function auditLedger(rows: Contribution[]): LedgerAudit {
  const audited = rows.map(auditRow);

  const counts: Record<AuditVerdict, number> = {
    reproduced: 0,
    correction: 0,
    converted: 0,
    mismatch: 0,
    not_reproducible: 0,
  };
  for (const r of audited) counts[r.verdict] += 1;

  const byId = new Map(rows.map((r) => [r.id, r]));
  const problems = audited.filter(
    (r) => r.verdict === "mismatch" || r.verdict === "not_reproducible"
  );

  const checks: AuditCheck[] = [];

  // ---- Corrections point at a real row, in this Pie, for this person ----
  const corrections = rows.filter((r) => r.reverses_id);
  const badCorrections = corrections.filter((c) => {
    const target = byId.get(c.reverses_id as string);
    if (!target) return true; // names a row that is not in this Pie
    if (target.pie_id !== c.pie_id) return true;
    if (target.participant_id !== c.participant_id) return true;
    return false;
  });
  checks.push({
    id: "corrections-point-at-a-real-row",
    claim:
      "Every correction names a row that exists, in the same Pie, belonging " +
      "to the same person.",
    passed: badCorrections.length === 0,
    inspected: corrections.length,
    offenders: badCorrections.slice(0, 10).map((c) => c.id),
  });

  // ---- Corrections never move a date backwards ----
  // A correction recorded before the thing it corrects would mean history
  // was rewritten into the past, which the ledger does not allow.
  const backdated = corrections.filter((c) => {
    const target = byId.get(c.reverses_id as string);
    return target ? c.event_date < target.event_date : false;
  });
  checks.push({
    id: "corrections-are-not-backdated",
    claim:
      "No correction is dated earlier than the entry it corrects — history " +
      "only ever gains rows at the end.",
    passed: backdated.length === 0,
    inspected: corrections.length,
    offenders: backdated.slice(0, 10).map((c) => c.id),
  });

  // ---- Every slice is attributable to a participant in the Pie ----
  const unowned = rows.filter(
    (r) => !r.participant_id || r.slices === null || Number.isNaN(r.slices)
  );
  checks.push({
    id: "every-row-has-an-owner-and-a-number",
    claim:
      "Every ledger row names a participant and carries a slice count.",
    passed: unowned.length === 0,
    inspected: rows.length,
    offenders: unowned.slice(0, 10).map((r) => r.id),
  });

  // ---- Every correction carries a readable figure ----
  // The delta must be on the row itself. If it were not, a reader could
  // not see how much was taken back without re-deriving it.
  const unreadable = corrections.filter((c) => typeof c.slices !== "number");
  checks.push({
    id: "corrections-carry-a-figure",
    claim:
      "Every correction states its own slice delta, so a reader can see " +
      "exactly how much was taken back.",
    passed: unreadable.length === 0,
    inspected: corrections.length,
    offenders: unreadable.slice(0, 10).map((c) => c.id),
  });

  return {
    rows_checked: rows.length,
    counts,
    problems,
    checks,
    ok: problems.length === 0 && checks.every((c) => c.passed),
  };
}

/**
 * Rows with the same type, participant and date, and the same slice
 * figure, excluding corrections. A likely accidental double entry.
 */
export function possibleDoubleEntries(rows: Contribution[]): Contribution[][] {
  const groups = new Map<string, Contribution[]>();
  for (const r of rows) {
    if (r.reverses_id) continue;
    if (isLegacyConversion(r)) continue;
    const key = `${r.participant_id}|${r.type}|${r.event_date.slice(0, 10)}|${r.slices}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }
  return Array.from(groups.values()).filter((g) => g.length > 1);
}
