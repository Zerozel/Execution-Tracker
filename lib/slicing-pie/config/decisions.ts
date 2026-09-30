// ============================================================
// Execution Tracker — Slicing Pie: Human Decisions Registry
// ============================================================
// Requirements §25 lists 16 items the source leaves AMBIGUOUS,
// CONFLICTING, or with NO DEFAULT. Per the doc's instruction, these
// must be EXPLICIT admin decisions, never silent code assumptions.
//
// The setup wizard surfaces every `decisionRequired` item below so
// the admin consciously confirms a value before activating the Pie.
// Each maps to one or more keys in PieSettings.
// ============================================================

import type { HumanDecision } from "@/types/slicing-pie";

export const HUMAN_DECISIONS: HumanDecision[] = [
  {
    id: "DECISION-ROYALTY-RENT",
    title: "Royalty & rent-in-kind treatment for bad leavers",
    description:
      "Three passages in the source disagree: the Appendix says these intangible slices are LOST; Ch.7 'Rent and Royalties' says they CONTINUE accruing unless paid in cash; the general bad-leaver rule zeroes intangibles. Decided 2026-09-30: FREEZE — the leaver keeps what they had earned by the day they left and earns no more after it.",
    settingKeys: ["royalty_rent_bad_leaver_policy"],
    sourceRef: "§24 Conflict #1; Ch.7; Appendix",
    priority: "high",
  },
  {
    id: "DECISION-SERIES-A-THRESHOLD",
    title: "Series A / freeze threshold",
    description:
      "The book gives no numeric threshold separating a Pie-freezing Series A from an angel round. Leave blank to require a manual owner-initiated freeze, or set an amount to auto-suggest a freeze.",
    settingKeys: ["series_a_auto_threshold_minor"],
    sourceRef: "§17; §24 Ambiguity #1",
    priority: "high",
  },
  {
    id: "DECISION-CLAWBACK-FORMULA",
    title: "Clawback difference formula",
    description:
      "The source states a good-leaver should be 'paid the difference' within the clawback window but gives no formula. The implemented option computes (per-slice sale price − buyout rate) × retained slices.",
    settingKeys: ["clawback_formula", "clawback_window_days"],
    sourceRef: "§14.4 (Missing Information)",
    priority: "high",
  },
  {
    id: "DECISION-LOYAL-EMPLOYEE",
    title: "Loyal-employee retention clause",
    description:
      "For 'resigned for no good reason' only, you may retain slices earned before N months, or a flat percentage. The book provides NO default and leaves it blank. Off by default.",
    settingKeys: ["loyal_employee_clause"],
    sourceRef: "CONFIG-013/014 (Missing Information)",
    priority: "medium",
  },
  {
    id: "DECISION-WORKING-HOURS-SCOPE",
    title: "Working-hours-per-year scope",
    description:
      "The Pie Slicer treats 2,000 as fixed; the Retrofit tool treats it as adjustable. Decide whether it is a single global value or overridable per participant (e.g. part-time roles).",
    settingKeys: ["working_hours_scope", "working_hours_per_year"],
    sourceRef: "§24 Conflict #2",
    priority: "medium",
  },
  {
    id: "DECISION-ADVISOR-CAP",
    title: "Advisor cap & minimum-hours mechanism",
    description:
      "The 200 slices/hour cap is not listed among editable settings in the source; and the 10-hour minimum's mechanism is unclear (gate vs. withhold-then-unlock). Decided 2026-09-30: withhold-then-unlock — the first 10 hours are held back and granted retroactively once the advisor qualifies, so an advisor who does the work is eventually paid for all of it.",
    settingKeys: [
      "advisor_cap_editable",
      "advisor_hourly_slice_cap",
      "advisor_min_hours_threshold",
      "advisor_min_hours_mode",
    ],
    sourceRef: "§24 Ambiguity #2/#3; CONFIG-010/011",
    priority: "medium",
  },
  {
    id: "DECISION-FREEZE-REVERSIBLE",
    title: "Is a Pie freeze reversible?",
    description:
      "The source describes freeze as one-way, with a single ambiguous hint it could reverse if cash later runs short. Decide whether re-activation is permitted (it will be logged).",
    settingKeys: ["freeze_reversible"],
    sourceRef: "§17 Ambiguity #9",
    priority: "medium",
  },
  {
    id: "DECISION-ROUNDING",
    title: "Rounding precision for slices & percentages",
    description:
      "The source specifies no rounding rules anywhere. Choose decimal precision for slice counts and ownership percentages (round-half-up).",
    settingKeys: ["slice_decimal_places", "percent_decimal_places"],
    sourceRef: "§12; EDGE-021",
    priority: "low",
  },
  {
    id: "DECISION-OVER-REIMBURSEMENT",
    title: "Over-reimbursement handling",
    description:
      "The source doesn't say whether a reimbursed amount may exceed the amount paid/FMV. Decide whether to block it (default) or allow it.",
    settingKeys: ["block_over_reimbursement"],
    sourceRef: "§20 (not addressed)",
    priority: "low",
  },
  {
    id: "DECISION-FINDER-MULTIPLIER",
    title: "Finder's-fee multiplier",
    description:
      "The Ch.15 table omits an explicit multiplier term for the finder's fee, unlike every other row (likely a typesetting omission). Confirm whether to apply the non-cash multiplier (default: yes).",
    settingKeys: ["finder_fee"],
    sourceRef: "§24 Conflict #4",
    priority: "low",
  },
  {
    id: "DECISION-DE-MINIMIS",
    title: "De-minimis threshold for small supplies",
    description:
      "The source says 'use your best judgment' with no number for excluding trivial personal supplies. Set a value, or 0 to disable the rule.",
    settingKeys: ["de_minimis_threshold_minor"],
    sourceRef: "§9; EDGE-013",
    priority: "low",
  },
];

/** High-priority decisions the wizard should present first. */
export function decisionsByPriority(): HumanDecision[] {
  const rank: Record<HumanDecision["priority"], number> = {
    high: 0,
    medium: 1,
    low: 2,
  };
  return [...HUMAN_DECISIONS].sort(
    (a, b) => rank[a.priority] - rank[b.priority]
  );
}
