// ============================================================
// Execution Tracker — Slicing Pie: Policy Guard Tests (§20)
// ============================================================
// Covers the HARD VALIDATIONS the model must reject or floor, plus
// the referral waiting period (CONFIG-016). These guards are shared by
// the API routes and the UI, so a regression here is a regression in
// both places at once. Dependency-free.
// ============================================================

import {
  canApplyStandardRecovery,
  canForceBuyout,
  canReceiveContributions,
  canTerminate,
  isCappedAdvisor,
  planDrawdown,
  referralVested,
} from "../engine/policy";
import { DEFAULT_PIE_SETTINGS } from "../config/schema";
import type {
  Contribution,
  ContributionType,
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
  check(name, String(actual) === String(expected), `expected ${expected}, got ${actual}`);
}
function section(t: string): void {
  console.log(`\n${t}`);
}

const S: PieSettings = { ...DEFAULT_PIE_SETTINGS };

function mkPerson(
  display_name: string,
  pie_role: PieParticipant["pie_role"],
  advisor_cap_opt_in = false
): PieParticipant {
  return {
    id: `p-${display_name}`,
    pie_id: "pie-1",
    user_id: null,
    display_name,
    pie_role,
    status: "active",
    advisor_cap_opt_in,
    joined_at: null,
    created_at: "2024-01-01T00:00:00Z",
  };
}

function mkContribution(
  type: ContributionType,
  slices: number,
  fmv_minor: number,
  multiplier_applied: number
): Contribution {
  return {
    id: `c-${type}-${slices}`,
    pie_id: "pie-1",
    participant_id: "p1",
    type,
    event_date: "2024-01-01",
    inputs: {},
    config_snapshot: S,
    fmv_minor,
    multiplier_kind: multiplier_applied > 1 ? "cash" : "none",
    multiplier_applied,
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

/**
 * A cash payment row (HARD-VAL-004) as the ledger actually stores one:
 * negative FMV and slices, with the planned split kept in `inputs` so it
 * can be replayed exactly.
 */
function mkPayment(
  cashDrawdownMinor: number,
  nonCashDrawdownMinor: number
): Contribution {
  return {
    ...mkContribution("cash_payment_to_participant", 0, 0, 4),
    id: `c-payment-${cashDrawdownMinor}-${nonCashDrawdownMinor}`,
    fmv_minor: -(cashDrawdownMinor + nonCashDrawdownMinor),
    inputs: {
      cash_drawdown_minor: cashDrawdownMinor,
      non_cash_drawdown_minor: nonCashDrawdownMinor,
    },
  };
}

// ------------------------------------------------------------
// HARD-VAL-002 — capped advisors cannot be terminated
// ------------------------------------------------------------
section("policy — HARD-VAL-002 capped advisor immunity");
{
  const capped = mkPerson("Ada", "advisor", true);
  const uncapped = mkPerson("Bo", "advisor", false);

  check("capped advisor recognised", isCappedAdvisor(capped));
  check("advisor who declined the cap is not capped", !isCappedAdvisor(uncapped));

  const d = canTerminate(capped);
  check("capped advisor cannot be terminated", !d.allowed);
  eq("refusal cites HARD-VAL-002", d.ruleRef, "HARD-VAL-002");
  check("refusal names the person", (d.reason ?? "").includes("Ada"));

  check("uncapped advisor can be terminated", canTerminate(uncapped).allowed);
  check("employee can be terminated", canTerminate(mkPerson("Cy", "employee")).allowed);
  check(
    "contractor termination is not blocked by this guard",
    canTerminate(mkPerson("Di", "contractor")).allowed
  );
}

// ------------------------------------------------------------
// HARD-VAL-003 — contractors are outside the Recovery Framework
// ------------------------------------------------------------
section("policy — HARD-VAL-003 contractors outside recovery");
{
  const d = canApplyStandardRecovery(mkPerson("Di", "contractor"));
  check("contractor cannot face standard recovery", !d.allowed);
  eq("refusal cites HARD-VAL-003", d.ruleRef, "HARD-VAL-003");
  check(
    "refusal explains the buyout right instead",
    (d.reason ?? "").includes("buyout")
  );

  check(
    "employees are subject to standard recovery",
    canApplyStandardRecovery(mkPerson("Cy", "employee")).allowed
  );
  // An advisor who declined the cap gave up immunity, so recovery applies.
  check(
    "uncapped advisor is subject to standard recovery",
    canApplyStandardRecovery(mkPerson("Bo", "advisor", false)).allowed
  );
}

// ------------------------------------------------------------
// HARD-VAL-001 — a good leaver cannot be forced to sell
// ------------------------------------------------------------
section("policy — HARD-VAL-001 good leaver cannot be force-bought");
{
  const d = canForceBuyout("good");
  check("forced buyout of a good leaver refused", !d.allowed);
  eq("refusal cites HARD-VAL-001", d.ruleRef, "HARD-VAL-001");
  check(
    "refusal distinguishes offer from obligation",
    (d.reason ?? "").includes("cannot be compelled")
  );
  check("forced buyout of a bad leaver allowed", canForceBuyout("bad").allowed);
}

// ------------------------------------------------------------
// CONFIG-016 — referral waiting period
// ------------------------------------------------------------
section("policy — CONFIG-016 referral waiting period");
{
  const settings: PieSettings = { ...S, referral_waiting_period_days: 90 };
  const hired = "2024-01-01";

  const early = referralVested(hired, settings, new Date("2024-02-01T00:00:00Z"));
  check("referral not vested inside the window", !early.allowed);
  eq("refusal cites CONFIG-016", early.ruleRef, "CONFIG-016");
  check("refusal names the vesting date", (early.reason ?? "").includes("2024-03-31"));

  const onTime = referralVested(hired, settings, new Date("2024-03-31T00:00:00Z"));
  check("referral vests exactly on the due date", onTime.allowed);

  const late = referralVested(hired, settings, new Date("2024-06-01T00:00:00Z"));
  check("referral stays vested afterwards", late.allowed);

  const bad = referralVested("not-a-date", settings, new Date("2024-06-01T00:00:00Z"));
  check("invalid hire date is refused", !bad.allowed);
}

// ------------------------------------------------------------
// HARD-VAL-004 — drawdown is cash-first and floors at zero
// ------------------------------------------------------------
section("policy — HARD-VAL-004 at-risk drawdown");
{
  // $200 cash at risk + $500 non-cash at risk = $700 balance.
  const portfolio = [
    mkContribution("expense", 800, 200_00, 4), // cash, ×4
    mkContribution("time", 1000, 500_00, 2), // intangible, ×2
  ];

  {
    const d = planDrawdown(100_00, portfolio, S); // $100
    eq("cash absorbs first", d.cash_minor, 100_00);
    eq("non-cash untouched", d.non_cash_minor, 0);
    eq("nothing overflows", d.overflow_minor, 0);
    eq("balance = $700", d.balance_minor, 700_00);
    eq("half the cash bucket's slices come off", d.cash_slices, 400);
    eq("...and nothing off the non-cash bucket", d.non_cash_slices, 0);
  }
  {
    const d = planDrawdown(300_00, portfolio, S); // $300
    eq("cash drained first ($200)", d.cash_minor, 200_00);
    eq("remainder takes non-cash ($100)", d.non_cash_minor, 100_00);
    eq("no overflow", d.overflow_minor, 0);
    // $200 is the whole $200 cash bucket → all 800 of its slices.
    eq("the whole cash holding comes off", d.cash_slices, 800);
    // $100 is a fifth of the $500 non-cash bucket → a fifth of 1000.
    eq("a fifth of the non-cash holding comes off", d.non_cash_slices, 200);
  }
  {
    // Overpayment: HARD-VAL-004 floors at zero rather than going negative.
    const d = planDrawdown(800_00, portfolio, S); // $800 vs $700 balance
    eq("cash part = $200", d.cash_minor, 200_00);
    eq("non-cash part = $500", d.non_cash_minor, 500_00);
    eq("excess $100 buys no slices", d.overflow_minor, 100_00);
    eq("both buckets emptied of slices", d.cash_slices + d.non_cash_slices, 1800);
    check(
      "explanation warns about the overpayment",
      d.explanation.some((l) => l.includes("HARD-VAL-004"))
    );
  }
  {
    const d = planDrawdown(0, portfolio, S);
    eq("zero payment draws down nothing", d.cash_minor + d.non_cash_minor, 0);
    eq("no overflow on a zero payment", d.overflow_minor, 0);
    eq("no slices removed", d.cash_slices + d.non_cash_slices, 0);
  }
  {
    const d = planDrawdown(-500, portfolio, S);
    eq("negative payment is clamped to zero", d.cash_minor, 0);
    eq("negative payment does not overflow", d.overflow_minor, 0);
    eq("negative payment removes no slices", d.cash_slices, 0);
  }
  {
    const d = planDrawdown(100_00, [], S);
    eq("empty portfolio → whole payment overflows", d.overflow_minor, 100_00);
    eq("empty portfolio balance = 0", d.balance_minor, 0);
    eq("empty portfolio loses no slices", d.cash_slices + d.non_cash_slices, 0);
  }
  {
    // A reversal row reduces the at-risk balance arithmetically.
    const withReversal = [
      ...portfolio,
      mkContribution("expense", -400, -100_00, 4),
    ];
    const d = planDrawdown(0, withReversal, S);
    eq("reversal lowers the cash balance to $100", d.balance_minor, 600_00);
  }
}

// ------------------------------------------------------------
// HARD-VAL-004 — one bucket, more than one multiplier
// ------------------------------------------------------------
// The bucket the drawdown is planned against is not homogeneous. Cash
// rows are booked at the cash multiplier and tangible property at the
// non-cash one, and both live in the same "retained at cash value"
// bucket. Converting drawn money at the bucket's headline multiplier
// used to remove MORE SLICES THAN THE PARTICIPANT HOLDS, which is a
// negative holding on the cap table — the thing HARD-VAL-004 exists to
// forbid. The slice figure has to be measured against the rows the
// money actually draws on.
section("policy — HARD-VAL-004 a bucket holds more than one multiplier");
{
  // $100 of cash (800... no: at ×4 that is 400 slices) next to $100 of
  // equipment at ×2 (200 slices). Same bucket, 600 slices, $200 of value.
  const mixed = [
    mkContribution("expense", 400, 100_00, 4), // cash, ×4
    mkContribution("equipment", 200, 100_00, 2), // tangible, ×2
  ];
  {
    const d = planDrawdown(100_00, mixed, S); // half the bucket's value
    // What the old conversion asked for: the money at the bucket's
    // headline multiplier, ×4. Annotated `number` so the assertion below
    // is a real comparison rather than one TypeScript can fold away.
    const headlineFormula: number = 400;
    eq("the payment is cash-bucket money", d.cash_minor, 100_00);
    eq("...half the bucket's value...", d.cash_slices, 300);
    check(
      "...so half its slices, not the money at the headline multiplier",
      d.cash_slices < headlineFormula
    );
  }
  {
    // The case that used to go negative: a portfolio that is ONLY
    // tangible. $100 of equipment at ×2 is 200 slices; drawing all $100
    // at the cash bucket's ×4 would ask for 400 and leave −200.
    const tangibleOnly = [mkContribution("equipment", 200, 100_00, 2)];
    const d = planDrawdown(100_00, tangibleOnly, S);
    eq("the whole balance is drawn", d.cash_minor, 100_00);
    eq("it removes exactly what is held, not more", d.cash_slices, 200);
    check("never more than the bucket holds", d.cash_slices <= 200);
  }
  {
    // And an overpayment still floors: the excess buys no slices.
    const tangibleOnly = [mkContribution("equipment", 200, 100_00, 2)];
    const d = planDrawdown(500_00, tangibleOnly, S);
    eq("only the balance is drawn", d.cash_minor, 100_00);
    eq("the rest overflows", d.overflow_minor, 400_00);
    eq("still only 200 slices come off", d.cash_slices, 200);
  }
  {
    // A bucket whose rows are all one multiplier is unchanged by any of
    // this, which is what makes the fix safe to reason about.
    const pureCash = [mkContribution("expense", 400, 100_00, 4)];
    const d = planDrawdown(100_00, pureCash, S);
    eq("a pure ×4 bucket still converts at ×4", d.cash_slices, 400);
  }
  {
    // A reversal row is a negative holding; nothing comes off it and the
    // total never goes below what is actually there.
    const withReversal = [
      mkContribution("equipment", 200, 100_00, 2),
      mkContribution("personal_car", -100, -50_00, 2),
    ];
    const d = planDrawdown(200_00, withReversal, S);
    eq("the balance nets the reversal out", d.balance_minor, 50_00);
    eq("the drawdown is capped at that balance", d.cash_minor, 50_00);
    eq("and at the slices still standing", d.cash_slices, 100);
  }
}

// ------------------------------------------------------------
// §13 — a closed participant stops accruing
// ------------------------------------------------------------
section("policy — §13 closed participants cannot accrue");
{
  // mkPerson() defaults to active; these are the states a person can be
  // in when the Pie is done with them.
  const active = mkPerson("Ann", "employee");
  const candidate = { ...mkPerson("Cal", "employee"), status: "candidate" as const };
  const departed = { ...mkPerson("Dana", "employee"), status: "departed" as const };
  const boughtOut = { ...mkPerson("Bo", "employee"), status: "bought_out" as const };
  const absentee = { ...mkPerson("Al", "employee"), status: "absentee" as const };

  check("active may accrue", canReceiveContributions(active, "time", S).allowed);
  check(
    "candidate may accrue",
    canReceiveContributions(candidate, "time", S).allowed
  );

  const d = canReceiveContributions(departed, "time", S);
  check("departed may not accrue", !d.allowed);
  eq("refusal carries its own rule id", d.ruleRef, "PARTICIPANT-CLOSED");
  check("refusal names the person", (d.reason ?? "").includes("Dana"));

  check(
    "bought out may not accrue",
    !canReceiveContributions(boughtOut, "expense", S).allowed
  );
  check(
    "absentee may not accrue",
    !canReceiveContributions(absentee, "time", S).allowed
  );

  // The single exception: Ch.7's "continue" position, where royalty and
  // rent keep accruing after the person has left. This is the only place
  // the source has someone who has gone still earning.
  const cont: PieSettings = { ...S, royalty_rent_bad_leaver_policy: "continue" };
  check(
    "continue: royalty still accrues after departure",
    canReceiveContributions(departed, "idea_royalty", cont).allowed
  );
  check(
    "continue: rent still accrues after departure",
    canReceiveContributions(departed, "facilities", cont).allowed
  );
  check(
    "continue does not open up anything else",
    !canReceiveContributions(departed, "time", cont).allowed
  );
  // An absentee left without being settled (no buyout), so the same
  // "left but not settled" reasoning applies to them.
  check(
    "continue applies to an absentee too",
    canReceiveContributions(absentee, "idea_royalty", cont).allowed
  );
  check(
    "continue does not reopen a bought-out person",
    !canReceiveContributions(boughtOut, "idea_royalty", cont).allowed
  );

  // The shipped default is freeze, which closes royalty as well.
  check(
    "freeze closes royalty too",
    !canReceiveContributions(departed, "idea_royalty", S).allowed
  );

  // A payment TO a participant is not an accrual — it takes slices off
  // the ledger rather than putting them on, so §13 has nothing to say
  // about it. A departed participant is exactly who you may still owe.
  check(
    "a departed participant can still be paid",
    canReceiveContributions(departed, "cash_payment_to_participant", S).allowed
  );
  check(
    "a bought-out participant can be offered a payment too",
    canReceiveContributions(boughtOut, "cash_payment_to_participant", S)
      .allowed
  );
  check(
    "the payment exemption does not depend on the royalty policy",
    canReceiveContributions(departed, "cash_payment_to_participant", {
      ...S,
      royalty_rent_bad_leaver_policy: "freeze",
    }).allowed
  );
  check(
    "and it does not open the door to anything else",
    !canReceiveContributions(boughtOut, "expense", S).allowed
  );
}

// ------------------------------------------------------------
// HARD-VAL-004 — a drawdown replays the split it recorded
// ------------------------------------------------------------
section("policy — HARD-VAL-004 drawdown replays the recorded split");
{
  // $200 of cash at risk and $500 of non-cash: a $700 balance.
  const portfolio = [
    mkContribution("expense", 800, 200_00, 4),
    mkContribution("time", 1000, 500_00, 2),
  ];
  // A $300 payment that took $200 from cash and $100 from non-cash.
  const after = [...portfolio, mkPayment(200_00, 100_00)];

  {
    const d = planDrawdown(0, after, S);
    eq("the balance drops to $400", d.balance_minor, 400_00);
  }
  {
    // The buckets must have moved in the right PROPORTION: cash is now
    // empty and non-cash holds the remaining $400. A second $100 payment
    // therefore takes nothing from cash and all of it from non-cash.
    //
    // This is the test that pins the fix. If the row's single negative
    // FMV were classified into the cash bucket instead of the recorded
    // split being replayed, cash would read -$100 and the cash part here
    // would come back as -$100 — a payment that "draws down" a negative
    // amount, which the engine then has to clamp, quietly paying out
    // $200 for a $100 payment.
    const d = planDrawdown(100_00, after, S);
    eq("the second payment takes nothing from cash", d.cash_minor, 0);
    eq("the second payment takes $100 from non-cash", d.non_cash_minor, 100_00);
    eq("nothing overflows", d.overflow_minor, 0);
  }
  {
    // Paying out more than the balance still floors at zero.
    const d = planDrawdown(900_00, after, S);
    eq("cash part = the $0 cash that remains", d.cash_minor, 0);
    eq("non-cash part = the $400 that remains", d.non_cash_minor, 400_00);
    eq("the excess $500 buys nothing", d.overflow_minor, 500_00);
  }
}

// ------------------------------------------------------------
// Summary
// ------------------------------------------------------------
console.log(`\n============================================`);
console.log(`Slicing Pie policy tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`Failures:\n - ${failures.join("\n - ")}`);
  process.exit(1);
}
console.log(`All policy tests passed.\n`);
