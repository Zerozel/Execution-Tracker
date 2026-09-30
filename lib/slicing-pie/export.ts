// ============================================================
// Execution Tracker — Slicing Pie: export the history (decision D3)
// ============================================================
// D3 committed to a history that can be got OUT of the tool: "defensible
// if challenged" is worth little if the evidence only exists inside the
// app being challenged.
//
// Two formats, because they answer different questions:
//
//   CSV   — for a spreadsheet, an accountant, or a lawyer. One row per
//           ledger entry, every column in full, plus the re-derived
//           figure so a reviewer can see the audit passes without
//           rerunning anything.
//   JSON  — the whole Pie, complete and re-importable: settings,
//           participants, the ledger, time logs, departures and buyouts.
//           This is the "if the tool disappears tomorrow" copy.
//
// The CSV is written to be opened by Excel and Google Sheets without the
// corruption that comes from a naive implementation, which is why the
// escaping below is fussy:
//
//   * UTF-8 BOM, so Excel does not mangle the currency symbol.
//   * CRLF line endings, per RFC 4180.
//   * Any field containing a comma, quote, newline or leading/trailing
//     space is quoted, with inner quotes doubled.
//   * A NEGATIVE money figure is written as "-1234" in a minor-unit
//     column, never as a formatted string, so a spreadsheet can subtract.
//
// Pure functions — the string builders take rows and return text, with no
// database and no clock. The loaders live in server/export.ts.
// ============================================================

import type {
  Contribution,
  PieParticipant,
  PieSettings,
} from "@/types/slicing-pie";
import type { TimeLog } from "@/types/time-tracking";
import { contributionTypeLabel } from "./labels";
import { auditRow } from "./engine/audit";

/**
 * Excel needs the byte-order mark to read a file as UTF-8 rather than as
 * the local codepage; without it the currency symbol comes out as
 * mojibake. Note the value is a LITERAL U+FEFF (an invisible character
 * sitting between the quotes), not the four escape characters that spell
 * it — if an editor ever strips it, the test suite catches it by name.
 */
export const UTF8_BOM = "﻿";

/** RFC 4180 says CRLF; Excel on Windows agrees. */
export const CRLF = "\r\n";

/**
 * Quote a CSV field when it needs it.
 *
 * A leading `=`, `+`, `-` or `@` in a TEXT field is prefixed with a
 * single quote. Without that, a note beginning "=..." is executed as a
 * formula when the file is opened — CSV injection, and a real hazard when
 * the field is a free-text note typed by a team member.
 *
 * The guard applies to TEXT ONLY. A value that arrived as a number cannot
 * have been typed by a user, and the money and slice columns are full of
 * negative numbers — a payment out is negative, a correction is negative.
 * Prefixing those would put `'-250000` in a column an accountant is meant
 * to subtract, which breaks every total in the sheet. Numbers therefore
 * pass through untouched.
 */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }

  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;

  const needsQuotes =
    s.includes(",") ||
    s.includes('"') ||
    s.includes("\n") ||
    s.includes("\r") ||
    s !== s.trim();
  if (!needsQuotes) return s;

  return `"${s.replace(/"/g, '""')}"`;
}

/** Join a matrix of cells into CSV text. */
export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvField).join(",")).join(CRLF) + CRLF;
}

// ------------------------------------------------------------
// Ledger CSV
// ------------------------------------------------------------

export interface LedgerCsvContext {
  pieName: string;
  currency: string;
  participants: Pick<PieParticipant, "id" | "display_name" | "pie_role">[];
  /** Generated-at stamp, passed in so the builder stays pure. */
  generatedAt: string;
}

/**
 * The columns, in the order a reader wants them: who, what, how much,
 * which rule produced it, and whether the audit could reproduce it.
 *
 * `fmv_minor` and `slices` stay in raw units so the sheet can do
 * arithmetic; the human-readable versions are separate columns.
 */
export const LEDGER_COLUMNS = [
  "row_id",
  "entry_date",
  "recorded_at",
  "participant",
  "pie_role",
  "entry_type",
  "entry_type_plain_english",
  "cash_value_minor",
  "multiplier_kind",
  "multiplier_applied",
  "slices_recorded",
  "slices_recalculated",
  "audit_result",
  "corrects_row_id",
  "status",
  "notes",
  "project_tag",
  "evidence_url",
  "recorded_by",
] as const;

/** One ledger row as an array of cells, in LEDGER_COLUMNS order. */
function ledgerCells(
  c: Contribution,
  nameOf: (id: string) => string,
  roleOf: (id: string) => string
): unknown[] {
  const audit = auditRow(c);
  return [
    c.id,
    c.event_date,
    c.created_at,
    nameOf(c.participant_id),
    roleOf(c.participant_id),
    c.type,
    contributionTypeLabel(c.type),
    c.fmv_minor,
    c.multiplier_kind,
    c.multiplier_applied,
    c.slices,
    audit.derived_slices === null ? "" : audit.derived_slices,
    audit.verdict,
    c.reverses_id ?? "",
    c.status,
    c.notes ?? "",
    c.project_tag ?? "",
    c.evidence_url ?? "",
    c.created_by ?? "",
  ];
}

/**
 * Build the ledger CSV.
 *
 * Rows are oldest-first: a ledger read top to bottom should accumulate,
 * and a reader checking the arithmetic needs to see each entry before the
 * correction that changes it.
 */
export function buildLedgerCsv(
  contributions: Contribution[],
  context: LedgerCsvContext
): string {
  const names = new Map(
    context.participants.map((p) => [p.id, p.display_name])
  );
  const roles = new Map(context.participants.map((p) => [p.id, p.pie_role]));
  const nameOf = (id: string) => names.get(id) ?? id;
  const roleOf = (id: string) => roles.get(id) ?? "";

  const ordered = [...contributions].sort((a, b) => {
    const byDate = a.event_date.localeCompare(b.event_date);
    if (byDate !== 0) return byDate;
    return a.created_at.localeCompare(b.created_at);
  });

  const rows: unknown[][] = [];

  // A short preamble of plain `key,value` lines, so the file explains
  // itself once it has been separated from the app. A blank line then
  // separates it from the table for both a human and a parser.
  rows.push(["Execution Tracker — Slicing Pie ledger export"]);
  rows.push(["Pie", context.pieName]);
  rows.push(["Currency", context.currency]);
  rows.push(["Generated at", context.generatedAt]);
  rows.push(["Entries", ordered.length]);
  rows.push(["Cash value is in minor units", `1 ${context.currency} = 100`]);
  rows.push([
    "Corrections",
    "Rows with a value in corrects_row_id carry a delta against that row; add them together to reach the corrected figure.",
  ]);
  rows.push([]);

  rows.push([...LEDGER_COLUMNS]);
  for (const c of ordered) rows.push(ledgerCells(c, nameOf, roleOf));

  // A totals block, because the first thing a challenger checks is
  // whether the slices add up to the ownership percentages.
  const totals = new Map<string, number>();
  for (const c of ordered) {
    totals.set(c.participant_id, (totals.get(c.participant_id) ?? 0) + c.slices);
  }
  const grandTotal = ordered.reduce((s, c) => s + c.slices, 0);

  rows.push([]);
  rows.push(["TOTALS"]);
  rows.push(["participant", "slices", "share_of_total_percent"]);
  for (const [pid, slices] of Array.from(totals.entries()).sort(
    (a, b) => b[1] - a[1]
  )) {
    const pct = grandTotal === 0 ? 0 : (slices / grandTotal) * 100;
    rows.push([nameOf(pid), slices, pct.toFixed(4)]);
  }
  rows.push(["TOTAL", grandTotal, grandTotal === 0 ? "0.0000" : "100.0000"]);

  return UTF8_BOM + toCsv(rows);
}

// ------------------------------------------------------------
// Full-Pie JSON
// ------------------------------------------------------------

export interface PieArchive {
  format: "execution-tracker.pie-archive";
  format_version: 1;
  generated_at: string;
  pie: Record<string, unknown>;
  settings: PieSettings;
  participants: PieParticipant[];
  contributions: Contribution[];
  time_logs: TimeLog[];
  /** Everything else that belongs to the Pie, keyed by table name. */
  other: Record<string, unknown[]>;
}

/**
 * The complete Pie as a JSON document.
 *
 * The ledger is included verbatim — every row, every correction, every
 * frozen `config_snapshot` — because a copy that has been "tidied up" is
 * not evidence. Re-running `buildCapTable` over `contributions` alone
 * reproduces the ownership figures in the app.
 */
export function buildPieArchive(
  archive: Omit<PieArchive, "format" | "format_version">
): PieArchive {
  return {
    format: "execution-tracker.pie-archive",
    format_version: 1,
    ...archive,
  };
}

/** A stable, filesystem-safe filename for a Pie's export. */
export function exportFilename(
  pieName: string,
  kind: "ledger" | "archive",
  stamp: string
): string {
  const slug =
    pieName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "pie";
  const ext = kind === "ledger" ? "csv" : "json";
  return `${slug}-${kind}-${stamp}.${ext}`;
}
