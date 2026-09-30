// ============================================================
// Execution Tracker — Slicing Pie: The Well Tests (§4.5, WELL-001)
// ============================================================
// The rule under test: slices from a withdrawal belong to EVERYONE who
// owns the Well, in proportion to their share of the balance at the
// moment of withdrawal — not to whoever triggered the payment. The
// book's own worked example (Julie, Chuck, then Suzanne) is the
// fixture. Dependency-free.
// ============================================================

import {
  wellOwnership,
  planWellWithdrawal,
  type WellTransactionRow,
} from "../engine/well";
import { DEFAULT_PIE_SETTINGS } from "../config/schema";
import type { PieSettings } from "@/types/slicing-pie";

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
  check(name, String(actual) === String(expected), `expected ${expected}, got ${actual}`);
}
function section(t: string): void {
  console.log(`\n${t}`);
}

const S: PieSettings = { ...DEFAULT_PIE_SETTINGS };

let seq = 0;
function tx(
  participant_id: string | null,
  kind: "deposit" | "withdrawal",
  amount_minor: number,
  day = ""
): WellTransactionRow {
  // Monotonic timestamps keep the fixtures readable while still
  // exercising the chronological replay.
  const stamp = `2024-01-${String(++seq).padStart(2, "0")}T00:00:00Z`;
  return { participant_id, kind, amount_minor, created_at: day || stamp };
}

const JULIE = "p-julie";
const CHUCK = "p-chuck";
const SUZANNE = "p-suzanne";

// ------------------------------------------------------------
// Ownership
// ------------------------------------------------------------
section("well — ownership is stake-based, not deposit-ever-based");
{
  const o = wellOwnership([
    tx(JULIE, "deposit", 1_000_00),
    tx(CHUCK, "deposit", 1_000_00),
  ]);
  eq("balance = $2,000", o.balance_minor, 2_000_00);
  eq("two contributors", o.stakes.length, 2);
  eq("Julie owns half", o.stakes.find((s) => s.participant_id === JULIE)?.fraction, 0.5);
  eq("Chuck owns half", o.stakes.find((s) => s.participant_id === CHUCK)?.fraction, 0.5);
  eq("nothing unattributed", o.unattributed_minor, 0);
}
{
  // A withdrawal scales every stake down pro rata — it does not
  // privilege the person who happens to be named on it.
  const o = wellOwnership([
    tx(JULIE, "deposit", 1_000_00),
    tx(CHUCK, "deposit", 1_000_00),
    tx(null, "withdrawal", 1_000_00),
  ]);
  eq("balance = $1,000", o.balance_minor, 1_000_00);
  eq("Julie's stake halved", o.stakes.find((s) => s.participant_id === JULIE)?.stake_minor, 500_00);
  eq("Chuck's stake halved", o.stakes.find((s) => s.participant_id === CHUCK)?.stake_minor, 500_00);
  eq("shares unchanged at 50/50", o.stakes.find((s) => s.participant_id === JULIE)?.fraction, 0.5);
}
{
  // A later deposit dilutes the earlier contributors.
  const o = wellOwnership([
    tx(JULIE, "deposit", 1_000_00),
    tx(CHUCK, "deposit", 1_000_00),
    tx(null, "withdrawal", 1_000_00),
    tx(SUZANNE, "deposit", 15_000_00),
  ]);
  eq("balance = $16,000", o.balance_minor, 16_000_00);
  const s = o.stakes.find((x) => x.participant_id === SUZANNE);
  eq("Suzanne's share of the balance", s?.fraction, 0.9375);
  eq("Suzanne's stake is her deposit", s?.stake_minor, 15_000_00);
  eq(
    "Julie is diluted to her remaining stake",
    o.stakes.find((x) => x.participant_id === JULIE)?.fraction,
    0.03125
  );
}
{
  // Stakes must add up to the balance exactly, even when the pro-rata
  // split does not divide evenly.
  const o = wellOwnership([
    tx("a", "deposit", 100_00),
    tx("b", "deposit", 100_00),
    tx("c", "deposit", 100_00),
    tx(null, "withdrawal", 100_00),
  ]);
  const sum = o.stakes.reduce((s, x) => s + x.stake_minor, 0);
  eq("stakes sum to the balance", sum, o.balance_minor);
  eq("balance = $200", o.balance_minor, 200_00);
}
{
  // A withdrawal larger than the balance cannot drive stakes negative.
  const o = wellOwnership([
    tx(JULIE, "deposit", 100_00),
    tx(null, "withdrawal", 500_00),
  ]);
  eq("balance floors at zero", o.balance_minor, 0);
  eq("nothing left to own", o.stakes.find((s) => s.participant_id === JULIE)?.stake_minor, 0);
  eq("no negative stake", o.stakes.every((s) => s.stake_minor >= 0), true);
}
{
  const o = wellOwnership([]);
  eq("an untouched Well is empty", o.balance_minor, 0);
  eq("and has no contributors", o.stakes.length, 0);
}

// ------------------------------------------------------------
// WELL-001 — withdrawal allocation
// ------------------------------------------------------------
section("well — WELL-001 splits the withdrawal across contributors");
{
  // The book's example: Julie and Chuck at $1,000 each, a $1,000
  // withdrawal → $500 each → 2,000 slices each at the ×4 cash rate.
  const o = wellOwnership([
    tx(JULIE, "deposit", 1_000_00),
    tx(CHUCK, "deposit", 1_000_00),
  ]);
  const plan = planWellWithdrawal(o, 1_000_00, S);

  eq("two allocations", plan.allocations.length, 2);
  const j = plan.allocations.find((a) => a.participant_id === JULIE);
  const c = plan.allocations.find((a) => a.participant_id === CHUCK);
  eq("Julie is attributed $500", j?.amount_minor, 500_00);
  eq("Chuck is attributed $500", c?.amount_minor, 500_00);
  eq("Julie earns 2,000 slices", j?.slices, 2000);
  eq("Chuck earns 2,000 slices", c?.slices, 2000);
  eq("4,000 slices total", plan.total_slices, 4000);
  eq(
    "the attributed parts add up to the withdrawal",
    plan.allocations.reduce((s, a) => s + a.amount_minor, 0),
    1_000_00
  );
}
{
  // After Suzanne's deposit the split follows the NEW ownership, which
  // is the whole point of "at the time of withdrawal".
  const o = wellOwnership([
    tx(JULIE, "deposit", 1_000_00),
    tx(CHUCK, "deposit", 1_000_00),
    tx(SUZANNE, "deposit", 6_000_00),
  ]);
  const plan = planWellWithdrawal(o, 8_000_00, S);
  const s = plan.allocations.find((a) => a.participant_id === SUZANNE);
  const j = plan.allocations.find((a) => a.participant_id === JULIE);

  eq("three allocations", plan.allocations.length, 3);
  // Suzanne: 6,000/8,000 = 75% of $8,000 = $6,000 → 24,000 slices.
  eq("Suzanne takes 75% of the withdrawal", s?.amount_minor, 6_000_00);
  eq("Suzanne earns 24,000 slices", s?.slices, 24000);
  // Julie: 1,000/8,000 = 12.5% of $8,000 = $1,000 → 4,000 slices.
  eq("Julie takes 12.5%", j?.amount_minor, 1_000_00);
  eq(
    "every cent of the withdrawal is allocated",
    plan.allocations.reduce((sum, a) => sum + a.amount_minor, 0),
    8_000_00
  );
}
{
  // The named "withdrawer" gets nothing extra: a payment is attributed
  // by ownership, so a contributor with no stake is not in the split.
  const o = wellOwnership([tx(JULIE, "deposit", 500_00)]);
  const plan = planWellWithdrawal(o, 500_00, S);
  eq("only the actual owner is allocated", plan.allocations.length, 1);
  eq("and it is Julie", plan.allocations[0]?.participant_id, JULIE);
}
{
  const o = wellOwnership([]);
  const plan = planWellWithdrawal(o, 1_000_00, S);
  eq("an empty Well allocates nothing", plan.allocations.length, 0);
  eq("and reports the whole amount unallocated", plan.unallocated_minor, 1_000_00);
  check("with a warning", plan.warnings.length > 0);
}
{
  // Money deposited by someone with no participant row cannot earn
  // slices; that is surfaced rather than silently swallowed.
  const o = wellOwnership([
    tx(JULIE, "deposit", 500_00),
    tx(null, "deposit", 500_00), // outside investor, unlinked
  ]);
  eq("half the Well is unattributed", o.unattributed_minor, 500_00);

  const plan = planWellWithdrawal(o, 1_000_00, S);
  eq("only Julie is allocated", plan.allocations.length, 1);
  eq("Julie gets her half of the withdrawal", plan.allocations[0]?.amount_minor, 500_00);
  check(
    "the unlinked deposit is reported as a warning",
    plan.warnings.some((w) => w.includes("no participant record"))
  );
}
{
  // A zero-amount withdrawal is a no-op, not an error.
  const o = wellOwnership([tx(JULIE, "deposit", 500_00)]);
  const plan = planWellWithdrawal(o, 0, S);
  eq("nothing allocated", plan.allocations.length, 0);
  eq("no slices", plan.total_slices, 0);
}
{
  // The explanation has to be readable by a founder defending the
  // number, so it must state each contributor's share and slices.
  const o = wellOwnership([
    tx(JULIE, "deposit", 1_000_00),
    tx(CHUCK, "deposit", 1_000_00),
  ]);
  const plan = planWellWithdrawal(o, 1_000_00, S);
  check(
    "explanation cites WELL-001",
    plan.explanation.some((l) => l.includes("WELL-001"))
  );
  check(
    "explanation shows the per-person split",
    plan.explanation.some((l) => l.includes("50.00%"))
  );
}

// ------------------------------------------------------------
// Summary
// ------------------------------------------------------------
console.log(`\n============================================`);
console.log(`Slicing Pie well tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`Failures:\n - ${failures.join("\n - ")}`);
  process.exit(1);
}
console.log(`All well tests passed.\n`);
