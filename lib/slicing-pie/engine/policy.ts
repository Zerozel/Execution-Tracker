// ============================================================
// Execution Tracker — Slicing Pie: Policy Guards (§20)
// ============================================================
// The spec's HARD VALIDATIONS — rules the source says the model
// "must reject/block", not merely warn about. They live here as pure
// functions so the API routes and the UI cannot drift apart: both
// call the same guard and both show the same reason.
//
//   HARD-VAL-001  A good leaver "should not be obligated to sell" —
//                 a FORCED buyout of a good leaver must be refused.
//   HARD-VAL-002  A capped advisor cannot be terminated by the
//                 company ("The Pie Slicer will not allow you to
//                 terminate an advisor").
//   HARD-VAL-003  Contractors are outside the Recovery Framework —
//                 ordinary termination rules do not apply to them.
//   HARD-VAL-004  "The model will not allocate negative slices" — a
//                 cash payment drawing down more than a participant's
//                 at-risk balance floors at zero; the excess simply
//                 buys no slices.
//
// Pure functions only. No I/O.
// ============================================================

import type {
  Contribution,
  ContributionType,
  LeaverKind,
  PieParticipant,
  PieSettings,
} from "@/types/slicing-pie";
import { fromMinor, roundSlices } from "../format";
import {
  deMultipliedSlices,
  retainedAtCashValue,
  recoveryCategory,
} from "./recovery-categories";

export interface PolicyDecision {
  /** True when the action is permitted. */
  allowed: boolean;
  /** Why it was refused, phrased for the person doing it. */
  reason?: string;
  /** The §20 rule id, for traceability in the UI and audit log. */
  ruleRef?: string;
}

const ALLOW: PolicyDecision = { allowed: true };

function deny(reason: string, ruleRef: string): PolicyDecision {
  return { allowed: false, reason, ruleRef };
}

// ------------------------------------------------------------
// HARD-VAL-002 — advisor termination immunity
// ------------------------------------------------------------

/**
 * An advisor who ACCEPTED the hourly slice cap took a worse deal in
 * exchange for immunity: they cannot be terminated by the company.
 * Their only exit is their own decision to stop advising, which the
 * book treats as "resignation for no good reason".
 *
 * An advisor who DECLINED the cap keeps market rate and gives up the
 * immunity — so this guard deliberately does not fire for them.
 */
export function isCappedAdvisor(participant: PieParticipant): boolean {
  return participant.pie_role === "advisor" && participant.advisor_cap_opt_in;
}

export function canTerminate(participant: PieParticipant): PolicyDecision {
  if (isCappedAdvisor(participant)) {
    return deny(
      `${participant.display_name} is an advisor who accepted the hourly slice cap, and therefore cannot be terminated by the company. The only way their slices become recoverable is if they themselves choose to stop advising (§4.3, §7).`,
      "HARD-VAL-002"
    );
  }
  return ALLOW;
}

// ------------------------------------------------------------
// HARD-VAL-003 — contractors are outside the Recovery Framework
// ------------------------------------------------------------

/**
 * "Once the contractor's slices are accounted for, you can't fire
 * them and get the slices back." A contractor's slices are governed
 * solely by the time-limited, price-capped buyout right (CONFIG-012),
 * so the four departure scenarios must not be applied to them.
 */
export function canApplyStandardRecovery(
  participant: PieParticipant
): PolicyDecision {
  if (participant.pie_role === "contractor") {
    return deny(
      `${participant.display_name} is a contractor. The four departure scenarios do not apply to contractors — their slices are governed only by the contractor buyout right (up to 200% of base billed value, within the configured window) (§4.2, §7, §16).`,
      "HARD-VAL-003"
    );
  }
  return ALLOW;
}

// ------------------------------------------------------------
// HARD-VAL-001 — a good leaver cannot be force-bought
// ------------------------------------------------------------

export function canForceBuyout(leaverKind: LeaverKind): PolicyDecision {
  if (leaverKind === "good") {
    return deny(
      "This is a good leaver (fired for no good reason, or resigned for good reason). They keep their slices in full and should not be obligated to sell — a buyout may be offered, but they cannot be compelled to accept it (§14.2, §14.3).",
      "HARD-VAL-001"
    );
  }
  return ALLOW;
}

// ------------------------------------------------------------
// §13 — who may still accrue slices
// ------------------------------------------------------------

/**
 * Whether a participant may receive a NEW contribution of this type.
 *
 * Nothing enforced this before. The entry form simply did not offer
 * anyone who was not `active` or `candidate`, so the form was the only
 * guard — and a form is not a boundary: POST /contributions would
 * cheerfully write slices for someone who had already left, or for
 * someone already bought out whose slices had been removed from the
 * Pie. For a ledger whose entire purpose is to survive being challenged,
 * "you stop accruing when you leave" has to be enforced where the write
 * actually happens.
 *
 * One deliberate exception, for someone who left WITHOUT being settled.
 * The royalty/rent policy may be set to `continue`, the Ch.7 position in
 * which a leaver keeps earning royalty or rent after they go. That is
 * the only place the source has someone who has left still accruing, so
 * it is the only case allowed through — and it does not reach a
 * bought-out person, whose relationship was settled by the buyout
 * itself. (`continue` cannot be reached from the entry form yet — see
 * the note on that setting in config/schema.ts.)
 *
 * A cash payment to a participant sits outside this guard entirely: it
 * takes slices off the ledger rather than putting them on, so "you stop
 * earning when you leave" has nothing to say about it.
 */
export function canReceiveContributions(
  participant: PieParticipant,
  type: ContributionType,
  settings: PieSettings
): PolicyDecision {
  // A cash payment to a participant is not an accrual — it is the Pie
  // paying slices OUT. §13 is about "you stop EARNING when you leave",
  // and a departed participant is precisely who you still have to pay,
  // so the rule does not reach this type. They are not being given new
  // slices; they are being settled for ones already earned. HARD-VAL-004
  // still floors the drawdown at whatever balance actually remains, and
  // someone with nothing left simply draws nothing down.
  if (type === "cash_payment_to_participant") {
    return ALLOW;
  }

  if (participant.status === "active" || participant.status === "candidate") {
    return ALLOW;
  }

  // A buyout is the act that settles the relationship — the slices were
  // removed from the Pie. Nothing accrues afterwards, whatever the
  // royalty policy says. This check has to come FIRST: letting a
  // bought-out person through the "continue" exception below would
  // quietly rebuild slices that a settlement already paid for.
  if (participant.status === "bought_out") {
    return deny(
      `${participant.display_name} was bought out — their slices were removed from the Pie, so any new contribution would quietly reinstate part of what was already settled (§13, §15).`,
      "PARTICIPANT-CLOSED"
    );
  }

  // The one exception, and it applies only to someone who left without
  // being settled: Ch.7's "continue" position, where royalty and rent
  // keep accruing. The other two policies (the shipped default, freeze,
  // and the Appendix's lost) both close the person off.
  const category = recoveryCategory(type);
  if (
    settings.royalty_rent_bad_leaver_policy === "continue" &&
    (category === "royalty" || category === "rent")
  ) {
    return ALLOW;
  }

  const why =
    participant.status === "departed"
      ? "has been recorded as departed — their exit recovery is already in the ledger, and new slices would be counted against a Pie they are no longer part of"
      : "is an absentee — they kept their existing slices but stopped contributing, so they do not accrue new ones";

  return deny(
    `${participant.display_name} ${why}. If they are contributing again, record that as a new event (or return them to active) rather than logging against the closed state (§13).`,
    "PARTICIPANT-CLOSED"
  );
}

// ------------------------------------------------------------
// CONFIG-016 — referral fee waiting period
// ------------------------------------------------------------

/**
 * Referral slices are withheld until the referred hire has stayed the
 * configured waiting period, so the reward is not paid for a hire who
 * immediately leaves.
 */
export function referralVested(
  hiredOn: string,
  settings: PieSettings,
  asOf: Date = new Date()
): PolicyDecision {
  const hire = new Date(`${hiredOn}T00:00:00Z`);
  if (Number.isNaN(hire.getTime())) {
    return deny("Referral hire date is invalid.", "CONFIG-016");
  }
  const due = new Date(hire);
  due.setUTCDate(due.getUTCDate() + settings.referral_waiting_period_days);

  if (asOf.getTime() < due.getTime()) {
    const daysLeft = Math.ceil(
      (due.getTime() - asOf.getTime()) / 86_400_000
    );
    return deny(
      `The referral waiting period has not elapsed. Slices become grantable on ${due
        .toISOString()
        .split("T")[0]} (${daysLeft} day${daysLeft === 1 ? "" : "s"} remaining).`,
      "CONFIG-016"
    );
  }
  return ALLOW;
}

// ------------------------------------------------------------
// HARD-VAL-004 — at-risk drawdown, cash first, floored at zero
// ------------------------------------------------------------

export interface Drawdown {
  /** Portion drawing down cash-type at-risk contributions. */
  cash_minor: number;
  /** Portion drawing down non-cash at-risk contributions. */
  non_cash_minor: number;
  /** Slices the cash portion removes, from the rows it actually draws on. */
  cash_slices: number;
  /** Slices the non-cash portion removes, from the rows it draws on. */
  non_cash_slices: number;
  /** Beyond the participant's whole at-risk balance — buys nothing. */
  overflow_minor: number;
  /** The participant's at-risk balance before the payment. */
  balance_minor: number;
  explanation: string[];
}

/**
 * Slices removed by drawing `money` out of a bucket holding `sliceTotal`
 * slices worth `moneyTotal` of at-risk value.
 *
 * This is the piece that stops a payment removing more slices than the
 * participant holds. A bucket is not one multiplier: the cash/tangible
 * bucket holds cash rows booked at ×4 AND equipment booked at ×2, so
 * converting drawn money at a fixed ×4 can over-remove badly — a
 * participant whose whole at-risk balance is a ₦100,000 piece of
 * equipment holds 200,000 slices, and a ₦100,000 payment converted at
 * ×4 would remove 400,000. That is a negative holding on a cap table.
 *
 * Drawing money out of a bucket in proportion to each row's at-risk
 * value removes slices in proportion to each row's SLICES (row i takes
 * `money × v_i/V`, which is `(money/V) × slices_i` worth of that row's
 * slices), so the correct figure is the bucket's slice total scaled by
 * the fraction of the bucket's value being drawn. No multiplier
 * appears, which is the point: whatever the rows were booked at, the
 * cap table and the departure both replay the same number.
 */
function bucketSlicesFor(
  money: number,
  moneyTotal: number,
  sliceTotal: number,
  decimalPlaces: number
): number {
  if (money <= 0 || moneyTotal <= 0 || sliceTotal <= 0) return 0;
  const fraction = Math.min(1, money / moneyTotal);
  return roundSlices(sliceTotal * fraction, decimalPlaces);
}

/**
 * Plan how a cash payment draws down a participant's at-risk balance.
 *
 * The source's ordering rule: a lump-sum or irregular payment "will
 * reduce slices starting with those from cash contributions" — cash
 * before non-cash. Amounts beyond the total balance do not create a
 * negative balance; they simply buy no slices (HARD-VAL-004).
 */
export function planDrawdown(
  paymentMinor: number,
  contributions: Contribution[],
  settings: PieSettings
): Drawdown {
  const explanation: string[] = [];
  const payment = Math.max(0, Math.round(paymentMinor));
  const dp = settings.slice_decimal_places;

  // At-risk balance per bucket, derived from the FMV frozen on each
  // row (the money actually at stake) rather than the multiplied
  // slice figure. The slice total per bucket is what turns drawn money
  // into removed slices (see bucketSlicesFor).
  let cashBalance = 0;
  let nonCashBalance = 0;
  let cashSliceTotal = 0;
  let nonCashSliceTotal = 0;
  for (const c of contributions) {
    // A cash payment (HARD-VAL-004) records HOW it was split at the
    // moment it was made, in `inputs`. That split cannot be recovered
    // from the row itself: its FMV is one negative number covering both
    // buckets, so the category path below would push the entire drawdown
    // into the cash bucket, drive that bucket negative, and make the
    // NEXT payment take the wrong amount out of the wrong place. Replay
    // the split that was actually applied — the same reason every row
    // freezes its own config_snapshot.
    if (c.type === "cash_payment_to_participant") {
      const applied = c.inputs as Record<string, unknown>;
      cashBalance -= Number(applied?.cash_drawdown_minor ?? 0) || 0;
      nonCashBalance -= Number(applied?.non_cash_drawdown_minor ?? 0) || 0;
      continue;
    }

    // No status filter: matching the cap table (see ./captable), every
    // ledger row counts — a reversal row carries a negative FMV and
    // therefore reduces the balance arithmetically.
    // deMultipliedSlices() yields the un-multiplied FMV in MAJOR units
    // for every category, so ×100 returns the minor-unit at-risk sum.
    const atRisk = Math.round(deMultipliedSlices(c, 2) * 100);
    const rowSlices = roundSlices(c.slices, dp);
    if (retainedAtCashValue(recoveryCategory(c.type))) {
      cashBalance += atRisk;
      cashSliceTotal += rowSlices;
    } else {
      nonCashBalance += atRisk;
      nonCashSliceTotal += rowSlices;
    }
  }

  const balance = cashBalance + nonCashBalance;
  const cashPart = Math.min(payment, cashBalance);
  const nonCashPart = Math.min(payment - cashPart, nonCashBalance);
  const overflow = Math.max(0, payment - cashPart - nonCashPart);

  const cashSlices = bucketSlicesFor(
    cashPart,
    cashBalance,
    cashSliceTotal,
    dp
  );
  const nonCashSlices = bucketSlicesFor(
    nonCashPart,
    nonCashBalance,
    nonCashSliceTotal,
    dp
  );

  explanation.push(
    `At-risk balance: ${fromMinor(cashBalance).toFixed(2)} cash + ${fromMinor(nonCashBalance).toFixed(2)} non-cash = ${fromMinor(balance).toFixed(2)} ${settings.currency}.`,
    `Payment of ${fromMinor(payment).toFixed(2)} draws down cash first: ${fromMinor(cashPart).toFixed(2)} cash, ${fromMinor(nonCashPart).toFixed(2)} non-cash.`,
    `Those portions remove ${cashSlices} + ${nonCashSlices} = ${roundSlices(cashSlices + nonCashSlices, dp)} slices, measured against what the drawn rows hold rather than a single bucket multiplier.`
  );
  if (overflow > 0) {
    explanation.push(
      `HARD-VAL-004: ${fromMinor(overflow).toFixed(2)} exceeds the remaining at-risk balance and buys no slices. The balance floors at zero — be careful not to overpay people in the future.`
    );
  }

  return {
    cash_minor: roundSlices(cashPart, 2),
    non_cash_minor: roundSlices(nonCashPart, 2),
    cash_slices: cashSlices,
    non_cash_slices: nonCashSlices,
    overflow_minor: roundSlices(overflow, 2),
    balance_minor: roundSlices(balance, 2),
    explanation,
  };
}
