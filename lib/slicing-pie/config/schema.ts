// ============================================================
// Execution Tracker — Slicing Pie: Config Schema & Defaults
// ============================================================
// SINGLE SOURCE OF TRUTH for every configurable setting.
//
//   • DEFAULT_PIE_SETTINGS  — the shipped defaults (code-level).
//   • SETTING_DESCRIPTORS   — metadata that DRIVES the admin UI,
//                             validation, and change history.
//
// The Settings Console renders its editors FROM SETTING_DESCRIPTORS,
// guaranteeing the code layer and the no-code UI layer stay in sync.
//
// Each CONFIG-00x id from requirements §3 is represented. Where the
// book gives no default (§25), `decisionRequired: true` forces the
// admin to confirm a value in the setup wizard.
// ============================================================

import type {
  ContributionType,
  PieSettings,
  SettingDescriptor,
} from "@/types/slicing-pie";

// ------------------------------------------------------------
// All contribution types enabled by default.
// ------------------------------------------------------------
export const ALL_CONTRIBUTION_TYPES: ContributionType[] = [
  "time",
  "contractor_time",
  "advisor_time",
  "expense",
  "well_deposit",
  "well_withdrawal",
  "loan_payment",
  "loan_missed_payment",
  "equipment",
  "idea_royalty",
  "commission",
  "finder_fee",
  "partner_vendor",
  "referral",
  "facilities",
  "personal_car",
  // §15/§20 HARD-VAL-004 — a payment BY the Pie TO a participant. It
  // reduces slices rather than adding them, so it is offered on the entry
  // form like any other entry but books a NEGATIVE row.
  "cash_payment_to_participant",
  "other",
];

// ------------------------------------------------------------
// Shipped defaults. Money values are in MINOR UNITS (cents).
// ------------------------------------------------------------
export const DEFAULT_PIE_SETTINGS: PieSettings = {
  // Core multipliers — CONFIG-001 / CONFIG-002
  non_cash_multiplier: 2,
  cash_multiplier: 4,

  // Time — CONFIG-003 + §24 Conflict #2 decision
  working_hours_per_year: 2000,
  working_hours_scope: "global",

  // Rates — CONFIG-004 / CONFIG-005 / CONFIG-006
  commission_rate: 0.1, // 10%
  royalty_rate: 0.05, // 5%
  finder_fee: {
    cutoff_minor: 100_000_000, // $1,000,000
    pre_cutoff_rate: 0.05, // 5%
    post_cutoff_rate: 0.025, // 2.5%
    apply_non_cash_multiplier: true, // §24 Conflict #4 → default apply
  },

  // Currency & buyout — CONFIG-007 / CONFIG-021
  // CONFIG-007. The Pie operates in exactly ONE currency and no exchange
  // rate is ever applied, so this is the least reversible setting there
  // is: every contribution freezes the currency it was valued in, and a
  // later change cannot restate that history. Shipped default is Naira
  // (founder decision, 2026-09-30).
  currency: "NGN",
  buyout_rate_per_slice_minor: 100, // $1.00 / slice

  // Personal car — CONFIG-008 / CONFIG-009
  personal_car_method: "split",
  personal_car_simple_multiplier: "non_cash",
  personal_car_mileage_rate_minor: 54, // ~$0.54 example rate

  // Advisor — CONFIG-010 / CONFIG-011 + §24 Ambiguity #2/#3
  advisor_hourly_slice_cap: 200,
  advisor_cap_editable: true,
  advisor_min_hours_threshold: 10,
  // The book does not say which mechanism it means (§24 Ambiguity #2).
  // Founder's decision, 2026-09-30: the first N hours are withheld and
  // then granted retroactively once the advisor qualifies — an advisor
  // who does the work eventually gets paid for all of it.
  advisor_min_hours_mode: "unpaid_first",

  // Contractor — CONFIG-012
  contractor_buyout_cap_pct: 2.0, // 200%
  contractor_buyout_window_days: 365,

  // Referral — CONFIG-015 / CONFIG-016
  referral_fee_minor: 25_000, // $250 (recommended $250–$500)
  referral_waiting_period_days: 180,

  // Loyal employee — CONFIG-013 / CONFIG-014 (no book default)
  loyal_employee_clause: { mode: "off" },

  // Relocation / clawback / non-solicit — CONFIG-017 / 018 / 019
  relocation_good_reason_miles: 50,
  clawback_window_days: 365,
  non_solicitation_period_days: 365,

  // Partner/vendor — CONFIG-020
  partner_vendor_savings_rate: 0.05, // under 5%

  // Recovery decisions — §25
  // Conflict #1 in the source: three passages give three different
  // answers for royalty/rent on a bad-leaver exit. Founder's decision,
  // 2026-09-30: freeze. The departing person keeps the slices they had
  // actually earned by the day they left, and earns no more after it —
  // they are not punished for the departure beyond the slices that
  // would have accrued had they stayed.
  royalty_rent_bad_leaver_policy: "freeze",
  clawback_formula: "per_slice_delta",

  // Freeze — §17 decisions
  freeze_reversible: false,
  series_a_auto_threshold_minor: null, // manual trigger by default

  // Validation / precision — §12 / §20 / §9 / WARN-001
  slice_decimal_places: 4,
  percent_decimal_places: 2,
  block_over_reimbursement: true,
  de_minimis_threshold_minor: 0, // off
  high_hours_warn_threshold: 60,

  // Enablement & tags
  enabled_contribution_types: [...ALL_CONTRIBUTION_TYPES],
  project_tags: [],
};

// ------------------------------------------------------------
// Descriptors that drive the UI. Ordered by group for rendering.
// ------------------------------------------------------------
export const SETTING_DESCRIPTORS: SettingDescriptor[] = [
  // ---------- CORE ----------
  {
    key: "non_cash_multiplier",
    configRef: "CONFIG-001",
    label: "Non-Cash Multiplier",
    helpText:
      "Applied to the FMV of non-cash contributions (time, ideas, relationships). The book strongly discourages changing this from 2.",
    group: "core",
    type: "multiplier",
    bookDefault: 2,
    shippedDefault: 2,
    decisionRequired: false,
    uiEditable: true,
    prospective: true,
    sourceRef: "Ch.4; Ch.15",
    min: 1,
  },
  {
    key: "cash_multiplier",
    configRef: "CONFIG-002",
    label: "Cash Multiplier",
    helpText:
      "Applied to the FMV of cash contributions. Recommended: cash multiplier > non-cash multiplier > 1.",
    group: "core",
    type: "multiplier",
    bookDefault: 4,
    shippedDefault: 4,
    decisionRequired: false,
    uiEditable: true,
    prospective: true,
    sourceRef: "Ch.4; Ch.15",
    min: 1,
  },

  // ---------- RATES ----------
  {
    key: "commission_rate",
    configRef: "CONFIG-004",
    label: "Sales Commission Rate",
    helpText:
      "Percentage of revenue paid (in slices) to the salesperson who closed a sale. Book default 10% (5–10% typical). Must be the same for all salespeople.",
    group: "rates",
    type: "percent",
    bookDefault: 0.1,
    shippedDefault: 0.1,
    decisionRequired: false,
    uiEditable: true,
    prospective: true,
    sourceRef: "Ch.6 'Customers'; Ch.15",
    min: 0,
    max: 1,
  },
  {
    key: "royalty_rate",
    configRef: "CONFIG-005",
    label: "Idea Royalty Rate",
    helpText:
      "Percentage of attributable revenue paid (in slices) to a qualifying idea's originator. Book default 5%.",
    group: "rates",
    type: "percent",
    bookDefault: 0.05,
    shippedDefault: 0.05,
    decisionRequired: false,
    uiEditable: true,
    prospective: true,
    sourceRef: "Ch.6 'Ideas'; Ch.15",
    min: 0,
    max: 1,
  },
  {
    key: "finder_fee",
    configRef: "CONFIG-006",
    label: "Investor Finder's Fee",
    helpText:
      "Tiered fee for securing an investment. Recommended: 5% of the first $1,000,000, 2.5% of the rest. One fee per investment.",
    group: "rates",
    type: "tiered_finder_fee",
    bookDefault: {
      cutoff_minor: 100_000_000,
      pre_cutoff_rate: 0.05,
      post_cutoff_rate: 0.025,
      apply_non_cash_multiplier: true,
    },
    shippedDefault: {
      cutoff_minor: 100_000_000,
      pre_cutoff_rate: 0.05,
      post_cutoff_rate: 0.025,
      apply_non_cash_multiplier: true,
    },
    decisionRequired: false,
    uiEditable: true,
    prospective: true,
    sourceRef: "Ch.6 'Investors'; Ch.11; Ch.15",
  },
  {
    key: "partner_vendor_savings_rate",
    configRef: "CONFIG-020",
    label: "Partner/Vendor Savings Rate",
    helpText:
      "Optional share of measurable cost savings allocated (in slices) to whoever sourced a partner/vendor. Book suggests under 5%; often not used at all.",
    group: "rates",
    type: "percent",
    bookDefault: 0.05,
    shippedDefault: 0.05,
    decisionRequired: false,
    uiEditable: true,
    prospective: true,
    sourceRef: "Ch.6 'Partners & Vendors'",
    min: 0,
    max: 1,
  },

  // ---------- TIME ----------
  {
    key: "working_hours_per_year",
    configRef: "CONFIG-003",
    label: "Working Hours Per Year",
    helpText:
      "Divisor that converts an annual FMV salary to an hourly rate (default 2,000 = 40h × 50 weeks). Some countries differ.",
    group: "time",
    type: "number",
    bookDefault: 2000,
    shippedDefault: 2000,
    decisionRequired: false,
    uiEditable: true,
    prospective: true,
    sourceRef: "Ch.6 'Time'; Ch.11; Ch.15",
    min: 1,
  },
  {
    key: "working_hours_scope",
    label: "Working-Hours Scope",
    helpText:
      "The source is inconsistent on whether the 2,000-hour figure is global or adjustable per participant (e.g. part-time). Choose how it applies.",
    group: "time",
    type: "enum",
    options: [
      { value: "global", label: "Global (one value for the whole Pie)" },
      { value: "per_participant", label: "Per participant (allow overrides)" },
    ],
    bookDefault: null,
    shippedDefault: "global",
    decisionRequired: true,
    uiEditable: true,
    prospective: true,
    sourceRef: "§24 Conflict #2",
  },
  {
    key: "high_hours_warn_threshold",
    configRef: "WARN-001",
    label: "High-Hours Warning Threshold",
    helpText:
      "Logging more than this many hours in a week raises a non-blocking credibility warning for review.",
    group: "time",
    type: "number",
    bookDefault: null,
    shippedDefault: 60,
    decisionRequired: false,
    uiEditable: true,
    prospective: false,
    sourceRef: "Ch.11 'Average Hours per Week Worked'",
    min: 1,
  },

  // ---------- PERSONAL CAR ----------
  {
    key: "personal_car_method",
    configRef: "CONFIG-008",
    label: "Personal Car Method",
    helpText:
      "Simple: apply a single chosen multiplier to the whole reimbursement. Split (more accurate): cash multiplier on fuel, non-cash on wear & tear.",
    group: "personal_car",
    type: "enum",
    options: [
      { value: "simple", label: "Simple (single multiplier)" },
      { value: "split", label: "Split (fuel vs. wear & tear)" },
    ],
    bookDefault: null,
    shippedDefault: "split",
    decisionRequired: false,
    uiEditable: true,
    prospective: true,
    sourceRef: "Ch.5 'Personal Car'; Ch.15",
  },
  {
    key: "personal_car_simple_multiplier",
    label: "Personal Car — Simple Multiplier",
    helpText:
      "Which multiplier the Simple method applies to the whole reimbursement.",
    group: "personal_car",
    type: "enum",
    options: [
      { value: "cash", label: "Cash multiplier" },
      { value: "non_cash", label: "Non-cash multiplier" },
    ],
    bookDefault: null,
    shippedDefault: "non_cash",
    decisionRequired: false,
    uiEditable: true,
    prospective: true,
    sourceRef: "Ch.5 'Personal Car'",
  },
  {
    key: "personal_car_mileage_rate_minor",
    configRef: "CONFIG-009",
    label: "Personal Car Mileage Rate",
    helpText:
      "Per-mile/km reimbursement rate used by the Split method. The IRS example (~$0.54) is jurisdiction- and time-dependent; set your own.",
    group: "personal_car",
    type: "currency_per_unit",
    bookDefault: 54,
    shippedDefault: 54,
    decisionRequired: false,
    uiEditable: true,
    prospective: true,
    sourceRef: "Ch.5 'Personal Car'",
    min: 0,
  },

  // ---------- ADVISOR ----------
  {
    key: "advisor_hourly_slice_cap",
    configRef: "CONFIG-010",
    label: "Advisor Hourly Slice Cap",
    helpText:
      "Cap on advisor compensation, expressed directly in slices/hour (recommended 200). Advisors who accept the cap gain termination immunity.",
    group: "advisor",
    type: "number",
    bookDefault: 200,
    shippedDefault: 200,
    decisionRequired: false,
    uiEditable: true,
    prospective: true,
    sourceRef: "Ch.7 'Advisory Board Members'",
    min: 0,
  },
  {
    key: "advisor_cap_editable",
    label: "Advisor Cap Is Editable",
    helpText:
      "The source is unclear whether the advisor cap is meant to be adjustable in software (§24 Ambiguity #3). Toggle to allow editing.",
    group: "advisor",
    type: "boolean",
    bookDefault: null,
    shippedDefault: true,
    decisionRequired: true,
    uiEditable: true,
    prospective: true,
    sourceRef: "§24 Ambiguity #3",
    advanced: true,
  },
  {
    key: "advisor_min_hours_threshold",
    configRef: "CONFIG-011",
    label: "Advisor Minimum Hours",
    helpText:
      "Minimum advisory hours before slices begin (recommended 10).",
    group: "advisor",
    type: "number",
    bookDefault: 10,
    shippedDefault: 10,
    decisionRequired: false,
    uiEditable: true,
    prospective: true,
    sourceRef: "Ch.7 'Advisory Board Members'",
    min: 0,
  },
  {
    key: "advisor_min_hours_mode",
    label: "Advisor Minimum-Hours Mechanism",
    helpText:
      "Gate: the first N hours earn NO slices. Unpaid-first: slices are withheld then unlocked (granted retroactively) once the threshold is reached. Decided: unpaid-first.",
    group: "advisor",
    type: "enum",
    options: [
      { value: "gate", label: "Gate (first N hours earn nothing)" },
      { value: "unpaid_first", label: "Withhold then unlock at threshold" },
    ],
    bookDefault: null,
    shippedDefault: "unpaid_first",
    decisionRequired: false,
    uiEditable: true,
    prospective: true,
    sourceRef: "§24 Ambiguity #2",
  },

  // ---------- CONTRACTOR ----------
  {
    key: "contractor_buyout_cap_pct",
    configRef: "CONFIG-012",
    label: "Contractor Buyout Cap",
    helpText:
      "Ceiling on the company's force-buyout price for a contractor's slices, as a multiple of base billed value (book: 200%).",
    group: "contractor",
    type: "multiplier",
    bookDefault: 2.0,
    shippedDefault: 2.0,
    decisionRequired: false,
    uiEditable: true,
    prospective: true,
    sourceRef: "Ch.6 'Contractor Time'",
    min: 1,
  },
  {
    key: "contractor_buyout_window_days",
    configRef: "CONFIG-012",
    label: "Contractor Buyout Window (days)",
    helpText:
      "How long the company's buyout right lasts for a given billing (book: 1 year). After this the right expires.",
    group: "contractor",
    type: "duration_days",
    bookDefault: 365,
    shippedDefault: 365,
    decisionRequired: false,
    uiEditable: true,
    prospective: true,
    sourceRef: "Ch.6 'Contractor Time'",
    min: 0,
  },

  // ---------- REFERRAL ----------
  {
    key: "referral_fee_minor",
    configRef: "CONFIG-015",
    label: "Employee Referral Fee",
    helpText:
      "Flat fee (in slices, via non-cash multiplier) for a relationship that results in a new hire. Recommended $250–$500.",
    group: "referral",
    type: "currency",
    bookDefault: null,
    shippedDefault: 25_000,
    decisionRequired: false,
    uiEditable: true,
    prospective: true,
    sourceRef: "Ch.6 'Employees'",
    min: 0,
  },
  {
    key: "referral_waiting_period_days",
    configRef: "CONFIG-016",
    label: "Referral Waiting Period (days)",
    helpText:
      "Delay before referral-fee slices are granted, to confirm the new hire stays (recommended ≥6 months).",
    group: "referral",
    type: "duration_days",
    bookDefault: 180,
    shippedDefault: 180,
    decisionRequired: false,
    uiEditable: true,
    prospective: true,
    sourceRef: "Ch.6 'Employees'",
    min: 0,
  },

  // ---------- RECOVERY ----------
  {
    key: "royalty_rent_bad_leaver_policy",
    label: "Royalty/Rent on Bad-Leaver Departure",
    helpText:
      "THE major source conflict (§24 #1). Three passages disagree on what happens to idea-royalty and rent-in-kind slices when a bad leaver departs. Lost (Appendix), Continue accruing unless paid in cash (Ch.7), or Freeze at departure value. Decided: freeze. NOTE: on the day of departure 'freeze' and 'continue' keep exactly the same slices — nothing is taken away by either. They differ only in whether NEW royalty/rent entries are logged afterwards, and 'continue' therefore has no effect today: a departed participant is not offered on the entry form. Treat 'continue' as a placeholder for that future behaviour, not as a working option.",
    group: "recovery",
    type: "enum",
    options: [
      { value: "lost", label: "Lost / zeroed (Appendix position)" },
      { value: "continue", label: "Continue unless paid in cash (Ch.7)" },
      { value: "freeze", label: "Freeze at departure value" },
    ],
    bookDefault: null,
    shippedDefault: "freeze",
    decisionRequired: false,
    uiEditable: true,
    prospective: false,
    sourceRef: "§24 Conflict #1; Ch.7; Appendix",
  },
  {
    key: "loyal_employee_clause",
    configRef: "CONFIG-013/014",
    label: "Loyal Employee Clause",
    helpText:
      "For 'resigned for no good reason' only: optionally retain slices earned before N months, or a flat percentage of slices. The book gives NO default — off by default.",
    group: "recovery",
    type: "loyal_employee_clause",
    bookDefault: null,
    shippedDefault: { mode: "off" },
    decisionRequired: false,
    uiEditable: true,
    prospective: false,
    sourceRef: "Ch.7 'Loyal Employees'; Legal Issues",
  },
  {
    key: "relocation_good_reason_miles",
    configRef: "CONFIG-017",
    label: "Relocation Good-Reason Distance (miles)",
    helpText:
      "A company relocation beyond this distance qualifies as 'resignation for good reason' (book: 50 miles).",
    group: "recovery",
    type: "number",
    bookDefault: 50,
    shippedDefault: 50,
    decisionRequired: false,
    uiEditable: true,
    prospective: false,
    sourceRef: "Ch.7 'Resign for Good Reason'",
    min: 0,
  },
  {
    key: "clawback_window_days",
    configRef: "CONFIG-018",
    label: "Clawback Window (days)",
    helpText:
      "After a good-leaver buyout, a higher-value transaction within this window triggers a clawback payment (book: 1 year).",
    group: "recovery",
    type: "duration_days",
    bookDefault: 365,
    shippedDefault: 365,
    decisionRequired: false,
    uiEditable: true,
    prospective: false,
    sourceRef: "Ch.7 'Claw Back'",
    min: 0,
  },
  {
    key: "non_solicitation_period_days",
    configRef: "CONFIG-019",
    label: "Non-Solicitation Period (days)",
    helpText:
      "Customary duration a departed employee is asked not to recruit former co-workers (~1 year).",
    group: "recovery",
    type: "duration_days",
    bookDefault: 365,
    shippedDefault: 365,
    decisionRequired: false,
    uiEditable: true,
    prospective: false,
    sourceRef: "Ch.7 'Fired for No Good Reason'",
    min: 0,
  },
  {
    key: "buyout_rate_per_slice_minor",
    configRef: "CONFIG-021",
    label: "Buyout Rate per Slice",
    helpText:
      "Cash paid per outstanding slice on a buyout (book: $1/slice in the US). Voluntary offers may differ by mutual agreement.",
    group: "recovery",
    type: "currency",
    bookDefault: 100,
    shippedDefault: 100,
    decisionRequired: false,
    uiEditable: true,
    prospective: false,
    sourceRef: "Ch.7 'Buyout Price'; Ch.15",
    min: 0,
  },

  // ---------- FREEZE ----------
  {
    key: "freeze_reversible",
    label: "Pie Freeze Is Reversible",
    helpText:
      "The source describes freeze as essentially one-way, with one ambiguous hint it could reverse (§17). Default off (one-way).",
    group: "freeze",
    type: "boolean",
    bookDefault: null,
    shippedDefault: false,
    decisionRequired: true,
    uiEditable: true,
    prospective: false,
    sourceRef: "§17; Ch.8",
  },
  {
    key: "series_a_auto_threshold_minor",
    label: "Series A Auto-Freeze Threshold",
    helpText:
      "The book gives NO numeric threshold separating a Series A (freezes the Pie) from an angel round (does not). Leave blank to require a manual owner trigger.",
    group: "freeze",
    type: "currency",
    bookDefault: null,
    shippedDefault: null,
    decisionRequired: true,
    uiEditable: true,
    prospective: false,
    sourceRef: "§17 Ambiguity #1",
  },

  // ---------- CURRENCY ----------
  {
    key: "currency",
    configRef: "CONFIG-007",
    label: "Operating Currency",
    helpText:
      "The single currency the Pie operates in. No exchange-rate conversion is ever applied.",
    group: "currency",
    type: "string_list", // a bare ISO code, not a list — see the note below
    bookDefault: null,
    shippedDefault: "NGN",
    // Rendered as a select. NOTE: `type` above is mislabelled — currency
    // is stored as a bare ISO token ("NGN"), not an array, which the
    // console had to special-case. Supplying `options` makes it render as
    // a dropdown instead of a free-text box, so a typo cannot produce a
    // Pie denominated in a currency that does not exist.
    options: [
      { value: "NGN", label: "NGN — Nigerian Naira (₦)" },
      { value: "USD", label: "USD — US Dollar ($)" },
      { value: "GBP", label: "GBP — Pound Sterling (£)" },
      { value: "EUR", label: "EUR — Euro (€)" },
      { value: "ZAR", label: "ZAR — South African Rand (R)" },
      { value: "KES", label: "KES — Kenyan Shilling (KSh)" },
      { value: "GHS", label: "GHS — Ghanaian Cedi (₵)" },
    ],
    decisionRequired: false,
    uiEditable: true,
    prospective: false,
    sourceRef: "Ch.15 'Pie Settings'",
  },

  // ---------- VALIDATION / PRECISION ----------
  {
    key: "slice_decimal_places",
    label: "Slice Decimal Places",
    helpText:
      "Rounding precision for slice counts. The source specifies no rounding rule (§12), so this is your decision.",
    group: "validation",
    type: "number",
    bookDefault: null,
    shippedDefault: 4,
    decisionRequired: false,
    uiEditable: true,
    prospective: false,
    sourceRef: "§12; EDGE-021",
    min: 0,
    max: 8,
    advanced: true,
  },
  {
    key: "percent_decimal_places",
    label: "Percent Decimal Places",
    helpText: "Rounding precision for ownership percentages.",
    group: "validation",
    type: "number",
    bookDefault: null,
    shippedDefault: 2,
    decisionRequired: false,
    uiEditable: true,
    prospective: false,
    sourceRef: "§12; EDGE-021",
    min: 0,
    max: 6,
    advanced: true,
  },
  {
    key: "block_over_reimbursement",
    label: "Block Over-Reimbursement",
    helpText:
      "Whether a reimbursed amount exceeding the amount paid/FMV is rejected. Source is silent (§20); default is to block.",
    group: "validation",
    type: "boolean",
    bookDefault: null,
    shippedDefault: true,
    decisionRequired: true,
    uiEditable: true,
    prospective: false,
    sourceRef: "§20",
    advanced: true,
  },
  {
    key: "de_minimis_threshold_minor",
    label: "De Minimis Threshold",
    helpText:
      "Small personal supplies under this value earn no slices. Source gives no number ('use your best judgment'); 0 disables the rule.",
    group: "validation",
    type: "currency",
    bookDefault: null,
    shippedDefault: 0,
    decisionRequired: false,
    uiEditable: true,
    prospective: false,
    sourceRef: "§9; EDGE-013",
    min: 0,
    advanced: true,
  },

  // ---------- CONTRIBUTION TYPES ----------
  {
    key: "enabled_contribution_types",
    label: "Enabled Contribution Types",
    helpText:
      "Turn off contribution types your company never uses to simplify entry forms.",
    group: "contribution_types",
    type: "enum_list",
    bookDefault: ALL_CONTRIBUTION_TYPES,
    shippedDefault: ALL_CONTRIBUTION_TYPES,
    decisionRequired: false,
    uiEditable: true,
    prospective: false,
    sourceRef: "§23",
  },
  {
    key: "project_tags",
    label: "Project / Category Tags",
    helpText:
      "Optional tags for organizing time and expenses by project. Reporting only — does not affect slice math.",
    group: "contribution_types",
    type: "string_list",
    bookDefault: [],
    shippedDefault: [],
    decisionRequired: false,
    uiEditable: true,
    prospective: false,
    sourceRef: "Ch.15 'Pie Settings — Projects'",
  },
];

/** Fast lookup by key. */
export const SETTING_DESCRIPTOR_MAP: Record<string, SettingDescriptor> =
  Object.fromEntries(SETTING_DESCRIPTORS.map((d) => [d.key, d]));

/** Ordered list of setting groups for tabbed rendering. */
export const SETTING_GROUP_ORDER: { group: string; label: string }[] = [
  { group: "core", label: "Core & Multipliers" },
  { group: "rates", label: "Rates" },
  { group: "time", label: "Time & Hours" },
  { group: "personal_car", label: "Personal Car" },
  { group: "advisor", label: "Advisors" },
  { group: "contractor", label: "Contractors" },
  { group: "referral", label: "Referrals" },
  { group: "recovery", label: "Recovery & Buyout" },
  { group: "freeze", label: "Freeze" },
  { group: "currency", label: "Currency" },
  { group: "contribution_types", label: "Contribution Types" },
  { group: "validation", label: "Validation & Precision" },
];
