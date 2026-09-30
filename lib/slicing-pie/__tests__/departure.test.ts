// ============================================================
// Execution Tracker — Slicing Pie: Departure Engine Tests
// ============================================================
// Verifies §14 separation logic: leaver classification, recovery
// recalculation (incl. the §24 royalty/rent policy conflict), buyout
// pricing, and the clawback window. Dependency-free.
// ============================================================

import {
  classifyLeaver,
  computeRecovery,
  computeBuyout,
  computeClawback,
  contractorBuyoutCeilingMinor,
  contractorEligibleContributions,
  planContractorForcedBuyout,
  planRecoveryEntries,
} from "../engine/departure";
import {
  recoveryCategory,
  deMultipliedSlices,
} from "../engine/recovery-categories";
import { computeSlices } from "../engine/calculate";
import { planDrawdown } from "../engine/policy";
import { DEFAULT_PIE_SETTINGS } from "../config/schema";
import type {
  Contribution,
  ContributionType,
  DepartureReason,
  MultiplierKind,
  PieSettings,
} from "@/types/slicing-pie";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  \u2713 ${name}`);
  } else {
    failed++;
    failures.push(detail ? `${name} — ${detail}` : name);
    console.log(`  \u2717 ${detail ? `${name} — ${detail}` : name}`);
  }
}
function eq(name: string, actual: unknown, expected: unknown): void {
  check(name, String(actual) === String(expected), `expected ${expected}, got ${actual}`);
}
function section(t: string): void {
  console.log(`\n${t}`);
}

const S: PieSettings = { ...DEFAULT_PIE_SETTINGS };

function mk(
  id: string,
  type: ContributionType,
  slices: number,
  multiplier_kind: MultiplierKind,
  fmv_minor = 0,
  event_date = "2024-01-01",
  inputs: Record<string, unknown> = {}
): Contribution {
  return {
    id,
    pie_id: "pie-1",
    participant_id: "p1",
    type,
    event_date,
    inputs,
    config_snapshot: S,
    fmv_minor,
    multiplier_kind,
    // Mirror multiplierValue(): "none" genuinely means NO multiplier, ×1.
    // An earlier version of this helper mapped every non-cash kind to 2, so
    // a "none" row claimed an uplift the engine never applied — which made
    // deMultipliedSlices() divide a figure that was already net (500 slices
    // came back as 250) and the "no multiplier → unchanged" case below fail.
    multiplier_applied:
      multiplier_kind === "cash" ? 4 : multiplier_kind === "non_cash" ? 2 : 1,
    slices,
    notes: null,
    evidence_url: null,
    project_tag: null,
    status: "active",
    reverses_id: null,
    created_by: null,
    created_at: "2024-01-01T00:00:00Z",
  };
}

// ------------------------------------------------------------
// §14.1 classification
// ------------------------------------------------------------
section("departure — §14.1 leaver classification");
eq("fired_good_reason → bad", classifyLeaver("fired_good_reason"), "bad");
eq("resigned_no_good_reason → bad", classifyLeaver("resigned_no_good_reason"), "bad");
eq("fired_no_good_reason → good", classifyLeaver("fired_no_good_reason"), "good");
eq("resigned_good_reason → good", classifyLeaver("resigned_good_reason"), "good");

// A representative portfolio: time (non-cash), expense (cash),
// idea royalty (special policy).
const portfolio = [
  mk("t1", "time", 1000, "non_cash"),
  mk("e1", "expense", 800, "cash"),
  mk("r1", "idea_royalty", 500, "non_cash"),
];

// ------------------------------------------------------------
// §14.2 good leaver keeps everything
// ------------------------------------------------------------
section("departure — §14.2 good leaver");
{
  const r = computeRecovery("fired_no_good_reason", portfolio, S);
  eq("good leaver retains all 2300", r.retained_slices, 2300);
  eq("good leaver forfeits 0", r.forfeited_slices, 0);
}

// ------------------------------------------------------------
// §14.2 bad leaver forfeits non-cash, keeps cash; royalty policy=freeze
// ------------------------------------------------------------
// The source gives three different answers for royalty/rent on a
// bad-leaver exit (§24 Conflict #1); the decided default is FREEZE — the
// leaver keeps what they had earned by the day they left and earns no
// more. So the royalty row survives at its departure value.
section("departure — §14.2 bad leaver (royalty policy = freeze)");
{
  const r = computeRecovery("fired_good_reason", portfolio, S);
  // Cash is retained WITHOUT the multiplier: 800 slices at ×4 → 200.
  // Time 1000 is intangible → forfeited. Royalty 500 is frozen → kept.
  //
  // What "forfeited" counts: `computeRecovery` sets lost = slices − kept on
  // EVERY row, so retained + forfeited is always exactly what the
  // participant held (700 + 1600 = 2300). Here that 1600 is two things —
  // the 1000 of time, and the 600 of uplift stripped off the cash row by
  // de-multiplying. The uplift is forfeited rather than simply deleted: it
  // goes back to the Pie, which is precisely why everyone else's
  // percentage rises once the leaver is corrected. What is NOT forfeited is
  // the $200 of VALUE behind that 600 — the leaver keeps every dollar they
  // spent, which is what the deltas section lower down pins down.
  eq("bad leaver retains 200 cash + 500 frozen royalty", r.retained_slices, 700);
  eq("bad leaver forfeits 1600 (1000 time + 600 cash uplift)", r.forfeited_slices, 1600);
  eq("retained + forfeited = all 2300 they held", r.retained_slices + r.forfeited_slices, 2300);
}
{
  // The Appendix position, still selectable in the settings console.
  const lost: PieSettings = { ...S, royalty_rent_bad_leaver_policy: "lost" };
  const r = computeRecovery("fired_good_reason", portfolio, lost);
  eq("policy=lost retains only the cash (200)", r.retained_slices, 200);
  // 1000 of time + all 500 of royalty + the 600 of cash uplift: 2300 − 200.
  eq("policy=lost forfeits 2100 (time + royalty + cash uplift)", r.forfeited_slices, 2100);
}

// The authoritative path: the FMV frozen onto the row is what survives,
// per "the amount of cash spent times one".
section("departure — §14.2 bad leaver uses frozen FMV for cash");
{
  // $200 spent → fmv_minor 20000 → 200 slices retained, NOT 800.
  const portfolioFmv = [
    mk("e2", "expense", 800, "cash", 200_00),
    mk("t2", "time", 1000, "non_cash", 500_00),
  ];
  const r = computeRecovery("fired_good_reason", portfolioFmv, S);
  eq("cash retained at FMV ($200 → 200 slices)", r.retained_slices, 200);
  // 1000 of time, plus the 600 uplift stripped off the cash row: 1800 − 200.
  eq("intangible time forfeited, plus the cash uplift", r.forfeited_slices, 1600);
}

// A pre-owned asset was booked with the NON-CASH multiplier but is
// still tangible property — it must be retained (de-multiplied), not
// zeroed. This is the defect the category module replaced.
section("departure — §14.2 pre-owned equipment is TANGIBLE, not intangible");
{
  const portfolioEquip = [
    mk("q1", "equipment", 200, "non_cash", 100_00), // pre-owned, ×2
    mk("t3", "time", 1000, "non_cash", 500_00),
  ];
  const r = computeRecovery("fired_good_reason", portfolioEquip, S);
  eq("pre-owned equipment retained at FMV (100 slices)", r.retained_slices, 100);
  // 1000 of time, plus the 100 uplift stripped off the equipment row (200
  // booked at ×2, retained at 100): 1200 − 100.
  eq("time still forfeited, plus the equipment uplift", r.forfeited_slices, 1100);
}

// Facilities are rent-in-kind: intangible, governed by the policy.
section("departure — §14.2 facilities follow the royalty/rent policy");
{
  eq("facilities classified as rent", recoveryCategory("facilities"), "rent");
  eq("equipment classified as tangible", recoveryCategory("equipment"), "tangible");
  eq("personal car classified as tangible", recoveryCategory("personal_car"), "tangible");
  eq("time classified as intangible", recoveryCategory("time"), "intangible");
  eq("commission classified as intangible", recoveryCategory("commission"), "intangible");
  eq("well withdrawal classified as cash", recoveryCategory("well_withdrawal"), "cash");
  eq(
    "a cash payment to a participant classified as cash",
    recoveryCategory("cash_payment_to_participant"),
    "cash"
  );
}

// deMultipliedSlices falls back sanely when FMV was not persisted.
section("departure — de-multiplier fallback");
{
  eq("no FMV → divides out the multiplier", deMultipliedSlices(mk("z1", "expense", 800, "cash")), 200);
  eq("FMV present → FMV wins", deMultipliedSlices(mk("z2", "expense", 800, "cash", 200_00)), 200);
  eq("no multiplier → unchanged", deMultipliedSlices(mk("z3", "other", 500, "none")), 500);

  // A payment row (HARD-VAL-004) is stored with a NEGATIVE FMV, and that
  // figure is exactly as authoritative as a positive one.
  //
  // The regression this pins: testing `fmv_minor > 0` treated those rows
  // as though no FMV had been persisted and fell through to dividing the
  // slice count by the multiplier — turning a $300 payment that removed
  // 1000 slices at ×4 into $250, and leaving $50 of at-risk balance on
  // the books that the participant had already been paid.
  eq(
    "a negative FMV is used as-is, not divided out",
    deMultipliedSlices(
      mk("z4", "cash_payment_to_participant", -1000, "cash", -300_00, "2024-01-01", {
        cash_drawdown_minor: 200_00,
        non_cash_drawdown_minor: 100_00,
      })
    ),
    -300
  );
}

// ------------------------------------------------------------
// HARD-VAL-004 — a payment is attributed, not refused
// ------------------------------------------------------------
// This section used to assert the opposite: that a ledger containing a
// payment REFUSED to compute recovery, because a per-row pass could
// attribute the payment's single negative figure to only one of the two
// buckets it drew on, and produced a NEGATIVE holding.
//
// The refusal is gone because the payment is now attributed to the rows
// it actually consumed (`attributePaymentDrawdowns`). These expectations
// are the arithmetic that used to come out negative, written out in
// full so a regression is visible as a wrong number rather than as a
// negative percentage on a cap table.
section("departure — a payment is attributed to what it consumed");
{
  // $200 cash (800 slices at ×4) + $500 of time (1000 at ×2), then a
  // $300 payment that drew $200 from the cash bucket and $100 from the
  // non-cash bucket, removing 1000 slices. They hold 800 going in.
  const ledger = [
    mk("r1", "expense", 800, "cash", 200_00),
    mk("r2", "time", 1000, "non_cash", 500_00),
    mk(
      "r3",
      "cash_payment_to_participant",
      -1000,
      "cash",
      -300_00,
      "2024-06-01",
      { cash_drawdown_minor: 200_00, non_cash_drawdown_minor: 100_00 }
    ),
  ];
  const held = 800;

  // "fired_good_reason" is a BAD leaver, so the recovery rules apply.
  const r = computeRecovery("fired_good_reason", ledger, S);

  eq("the payment no longer blocks the departure", r.blockers.length, 0);
  // Nothing they keep: the $200 of cash was paid back to them by the
  // payment, and the $400 of time still at risk is intangible.
  eq("retained is zero, not negative", r.retained_slices, 0);
  eq("forfeited is the whole remaining holding", r.forfeited_slices, held);
  check("no figure is negative", r.retained_slices >= 0 && r.forfeited_slices >= 0);

  // The payment's drawdown is attributed to the rows it consumed: the
  // $200 cash portion came off the expense row (800 slices at ×4), the
  // $100 non-cash portion off the time row (200 slices at ×2).
  const byId = new Map(r.detail.map((d) => [d.contribution_id, d]));
  eq("the expense row loses its whole 800 slices", byId.get("r1")?.kept, 0);
  eq("...because the payment consumed all of it", byId.get("r1")?.standing, 0);
  eq("the time row still stands 800 slices after the payment", byId.get("r2")?.standing, 800);
  eq("...and forfeits all of them as intangible", byId.get("r2")?.kept, 0);
  eq("the payment row's slice effect is re-attributed", byId.get("r3")?.kept, 0);

  // VALUE moves differently from slices. The $200 the participant spent
  // is still their value (the payment that repaid it is its own row, and
  // the two net out), so no value is written off on that row. The time
  // that is forfeited writes off only what was still at risk — $400 of
  // the $500, because $100 of it had already been paid out.
  eq("no value is written off the cash row", byId.get("r1")?.retained_fmv_minor, 200_00);
  eq("the forfeited time writes off what was still at risk", byId.get("r2")?.retained_fmv_minor, 100_00);
  eq("the payment's money is untouched", byId.get("r3")?.retained_fmv_minor, -300_00);

  // And the ledger must land exactly on the retained figure — this is
  // what makes the report and the cap table agree.
  const entries = planRecoveryEntries(r, ledger, S);
  eq("three corrections are planned", entries.length, 3);
  const netSlices =
    ledger.reduce((s, c) => s + c.slices, 0) +
    entries.reduce((s, e) => s + e.slices, 0);
  eq("original + corrections = retained", netSlices, r.retained_slices);
  const netFmv =
    ledger.reduce((s, c) => s + c.fmv_minor, 0) +
    entries.reduce((s, e) => s + e.fmv_minor, 0);
  eq("the value ledger lands at zero at-risk value too", netFmv, 0);
}
{
  // The same shape, but the payment is smaller than the cash bucket, so
  // the participant keeps the difference at cash value (×1).
  // $200 cash (800 slices) less a $100 cash-first payment (400 slices)
  // leaves 400 slices held and $100 still at risk → 100 slices retained.
  const ledger = [
    mk("s1", "expense", 800, "cash", 200_00),
    mk("s2", "cash_payment_to_participant", -400, "cash", -100_00, "2024-06-01", {
      cash_drawdown_minor: 100_00,
      non_cash_drawdown_minor: 0,
    }),
  ];
  const r = computeRecovery("fired_good_reason", ledger, S);
  eq("held 400 going in", ledger.reduce((s, c) => s + c.slices, 0), 400);
  eq("retained at cash value, net of the payment", r.retained_slices, 100);
  eq("the rest is returned to the Pie", r.forfeited_slices, 300);

  const entries = planRecoveryEntries(r, ledger, S);
  const net =
    ledger.reduce((s, c) => s + c.slices, 0) +
    entries.reduce((s, e) => s + e.slices, 0);
  eq("the corrections land on the retained figure", net, r.retained_slices);
}
{
  // A payment reaching into the non-cash bucket lands on the non-cash
  // rows — including a royalty row, which the configured policy then
  // decides on. Both buckets are drawn pro-rata, so the attribution is
  // deterministic rather than arbitrary.
  const ledger = [
    mk("v1", "idea_royalty", 500, "non_cash", 250_00),
    mk("v2", "time", 1000, "non_cash", 500_00),
    mk("v3", "cash_payment_to_participant", -200, "cash", -100_00, "2024-06-01", {
      cash_drawdown_minor: 0,
      non_cash_drawdown_minor: 100_00,
    }),
  ];
  const held = 1300;
  const r = computeRecovery("fired_good_reason", ledger, S);
  const byId = new Map(r.detail.map((d) => [d.contribution_id, d]));

  eq("blocked by nothing", r.blockers.length, 0);
  eq(
    "the non-cash drawdown is spread across both non-cash rows",
    Math.round(((byId.get("v1")?.standing ?? 0) + (byId.get("v2")?.standing ?? 0)) * 100),
    130000
  );
  eq("the royalty is retained at its remaining value (freeze)", byId.get("v1")?.kept, 433.3333);
  eq("the royalty's value is not written off", byId.get("v1")?.retained_fmv_minor, 250_00);
  eq("the time is forfeited", byId.get("v2")?.kept, 0);
  eq("partitions the whole holding", r.retained_slices + r.forfeited_slices, held);

  const entries = planRecoveryEntries(r, ledger, S);
  const net =
    ledger.reduce((s, c) => s + c.slices, 0) +
    entries.reduce((s, e) => s + e.slices, 0);
  eq("the corrections land on the retained figure", net, r.retained_slices);

  // The retained figure and the at-risk value must agree: a later
  // payment draws on the value, so holding slices and holding value
  // cannot be two different stories.
  const netFmv =
    ledger.reduce((s, c) => s + c.fmv_minor, 0) +
    entries.reduce((s, e) => s + e.fmv_minor, 0);
  eq(
    "the retained slices are exactly what the remaining at-risk value buys",
    Math.round((netFmv / 100) * S.non_cash_multiplier),
    Math.round(r.retained_slices)
  );
}
{
  // A ledger without a payment is untouched by all of this.
  const clean = computeRecovery(
    "fired_good_reason",
    [mk("q1", "expense", 800, "cash", 200_00), mk("q2", "time", 1000, "non_cash", 500_00)],
    S
  );
  eq("an ordinary ledger is not blocked", clean.blockers.length, 0);
  eq("cash expense retained at $200 (200 slices)", clean.retained_slices, 200);
  eq("everything else forfeited", clean.forfeited_slices, 1600);
}
{
  // A payment row written before the split was recorded still has to be
  // adjudicated. The split is solved from the row itself:
  // |fmv| = cash + nonCash and |slices| = cash×cashMult + nonCash×nonCashMult.
  // -100_00 and -400 slices with multipliers 4 and 2 → $100 cash, $0 non-cash.
  const ledger: Contribution[] = [
    mk("d1", "expense", 800, "cash", 200_00),
    mk("d2", "cash_payment_to_participant", -400, "cash", -100_00, "2024-06-01"),
  ];
  const withSplit = [
    mk("d1", "expense", 800, "cash", 200_00),
    mk("d2", "cash_payment_to_participant", -400, "cash", -100_00, "2024-06-01", {
      cash_drawdown_minor: 100_00,
      non_cash_drawdown_minor: 0,
    }),
  ];
  const derived = computeRecovery("fired_good_reason", ledger, S);
  const explicit = computeRecovery("fired_good_reason", withSplit, S);
  eq(
    "a payment with no recorded split gives the same answer as one with it",
    derived.retained_slices,
    explicit.retained_slices
  );
  eq("...and the same forfeiture", derived.forfeited_slices, explicit.forfeited_slices);
}

// ------------------------------------------------------------
// The drawdown a payment recorded is the drawdown it replayed
// ------------------------------------------------------------
// This is the whole chain in one place: planDrawdown measures the
// payment against the rows it draws on, the engine writes that measurement
// onto the row, and recovery takes exactly that many slices back off the
// rows. Nothing re-converts money into slices along the way, because a
// bucket holds rows at more than one multiplier and the conversion is
// not invertible.
section("departure — a payment's recorded drawdown is what recovery replays");
{
  // A balance that is ONLY tangible: $100 of equipment, booked at the
  // non-cash multiplier, so 200 slices. The old conversion — the money
  // at the cash bucket's ×4 — would ask for 400 slices off 200 and leave
  // the participant holding MINUS 200.
  const equipment = mk("e1", "equipment", 200, "non_cash", 100_00);
  const plan = planDrawdown(100_00, [equipment], S);
  eq("the plan draws the whole balance", plan.cash_minor, 100_00);
  eq("...and asks for only the 200 slices that exist", plan.cash_slices, 200);
  check("nothing overflows", plan.overflow_minor === 0);

  // The row the engine would write from that plan.
  const computed = computeSlices(
    {
      type: "cash_payment_to_participant",
      amount_minor: 100_00,
      event_date: "2024-06-01",
      cash_drawdown_minor: plan.cash_minor,
      non_cash_drawdown_minor: plan.non_cash_minor,
      cash_drawdown_slices: plan.cash_slices,
      non_cash_drawdown_slices: plan.non_cash_slices,
      overflow_minor: plan.overflow_minor,
    },
    S
  );
  eq("the row removes 200 slices", computed.slices, -200);
  eq("...and records the same money", computed.fmv_minor, -100_00);

  const payment = mk(
    "pay1",
    "cash_payment_to_participant",
    computed.slices,
    "cash",
    computed.fmv_minor,
    "2024-06-01",
    {
      cash_drawdown_minor: plan.cash_minor,
      non_cash_drawdown_minor: plan.non_cash_minor,
      cash_drawdown_slices: plan.cash_slices,
      non_cash_drawdown_slices: plan.non_cash_slices,
    }
  );
  const ledger = [equipment, payment];
  eq("the participant holds nothing after the payment", ledger.reduce((s, c) => s + c.slices, 0), 0);

  // Now leave. There is nothing to recover, and — the point of the whole
  // exercise — nothing goes negative doing it.
  const r = computeRecovery("fired_good_reason", ledger, S);
  eq("no blocker", r.blockers.length, 0);
  eq("nothing retained", r.retained_slices, 0);
  eq("nothing forfeited either", r.forfeited_slices, 0);
  const byId = new Map(r.detail.map((d) => [d.contribution_id, d]));
  eq("the equipment is fully consumed", byId.get("e1")?.standing, 0);
  check(
    "no row is left holding negative slices",
    // A payment row's `standing` is its own negative slice count — it
    // holds nothing by definition, and says so. Every other row must be
    // at or above zero.
    r.detail.every(
      (d) => d.standing >= 0 || d.type === "cash_payment_to_participant"
    ) && r.detail.every((d) => d.kept >= 0)
  );

  // And the corrections land exactly on the retained figure, which is
  // what makes the cap table agree with the report.
  const entries = planRecoveryEntries(r, ledger, S);
  const net =
    ledger.reduce((s, c) => s + c.slices, 0) +
    entries.reduce((s, e) => s + e.slices, 0);
  eq("original + corrections = retained", net, r.retained_slices);
}
{
  // The same chain, but on a bucket that genuinely mixes multipliers:
  // $100 of cash booked at ×4 (400 slices) alongside $100 of equipment
  // booked at ×2 (200 slices). Both are "retained at cash value", so both
  // sit in the SAME bucket — 600 slices standing against $200 of value —
  // and a payment against it has to come off both in the right shares.
  const cashRow = mk("m1", "expense", 400, "cash", 100_00);
  const equipment = mk("m2", "equipment", 200, "non_cash", 100_00);
  const plan = planDrawdown(150_00, [cashRow, equipment], S);
  eq("the whole payment is drawn from the cash/tangible bucket", plan.cash_minor, 150_00);
  eq("...leaving the other bucket alone", plan.non_cash_minor, 0);
  // $150 of the bucket's $200 is drawn, so three quarters of its slices:
  // 450 of 600. The money alone cannot say that — it depends on which
  // rows were booked at which multiplier.
  eq("three quarters of the bucket's slices come off", plan.cash_slices, 450);
  check(
    "...not the money at the bucket's headline multiplier",
    plan.cash_slices < 600
  );

  const computed = computeSlices(
    {
      type: "cash_payment_to_participant",
      amount_minor: 150_00,
      event_date: "2024-06-01",
      cash_drawdown_minor: plan.cash_minor,
      non_cash_drawdown_minor: plan.non_cash_minor,
      cash_drawdown_slices: plan.cash_slices,
      non_cash_drawdown_slices: plan.non_cash_slices,
      overflow_minor: plan.overflow_minor,
    },
    S
  );
  eq("the row removes 450 slices", computed.slices, -450);
  eq("held after the payment", 600 - 450, 150);

  const ledger = [
    cashRow,
    equipment,
    mk(
      "pay2",
      "cash_payment_to_participant",
      computed.slices,
      "cash",
      computed.fmv_minor,
      "2024-06-01",
      {
        cash_drawdown_minor: plan.cash_minor,
        non_cash_drawdown_minor: plan.non_cash_minor,
        cash_drawdown_slices: plan.cash_slices,
        non_cash_drawdown_slices: plan.non_cash_slices,
      }
    ),
  ];
  const r = computeRecovery("fired_good_reason", ledger, S);
  const byId = new Map(r.detail.map((d) => [d.contribution_id, d]));
  eq("no blocker", r.blockers.length, 0);
  // 450 of 600 slices is three quarters of each row by value: the cash
  // row keeps 100 of its 400, the equipment 50 of its 200.
  eq("the cash row keeps a quarter of its slices", byId.get("m1")?.standing, 100);
  eq("the equipment keeps a quarter of its slices", byId.get("m2")?.standing, 50);
  // $25 + $25 of at-risk value still stands, and cash/tangible is
  // retained at cash value, so 50 slices come back.
  eq("retained at cash value", r.retained_slices, 50);
  eq("the rest is returned to the Pie", r.forfeited_slices, 100);

  const entries = planRecoveryEntries(r, ledger, S);
  const netSlices =
    ledger.reduce((s, c) => s + c.slices, 0) +
    entries.reduce((s, e) => s + e.slices, 0);
  eq("original + corrections = retained", netSlices, r.retained_slices);
}

// ------------------------------------------------------------
// Royalty policy = continue → royalty retained
// ------------------------------------------------------------
section("departure — royalty policy = continue");
{
  const cont: PieSettings = { ...S, royalty_rent_bad_leaver_policy: "continue" };
  const r = computeRecovery("fired_good_reason", portfolio, cont);
  // keeps expense 200 (de-multiplied from 800) + royalty 500; the time 1000
  // and the 600 of cash uplift are forfeited: 2300 − 700.
  eq("continue: retains 700", r.retained_slices, 700);
  eq("continue: forfeits 1600", r.forfeited_slices, 1600);
}

// ------------------------------------------------------------
// Loyal-employee clause (percentage) on resigned_no_good_reason
// ------------------------------------------------------------
section("departure — loyal-employee clause (50%)");
{
  const loyal: PieSettings = {
    ...S,
    loyal_employee_clause: { mode: "percentage", percentage: 0.5 },
  };
  const r = computeRecovery("resigned_no_good_reason", portfolio, loyal);
  // cash 200 kept (de-multiplied); time 1000 → 50% = 500 kept;
  // royalty 500 frozen at departure value (the decided default).
  eq("loyal 50%: retains 200 + 500 + 500 = 1200", r.retained_slices, 1200);
  // half the time (500) plus the 600 of cash uplift: 2300 − 1200.
  eq("loyal 50%: forfeits 1100 (half the time + cash uplift)", r.forfeited_slices, 1100);
}

// ------------------------------------------------------------
// Recovery → ledger entries (append-only, §21)
// ------------------------------------------------------------
// The ledger is never edited: a recovery is applied by appending a row
// per affected contribution carrying the DELTA needed to reach the
// retained amount. The key property these tests pin down is that
// de-multiplying a cash row costs SLICES but not VALUE — the
// participant keeps every dollar they put in, just at ×1.
section("departure — recovery emits ledger deltas, not edits");
{
  const fmvPortfolio = [
    mk("e2", "expense", 800, "cash", 200_00), // $200 spent, ×4 → 800 slices
    mk("t2", "time", 1000, "non_cash", 500_00), // $500 of time, ×2
  ];
  const r = computeRecovery("fired_good_reason", fmvPortfolio, S);
  const entries = planRecoveryEntries(r, fmvPortfolio, S);
  const byId = new Map(entries.map((e) => [e.contribution_id, e]));

  eq("two corrections emitted", entries.length, 2);

  const cash = byId.get("e2")!;
  eq("cash loses slices (−600)", cash.slices, -600);
  eq("cash loses NO value (multiplier is not value)", cash.fmv_minor, 0);
  // 800 − 600 = 200 slices = $200 at ×1, exactly what was spent.
  eq("cash nets to 200 slices", 800 + cash.slices, 200);

  const time = byId.get("t2")!;
  eq("forfeited time loses all slices", time.slices, -1000);
  eq("forfeited time loses all value", time.fmv_minor, -500_00);
  eq("time nets to 0", 1000 + time.slices, 0);
}

section("departure — recovery entries net to the retained total");
{
  const fmvPortfolio = [
    mk("e2", "expense", 800, "cash", 200_00),
    mk("t2", "time", 1000, "non_cash", 500_00),
    mk("r2", "idea_royalty", 500, "non_cash", 250_00),
  ];
  const r = computeRecovery("fired_good_reason", fmvPortfolio, S);
  const entries = planRecoveryEntries(r, fmvPortfolio, S);
  const net =
    fmvPortfolio.reduce((s, c) => s + c.slices, 0) +
    entries.reduce((s, e) => s + e.slices, 0);
  eq("original + corrections = retained_slices", net, r.retained_slices);

  const netFmv =
    fmvPortfolio.reduce((s, c) => s + c.fmv_minor, 0) +
    entries.reduce((s, e) => s + e.fmv_minor, 0);
  // $200 of cash + $250 of frozen royalty. The royalty row was RETAINED —
  // its 500 slices are in retained_slices on the line above — and a row
  // cannot keep its slices while losing the value behind them, so its $250
  // survives too. Only the $500 of time is forfeited in value, and the
  // cash row's 600 of uplift was never value in the first place (its
  // correction carries fmv_minor 0). 95000 − 50000 = 45000.
  //
  // The old expectation here said 20000, i.e. that the royalty's value is
  // destroyed as well. That assumed the royalty/rent policy was "lost",
  // but the shipped default is FREEZE — the very thing the §14.2 section
  // above asserts when it keeps the royalty's 500 slices.
  eq(
    "value survives with the slices ($200 cash + $250 frozen royalty)",
    netFmv,
    45_000
  );
}

// ------------------------------------------------------------
// THE partitioning invariant
// ------------------------------------------------------------
// `retained_slices` and `forfeited_slices` are two halves of one number,
// not two independent readings. computeRecovery sets lost = slices − kept
// on every row, so across any ledger and any policy their sum must equal
// exactly what the participant held the day they left. Six expectations
// in this file once disagreed with that (they counted only the intangible
// forfeitures and let the de-multiplied uplift fall into no bucket at
// all, so 600 slices of a 2300-slice portfolio simply went missing from
// the report). This section is what makes that class of drift fail loudly
// rather than quietly under-report to the person being bought out.
section("departure — retained and forfeited partition the slice total");
{
  const held = portfolio.reduce((s, c) => s + c.slices, 0); // 2300

  const scenarios: { label: string; reason: DepartureReason; settings: PieSettings }[] = [
    { label: "bad leaver (freeze)", reason: "fired_good_reason", settings: S },
    {
      label: "bad leaver (lost)",
      reason: "fired_good_reason",
      settings: { ...S, royalty_rent_bad_leaver_policy: "lost" },
    },
    {
      label: "bad leaver (continue)",
      reason: "fired_good_reason",
      settings: { ...S, royalty_rent_bad_leaver_policy: "continue" },
    },
    {
      label: "loyal 50%",
      reason: "resigned_no_good_reason",
      settings: { ...S, loyal_employee_clause: { mode: "percentage", percentage: 0.5 } },
    },
    {
      label: "loyal tenure not met",
      reason: "resigned_no_good_reason",
      settings: { ...S, loyal_employee_clause: { mode: "months", months: 24 } },
    },
    { label: "good leaver", reason: "resigned_good_reason", settings: S },
  ];

  for (const s of scenarios) {
    const r = computeRecovery(s.reason, portfolio, s.settings);
    eq(
      `${s.label}: retained + forfeited = ${held}`,
      r.retained_slices + r.forfeited_slices,
      held
    );
    // And the correction entries must land on the retained figure, so the
    // ledger itself reconciles with the report the leaver is shown.
    const entries = planRecoveryEntries(r, portfolio, s.settings);
    const net = held + entries.reduce((sum, e) => sum + e.slices, 0);
    eq(`${s.label}: the corrections land on retained_slices`, net, r.retained_slices);
  }
}

section("departure — a good leaver needs no corrections");
{
  const r = computeRecovery("resigned_good_reason", portfolio, S);
  const entries = planRecoveryEntries(r, portfolio, S);
  eq("nothing to correct", entries.length, 0);
}

section("departure — a partially-retained intangible loses value proportionally");
{
  const loyal: PieSettings = {
    ...S,
    loyal_employee_clause: { mode: "percentage", percentage: 0.5 },
  };
  const rows = [mk("t4", "time", 1000, "non_cash", 500_00)];
  const r = computeRecovery("resigned_no_good_reason", rows, loyal);
  const entries = planRecoveryEntries(r, rows, loyal);
  eq("half the slices forfeited", entries[0].slices, -500);
  eq("half the value forfeited ($250)", entries[0].fmv_minor, -250_00);
}

section("departure — an equipment row keeps its value, loses the uplift");
{
  const rows = [mk("q1", "equipment", 200, "non_cash", 100_00)]; // ×2
  const r = computeRecovery("fired_good_reason", rows, S);
  const entries = planRecoveryEntries(r, rows, S);
  eq("uplift removed (−100 slices)", entries[0].slices, -100);
  eq("value untouched", entries[0].fmv_minor, 0);
}

section("departure — corrections carry the hour delta too");
{
  // Advisor time is intangible: a bad leaver forfeits it entirely. The
  // row holds 100 hours and 20,000 slices, so the correction must remove
  // 20,000 slices AND all 100 hours — otherwise a §4.3 cumulative-hours
  // gate replayed from the ledger would still count hours the
  // participant no longer holds.
  const rows = [
    mk("a1", "advisor_time", 20_000, "non_cash", 1_000_00, "2024-01-01", {
      hours: 100,
    }),
  ];
  const r = computeRecovery("fired_good_reason", rows, S);
  const entries = planRecoveryEntries(r, rows, S);
  eq("every slice forfeited", entries[0].slices, -20_000);
  eq("every hour forfeited", entries[0].hours, -100);
  eq("hours net back to 0", 100 + (entries[0].hours ?? 0), 0);
}
{
  // A partial retention (loyal-employee clause, 50%) must prorate the
  // hours by the same proportion as the slices.
  const loyal: PieSettings = {
    ...S,
    loyal_employee_clause: { mode: "percentage", percentage: 0.5 },
  };
  const rows = [
    mk("a2", "advisor_time", 20_000, "non_cash", 1_000_00, "2024-01-01", {
      hours: 100,
    }),
  ];
  const r = computeRecovery("resigned_no_good_reason", rows, loyal);
  const entries = planRecoveryEntries(r, rows, loyal);
  eq("half the slices forfeited", entries[0].slices, -10_000);
  eq("half the hours forfeited", entries[0].hours, -50);
  eq("hours net back to 50", 100 + (entries[0].hours ?? 0), 50);
}
{
  // A row with no hours (a cash expense) must not invent an hour delta.
  const rows = [mk("x1", "expense", 800, "cash", 200_00)];
  const r = computeRecovery("fired_good_reason", rows, S);
  const entries = planRecoveryEntries(r, rows, S);
  eq("no hours field on a non-time row", entries[0].hours, undefined);
}

// ------------------------------------------------------------
// CONFIG-012 — contractor forced buyout: window + cap
// ------------------------------------------------------------
section("departure — CONFIG-012 contractor buyout window");
{
  const AS_OF = new Date("2024-06-01T00:00:00Z");
  const rows = [
    mk("ct1", "contractor_time", 1000, "non_cash", 500_00, "2024-05-01"), // inside
    mk("ct2", "contractor_time", 400, "non_cash", 200_00, "2022-01-01"), // aged out
  ];

  const { eligible, expired } = contractorEligibleContributions(rows, S, AS_OF);
  eq("one billing still inside the window", eligible.length, 1);
  eq("one billing has aged out", expired.length, 1);
  eq("the aged-out billing is the old one", expired[0].id, "ct2");
}
{
  const AS_OF = new Date("2024-06-01T00:00:00Z");
  const rows = [
    mk("ct1", "contractor_time", 1000, "non_cash", 500_00, "2024-05-01"),
    mk("ct2", "contractor_time", 400, "non_cash", 200_00, "2022-01-01"),
  ];
  const p = planContractorForcedBuyout(rows, S, AS_OF);
  eq("only the eligible slices can be bought", p.eligible_slices, 1000);
  eq("aged-out slices are reported, not hidden", p.expired_slices, 400);
  eq("base billed = $500", p.base_billed_minor, 500_00);
  eq("ceiling = 200% of $500", p.ceiling_minor, 1000_00);
  // 1000 slices × $1 = $1000, exactly at the cap → not over it.
  eq("quote at the standing rate", p.rate_quote_minor, 1000_00);
  eq("payout is not reduced", p.amount_minor, 1000_00);
  check("not flagged as capped", !p.capped);
}
{
  // The cap bites: only $50 of base billed value, so 200% = $100 even
  // though the slices would price at $1000.
  const AS_OF = new Date("2024-06-01T00:00:00Z");
  const rows = [
    mk("ct1", "contractor_time", 1000, "non_cash", 50_00, "2024-05-01"),
  ];
  const p = planContractorForcedBuyout(rows, S, AS_OF);
  eq("ceiling = 200% of $50 = $100", p.ceiling_minor, 100_00);
  eq("rate quote would be $1000", p.rate_quote_minor, 1000_00);
  eq("payout limited to the ceiling", p.amount_minor, 100_00);
  check("flagged as capped", p.capped);
  check(
    "explanation names the cap",
    p.explanation.some((l) => l.includes("CONFIG-012"))
  );
}
{
  // Every billing aged out → the buyout right has gone away entirely.
  const AS_OF = new Date("2024-06-01T00:00:00Z");
  const rows = [
    mk("ct1", "contractor_time", 1000, "non_cash", 500_00, "2020-01-01"),
  ];
  const p = planContractorForcedBuyout(rows, S, AS_OF);
  eq("nothing is buyable", p.eligible_slices, 0);
  eq("nothing is payable", p.amount_minor, 0);
}

// ------------------------------------------------------------
// §14.3 buyout price
// ------------------------------------------------------------
section("departure — §14.3 buyout price");
{
  // 800 slices × $1.00 ($1 = 100 minor) = $800 = 80000 minor.
  const q = computeBuyout(800, S);
  eq("buyout amount = 80000 minor ($800)", q.amount_minor, 80_000);
  eq("buyout rate = 100 minor/slice", q.rate_per_slice_minor, 100);
  // Voluntary override rate.
  const q2 = computeBuyout(800, S, 250);
  eq("buyout override rate = 250 → 200000 minor", q2.amount_minor, 200_000);
}

// ------------------------------------------------------------
// §14.4 clawback
// ------------------------------------------------------------
section("departure — §14.4 clawback");
{
  // Total pie 10,000 slices; company sells for $1,000,000 (100,000,000 minor)
  // → $100/slice = 10,000 minor/slice. Buyout was 100 minor/slice.
  // Good-leaver had 800 retained (bought-out) slices.
  const r = computeClawback({
    saleValuationMinor: 100_000_000,
    totalSlices: 10_000,
    retainedSlices: 800,
    buyoutRatePerSliceMinor: 100,
    withinWindow: true,
  });
  check("clawback triggered", r.triggered);
  eq("sale price/slice = 10000 minor", r.sale_price_per_slice_minor, 10_000);
  // (10000 − 100) × 800 = 7,920,000 minor.
  eq("clawback owed = 7,920,000 minor", r.amount_owed_minor, 7_920_000);
}
{
  // Outside the window → never triggers.
  const r = computeClawback({
    saleValuationMinor: 100_000_000,
    totalSlices: 10_000,
    retainedSlices: 800,
    buyoutRatePerSliceMinor: 100,
    withinWindow: false,
  });
  check("clawback not triggered outside window", !r.triggered);
  eq("owed = 0 outside window", r.amount_owed_minor, 0);
}
{
  // Sale price below buyout rate → no clawback, never negative.
  const r = computeClawback({
    saleValuationMinor: 100_000, // tiny valuation
    totalSlices: 10_000,
    retainedSlices: 800,
    buyoutRatePerSliceMinor: 100,
    withinWindow: true,
  });
  check("no clawback when sale price ≤ buyout rate", !r.triggered);
  eq("owed never negative", r.amount_owed_minor, 0);
}

// ------------------------------------------------------------
// Contractor buyout ceiling (CONFIG-012)
// ------------------------------------------------------------
section("departure — contractor buyout ceiling");
eq(
  "200% of $1000 billed = $2000 (200000 minor)",
  contractorBuyoutCeilingMinor(100_000, S),
  200_000
);

// ------------------------------------------------------------
// Summary
// ------------------------------------------------------------
console.log(`\n============================================`);
console.log(`Slicing Pie departure tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`Failures:\n - ${failures.join("\n - ")}`);
  process.exit(1);
}
console.log(`All departure tests passed.\n`);
