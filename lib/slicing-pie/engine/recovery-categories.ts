// ============================================================
// Execution Tracker — Slicing Pie: Recovery Categories (§14.2)
// ============================================================
// On a BAD-leaver departure the source splits contributions into
// buckets that are treated differently:
//
//   • Cash and tangible property  → RETAINED, but "recalculated
//     without the multiplier" — i.e. the amount of cash spent times
//     one, not times four (Legal Issues — Terms for Recovery).
//   • Intangible (time, relationships, commissions, …) → LOST (×0).
//   • Idea royalties and rent-in-kind → governed by the configurable
//     §24 Conflict #1 policy (lost | continue | freeze).
//
// The earlier implementation inferred "is this cash?" from
// `multiplier_kind`, which silently misfiled pre-owned equipment
// (a tangible asset contributed in kind, so booked with the NON-CASH
// multiplier) as an intangible and forfeited it entirely. Category is
// a property of WHAT was contributed, not of which multiplier the
// engine happened to apply — so it is declared explicitly here.
//
// Pure functions only. No I/O.
// ============================================================

import type { Contribution, ContributionType } from "@/types/slicing-pie";
import { fromMinor, roundSlices } from "../format";

export type RecoveryCategory =
  | "cash" // money actually spent by the participant
  | "tangible" // property with resale value
  | "royalty" // idea royalty stream (§24 Conflict #1 policy)
  | "rent" // facilities / rent-in-kind (§24 Conflict #1 policy)
  | "intangible"; // everything else — forfeited on a bad-leaver exit

const CASH_TYPES: readonly ContributionType[] = [
  "expense", // §4.4 unreimbursed cash
  "well_withdrawal", // §4.5 cash drawn out of the Well
  "loan_payment", // §4.6 personally repaid loan
  "loan_missed_payment", // §4.6 missed payment borne by the individual
  // §15/§20 — a payment OUT of the Pie. Negative on the ledger, so on a
  // bad-leaver recalculation it reduces the recoverable cash figure,
  // which is right: they have already been paid that money.
  "cash_payment_to_participant",
];

// Tangible property. NOTE: equipment sits here regardless of its
// `condition` — a pre-owned item is booked at the non-cash multiplier
// for slice maths, but it is still a physical asset the participant
// handed over, so it is retained (de-multiplied) rather than lost.
const TANGIBLE_TYPES: readonly ContributionType[] = [
  "equipment", // §4.7 new and pre-owned alike
  "personal_car", // §4.14 real out-of-pocket spend (source is silent)
];

const ROYALTY_TYPES: readonly ContributionType[] = ["idea_royalty"]; // §4.8
const RENT_TYPES: readonly ContributionType[] = ["facilities"]; // §4.13

/** Classify a contribution for recovery purposes (§14.2). */
export function recoveryCategory(type: ContributionType): RecoveryCategory {
  if (CASH_TYPES.includes(type)) return "cash";
  if (TANGIBLE_TYPES.includes(type)) return "tangible";
  if (ROYALTY_TYPES.includes(type)) return "royalty";
  if (RENT_TYPES.includes(type)) return "rent";
  return "intangible";
}

/** True when the category survives a bad-leaver exit at cash value. */
export function retainedAtCashValue(category: RecoveryCategory): boolean {
  return category === "cash" || category === "tangible";
}

/**
 * A category in words, for screens that group a person's own
 * contributions. Deliberately describes WHERE the contribution came from
 * rather than what happens to it on a departure — this is shown to the
 * person who made it, and "forfeited if you leave badly" is not a column
 * heading.
 */
const CATEGORY_LABELS: Record<RecoveryCategory, string> = {
  cash: "Money you spent",
  tangible: "Property you contributed",
  royalty: "Idea royalties",
  rent: "Facilities / rent",
  intangible: "Your time and work",
};

/** The category a contribution type falls in, in words. */
export function contributionCategoryLabel(type: ContributionType): string {
  return CATEGORY_LABELS[recoveryCategory(type)];
}

/**
 * The slice count a cash/tangible contribution falls back to on a
 * bad-leaver exit: "the amount of cash spent times one".
 *
 * The trusted source is the FMV that was frozen onto the row at
 * calculation time. Where that is absent or zero (manual slice grants,
 * or rows written before FMV was persisted) we recover the implied FMV
 * by dividing out the multiplier that was actually applied, rather
 * than silently forfeiting the participant's money.
 *
 * The test is `!== 0` rather than `> 0`: a cash payment to a
 * participant (HARD-VAL-004) is stored with a NEGATIVE FMV, and it is
 * just as authoritative as a positive one. Falling through to the
 * divide-by-multiplier path for those rows would misreport them —
 * a $300 payment that removed 1000 slices at the cash multiplier ×4
 * would come back as $250, quietly leaving $50 of at-risk balance on
 * the books that the participant has already been paid.
 */
export function deMultipliedSlices(
  contribution: Contribution,
  decimalPlaces = 4
): number {
  const { fmv_minor, multiplier_applied, slices } = contribution;

  if (fmv_minor !== 0) {
    return roundSlices(fromMinor(fmv_minor), decimalPlaces);
  }
  if (multiplier_applied > 1) {
    return roundSlices(slices / multiplier_applied, decimalPlaces);
  }
  return roundSlices(slices, decimalPlaces);
}
