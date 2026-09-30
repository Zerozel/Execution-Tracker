// ============================================================
// Execution Tracker — Slicing Pie: Human Labels
// ============================================================
// One place where a contribution type becomes words a person reads.
// The alternative — a label map per screen — is how the same row ends
// up described two different ways in two places, and the member's view
// disagreeing with the admin's view about what a row IS is exactly the
// kind of thing that loses an argument you should have won.
//
// Pure data. No I/O, safe on both server and client.
// ============================================================

import type { ContributionType } from "@/types/slicing-pie";

export const CONTRIBUTION_TYPE_LABELS: Record<ContributionType, string> = {
  time: "Time (employee/founder)",
  contractor_time: "Contractor time",
  advisor_time: "Advisor time",
  expense: "Unreimbursed expense",
  well_deposit: "The Well — deposit",
  well_withdrawal: "The Well — withdrawal",
  loan_payment: "Loan payment",
  loan_missed_payment: "Loan missed payment",
  equipment: "Equipment",
  idea_royalty: "Idea royalty",
  commission: "Sales commission",
  finder_fee: "Finder's fee",
  partner_vendor: "Partner/vendor savings",
  referral: "Referral",
  facilities: "Facilities / rent-in-kind",
  personal_car: "Personal car",
  cash_payment_to_participant: "Payment out of the Pie (reduces slices)",
  other: "Other / bonus",
};

/** A contribution type in words. Falls back to the raw key. */
export function contributionTypeLabel(type: ContributionType): string {
  return CONTRIBUTION_TYPE_LABELS[type] ?? type;
}
