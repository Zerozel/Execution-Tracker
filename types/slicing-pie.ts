// ============================================================
// Execution Tracker — Slicing Pie Module Types
// ============================================================
// Faithful to "slicing-pie-software-requirements-extraction.md".
// Every rule/config referenced here carries its source RULE-ID or
// CONFIG-ID in comments for traceability.
//
// DESIGN PRINCIPLES (from the requirements doc):
//   1. Everything is a setting (21 CONFIG vars + policy decisions).
//   2. Setting changes are PROSPECTIVE ONLY — never rewrite history.
//      Each contribution stores a frozen `config_snapshot`.
//   3. Ambiguous/conflicting rules (§24–25) become explicit admin
//      decisions with shipped defaults, never silent assumptions.
// ============================================================

// ------------------------------------------------------------
// Enums (mirror intended PostgreSQL enums / check constraints)
// ------------------------------------------------------------

/** Pie-specific role. Distinct from the app-level `admin | member`. */
export type PieRole =
  | "owner"
  | "executive"
  | "employee"
  | "advisor"
  | "contractor"
  | "investor";

/** Participant lifecycle states (requirements §13). */
export type ParticipantStatus =
  | "candidate" // negotiating; no at-risk contribution yet
  | "active"
  | "departed" // separation logged; buyout pending
  | "bought_out" // slices removed from Pie
  | "absentee"; // retained slices, no buyout (dead equity)

export type PieStatus = "setup" | "active" | "frozen";

/** All contribution types the engine supports (requirements §4). */
export type ContributionType =
  | "time" // §4.1 employee/founder/executive
  | "contractor_time" // §4.2
  | "advisor_time" // §4.3
  | "expense" // §4.4 unreimbursed expenses
  | "well_deposit" // §4.5 (no slices)
  | "well_withdrawal" // §4.5 (slices at withdrawal)
  | "loan_payment" // §4.6
  | "loan_missed_payment" // §4.6
  | "equipment" // §4.7
  | "idea_royalty" // §4.8
  | "commission" // §4.9 sales
  | "finder_fee" // §4.10
  | "partner_vendor" // §4.11
  | "referral" // §4.12
  | "facilities" // §4.13
  | "personal_car" // §4.14
  // §15/§20 — a payment made BY the Pie TO a participant. The one type
  // that is a WITHDRAWAL rather than an earning: its fmv_minor and
  // slices are NEGATIVE, and the cap table's sum nets it out.
  | "cash_payment_to_participant"
  | "other"; // §4.15 bonus / spot / retrofit

export type ContributionStatus = "active" | "reversed" | "recalculated";

/** Which multiplier a contribution used. */
export type MultiplierKind = "cash" | "non_cash" | "none";

/** The four departure scenarios (requirements §14.1). */
export type DepartureReason =
  | "fired_good_reason" // bad leaver
  | "fired_no_good_reason" // good leaver
  | "resigned_good_reason" // good leaver
  | "resigned_no_good_reason"; // bad leaver

/** Bad leaver = employee at fault; Good leaver = company at fault. */
export type LeaverKind = "bad" | "good";

export type PersonalCarMethod = "simple" | "split"; // CONFIG-008

/** Multiplier used by the "simple" personal-car method. */
export type PersonalCarSimpleMultiplier = "cash" | "non_cash";

export type EquipmentCondition = "new" | "preowned_lt_1yr" | "preowned_gte_1yr";

export type BuyoutKind = "forced" | "voluntary";

export type FreezeTrigger = "breakeven" | "series_a";

/** How idea-royalty / rent-in-kind slices behave on a BAD-leaver exit.
 *  This is the single most significant conflict in the source (§24
 *  Conflict #1). Shipped default = "lost". */
export type RoyaltyRentRecoveryPolicy = "lost" | "continue" | "freeze";

/** Whether the working-hours-per-year divisor is global or per participant. */
export type WorkingHoursScope = "global" | "per_participant";

// ------------------------------------------------------------
// Tiered structures
// ------------------------------------------------------------

/** Finder's-fee tiers (CONFIG-006). */
export interface FinderFeeTiers {
  /** Cutoff amount in minor units (e.g. cents). Recommended $1,000,000. */
  cutoff_minor: number;
  /** Rate applied up to the cutoff (fraction, e.g. 0.05 = 5%). */
  pre_cutoff_rate: number;
  /** Rate applied above the cutoff (fraction, e.g. 0.025 = 2.5%). */
  post_cutoff_rate: number;
  /** Whether the multiplier is applied to the finder's-fee FMV.
   *  §24 Conflict #4 — Ch.15 table omits it; we default to `true`
   *  for consistency with every other contribution type. */
  apply_non_cash_multiplier: boolean;
}

/** Loyal-employee clause (CONFIG-013 / CONFIG-014). No book default. */
export interface LoyalEmployeeClause {
  mode: "off" | "months" | "percentage";
  /** Months before which slices are retained (mode = "months"). */
  months?: number;
  /** Percentage of slices retained (mode = "percentage"), fraction 0..1. */
  percentage?: number;
}

// ------------------------------------------------------------
// Resolved settings object — what the calculation engine consumes.
// This is the flat, typed shape produced by resolveConfig().
// ------------------------------------------------------------

export interface PieSettings {
  // Core multipliers
  non_cash_multiplier: number; // CONFIG-001, default 2
  cash_multiplier: number; // CONFIG-002, default 4

  // Time
  working_hours_per_year: number; // CONFIG-003, default 2000
  working_hours_scope: WorkingHoursScope; // decision (§24 Conflict #2)

  // Rates
  commission_rate: number; // CONFIG-004, default 0.10
  royalty_rate: number; // CONFIG-005, default 0.05
  finder_fee: FinderFeeTiers; // CONFIG-006

  // Currency & buyout
  currency: string; // CONFIG-007 (ISO 4217), no FX support
  buyout_rate_per_slice_minor: number; // CONFIG-021, default 100 ($1.00)

  // Personal car
  personal_car_method: PersonalCarMethod; // CONFIG-008
  personal_car_simple_multiplier: PersonalCarSimpleMultiplier;
  personal_car_mileage_rate_minor: number; // CONFIG-009, per mile/km

  // Advisor
  advisor_hourly_slice_cap: number; // CONFIG-010, default 200 slices/hr
  advisor_cap_editable: boolean; // §24 Ambiguity #3
  advisor_min_hours_threshold: number; // CONFIG-011, default 10
  advisor_min_hours_mode: "gate" | "unpaid_first"; // §4.3 mechanism decision

  // Contractor
  contractor_buyout_cap_pct: number; // CONFIG-012, default 2.0 (200%)
  contractor_buyout_window_days: number; // CONFIG-012, default 365

  // Referral
  referral_fee_minor: number; // CONFIG-015, default 250..500 → ship 25000 ($250)
  referral_waiting_period_days: number; // CONFIG-016, default 180

  // Loyal employee
  loyal_employee_clause: LoyalEmployeeClause; // CONFIG-013/014

  // Relocation / non-solicit / clawback
  relocation_good_reason_miles: number; // CONFIG-017, default 50
  clawback_window_days: number; // CONFIG-018, default 365
  non_solicitation_period_days: number; // CONFIG-019, default 365

  // Partner/vendor
  partner_vendor_savings_rate: number; // CONFIG-020, default 0.05

  // Recovery policy decisions (§25)
  royalty_rent_bad_leaver_policy: RoyaltyRentRecoveryPolicy; // default "lost"
  clawback_formula: "per_slice_delta"; // §14.4 (only implemented option)

  // Freeze
  freeze_reversible: boolean; // §17 decision, default false
  series_a_auto_threshold_minor: number | null; // §17, default null (manual)

  // Validation / precision decisions
  slice_decimal_places: number; // §12 rounding, default 4
  percent_decimal_places: number; // §12 rounding, default 2
  block_over_reimbursement: boolean; // §20 decision, default true
  de_minimis_threshold_minor: number; // §9 decision, default 0 (off)
  high_hours_warn_threshold: number; // WARN-001, default 60 (per week)

  // Contribution-type enablement (admin can disable types they don't use)
  enabled_contribution_types: ContributionType[];

  // Custom project/category tags for time logging (§19)
  project_tags: string[];
}

// ------------------------------------------------------------
// Config schema descriptors — drive the UI + validation.
// The Settings Console renders editors FROM these so code & UI
// can never drift.
// ------------------------------------------------------------

export type SettingGroup =
  | "core"
  | "rates"
  | "time"
  | "personal_car"
  | "advisor"
  | "contractor"
  | "referral"
  | "recovery"
  | "freeze"
  | "currency"
  | "validation"
  | "contribution_types"
  | "advanced";

export type SettingValueType =
  | "multiplier"
  | "number"
  | "percent"
  | "currency"
  | "currency_per_unit"
  | "duration_days"
  | "boolean"
  | "enum"
  | "string_list"
  | "tiered_finder_fee"
  | "loyal_employee_clause"
  | "enum_list";

export interface SettingOption {
  value: string;
  label: string;
}

export interface SettingDescriptor {
  /** Key into PieSettings. */
  key: keyof PieSettings;
  /** CONFIG-00x reference where applicable. */
  configRef?: string;
  label: string;
  helpText: string;
  group: SettingGroup;
  type: SettingValueType;
  /** Book-stated default (null when the source gives none → decision). */
  bookDefault: unknown;
  /** What we ship as the working default (may equal bookDefault). */
  shippedDefault: unknown;
  /** True when the source provides no default and admin MUST decide (§25). */
  decisionRequired: boolean;
  /** Whether this is editable through the admin UI (vs code-only). */
  uiEditable: boolean;
  /** Whether edits apply prospectively only (nearly all do). */
  prospective: boolean;
  /** Human-readable source citation. */
  sourceRef: string;
  /** For enum types. */
  options?: SettingOption[];
  /** Hidden behind an "Advanced / Danger" disclosure. */
  advanced?: boolean;
  min?: number;
  max?: number;
}

// ------------------------------------------------------------
// Human-decision registry (§25) — surfaced in setup wizard.
// ------------------------------------------------------------

export interface HumanDecision {
  id: string; // e.g. "DECISION-ROYALTY-RENT"
  title: string;
  /** The ambiguity/conflict summarized from §24. */
  description: string;
  /** Which PieSettings key(s) this decision controls. */
  settingKeys: (keyof PieSettings)[];
  sourceRef: string;
  priority: "high" | "medium" | "low";
}

// ------------------------------------------------------------
// Database entities
// ------------------------------------------------------------

export interface Pie {
  id: string;
  name: string;
  currency: string;
  status: PieStatus;
  created_by: string | null;
  created_at: string;
  frozen_at: string | null;
}

export interface PieSettingsVersion {
  id: string;
  pie_id: string;
  /** Partial overrides layered on top of shipped defaults. */
  settings: Partial<PieSettings>;
  effective_from: string; // date
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export interface PieParticipant {
  id: string;
  pie_id: string;
  user_id: string | null; // may be an external contributor
  display_name: string;
  pie_role: PieRole;
  status: ParticipantStatus;
  advisor_cap_opt_in: boolean; // §4.3 immunity trade-off
  joined_at: string | null;
  created_at: string;
}

export interface ParticipantTermsVersion {
  id: string;
  participant_id: string;
  fair_market_salary_minor: number | null; // annual, for time
  contractor_rate_minor: number | null; // hourly, for contractors
  working_hours_override: number | null; // per-participant hours/yr
  effective_from: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

/** A single immutable ledger entry. */
export interface Contribution {
  id: string;
  pie_id: string;
  participant_id: string;
  type: ContributionType;
  event_date: string;
  /** Raw type-specific inputs (hours, amounts, etc.). */
  inputs: Record<string, unknown>;
  /** Frozen resolved settings used at calc time (audit + prospective). */
  config_snapshot: PieSettings;
  fmv_minor: number;
  multiplier_kind: MultiplierKind;
  multiplier_applied: number;
  slices: number;
  notes: string | null;
  evidence_url: string | null;
  project_tag: string | null;
  status: ContributionStatus;
  /** If this row reverses/recalculates another (recovery, buyout). */
  reverses_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Well {
  id: string;
  pie_id: string;
  balance_minor: number;
  created_at: string;
}

export interface WellTransaction {
  id: string;
  well_id: string;
  participant_id: string | null;
  kind: "deposit" | "withdrawal";
  amount_minor: number;
  /** For deposits: optional finder's-fee recipient. */
  finder_fee_recipient_id: string | null;
  /** For withdrawals: snapshot of per-owner allocation used. */
  allocation_snapshot: Record<string, number> | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Departure {
  id: string;
  participant_id: string;
  reason: DepartureReason;
  leaver_kind: LeaverKind;
  departure_date: string;
  /** Justification / evidence (e.g. the two required warnings). */
  justification: string | null;
  evidence_url: string | null;
  /** Snapshot of the recovery recalculation applied. */
  recovery_snapshot: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
}

export interface Buyout {
  id: string;
  participant_id: string;
  kind: BuyoutKind;
  slices_bought: number;
  rate_per_slice_minor: number;
  amount_minor: number;
  executed_at: string | null;
  /** Clawback monitoring window end (departure_date + clawback_window). */
  clawback_until: string | null;
  clawback_paid_minor: number | null;
  created_by: string | null;
  created_at: string;
}

export interface PieFreeze {
  id: string;
  pie_id: string;
  trigger: FreezeTrigger;
  /** Frozen ownership snapshot: participant_id → { slices, pct }. */
  ownership_snapshot: Record<string, { slices: number; pct: number }>;
  reversible: boolean;
  reactivated_at: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  pie_id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  effective_from: string | null;
  created_at: string;
}

// ------------------------------------------------------------
// Calculation input/output (engine contracts)
// ------------------------------------------------------------

/** Result of a slice computation for a single contribution event. */
export interface SliceComputation {
  fmv_minor: number;
  multiplier_kind: MultiplierKind;
  multiplier_applied: number;
  slices: number;
  /** Human-readable breakdown for the live-preview UI. */
  explanation: string[];
  /** Non-blocking warnings (WARN-001..004, EDGE cases). */
  warnings: string[];
}

/** A row in an ownership / cap-table snapshot. */
export interface OwnershipRow {
  participant_id: string;
  display_name: string;
  pie_role: PieRole;
  status: ParticipantStatus;
  slices: number;
  pct: number;
  by_type: Partial<Record<ContributionType, number>>;
}

export interface CapTable {
  pie_id: string;
  as_of: string;
  total_slices: number;
  frozen: boolean;
  rows: OwnershipRow[];
}

// ------------------------------------------------------------
// API envelope (matches the app-wide { data, error } convention)
// ------------------------------------------------------------

export interface PieApiResponse<T> {
  data: T | null;
  error: string | null;
}
