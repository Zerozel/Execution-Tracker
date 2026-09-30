// ============================================================
// Execution Tracker — Slicing Pie: Contribution Rules Engine
// ============================================================
// Pure, deterministic slice math for all 18 contribution types
// (requirements §4, plus §20's cash payment to a participant). No I/O,
// no dates-from-now, no randomness — the same inputs + settings always
// yield the same SliceComputation, so historical rows can be recomputed
// against their frozen snapshot.
//
// CORE FORMULA (§2):
//     slices = FMV(in major currency units) × multiplier
// where the multiplier is the CASH multiplier for cash-equivalent
// contributions and the NON-CASH multiplier for everything else.
//
// SIGN: every type accrues POSITIVE slices except
// `cash_payment_to_participant` (HARD-VAL-004), which is a payment out of
// the Pie and so carries NEGATIVE FMV and slices. The cap table sums
// every row, so that row nets out with no special handling.
//
// Money is passed in as INTEGER MINOR UNITS (cents). Slices are
// rounded to settings.slice_decimal_places (round-half-up).
// ============================================================

import type {
  ContributionType,
  EquipmentCondition,
  MultiplierKind,
  PieSettings,
  SliceComputation,
} from "@/types/slicing-pie";
import { fromMinor, roundSlices } from "../format";

// ------------------------------------------------------------
// Per-type input shapes (discriminated union on `type`).
// These mirror what the entry forms collect and what is persisted
// in Contribution.inputs.
// ------------------------------------------------------------

interface BaseInput {
  /** ISO date of the event (unused by math; kept for parity/audit). */
  event_date?: string;
}

export interface TimeInput extends BaseInput {
  type: "time";
  hours: number;
  fair_market_salary_minor: number; // annual FMV salary
  working_hours_override?: number; // per-participant, if enabled
}

export interface ContractorTimeInput extends BaseInput {
  type: "contractor_time";
  hours: number;
  contractor_rate_minor: number; // hourly billed rate
  paid_amount_minor?: number; // portion paid in cash (no slices)
}

export interface AdvisorTimeInput extends BaseInput {
  type: "advisor_time";
  hours: number;
  hourly_rate_minor: number; // advisor's hourly FMV
  cumulative_hours_before?: number; // hours already logged (for min-hours gate)
  /**
   * Whether this advisor ACCEPTED the hourly slice cap (§4.3).
   *
   * The cap is half of a trade: an advisor who accepts it earns fewer
   * slices per hour but cannot be terminated by the company
   * (HARD-VAL-002). An advisor who declines keeps market-rate slices
   * and gives up that immunity — so the cap must NOT be applied to them.
   * Defaults to false: the cap is opt-in, never assumed.
   */
  cap_opt_in?: boolean;
}

export interface ExpenseInput extends BaseInput {
  type: "expense";
  amount_minor: number;
  reimbursed_minor?: number;
}

export interface WellDepositInput extends BaseInput {
  type: "well_deposit";
  amount_minor: number;
}

export interface WellWithdrawalInput extends BaseInput {
  type: "well_withdrawal";
  amount_minor: number;
}

export interface LoanPaymentInput extends BaseInput {
  type: "loan_payment";
  amount_minor: number;
}

export interface LoanMissedPaymentInput extends BaseInput {
  type: "loan_missed_payment";
  amount_minor: number;
}

export interface EquipmentInput extends BaseInput {
  type: "equipment";
  fmv_minor: number;
  condition: EquipmentCondition;
  reimbursed_minor?: number;
}

export interface IdeaRoyaltyInput extends BaseInput {
  type: "idea_royalty";
  revenue_minor: number; // attributable revenue this period
  /** Royalty already paid to the originator in cash (IDEA-002). */
  cash_paid_minor?: number;
}

export interface CommissionInput extends BaseInput {
  type: "commission";
  revenue_minor: number; // revenue from the closed sale
  /** Commission already paid to the salesperson in cash (SALES-002). */
  cash_paid_minor?: number;
}

export interface FinderFeeInput extends BaseInput {
  type: "finder_fee";
  investment_minor: number; // total investment secured
}

export interface PartnerVendorInput extends BaseInput {
  type: "partner_vendor";
  savings_minor: number; // measurable cost savings
}

export interface ReferralInput extends BaseInput {
  type: "referral";
  /** Optional override of the configured flat fee. */
  fee_minor?: number;
}

export interface FacilitiesInput extends BaseInput {
  type: "facilities";
  rent_fmv_minor: number; // FMV of space/facilities provided
  /** Rent already paid to the provider in cash (FACILITY-002). */
  cash_paid_minor?: number;
}

export interface PersonalCarInput extends BaseInput {
  type: "personal_car";
  /** Simple method: total reimbursement to convert. */
  reimbursement_minor?: number;
  /** Split method: actual fuel receipts (cash) + miles (wear & tear). */
  fuel_minor?: number;
  miles?: number;
}

/**
 * A cash payment made BY the Pie TO a participant (§15, §20 HARD-VAL-004).
 *
 * This is the one entry whose slices are NEGATIVE. It is not an earning —
 * it is a withdrawal of slices the participant had already earned — so it
 * is written as an ordinary append-only row whose FMV and slice count are
 * negative. The cap table sums every row, so it nets out on its own: no
 * UPDATE, no DELETE and no reversal row are needed.
 *
 * The cash/non-cash split is history-dependent — the source says a payment
 * "will reduce slices starting with those from cash contributions" — so it
 * cannot be derived from this entry alone. The server resolves it with
 * planDrawdown() against the participant's live at-risk balance and passes
 * the result in, exactly as advisor hours are resolved into
 * `cumulative_hours_before`.
 */
export interface CashPaymentToParticipantInput extends BaseInput {
  type: "cash_payment_to_participant";
  /** The payment being made, in minor units. Always positive. */
  amount_minor: number;
  /** planDrawdown(): the portion drawing down CASH-type at-risk contributions. */
  cash_drawdown_minor?: number;
  /** planDrawdown(): the portion drawing down NON-CASH at-risk contributions. */
  non_cash_drawdown_minor?: number;
  /**
   * planDrawdown(): slices those two portions remove, measured against
   * the rows they draw on. Authoritative when present — a bucket mixes
   * multipliers (cash at ×4 alongside equipment at ×2), so converting
   * the money at a fixed bucket multiplier can remove more slices than
   * the participant holds.
   */
  cash_drawdown_slices?: number;
  non_cash_drawdown_slices?: number;
  /** planDrawdown(): beyond the at-risk balance — recorded, buys nothing. */
  overflow_minor?: number;
}

export interface OtherInput extends BaseInput {
  type: "other";
  /** Provide slices directly, or an FMV to convert. */
  slices?: number;
  fmv_minor?: number;
  multiplier_kind?: MultiplierKind;
  label?: string;
}

export type PieContributionInput =
  | TimeInput
  | ContractorTimeInput
  | AdvisorTimeInput
  | ExpenseInput
  | WellDepositInput
  | WellWithdrawalInput
  | LoanPaymentInput
  | LoanMissedPaymentInput
  | EquipmentInput
  | IdeaRoyaltyInput
  | CommissionInput
  | FinderFeeInput
  | PartnerVendorInput
  | ReferralInput
  | FacilitiesInput
  | PersonalCarInput
  | CashPaymentToParticipantInput
  | OtherInput;

// ------------------------------------------------------------
// Multiplier helpers
// ------------------------------------------------------------

export function multiplierValue(
  kind: MultiplierKind,
  settings: PieSettings
): number {
  switch (kind) {
    case "cash":
      return settings.cash_multiplier;
    case "non_cash":
      return settings.non_cash_multiplier;
    default:
      return 1;
  }
}

/**
 * slices = FMV(major units) × multiplier, rounded to configured precision.
 *
 * Exported for the rows that genuinely are one multiplier: the fuel half
 * of a personal-car split, a well deposit, and so on.
 *
 * It is NOT the way to reconstruct a `cash_payment_to_participant`'s
 * drawdown, even though it looks like it should be. A payment draws on
 * two buckets of rows, and a bucket mixes multipliers — cash booked at
 * ×4 alongside equipment booked at ×2 — so converting the money at the
 * bucket's headline multiplier removes the wrong number of slices, and
 * on a tangible-heavy balance removes more than the participant holds.
 * `planDrawdown` measures the slice figures against the rows actually
 * drawn on and the payment stores them; see `sliceFigure` below, which
 * prefers those and only falls back to this function for rows written
 * before the figures were recorded.
 */
export function slicesFromMinor(
  fmvMinor: number,
  kind: MultiplierKind,
  settings: PieSettings
): number {
  const mult = multiplierValue(kind, settings);
  return roundSlices(fromMinor(fmvMinor) * mult, settings.slice_decimal_places);
}

/**
 * The slice figure for a payment's drawdown: the one `planDrawdown`
 * measured if it is there, otherwise `slicesFromMinor` as a best effort
 * for rows written before it was recorded.
 *
 * Kept as a named function rather than an inline `??` so the fallback is
 * visible at the call site — it is the one path that can still be wrong
 * about a mixed-multiplier bucket.
 */
function sliceFigure(
  recorded: number | undefined,
  fmvMinor: number,
  kind: MultiplierKind,
  settings: PieSettings
): number {
  if (recorded === undefined) {
    return slicesFromMinor(fmvMinor, kind, settings);
  }
  const n = Number(recorded);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return roundSlices(n, settings.slice_decimal_places);
}

// ------------------------------------------------------------
// Tiered finder's fee (CONFIG-006). Exported for reuse/testing.
// ------------------------------------------------------------
export function computeFinderFeeMinor(
  investmentMinor: number,
  settings: PieSettings
): number {
  const { cutoff_minor, pre_cutoff_rate, post_cutoff_rate } =
    settings.finder_fee;
  const preBase = Math.min(investmentMinor, cutoff_minor);
  const postBase = Math.max(0, investmentMinor - cutoff_minor);
  return Math.round(preBase * pre_cutoff_rate + postBase * post_cutoff_rate);
}

// ------------------------------------------------------------
// Reimbursement/unreimbursed helper with over-reimbursement guard (§20).
// ------------------------------------------------------------
function netUnreimbursed(
  amountMinor: number,
  reimbursedMinor: number,
  settings: PieSettings,
  warnings: string[]
): number {
  const net = amountMinor - reimbursedMinor;
  if (net < 0) {
    warnings.push(
      settings.block_over_reimbursement
        ? "Reimbursement exceeds the amount contributed — entry should be blocked (§20)."
        : "Reimbursement exceeds the amount contributed; clamped to zero slices."
    );
    return 0;
  }
  return net;
}

// ------------------------------------------------------------
// Main dispatcher
// ------------------------------------------------------------

export function computeSlices(
  input: PieContributionInput,
  settings: PieSettings
): SliceComputation {
  const explanation: string[] = [];
  const warnings: string[] = [];

  const none = (
    fmvMinor: number,
    extra?: Partial<SliceComputation>
  ): SliceComputation => ({
    fmv_minor: fmvMinor,
    multiplier_kind: "none",
    multiplier_applied: 1,
    slices: 0,
    explanation,
    warnings,
    ...extra,
  });

  const result = (
    fmvMinor: number,
    kind: MultiplierKind
  ): SliceComputation => {
    const mult = multiplierValue(kind, settings);
    const slices = slicesFromMinor(fmvMinor, kind, settings);
    return {
      fmv_minor: fmvMinor,
      multiplier_kind: kind,
      multiplier_applied: mult,
      slices,
      explanation,
      warnings,
    };
  };

  switch (input.type) {
    // ---------------- §4.1 Time ----------------
    case "time": {
      const hoursPerYear =
        settings.working_hours_scope === "per_participant" &&
        input.working_hours_override
          ? input.working_hours_override
          : settings.working_hours_per_year;
      const hourlyRateMinor = input.fair_market_salary_minor / hoursPerYear;
      const fmvMinor = Math.round(input.hours * hourlyRateMinor);
      explanation.push(
        `Hourly rate = ${input.fair_market_salary_minor} / ${hoursPerYear} = ${hourlyRateMinor.toFixed(2)} minor/hr`,
        `FMV = ${input.hours}h × rate = ${fmvMinor} minor`,
        `Slices = FMV × non-cash multiplier (${settings.non_cash_multiplier})`
      );
      if (input.hours > settings.high_hours_warn_threshold) {
        warnings.push(
          `WARN-001: ${input.hours} hours in one entry exceeds the ${settings.high_hours_warn_threshold}-hour credibility threshold.`
        );
      }
      return result(fmvMinor, "non_cash");
    }

    // ---------------- §4.2 Contractor time ----------------
    case "contractor_time": {
      const billed = Math.round(input.hours * input.contractor_rate_minor);
      const unpaid = netUnreimbursed(
        billed,
        input.paid_amount_minor ?? 0,
        settings,
        warnings
      );
      explanation.push(
        `Billed = ${input.hours}h × ${input.contractor_rate_minor} = ${billed} minor`,
        `Unpaid (at-risk) = ${unpaid} minor`,
        `Slices = unpaid × non-cash multiplier (${settings.non_cash_multiplier})`,
        `Company may buy out these slices at up to ${settings.contractor_buyout_cap_pct * 100}% within ${settings.contractor_buyout_window_days} days.`
      );
      return result(unpaid, "non_cash");
    }

    // ---------------- §4.3 Advisor time ----------------
    case "advisor_time": {
      const before = input.cumulative_hours_before ?? 0;
      const after = before + input.hours;
      const threshold = settings.advisor_min_hours_threshold;

      let countedHours: number;
      if (settings.advisor_min_hours_mode === "gate") {
        // Only hours beyond the threshold ever count.
        const billableBefore = Math.max(0, before - threshold);
        const billableAfter = Math.max(0, after - threshold);
        countedHours = billableAfter - billableBefore;
      } else {
        // "unpaid_first": withhold until threshold, then unlock all to date.
        if (after < threshold) {
          countedHours = 0;
        } else if (before < threshold) {
          countedHours = after; // unlock everything accumulated so far
        } else {
          countedHours = input.hours;
        }
      }

      if (countedHours <= 0) {
        explanation.push(
          `Below the ${threshold}-hour minimum (mode: ${settings.advisor_min_hours_mode}); no slices yet.`
        );
        return none(0);
      }

      const fmvMinor = Math.round(countedHours * input.hourly_rate_minor);
      const uncapped = slicesFromMinor(fmvMinor, "non_cash", settings);

      // The hourly cap only binds an advisor who opted into it — it is
      // the price of the termination immunity they received in return.
      const optedIn = input.cap_opt_in === true;
      const cap = roundSlices(
        countedHours * settings.advisor_hourly_slice_cap,
        settings.slice_decimal_places
      );
      const slices = optedIn ? Math.min(uncapped, cap) : uncapped;

      explanation.push(
        `Counted hours = ${countedHours} (of ${input.hours} logged; ${before}h prior)`,
        `FMV = ${countedHours}h × ${input.hourly_rate_minor} = ${fmvMinor} minor`
      );
      if (optedIn) {
        explanation.push(
          `Uncapped slices = ${uncapped}; cap = ${countedHours}h × ${settings.advisor_hourly_slice_cap} = ${cap}`,
          `Slices = min(uncapped, cap) = ${slices}`
        );
      } else {
        explanation.push(
          `Slices = ${uncapped} (no hourly cap — this advisor did not accept it, and so has no termination immunity)`
        );
      }
      if (optedIn && uncapped > cap) {
        warnings.push(
          `Advisor hourly cap applied (${settings.advisor_hourly_slice_cap} slices/hr).`
        );
      }

      return {
        fmv_minor: fmvMinor,
        multiplier_kind: "non_cash",
        multiplier_applied: settings.non_cash_multiplier,
        slices,
        explanation,
        warnings,
      };
    }

    // ---------------- §4.4 Expense (unreimbursed, cash) ----------------
    case "expense": {
      const net = netUnreimbursed(
        input.amount_minor,
        input.reimbursed_minor ?? 0,
        settings,
        warnings
      );
      if (
        settings.de_minimis_threshold_minor > 0 &&
        net > 0 &&
        net < settings.de_minimis_threshold_minor
      ) {
        warnings.push(
          `Below the de-minimis threshold (${settings.de_minimis_threshold_minor} minor); no slices.`
        );
        return none(net);
      }
      explanation.push(
        `Unreimbursed cash expense = ${net} minor`,
        `Slices = expense × cash multiplier (${settings.cash_multiplier})`
      );
      return result(net, "cash");
    }

    // ---------------- §4.5 The Well ----------------
    case "well_deposit": {
      explanation.push(
        `Deposit of ${input.amount_minor} minor into the Well — earns NO slices (§4.5). Slices are granted only on withdrawal.`
      );
      return none(input.amount_minor);
    }
    case "well_withdrawal": {
      explanation.push(
        `Withdrawal of ${input.amount_minor} minor from the Well treated as an at-risk cash contribution.`,
        `Slices = amount × cash multiplier (${settings.cash_multiplier})`
      );
      return result(input.amount_minor, "cash");
    }

    // ---------------- §4.6 Loans (cash) ----------------
    case "loan_payment":
    case "loan_missed_payment": {
      explanation.push(
        `Personal loan payment on the company's behalf = cash contribution of ${input.amount_minor} minor`,
        `Slices = amount × cash multiplier (${settings.cash_multiplier})`
      );
      return result(input.amount_minor, "cash");
    }

    // ---------------- §4.7 Equipment ----------------
    case "equipment": {
      const net = netUnreimbursed(
        input.fmv_minor,
        input.reimbursed_minor ?? 0,
        settings,
        warnings
      );
      // New items bought for the company behave like a cash expense;
      // pre-owned personal equipment contributed in kind is non-cash.
      const kind: MultiplierKind =
        input.condition === "new" ? "cash" : "non_cash";
      explanation.push(
        `Equipment condition = ${input.condition}`,
        `Net FMV (after reimbursement) = ${net} minor`,
        `Treated as ${kind === "cash" ? "cash (purchased for company)" : "non-cash (in-kind)"}; multiplier ${multiplierValue(kind, settings)}`
      );
      return result(net, kind);
    }

    // ---------------- §4.8 Idea royalty ----------------
    case "idea_royalty": {
      const gross = Math.round(input.revenue_minor * settings.royalty_rate);
      // IDEA-002: (FMV − CashPaid) × NonCashMult. Paying the royalty in
      // cash removes that much risk, exactly as with time.
      const fmvMinor = netUnreimbursed(
        gross,
        input.cash_paid_minor ?? 0,
        settings,
        warnings
      );
      explanation.push(
        `Royalty = ${input.revenue_minor} × ${settings.royalty_rate} = ${gross} minor`,
        input.cash_paid_minor
          ? `Less cash already paid = ${input.cash_paid_minor} minor → at-risk ${fmvMinor} minor`
          : `No cash paid → at-risk ${fmvMinor} minor`,
        `Slices = at-risk royalty × non-cash multiplier (${settings.non_cash_multiplier})`
      );
      return result(fmvMinor, "non_cash");
    }

    // ---------------- §4.9 Sales commission ----------------
    case "commission": {
      const gross = Math.round(
        input.revenue_minor * settings.commission_rate
      );
      // SALES-002: ((Rev × Rate) − CashPaid) × NonCashMult.
      const fmvMinor = netUnreimbursed(
        gross,
        input.cash_paid_minor ?? 0,
        settings,
        warnings
      );
      explanation.push(
        `Commission = ${input.revenue_minor} × ${settings.commission_rate} = ${gross} minor`,
        input.cash_paid_minor
          ? `Less cash already paid = ${input.cash_paid_minor} minor → at-risk ${fmvMinor} minor`
          : `No cash paid → at-risk ${fmvMinor} minor`,
        `Slices = at-risk commission × non-cash multiplier (${settings.non_cash_multiplier})`
      );
      return result(fmvMinor, "non_cash");
    }

    // ---------------- §4.10 Investor finder's fee ----------------
    case "finder_fee": {
      const feeMinor = computeFinderFeeMinor(input.investment_minor, settings);
      const applyMult = settings.finder_fee.apply_non_cash_multiplier;
      explanation.push(
        `Tiered fee on ${input.investment_minor} minor = ${feeMinor} minor`,
        applyMult
          ? `Slices = fee × non-cash multiplier (${settings.non_cash_multiplier})`
          : `Slices = fee (no multiplier applied per settings)`
      );
      return result(feeMinor, applyMult ? "non_cash" : "none");
    }

    // ---------------- §4.11 Partner/vendor ----------------
    case "partner_vendor": {
      const fmvMinor = Math.round(
        input.savings_minor * settings.partner_vendor_savings_rate
      );
      explanation.push(
        `Savings share = ${input.savings_minor} × ${settings.partner_vendor_savings_rate} = ${fmvMinor} minor`,
        `Slices = share × non-cash multiplier (${settings.non_cash_multiplier})`
      );
      return result(fmvMinor, "non_cash");
    }

    // ---------------- §4.12 Referral ----------------
    case "referral": {
      const feeMinor = input.fee_minor ?? settings.referral_fee_minor;
      explanation.push(
        `Flat referral fee = ${feeMinor} minor (granted after a ${settings.referral_waiting_period_days}-day waiting period)`,
        `Slices = fee × non-cash multiplier (${settings.non_cash_multiplier})`
      );
      return result(feeMinor, "non_cash");
    }

    // ---------------- §4.13 Facilities (rent in kind) ----------------
    case "facilities": {
      // FACILITY-002: (FMV − CashPaid) × NonCashMult. Charging actual
      // rent removes the risk that earned the slices.
      const atRisk = netUnreimbursed(
        input.rent_fmv_minor,
        input.cash_paid_minor ?? 0,
        settings,
        warnings
      );
      explanation.push(
        `Rent-in-kind FMV = ${input.rent_fmv_minor} minor`,
        input.cash_paid_minor
          ? `Less rent already paid in cash = ${input.cash_paid_minor} minor → at-risk ${atRisk} minor`
          : `No cash paid → at-risk ${atRisk} minor`,
        `Slices = at-risk rent × non-cash multiplier (${settings.non_cash_multiplier})`
      );
      return result(atRisk, "non_cash");
    }

    // ---------------- §4.14 Personal car ----------------
    case "personal_car": {
      if (settings.personal_car_method === "simple") {
        const kind = settings.personal_car_simple_multiplier;
        const amt = input.reimbursement_minor ?? 0;
        explanation.push(
          `Simple method: ${amt} minor × ${kind} multiplier (${multiplierValue(kind, settings)})`
        );
        return result(amt, kind);
      }
      // Split method: fuel (cash) + wear & tear via mileage (non-cash).
      const fuelMinor = input.fuel_minor ?? 0;
      const wearTearMinor = Math.round(
        (input.miles ?? 0) * settings.personal_car_mileage_rate_minor
      );
      const fuelSlices = slicesFromMinor(fuelMinor, "cash", settings);
      const wearSlices = slicesFromMinor(wearTearMinor, "non_cash", settings);
      const slices = roundSlices(
        fuelSlices + wearSlices,
        settings.slice_decimal_places
      );
      explanation.push(
        `Split method:`,
        `  Fuel = ${fuelMinor} minor × cash (${settings.cash_multiplier}) = ${fuelSlices} slices`,
        `  Wear & tear = ${input.miles ?? 0} mi × ${settings.personal_car_mileage_rate_minor} = ${wearTearMinor} minor × non-cash (${settings.non_cash_multiplier}) = ${wearSlices} slices`,
        `  Total = ${slices} slices`
      );
      return {
        fmv_minor: fuelMinor + wearTearMinor,
        multiplier_kind: "non_cash", // mixed; label as non_cash dominant
        multiplier_applied: settings.non_cash_multiplier,
        slices,
        explanation,
        warnings,
      };
    }

    // ---------------- §15/§20 Cash payment to a participant ----------------
    case "cash_payment_to_participant": {
      // HARD-VAL-004: a payment never produces a negative balance. The
      // server has already run planDrawdown() against the participant's
      // live at-risk balance, so what arrives here is the portion that
      // genuinely draws slices down. `overflow_minor` is the part that
      // exceeded the balance — it is recorded for the audit trail, but it
      // buys nothing.
      const cashPart = Math.max(0, input.cash_drawdown_minor ?? 0);
      const nonCashPart = Math.max(0, input.non_cash_drawdown_minor ?? 0);
      const overflow = Math.max(0, input.overflow_minor ?? 0);
      const drawn = cashPart + nonCashPart;

      if (drawn === 0) {
        explanation.push(
          `Payment of ${input.amount_minor} minor draws nothing down — this participant has no at-risk balance left to reduce.`,
          `HARD-VAL-004: the balance floors at zero, and the model will not allocate negative slices.`
        );
        warnings.push(
          `HARD-VAL-004: nothing to draw down — this participant has no at-risk balance left, so the whole payment sits beyond it and removes no slices.`
        );
        return none(0);
      }

      // The slice figures come from planDrawdown, which measured them
      // against the rows being drawn on. Re-deriving them here as
      // `money × bucket multiplier` is what used to let a payment remove
      // more slices than the participant held: a bucket is not one
      // multiplier, so a tangible-only portfolio booked at ×2 would have
      // its drawdown converted at the cash bucket's ×4.
      //
      // The fallback is for rows written before planDrawdown returned
      // slice figures. It is the best available approximation without
      // the portfolio, and it cannot over-remove on a pure-cash balance.
      const cashSlices = sliceFigure(
        input.cash_drawdown_slices,
        cashPart,
        "cash",
        settings
      );
      const nonCashSlices = sliceFigure(
        input.non_cash_drawdown_slices,
        nonCashPart,
        "non_cash",
        settings
      );
      const slices = roundSlices(
        -(cashSlices + nonCashSlices),
        settings.slice_decimal_places
      );

      explanation.push(
        `Payment of ${input.amount_minor} minor draws the at-risk balance down cash-first:`,
        `  cash portion = ${cashPart} minor → −${cashSlices} slices`,
        `  non-cash portion = ${nonCashPart} minor → −${nonCashSlices} slices`,
        `Slices removed = ${slices} (this row is negative; the cap table sums every row, so it nets out)`
      );
      if (overflow > 0) {
        warnings.push(
          `HARD-VAL-004: ${overflow} minor of this payment exceeds the remaining at-risk balance and buys nothing. The balance floors at zero — be careful not to overpay in future.`
        );
        explanation.push(
          `${overflow} minor exceeded the balance; it is recorded on the row but converted to no slices.`
        );
      }

      return {
        // Negative FMV and negative slices. The row is a withdrawal, and
        // since the cap table sums EVERY ledger row it needs no special
        // handling to reduce the total.
        fmv_minor: -drawn,
        // The split is mixed, so no single multiplier describes this row.
        // As with the personal-car split method above, the recorded
        // multiplier is the dominant label only — the authoritative
        // figure is fmv_minor, which `deMultipliedSlices` reads directly.
        multiplier_kind: "cash",
        multiplier_applied: settings.cash_multiplier,
        slices,
        explanation,
        warnings,
      };
    }

    // ---------------- §4.15 Other / bonus / retrofit ----------------
    case "other": {
      if (typeof input.slices === "number") {
        explanation.push(
          `Manual slice grant${input.label ? ` (${input.label})` : ""} = ${input.slices} slices`
        );
        return {
          fmv_minor: input.fmv_minor ?? 0,
          multiplier_kind: "none",
          multiplier_applied: 1,
          slices: roundSlices(input.slices, settings.slice_decimal_places),
          explanation,
          warnings,
        };
      }
      const kind = input.multiplier_kind ?? "non_cash";
      const fmvMinor = input.fmv_minor ?? 0;
      explanation.push(
        `Other contribution FMV = ${fmvMinor} minor × ${kind} multiplier (${multiplierValue(kind, settings)})`
      );
      return result(fmvMinor, kind);
    }

    default: {
      // Exhaustiveness guard — unreachable if the union is complete.
      const _never: never = input;
      throw new Error(`Unhandled contribution type: ${JSON.stringify(_never)}`);
    }
  }
}

/** Convenience: does this settings object enable a given type? */
export function isTypeEnabled(
  type: ContributionType,
  settings: PieSettings
): boolean {
  return settings.enabled_contribution_types.includes(type);
}
