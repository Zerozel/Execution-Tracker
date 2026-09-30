// ============================================================
// Execution Tracker — Slicing Pie: Records & proof tests (W6)
// ============================================================
// Three claims, each of which the product makes out loud:
//
//   audit    "every slice came from a rule, and the rule is still
//             visible in the row that carries it"
//   as-of    "we can show what ownership looked like on any past date,
//             and a later correction does not rewrite that past"
//   export   "the history can be taken out and read by something that
//             is not this app"
//
// Each is tested against the shape it will actually meet in the
// database, not a convenient one. Dependency-free.
// ============================================================

import {
  auditLedger,
  auditRow,
  possibleDoubleEntries,
} from "../engine/audit";
import { buildCapTable, capTableAsOf } from "../engine/captable";
import { computeSlices } from "../engine/calculate";
import {
  buildLedgerCsv,
  buildPieArchive,
  csvField,
  exportFilename,
  toCsv,
  LEDGER_COLUMNS,
} from "../export";
import { DEFAULT_PIE_SETTINGS } from "../config/schema";
import type {
  Contribution,
  PieParticipant,
  PieSettings,
} from "@/types/slicing-pie";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(detail ? `${name} — ${detail}` : name);
    console.log(`  ✗ ${detail ? `${name} — ${detail}` : name}`);
  }
}
function eq(name: string, actual: unknown, expected: unknown): void {
  check(
    name,
    String(actual) === String(expected),
    `expected ${expected}, got ${actual}`
  );
}
function section(t: string): void {
  console.log(`\n${t}`);
}

const S: PieSettings = { ...DEFAULT_PIE_SETTINGS };

let seq = 0;

/**
 * A ledger row as the app writes one: the frozen inputs, the frozen
 * settings, and the figure the calculator produced. Built by actually
 * running the calculator, so the fixture cannot drift away from the
 * product's own behaviour.
 */
function row(
  participant_id: string,
  partial: Partial<Contribution> & Pick<Contribution, "type" | "inputs">
): Contribution {
  const settings = partial.config_snapshot ?? S;
  const computed = computeSlices(
    { type: partial.type, ...partial.inputs } as never,
    settings
  );
  const n = ++seq;
  return {
    id: `c-${String(n).padStart(3, "0")}`,
    pie_id: "pie-1",
    participant_id,
    type: partial.type,
    event_date: partial.event_date ?? "2024-01-01",
    inputs: partial.inputs,
    config_snapshot: settings,
    fmv_minor: partial.fmv_minor ?? computed.fmv_minor,
    multiplier_kind: partial.multiplier_kind ?? computed.multiplier_kind,
    multiplier_applied:
      partial.multiplier_applied ?? computed.multiplier_applied,
    slices: partial.slices ?? computed.slices,
    notes: partial.notes ?? null,
    evidence_url: partial.evidence_url ?? null,
    project_tag: partial.project_tag ?? null,
    status: partial.status ?? "active",
    reverses_id: partial.reverses_id ?? null,
    created_by: partial.created_by ?? "u-admin",
    created_at: partial.created_at ?? "2024-01-01T00:00:00Z",
  };
}

/** 100 hours at a $200,000 salary ⇒ 1,000,000 minor of FMV = 20,000 slices. */
const TIME_INPUTS = { hours: 100, fair_market_salary_minor: 20_000_000 };
const TIME_SLICES = 20_000;

const ANA = "p-ana";
const BEN = "p-ben";

function participant(
  id: string,
  display_name: string,
  pie_role: PieParticipant["pie_role"]
): PieParticipant {
  return {
    id,
    pie_id: "pie-1",
    user_id: null,
    display_name,
    pie_role,
    status: "active",
    advisor_cap_opt_in: false,
    joined_at: "2024-01-01T00:00:00Z",
    created_at: "2024-01-01T00:00:00Z",
  };
}

const PARTICIPANTS: PieParticipant[] = [
  participant(ANA, "Ana", "owner"),
  participant(BEN, "Ben", "employee"),
];

// ============================================================
section("audit — every slice came from a rule, and the rule is on the row");
// ============================================================
{
  const r = row(ANA, { type: "time", inputs: TIME_INPUTS });

  // §4.1 worked by hand: rate 20,000,000 / 2,000 = 10,000 minor/hr;
  // FMV 100h × 10,000 = 1,000,000 minor; slices = 10,000 × 2 = 20,000.
  eq("the fixture is the number the rule gives", r.slices, TIME_SLICES);
  eq("cash value of 100h at that salary", r.fmv_minor, 1_000_000);

  const a = auditRow(r);
  eq("an ordinary row reproduces", a.verdict, "reproduced");
  eq("and the rule's answer matches the ledger", a.derived_slices, TIME_SLICES);
  check("and the calculator's working is carried out with it",
    a.explanation.length > 0);
}
{
  // The point of the audit is to notice when the ledger and the rule
  // disagree. Here someone has edited the slice count directly.
  const r = row(ANA, { type: "time", inputs: TIME_INPUTS, slices: 999_999 });
  const a = auditRow(r);
  eq("a tampered row is a mismatch", a.verdict, "mismatch");
  eq("the rule's answer is still reported", a.derived_slices, TIME_SLICES);
  check(
    "and both numbers appear in the explanation",
    a.note.includes("20000") && a.note.includes("999999"),
    a.note
  );
}
{
  // Rows computed BEFORE a settings change must still reproduce, because
  // the settings that produced them were frozen onto them. If the audit
  // used today's settings it would flag every historical row the moment
  // the founder changed a multiplier — and the check would become noise.
  const oldSettings: PieSettings = { ...S, non_cash_multiplier: 2 };
  const r = row(ANA, {
    type: "time",
    inputs: TIME_INPUTS,
    config_snapshot: oldSettings,
  });

  // The founder now changes the multiplier.
  const today: PieSettings = { ...S, non_cash_multiplier: 3 };
  check("the two eras genuinely differ", today.non_cash_multiplier !== 2);

  const a = auditRow(r);
  eq("a row from the old era still reproduces", a.verdict, "reproduced");
  eq("at the figure its own frozen rules produced", a.derived_slices, TIME_SLICES);
}
{
  const r = row(ANA, { type: "time", inputs: TIME_INPUTS });
  r.config_snapshot = null as unknown as PieSettings;
  const a = auditRow(r);
  eq("a row with no frozen settings cannot be re-derived", a.verdict, "not_reproducible");
}
{
  // A correction carries a DELTA, computed by the departure engine and
  // deliberately stamped with no multiplier. Re-running a rule over it is
  // a category error, and reporting it as a mismatch would train the
  // reader to ignore the report — which is worse than not having one.
  const original = row(ANA, { type: "time", inputs: TIME_INPUTS });
  const correction = row(ANA, {
    type: "time",
    inputs: { recovery_of: original.id, hours: 100 },
    event_date: "2024-06-01",
    fmv_minor: -1_000_000,
    multiplier_kind: "none",
    multiplier_applied: 1,
    slices: -TIME_SLICES,
    status: "active",
    reverses_id: original.id,
    notes: "Recovery on resignation",
  });
  const a = auditRow(correction);
  eq("a correction is not treated as a mismatch", a.verdict, "correction");
  eq("and no figure is invented for it", a.derived_slices, null);

  const audit = auditLedger([original, correction]);
  eq("so a clean departure leaves the ledger clean", audit.ok, true);
  eq("with one reproducible row", audit.counts.reproduced, 1);
  eq("and one correction", audit.counts.correction, 1);
}
{
  const original = row(ANA, { type: "time", inputs: TIME_INPUTS });
  const orphan = row(ANA, {
    type: "time",
    inputs: { recovery_of: "c-does-not-exist" },
    event_date: "2024-06-01",
    multiplier_kind: "none",
    multiplier_applied: 1,
    slices: -100,
    reverses_id: "c-does-not-exist",
  });
  const audit = auditLedger([original, orphan]);
  const c = audit.checks.find((x) => x.id === "corrections-point-at-a-real-row");
  check("a correction naming a row that is not there fails the check",
    c !== undefined && !c.passed);
  eq("and the offending row is named", c?.offenders[0], orphan.id);
  eq("which makes the whole audit not-ok", audit.ok, false);
}
{
  // A correction must not reach into someone else's history.
  const benRow = row(BEN, { type: "time", inputs: TIME_INPUTS });
  const cross = row(ANA, {
    type: "time",
    inputs: { recovery_of: benRow.id },
    event_date: "2024-06-01",
    multiplier_kind: "none",
    multiplier_applied: 1,
    slices: -1,
    reverses_id: benRow.id,
  });
  const audit = auditLedger([benRow, cross]);
  const c = audit.checks.find((x) => x.id === "corrections-point-at-a-real-row");
  check("a correction against another person's row fails the check",
    c !== undefined && !c.passed);
}
{
  const original = row(ANA, {
    type: "time",
    inputs: TIME_INPUTS,
    event_date: "2024-06-01",
  });
  const backdated = row(ANA, {
    type: "time",
    inputs: { recovery_of: original.id },
    event_date: "2024-01-01",
    multiplier_kind: "none",
    multiplier_applied: 1,
    slices: -100,
    reverses_id: original.id,
  });
  const audit = auditLedger([original, backdated]);
  const c = audit.checks.find((x) => x.id === "corrections-are-not-backdated");
  check("a correction dated before its target fails the check",
    c !== undefined && !c.passed);
}
{
  const r = row(ANA, { type: "time", inputs: TIME_INPUTS });
  r.inputs = {};
  r.reverses_id = null;
  const a = auditRow(r);
  eq("a row with no inputs to run is not reproducible", a.verdict, "not_reproducible");
  eq("and it is surfaced, not hidden", auditLedger([r]).ok, false);
}
{
  const rows = [
    row(ANA, { type: "time", inputs: TIME_INPUTS }),
    row(BEN, { type: "time", inputs: TIME_INPUTS }),
    row(ANA, { type: "expense", inputs: { amount_minor: 250_000 } }),
  ];
  const audit = auditLedger(rows);
  eq("a clean ledger is ok", audit.ok, true);
  eq("every row is accounted for", audit.counts.reproduced, 3);
  eq("nothing is left for a human to read", audit.problems.length, 0);
  eq("and every structural check ran", audit.checks.length, 4);
}

// ============================================================
section("audit — the likely double entry is surfaced, not silently summed");
// ============================================================
{
  const a1 = row(ANA, {
    type: "time",
    inputs: TIME_INPUTS,
    event_date: "2024-03-01",
  });
  const a2 = { ...row(ANA, { type: "time", inputs: TIME_INPUTS, event_date: "2024-03-01" }) };
  const b = row(BEN, {
    type: "time",
    inputs: TIME_INPUTS,
    event_date: "2024-03-01",
  });
  const dupes = possibleDoubleEntries([a1, a2, b]);
  eq("the same entry twice on one day is flagged", dupes.length, 1);
  eq("and it is the pair, not the other person's row", dupes[0].length, 2);
}
{
  const a1 = row(ANA, {
    type: "time",
    inputs: TIME_INPUTS,
    event_date: "2024-03-01",
  });
  const a2 = row(ANA, {
    type: "time",
    inputs: { hours: 40, fair_market_salary_minor: 20_000_000 },
    event_date: "2024-03-01",
  });
  eq("two different amounts on one day are not flagged",
    possibleDoubleEntries([a1, a2]).length, 0);
}

// ============================================================
section("as-of — ownership at a past date, rebuilt from the ledger");
// ============================================================
{
  const jan = row(ANA, {
    type: "time",
    inputs: { hours: 100, fair_market_salary_minor: 20_000_000 },
    event_date: "2024-01-15",
  });
  const mar = row(BEN, {
    type: "time",
    inputs: { hours: 100, fair_market_salary_minor: 20_000_000 },
    event_date: "2024-03-15",
  });

  const asOfJan = capTableAsOf("pie-1", PARTICIPANTS, [jan, mar], "2024-02-01");
  const anaJan = asOfJan.rows.find((r) => r.participant_id === ANA);
  const benJan = asOfJan.rows.find((r) => r.participant_id === BEN);
  eq("in February, Ana's 20,000 slices are all there", anaJan?.slices, 20_000);
  eq("and Ben had not started", benJan?.slices, 0);
  eq("so Ana owned the whole Pie", anaJan?.pct, 100);

  const asOfApr = capTableAsOf("pie-1", PARTICIPANTS, [jan, mar], "2024-04-01");
  const anaApr = asOfApr.rows.find((r) => r.participant_id === ANA);
  const benApr = asOfApr.rows.find((r) => r.participant_id === BEN);
  eq("by April they are equal", anaApr?.slices, 20_000);
  eq("Ben has caught up", benApr?.slices, 20_000);
  eq("and it is a 50/50 Pie", anaApr?.pct, 50);
  eq("with the total doubled", asOfApr.total_slices, 40_000);
}
{
  // The whole reason "as of" is worth having: a departure recorded in
  // June must not change what ownership looked like in May. The
  // correction is excluded from an earlier date purely because of when it
  // happened, with no special-casing.
  const earning = row(ANA, {
    type: "time",
    inputs: TIME_INPUTS,
    event_date: "2024-01-15",
  });
  const other = row(BEN, {
    type: "time",
    inputs: TIME_INPUTS,
    event_date: "2024-01-20",
  });
  const departure = row(ANA, {
    type: "time",
    inputs: { recovery_of: earning.id },
    event_date: "2024-06-30",
    multiplier_kind: "none",
    multiplier_applied: 1,
    slices: -20_000,
    reverses_id: earning.id,
  });

  const may = capTableAsOf(
    "pie-1",
    PARTICIPANTS,
    [earning, other, departure],
    "2024-05-31"
  );
  eq("in May, Ana still holds what she earned",
    may.rows.find((r) => r.participant_id === ANA)?.slices, 20_000);
  eq("and it is still 50/50",
    may.rows.find((r) => r.participant_id === ANA)?.pct, 50);

  const july = capTableAsOf(
    "pie-1",
    PARTICIPANTS,
    [earning, other, departure],
    "2024-07-31"
  );
  eq("by July the departure has taken effect",
    july.rows.find((r) => r.participant_id === ANA)?.slices, 0);
  eq("Ben owns everything",
    july.rows.find((r) => r.participant_id === BEN)?.pct, 100);

  // And the current cap table agrees with the latest as-of date, which is
  // what makes the two views one system rather than two.
  const now = buildCapTable("pie-1", PARTICIPANTS, [earning, other, departure]);
  eq("today's total matches the latest as-of total",
    now.total_slices, july.total_slices);
}
{
  const earning = row(ANA, {
    type: "time",
    inputs: TIME_INPUTS,
    event_date: "2024-01-15",
  });
  const before = capTableAsOf("pie-1", PARTICIPANTS, [earning], "2024-01-14");
  eq("before anything happened, the Pie is empty", before.total_slices, 0);
  const onTheDay = capTableAsOf("pie-1", PARTICIPANTS, [earning], "2024-01-15");
  eq("and the boundary date is inclusive", onTheDay.total_slices, 20_000);
}

// ============================================================
section("export — CSV that a spreadsheet opens without being corrupted");
// ============================================================
{
  eq("a plain field is left alone", csvField("Ana"), "Ana");
  eq("a comma forces quotes", csvField("Ana, Ben"), '"Ana, Ben"');
  eq("an inner quote is doubled", csvField('He said "yes"'), '"He said ""yes"""');
  eq("a newline forces quotes", csvField("line one\nline two"), '"line one\nline two"');
  eq("padding is preserved", csvField(" padded "), '" padded "');
  eq("null is empty", csvField(null), "");
  eq("a number stays a number", csvField(-250_000), "-250000");
  check("a non-finite number is written as blank rather than as NaN",
    csvField(Number.NaN) === "" && csvField(Infinity) === "");
}
{
  // CSV injection: a note beginning "=" is executed as a formula by
  // Excel on open. Notes are free text typed by a team member, so this is
  // the one place in the product where a user can hand a formula to
  // whoever opens the export.
  check("a formula is defused", csvField("=1+1").startsWith("'="));
  check("so is a plus", csvField("+cmd").startsWith("'+"));
  check("so is an at-sign", csvField("@SUM(A1)").startsWith("'@"));
  eq("but a negative number in a numeric field is NOT defused",
    csvField(-1_000_000), "-1000000");
}
{
  const text = toCsv([["a", "b"], ["c", "d"]]);
  eq("rows are joined with CRLF per RFC 4180", text, "a,b\r\nc,d\r\n");
}
{
  const rows = [
    row(ANA, {
      type: "time",
      inputs: TIME_INPUTS,
      event_date: "2024-03-01",
      notes: "March sprint",
    }),
    row(ANA, {
      type: "expense",
      inputs: { amount_minor: 250_000 },
      event_date: "2024-01-05",
      notes: "Domain name, hosting",
    }),
  ];

  const csv = buildLedgerCsv(rows, {
    pieName: "Acme, Inc.",
    currency: "NGN",
    participants: PARTICIPANTS,
    generatedAt: "2024-12-01T10:00:00Z",
  });

  check("the file starts with the byte-order mark", csv.startsWith("﻿"));
  check("the Pie name is quoted because it contains a comma",
    csv.includes('"Acme, Inc."'));
  check("the entry type is spelled out in words, not left as a key",
    csv.includes("Time (employee/founder)") && csv.includes("Unreimbursed expense"));
  check("the header row is present",
    csv.includes(LEDGER_COLUMNS.join(",")));
  check("a note containing a comma survives intact",
    csv.includes('"Domain name, hosting"'));
  check("the audit verdict travels with the row", csv.includes("reproduced"));
  check("there is a totals block", csv.includes("TOTALS"));
  // The export's own total must be the number the app shows.
  check("and it carries the cap table's grand total",
    csv.includes(`TOTAL,${buildCapTable("pie-1", PARTICIPANTS, rows).total_slices},`));

  // Oldest first: a ledger is only readable if the correction comes after
  // the entry it corrects.
  const expenseAt = csv.indexOf("Domain name");
  const timeAt = csv.indexOf("March sprint");
  check("rows are exported oldest first", expenseAt < timeAt);

  // Every line is either blank or has the right number of fields.
  const fieldCount = LEDGER_COLUMNS.length;
  const tableLines = csv
    .slice(1)
    .split("\r\n")
    .filter((l) => l.startsWith("c-"));
  check("every ledger line carries a full set of columns",
    tableLines.every((l) => l.split(",").length >= fieldCount),
    `${tableLines.map((l) => l.split(",").length).join("/")} vs ${fieldCount}`);
}
{
  const rows = [
    row(ANA, { type: "time", inputs: TIME_INPUTS, event_date: "2024-01-15" }),
    row(BEN, { type: "time", inputs: TIME_INPUTS, event_date: "2024-01-15" }),
  ];
  const csv = buildLedgerCsv(rows, {
    pieName: "Acme",
    currency: "NGN",
    participants: PARTICIPANTS,
    generatedAt: "2024-12-01T10:00:00Z",
  });

  // The export's totals must agree with the cap table's, or the two
  // documents contradict each other in front of whoever is challenging
  // the numbers — the exact situation this feature exists for.
  const cap = buildCapTable("pie-1", PARTICIPANTS, rows);
  check("the export's total is the cap table's total",
    csv.includes(`TOTAL,${cap.total_slices},`));
}
{
  const archive = buildPieArchive({
    generated_at: "2024-12-01T10:00:00Z",
    pie: { id: "pie-1", name: "Acme" },
    settings: S,
    participants: PARTICIPANTS,
    contributions: [],
    time_logs: [],
    other: {},
  });
  eq("the archive declares its format", archive.format, "execution-tracker.pie-archive");
  eq("and its version", archive.format_version, 1);
  eq("and it survives a JSON round-trip",
    JSON.parse(JSON.stringify(archive)).format_version, 1);
}
{
  eq("a filename is slugged", exportFilename("Acme, Inc.", "ledger", "20241201-1000"),
    "acme-inc-ledger-20241201-1000.csv");
  eq("JSON exports are .json", exportFilename("Acme", "archive", "x"), "acme-archive-x.json");
  eq("a Pie with no usable name still gets one",
    exportFilename("Ñ", "ledger", "x"), "pie-ledger-x.csv");
  check("a very long name is truncated to something a filesystem accepts",
    exportFilename("x".repeat(500), "ledger", "s").length < 100);
}

// ============================================================
if (failed > 0) {
  console.log(`\n${failed} of ${passed + failed} checks FAILED:`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`\n  ✓ records: ${passed} checks passed.`);
