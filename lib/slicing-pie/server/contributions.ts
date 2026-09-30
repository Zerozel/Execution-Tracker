// ============================================================
// Execution Tracker — Slicing Pie: Contribution Input Bridge
// ============================================================
// Bridges a raw API contribution request (type + free-form `inputs`)
// to the engine's strongly-typed PieContributionInput, injecting
// participant-terms values (FMV salary, contractor rate, hours
// override) that live outside the request body.
//
// It also computes the participant's cumulative advisor hours BEFORE
// the current event (needed for the §4.3 min-hours gate), by summing
// prior advisor_time contributions.
// ============================================================

import { createClient } from "@/lib/supabase";
import type {
  Contribution,
  ContributionType,
  ParticipantTermsVersion,
  PieParticipant,
  PieSettings,
} from "@/types/slicing-pie";
import type { PieContributionInput } from "@/lib/slicing-pie/engine/calculate";

/** Resolve the participant's terms effective on a given date. */
export async function resolveParticipantTerms(
  participantId: string,
  atDate: string
): Promise<ParticipantTermsVersion | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("participant_terms_versions")
    .select("*")
    .eq("participant_id", participantId);

  if (error || !data) return null;

  const applicable = (data as ParticipantTermsVersion[])
    .filter((t) => (t.effective_from || "") <= atDate)
    .sort((a, b) =>
      (b.effective_from || "").localeCompare(a.effective_from || "")
    );

  return applicable[0] ?? null;
}

/**
 * Sum a participant's prior advisor hours strictly before `beforeDate`.
 *
 * Every ledger row of type `advisor_time` is counted, including
 * correcting rows. The ledger is append-only, so a correction is a new
 * row carrying a NEGATIVE delta in the same `hours` field, and the sum
 * is what nets it out. Filtering on `status` here would silently keep
 * corrected hours in the total and inflate the §4.3 gate.
 */
export async function priorAdvisorHours(
  participantId: string,
  beforeDate: string
): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contributions")
    .select("inputs, event_date, type")
    .eq("participant_id", participantId)
    .eq("type", "advisor_time");

  if (error || !data) return 0;

  return (data as Pick<Contribution, "inputs" | "event_date">[])
    .filter((c) => (c.event_date || "") < beforeDate)
    .reduce((sum, c) => {
      const h = Number((c.inputs as Record<string, unknown>)?.hours ?? 0);
      return sum + (Number.isFinite(h) ? h : 0);
    }, 0);
}

/**
 * Every ledger row for a participant dated on or before `atDate`.
 *
 * Needed only to resolve a cash payment's drawdown (HARD-VAL-004): the
 * split between cash and non-cash at-risk contributions depends on what
 * the participant has actually contributed, and the pure engine cannot
 * see history. Exactly as with `priorAdvisorHours`, the server resolves
 * it and passes the answer into the engine.
 *
 * Every row counts and `status` is NOT filtered, matching the cap table
 * and planDrawdown: the ledger is append-only, so a correction is a
 * separate row carrying a delta, and filtering by status would count one
 * half of a correcting pair and not the other.
 *
 * Same-day rows are included. If someone earns and is paid on the same
 * date, the payment draws against the balance as it stands at the end of
 * that day, which is the reading most favourable to the participant.
 */
export async function participantAtRiskPortfolio(
  participantId: string,
  atDate: string
): Promise<Contribution[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contributions")
    .select("*")
    .eq("participant_id", participantId);

  if (error || !data) return [];

  return (data as Contribution[]).filter(
    (c) => (c.event_date || "") <= atDate
  );
}

interface BuildResult {
  input: PieContributionInput | null;
  error: string | null;
}

/**
 * Construct a typed engine input from the request. Returns an error
 * string if a required field for the given type is missing.
 *
 * `raw` is the request's `inputs` object; `terms` supplies salary/rate;
 * `priorHours` is the participant's cumulative advisor hours to date;
 * `participant` supplies the advisor cap opt-in, which is a property of
 * the person rather than of the entry (§4.3).
 */
export function buildEngineInput(
  type: ContributionType,
  raw: Record<string, unknown>,
  terms: ParticipantTermsVersion | null,
  priorHours: number,
  settings: PieSettings,
  participant?: Pick<PieParticipant, "advisor_cap_opt_in"> | null
): BuildResult {
  const num = (v: unknown): number | undefined =>
    v === undefined || v === null || v === "" ? undefined : Number(v);

  switch (type) {
    case "time": {
      const hours = num(raw.hours);
      const salary =
        num(raw.fair_market_salary_minor) ??
        terms?.fair_market_salary_minor ??
        undefined;
      if (hours == null) return { input: null, error: "hours is required" };
      if (salary == null)
        return {
          input: null,
          error: "fair_market_salary_minor (or participant terms) is required",
        };
      return {
        input: {
          type,
          hours,
          fair_market_salary_minor: salary,
          working_hours_override:
            terms?.working_hours_override ?? undefined,
        },
        error: null,
      };
    }

    case "contractor_time": {
      const hours = num(raw.hours);
      const rate =
        num(raw.contractor_rate_minor) ?? terms?.contractor_rate_minor ?? undefined;
      if (hours == null) return { input: null, error: "hours is required" };
      if (rate == null)
        return {
          input: null,
          error: "contractor_rate_minor (or participant terms) is required",
        };
      return {
        input: {
          type,
          hours,
          contractor_rate_minor: rate,
          paid_amount_minor: num(raw.paid_amount_minor),
        },
        error: null,
      };
    }

    case "advisor_time": {
      const hours = num(raw.hours);
      const rate = num(raw.hourly_rate_minor);
      if (hours == null) return { input: null, error: "hours is required" };
      if (rate == null)
        return { input: null, error: "hourly_rate_minor is required" };
      return {
        input: {
          type,
          hours,
          hourly_rate_minor: rate,
          cumulative_hours_before: priorHours,
          // §4.3: accepting the hourly-slice cap is what buys an advisor
          // protection from termination (HARD-VAL-002). It is a property
          // of the person, so it is read from the participant record and
          // must never be accepted from the request body — an advisor
          // cannot opt out of the cap to keep market-rate slices and
          // still claim the immunity. Absent a record, they are uncapped
          // and unprotected.
          cap_opt_in: participant?.advisor_cap_opt_in === true,
        },
        error: null,
      };
    }

    case "expense": {
      const amount = num(raw.amount_minor);
      if (amount == null)
        return { input: null, error: "amount_minor is required" };
      return {
        input: { type, amount_minor: amount, reimbursed_minor: num(raw.reimbursed_minor) },
        error: null,
      };
    }

    case "well_deposit":
    case "well_withdrawal":
    case "loan_payment":
    case "loan_missed_payment": {
      const amount = num(raw.amount_minor);
      if (amount == null)
        return { input: null, error: "amount_minor is required" };
      // Grouped labels leave `type` narrowed to a UNION of four literals,
      // but PieContributionInput is discriminated on `type`, so the
      // literal's discriminant has to resolve to one literal. The
      // assertion is safe because all four members have exactly the same
      // shape, and `amount_minor` is set right here.
      return {
        input: { type, amount_minor: amount } as PieContributionInput,
        error: null,
      };
    }

    case "equipment": {
      const fmv = num(raw.fmv_minor);
      const condition = raw.condition as
        | "new"
        | "preowned_lt_1yr"
        | "preowned_gte_1yr"
        | undefined;
      if (fmv == null) return { input: null, error: "fmv_minor is required" };
      if (!condition)
        return { input: null, error: "condition is required" };
      return {
        input: { type, fmv_minor: fmv, condition, reimbursed_minor: num(raw.reimbursed_minor) },
        error: null,
      };
    }

    case "idea_royalty":
    case "commission": {
      const revenue = num(raw.revenue_minor);
      if (revenue == null)
        return { input: null, error: "revenue_minor is required" };
      // IDEA-002 / SALES-002: only the UNREIMBURSED portion is at risk.
      // Cash already paid out on the same deal is not a contribution.
      // (Assertion as above: two grouped labels leave `type` a union,
      // and both members have the same shape.)
      return {
        input: {
          type,
          revenue_minor: revenue,
          cash_paid_minor: num(raw.cash_paid_minor),
        } as PieContributionInput,
        error: null,
      };
    }

    case "finder_fee": {
      const investment = num(raw.investment_minor);
      if (investment == null)
        return { input: null, error: "investment_minor is required" };
      return { input: { type, investment_minor: investment }, error: null };
    }

    case "partner_vendor": {
      const savings = num(raw.savings_minor);
      if (savings == null)
        return { input: null, error: "savings_minor is required" };
      return { input: { type, savings_minor: savings }, error: null };
    }

    case "referral": {
      return { input: { type, fee_minor: num(raw.fee_minor) }, error: null };
    }

    case "facilities": {
      const rent = num(raw.rent_fmv_minor);
      if (rent == null)
        return { input: null, error: "rent_fmv_minor is required" };
      // FACILITY-002: rent the Pie already paid is not at risk.
      return {
        input: {
          type,
          rent_fmv_minor: rent,
          cash_paid_minor: num(raw.cash_paid_minor),
        },
        error: null,
      };
    }

    case "personal_car": {
      return {
        input: {
          type,
          reimbursement_minor: num(raw.reimbursement_minor),
          fuel_minor: num(raw.fuel_minor),
          miles: num(raw.miles),
        },
        error: null,
      };
    }

    case "cash_payment_to_participant": {
      const amount = num(raw.amount_minor);
      if (amount == null)
        return { input: null, error: "amount_minor is required" };
      // A negative amount would be a demand for money back, which is not
      // what this type means. Clamping it silently would book a payment
      // that never happened, so refuse it outright.
      if (amount <= 0)
        return {
          input: null,
          error:
            "amount_minor must be greater than zero — this type records a payment made TO the participant",
        };

      // The cash/non-cash split is planned by the caller (the route) using
      // planDrawdown() against the participant's live at-risk balance, and
      // arrives in `raw`. If it were missing the payment would silently
      // become a no-op, leaving a row that reads as though it had paid
      // someone when it had not, so require it explicitly.
      const cashPart = num(raw.cash_drawdown_minor);
      const nonCashPart = num(raw.non_cash_drawdown_minor);
      if (cashPart == null || nonCashPart == null)
        return {
          input: null,
          error:
            "cash_drawdown_minor and non_cash_drawdown_minor are required — the drawdown must be planned against the participant's at-risk balance first",
        };

      return {
        input: {
          type,
          amount_minor: amount,
          cash_drawdown_minor: cashPart,
          non_cash_drawdown_minor: nonCashPart,
          overflow_minor: num(raw.overflow_minor) ?? 0,
        },
        error: null,
      };
    }

    case "other": {
      return {
        input: {
          type,
          slices: num(raw.slices),
          fmv_minor: num(raw.fmv_minor),
          multiplier_kind: raw.multiplier_kind as
            | "cash"
            | "non_cash"
            | "none"
            | undefined,
          label: typeof raw.label === "string" ? raw.label : undefined,
        },
        error: null,
      };
    }

    default:
      return { input: null, error: `Unsupported contribution type: ${type}` };
  }
}

/** Whether a type is enabled in the resolved settings. */
export function typeEnabled(
  type: ContributionType,
  settings: PieSettings
): boolean {
  return settings.enabled_contribution_types.includes(type);
}
