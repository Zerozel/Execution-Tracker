// ============================================================
// Execution Tracker — Slicing Pie: Engine Functional Tests
// ============================================================
// Verifies the contribution rules engine (§4) and cap-table
// aggregation with worked numeric examples, including the negative-slice
// cash payment of §20 HARD-VAL-004. Dependency-free; exits
// non-zero on any failure. Money in MINOR units (cents).
// ============================================================

import {
  computeSlices,
  computeFinderFeeMinor,
  multiplierValue,
  type PieContributionInput,
} from "../engine/calculate";
import { buildCapTable, ownershipFraction } from "../engine/captable";
import { DEFAULT_PIE_SETTINGS } from "../config/schema";
import type {
  Contribution,
  PieParticipant,
  PieSettings,
} from "@/types/slicing-pie";

// ------------------------------------------------------------
// Harness
// ------------------------------------------------------------
let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  \u2713 ${name}`);
  } else {
    failed++;
    const msg = detail ? `${name} — ${detail}` : name;
    failures.push(msg);
    console.log(`  \u2717 ${msg}`);
  }
}
function eq(name: string, actual: unknown, expected: unknown): void {
  const a = typeof actual === "object" ? JSON.stringify(actual) : String(actual);
  const e = typeof expected === "object" ? JSON.stringify(expected) : String(expected);
  check(name, a === e, `expected ${e}, got ${a}`);
}
function section(t: string): void {
  console.log(`\n${t}`);
}

const S: PieSettings = { ...DEFAULT_PIE_SETTINGS };

// ------------------------------------------------------------
// §4.1 Time
// ------------------------------------------------------------
section("engine — §4.1 time");
// $100,000/yr salary → $50/hr over 2000h; 10h = $500 FMV; ×2 = 1000 slices.
{
  const r = computeSlices(
    { type: "time", hours: 10, fair_market_salary_minor: 10_000_000 },
    S
  );
  eq("time FMV = $500 (50000 minor)", r.fmv_minor, 500_00);
  eq("time multiplier = non_cash (2)", r.multiplier_applied, 2);
  eq("time slices = 1000", r.slices, 1000);
}
// per-participant override changes divisor when scope allows it.
{
  const perP: PieSettings = { ...S, working_hours_scope: "per_participant" };
  const r = computeSlices(
    {
      type: "time",
      hours: 10,
      fair_market_salary_minor: 10_000_000,
      working_hours_override: 1000, // half the hours → double the rate
    },
    perP
  );
  eq("time (override 1000h) slices = 2000", r.slices, 2000);
}
// high-hours warning fires past threshold.
{
  const r = computeSlices(
    { type: "time", hours: 80, fair_market_salary_minor: 10_000_000 },
    S
  );
  check("time high-hours warning present", r.warnings.some((w) => w.includes("WARN-001")));
}

// ------------------------------------------------------------
// §4.4 Expense (cash) + over-reimbursement guard
// ------------------------------------------------------------
section("engine — §4.4 expense & reimbursement");
{
  // $200 unreimbursed cash × 4 = 800 slices.
  const r = computeSlices({ type: "expense", amount_minor: 200_00 }, S);
  eq("expense slices = 800 (cash ×4)", r.slices, 800);
  eq("expense multiplier = cash (4)", r.multiplier_applied, 4);
}
{
  // Partial reimbursement reduces the at-risk base.
  const r = computeSlices(
    { type: "expense", amount_minor: 200_00, reimbursed_minor: 50_00 },
    S
  );
  eq("expense net $150 → 600 slices", r.slices, 600);
}
{
  // Over-reimbursement clamps to 0 and warns.
  const r = computeSlices(
    { type: "expense", amount_minor: 100_00, reimbursed_minor: 150_00 },
    S
  );
  eq("over-reimbursed → 0 slices", r.slices, 0);
  check("over-reimbursement warns", r.warnings.length > 0);
}

// ------------------------------------------------------------
// §4.5 The Well — deposit earns nothing, withdrawal earns cash slices
// ------------------------------------------------------------
section("engine — §4.5 the well");
{
  const dep = computeSlices({ type: "well_deposit", amount_minor: 500_00 }, S);
  eq("well deposit slices = 0", dep.slices, 0);
  const wd = computeSlices({ type: "well_withdrawal", amount_minor: 500_00 }, S);
  eq("well withdrawal slices = 2000 (cash ×4)", wd.slices, 2000);
}

// ------------------------------------------------------------
// §4.8 / §4.9 rate-based (royalty, commission)
// ------------------------------------------------------------
section("engine — §4.8/§4.9 royalty & commission");
{
  // 5% royalty on $10,000 = $500 FMV × 2 = 1000 slices.
  const r = computeSlices({ type: "idea_royalty", revenue_minor: 10_000_00 }, S);
  eq("royalty slices = 1000", r.slices, 1000);
}
{
  // 10% commission on $10,000 = $1000 FMV × 2 = 2000 slices.
  const r = computeSlices({ type: "commission", revenue_minor: 10_000_00 }, S);
  eq("commission slices = 2000", r.slices, 2000);
}
// IDEA-002 / SALES-002 / FACILITY-002: cash already paid on the same
// deal is not at risk, so it earns no slices.
{
  const r = computeSlices(
    { type: "idea_royalty", revenue_minor: 10_000_00, cash_paid_minor: 200_00 },
    S
  );
  // Gross $500 − $200 paid = $300 at risk × 2 = 600 slices.
  eq("royalty less cash paid → 600 slices", r.slices, 600);
  eq("royalty keeps the unreimbursed value", r.fmv_minor, 300_00);
}
{
  const r = computeSlices(
    { type: "commission", revenue_minor: 10_000_00, cash_paid_minor: 1000_00 },
    S
  );
  eq("commission paid in full → 0 slices", r.slices, 0);
}
{
  const r = computeSlices(
    { type: "commission", revenue_minor: 10_000_00, cash_paid_minor: 1500_00 },
    S
  );
  eq("commission overpaid clamps to 0 (never negative)", r.slices, 0);
  check("commission overpayment warns", r.warnings.length > 0);
}
{
  const r = computeSlices(
    { type: "facilities", rent_fmv_minor: 1000_00, cash_paid_minor: 250_00 },
    S
  );
  eq("facilities less cash paid → 1500 slices", r.slices, 1500);
}

// ------------------------------------------------------------
// §4.10 Finder's fee — tiered
// ------------------------------------------------------------
section("engine — §4.10 finder's fee (tiered)");
{
  // $1.5M investment: 5% of first $1M = $50k; 2.5% of next $500k = $12.5k;
  // total fee $62,500.
  const fee = computeFinderFeeMinor(1_500_000_00, S);
  eq("finder fee on $1.5M = $62,500", fee, 62_500_00);
  const r = computeSlices({ type: "finder_fee", investment_minor: 1_500_000_00 }, S);
  eq("finder fee slices = fee×2 = 125000", r.slices, 125_000);
}
{
  // With multiplier disabled, slices == fee (major units).
  const noMult: PieSettings = {
    ...S,
    finder_fee: { ...S.finder_fee, apply_non_cash_multiplier: false },
  };
  const r = computeSlices({ type: "finder_fee", investment_minor: 1_000_000_00 }, noMult);
  eq("finder fee (no mult) slices = 50000", r.slices, 50_000);
  eq("finder fee (no mult) multiplier = 1", r.multiplier_applied, 1);
}

// ------------------------------------------------------------
// §4.3 Advisor — min-hours gate + hourly cap
// ------------------------------------------------------------
section("engine — §4.3 advisor gate & cap");
{
  // Below 10h minimum → 0 (gate mode, no prior hours).
  const r = computeSlices(
    { type: "advisor_time", hours: 5, hourly_rate_minor: 100_00 },
    S
  );
  eq("advisor 5h (<10 min) → 0 slices", r.slices, 0);
}
{
  // Default mechanism is "unpaid_first": the hours below the threshold
  // are WITHHELD, then granted retroactively at the crossing event. Here
  // 8 prior + 5 now = 13 counted hours, so the earlier 8 are unlocked
  // too — the advisor is paid for all of the work, not just the excess.
  const r = computeSlices(
    {
      type: "advisor_time",
      hours: 5,
      hourly_rate_minor: 100_00, // $100/hr
      cumulative_hours_before: 8,
      cap_opt_in: true,
    },
    S
  );
  // 13 counted hours × $100 = $1,300 FMV × 2 = 2,600 slices; cap = 13 × 200 = 2,600.
  eq("advisor unlock counts 13h → 2600 slices", r.slices, 2600);
}
{
  // Same entry under the "gate" mechanism: the first 10 hours are burnt,
  // so only the 3 hours beyond the threshold count.
  const gated: PieSettings = { ...S, advisor_min_hours_mode: "gate" };
  const r = computeSlices(
    {
      type: "advisor_time",
      hours: 5,
      hourly_rate_minor: 100_00,
      cumulative_hours_before: 8,
      cap_opt_in: true,
    },
    gated
  );
  // 3 counted hours × $100 = $300 FMV × 2 = 600 slices; cap = 3 × 200 = 600.
  eq("advisor gate counts 3h → 600 slices", r.slices, 600);
}
{
  // Cap binds when hourly value is very high AND the advisor accepted it.
  const r = computeSlices(
    {
      type: "advisor_time",
      hours: 1,
      hourly_rate_minor: 1_000_00, // $1000/hr → uncapped 2000 slices
      cumulative_hours_before: 20,
      cap_opt_in: true,
    },
    S
  );
  // cap = 1h × 200 = 200 slices; min(2000, 200) = 200.
  eq("advisor cap binds → 200 slices", r.slices, 200);
  check("advisor cap warning present", r.warnings.some((w) => w.includes("cap")));
}
{
  // The cap is opt-in: declining it keeps market-rate slices and gives
  // up the termination immunity in exchange (§4.3, HARD-VAL-002).
  const r = computeSlices(
    {
      type: "advisor_time",
      hours: 1,
      hourly_rate_minor: 1_000_00,
      cumulative_hours_before: 20,
      cap_opt_in: false,
    },
    S
  );
  eq("uncapped advisor keeps 2,000 slices", r.slices, 2000);
  check("and gets no cap warning", !r.warnings.some((w) => w.includes("cap")));
  check(
    "explanation says why the cap did not apply",
    r.explanation.some((l) => l.includes("no hourly cap"))
  );
}
{
  // Default is opt-OUT: omitting the flag must not silently cap anyone.
  const r = computeSlices(
    {
      type: "advisor_time",
      hours: 1,
      hourly_rate_minor: 1_000_00,
      cumulative_hours_before: 20,
    },
    S
  );
  eq("cap is never assumed", r.slices, 2000);
}

// ------------------------------------------------------------
// §4.14 Personal car — split method
// ------------------------------------------------------------
section("engine — §4.14 personal car (split)");
{
  // fuel $40 (cash ×4 = 160) + 100mi × $0.54 = $54 (non-cash ×2 = 108) = 268.
  const r = computeSlices(
    { type: "personal_car", fuel_minor: 40_00, miles: 100 },
    S
  );
  eq("personal car split slices = 268", r.slices, 268);
}

// ------------------------------------------------------------
// §4.7 Equipment — new (cash) vs pre-owned (non-cash)
// ------------------------------------------------------------
section("engine — §4.7 equipment");
{
  const neu = computeSlices(
    { type: "equipment", fmv_minor: 100_00, condition: "new" },
    S
  );
  eq("new equipment → cash ×4 = 400 slices", neu.slices, 400);
  const used = computeSlices(
    { type: "equipment", fmv_minor: 100_00, condition: "preowned_gte_1yr" },
    S
  );
  eq("preowned equipment → non-cash ×2 = 200 slices", used.slices, 200);
}

// ------------------------------------------------------------
// multiplierValue helper
// ------------------------------------------------------------
section("engine — multiplier helper");
eq("multiplierValue(cash) = 4", multiplierValue("cash", S), 4);
eq("multiplierValue(non_cash) = 2", multiplierValue("non_cash", S), 2);
eq("multiplierValue(none) = 1", multiplierValue("none", S), 1);

// ------------------------------------------------------------
// Cap table aggregation
// ------------------------------------------------------------
section("captable — ownership aggregation");

function mkParticipant(id: string, name: string): PieParticipant {
  return {
    id,
    pie_id: "pie-1",
    user_id: null,
    display_name: name,
    pie_role: "employee",
    status: "active",
    advisor_cap_opt_in: false,
    joined_at: null,
    created_at: "2024-01-01T00:00:00Z",
  };
}
function mkContribution(
  participant_id: string,
  slices: number,
  opts: {
    id?: string;
    status?: Contribution["status"];
    reverses_id?: string | null;
  } = {}
): Contribution {
  return {
    id: opts.id ?? `c-${Math.random()}`,
    pie_id: "pie-1",
    participant_id,
    type: "time",
    event_date: "2024-01-01",
    inputs: {},
    config_snapshot: S,
    fmv_minor: 0,
    multiplier_kind: "non_cash",
    multiplier_applied: 2,
    slices,
    notes: null,
    evidence_url: null,
    project_tag: null,
    status: opts.status ?? "active",
    reverses_id: opts.reverses_id ?? null,
    created_by: null,
    created_at: "2024-01-01T00:00:00Z",
  };
}

{
  // The ledger is append-only: the erroneous 5000 is corrected by a
  // NEW row carrying −5000, not by editing or filtering the original.
  const participants = [mkParticipant("p1", "Alice"), mkParticipant("p2", "Bob")];
  const contributions = [
    mkContribution("p1", 3000),
    mkContribution("p1", 1000),
    mkContribution("p2", 1000),
    mkContribution("p2", 5000, { id: "c-bad" }), // booked in error
    mkContribution("p2", -5000, { id: "c-rev", reverses_id: "c-bad" }), // reversal
  ];
  const ct = buildCapTable("pie-1", participants, contributions);
  eq("cap table total = 5000 (reversal nets out)", ct.total_slices, 5000);
  eq("rows sorted: Alice first", ct.rows[0]?.display_name, "Alice");
  eq("Alice slices = 4000", ct.rows[0]?.slices, 4000);
  eq("Alice pct = 80", ct.rows[0]?.pct, 80);
  eq("Bob slices = 1000 (5000 − 5000 + 1000)", ct.rows[1]?.slices, 1000);
  eq("Bob pct = 20", ct.rows[1]?.pct, 20);
  eq(
    "ownershipFraction(p1) = 0.8",
    ownershipFraction("p1", contributions),
    0.8
  );
}
{
  // `status` is informational only and must NOT filter rows: a legacy
  // row marked "reversed" still counts, exactly like its modern
  // negative companion — the arithmetic is what nets it out.
  const participants = [mkParticipant("p1", "Alice")];
  const contributions = [
    mkContribution("p1", 1000),
    mkContribution("p1", -1000, { status: "reversed" }),
  ];
  const ct = buildCapTable("pie-1", participants, contributions);
  eq("legacy status row is not filtered — nets to 0", ct.total_slices, 0);
}
{
  // A full reversal pair leaves both participants untouched, while the
  // history of both rows survives for audit.
  const participants = [mkParticipant("p1", "Alice"), mkParticipant("p2", "Bob")];
  const contributions = [
    mkContribution("p1", 2000),
    mkContribution("p2", 800),
    mkContribution("p2", -800, { reverses_id: "x" }),
  ];
  const ct = buildCapTable("pie-1", participants, contributions);
  eq("reversal restores Alice to 100%", ct.rows[0]?.pct, 100);
  eq("Bob nets to 0 slices", ct.rows[1]?.slices, 0);
  eq("Bob still listed (row not dropped)", ct.rows.length, 2);
}
{
  // Empty Pie: no divide-by-zero, all zero.
  const ct = buildCapTable("pie-1", [mkParticipant("p1", "Solo")], []);
  eq("empty pie total = 0", ct.total_slices, 0);
  eq("empty pie pct = 0 (no NaN)", ct.rows[0]?.pct, 0);
}

// ------------------------------------------------------------
// §15/§20 HARD-VAL-004 — cash payment to a participant
// ------------------------------------------------------------
section("engine — §20 HARD-VAL-004 cash payment to a participant");
{
  // A $300 payment drawing $200 of cash at risk and $100 of the $500
  // non-cash: $200 × 4 = 800 plus $100 × 2 = 200, so 1000 slices go.
  const r = computeSlices(
    {
      type: "cash_payment_to_participant",
      amount_minor: 300_00,
      cash_drawdown_minor: 200_00,
      non_cash_drawdown_minor: 100_00,
      overflow_minor: 0,
    },
    S
  );
  eq("payment removes 1000 slices", r.slices, -1000);
  eq("payment FMV is negative", r.fmv_minor, -300_00);
  check(
    "a fully covered payment raises no floor warning",
    !r.warnings.some((w) => w.includes("HARD-VAL-004"))
  );
  check(
    "the explanation states both halves of the split",
    r.explanation.some((l) => l.includes("cash portion")) &&
      r.explanation.some((l) => l.includes("non-cash portion"))
  );
}
{
  // The whole payment is beyond the balance: nothing is drawn, and the
  // balance floors at zero rather than going negative.
  const r = computeSlices(
    {
      type: "cash_payment_to_participant",
      amount_minor: 100_00,
      cash_drawdown_minor: 0,
      non_cash_drawdown_minor: 0,
      overflow_minor: 100_00,
    },
    S
  );
  eq("an entirely overflowing payment removes nothing", r.slices, 0);
  eq("...and carries no negative FMV", r.fmv_minor, 0);
  check(
    "the floor is explained, not silent",
    r.warnings.some((w) => w.includes("HARD-VAL-004"))
  );
}
{
  // Partial overflow: a $700 balance against an $800 payment. Only the
  // covered $700 may be turned into slices.
  const r = computeSlices(
    {
      type: "cash_payment_to_participant",
      amount_minor: 800_00,
      cash_drawdown_minor: 200_00,
      non_cash_drawdown_minor: 500_00,
      overflow_minor: 100_00,
    },
    S
  );
  eq("only the covered part removes slices", r.slices, -(200 * 4 + 500 * 2));
  eq("only the covered part is recorded at risk", r.fmv_minor, -700_00);
  check(
    "the uncovered $100 is reported",
    r.warnings.some((w) => w.includes("10000"))
  );
}
{
  // A caller that forgot to plan the drawdown must not silently book a
  // payment that looks real but moved nothing.
  const r = computeSlices(
    { type: "cash_payment_to_participant", amount_minor: 250_00 },
    S
  );
  eq("an unplanned payment removes nothing", r.slices, 0);
  check(
    "and says so, citing the rule, rather than looking like a real payment",
    r.warnings.some(
      (w) => w.includes("HARD-VAL-004") && w.toLowerCase().includes("nothing to draw down")
    )
  );
}
{
  // The cap table needs no special handling for the negative row: it
  // sums every row (architecture decision A1), so the payment nets out.
  const participants = [
    mkParticipant("p1", "Payer"),
    mkParticipant("p2", "Other"),
  ];
  const ct = buildCapTable("pie-1", participants, [
    mkContribution("p1", 1000, { id: "earned" }),
    mkContribution("p1", -1000, { id: "paid-out" }),
    mkContribution("p2", 1000, { id: "other" }),
  ]);
  eq("paid-out slices leave the Pie total", ct.total_slices, 1000);
  eq(
    "the payer nets to zero",
    ct.rows.find((r) => r.participant_id === "p1")?.slices,
    0
  );
  eq(
    "the other participant keeps everything",
    ct.rows.find((r) => r.participant_id === "p2")?.pct,
    100
  );
}

// ------------------------------------------------------------
// Summary
// ------------------------------------------------------------
console.log(`\n============================================`);
console.log(`Slicing Pie engine tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`Failures:\n - ${failures.join("\n - ")}`);
  process.exit(1);
}
console.log(`All engine tests passed.\n`);
