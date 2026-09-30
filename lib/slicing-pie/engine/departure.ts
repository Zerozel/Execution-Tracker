// ============================================================
// Execution Tracker — Slicing Pie: Departure / Recovery / Buyout
// ============================================================
// Implements the separation rules (§14):
//   • Four scenarios map to good-leaver vs bad-leaver (§14.1).
//   • Recovery recalculation (§14.2):
//       - BAD leaver  → intangible slices forfeited (×0); cash and
//                       tangible slices RETAINED at cash value, i.e.
//                       "the amount of cash spent times one" — the
//                       multiplier is removed, not kept.
//       - GOOD leaver → keeps ALL slices, multiplier included.
//     Royalty/rent-in-kind slices follow the configurable policy
//     (§24 Conflict #1): "lost" | "continue" | "freeze".
//   • Buyout price (§14.3) = retained slices × buyout_rate_per_slice.
//   • Clawback (§14.4) = (sale price/slice − buyout rate/slice) ×
//     retained slices, if a higher-value event occurs within the
//     clawback window; never negative.
//
// Recovery is adjudicated in AGGREGATE, not row by row. A participant who
// has already been paid has a payment row that drew on two buckets of
// contributions at once, and no per-row pass can attribute it correctly —
// see `attributePaymentDrawdowns` for the whole argument, and
// `RecoveryRowDetail` for what each row's numbers mean.
//
// Pure functions over an explicit list of the departing participant's
// contributions + settings. No I/O.
// ============================================================

import type {
  Contribution,
  DepartureReason,
  LeaverKind,
  PieSettings,
} from "@/types/slicing-pie";
import { fromMinor, roundSlices, safeDivide } from "../format";
import { slicesFromMinor } from "./calculate";
import {
  deMultipliedSlices,
  recoveryCategory,
  retainedAtCashValue,
} from "./recovery-categories";

// ------------------------------------------------------------
// Scenario → leaver classification (§14.1)
// ------------------------------------------------------------
// Bad leaver  = employee at fault  → fired WITH good reason,
//               or resigned WITHOUT good reason.
// Good leaver = company at fault    → fired WITHOUT good reason,
//               or resigned WITH good reason.
export function classifyLeaver(reason: DepartureReason): LeaverKind {
  switch (reason) {
    case "fired_good_reason":
    case "resigned_no_good_reason":
      return "bad";
    case "fired_no_good_reason":
    case "resigned_good_reason":
      return "good";
  }
}

// Category (cash / tangible / royalty / rent / intangible) is declared
// explicitly in ./recovery-categories, NOT inferred from which
// multiplier the engine happened to apply — see that module's header
// for why that distinction matters.

/**
 * A ledger row this module cannot adjudicate. When any of these is
 * present the rest of the `RecoveryResult` is meaningless and MUST NOT
 * be written to the ledger — see `computeRecovery`.
 *
 * Nothing is currently expected to produce one: the payment case that
 * used to land here is now handled by aggregate adjudication (below).
 * The channel is kept because it is the last line of defence — if the
 * arithmetic is ever asked for a figure outside the range the ledger
 * can support (a negative holding, or more than the person holds), the
 * only safe answer is to refuse and say so rather than append a
 * plausible-looking wrong number.
 */
export interface RecoveryBlocker {
  contribution_id: string;
  type: Contribution["type"];
  reason: string;
}

/** One row's outcome, with enough detail to re-derive its correction. */
export interface RecoveryRowDetail {
  contribution_id: string;
  type: Contribution["type"];
  /** Slices on the row as recorded (negative for a correction/payment). */
  slices: number;
  /** What this row contributes to the participant's holding afterwards. */
  kept: number;
  /** `slices − kept`. NEGATIVE on a payment row — see `standing` and `why`. */
  forfeited: number;
  /**
   * Slices of this row still economically held once every payment's
   * drawdown has been attributed to the rows it consumed. Equals
   * `slices` unless a payment was made; the difference is exactly what
   * the payment took from this row.
   */
  standing: number;
  /** At-risk value still un-consumed on this row, in minor units. */
  remaining_fmv_minor: number;
  /** Value this row carries after recovery, in minor units. */
  retained_fmv_minor: number;
  reason: string;
}

export interface RecoveryResult {
  leaver_kind: LeaverKind;
  /** Slices the departing participant retains after recovery. */
  retained_slices: number;
  /**
   * Slices forfeited back to the Pie.
   *
   * This is the exact complement of `retained_slices`, not an independent
   * reading: it is computed as `Σ(row.slices) − retained_slices`, so for
   * any ledger and any policy
   *
   *     retained_slices + forfeited_slices === Σ(row.slices)
   *
   * i.e. everything the participant held the day they left. Note what
   * that makes forfeited include on a bad-leaver exit: not only the
   * intangible slices (time, commission) but also the UPLIFT stripped off
   * cash and tangible rows by de-multiplying them (a $200 expense booked
   * at ×4 keeps 200 slices and forfeits 600). Those 600 go back to the
   * Pie — they are why the remaining participants' percentages rise —
   * even though the $200 of VALUE behind them stays with the leaver.
   * Slices and value are different ledgers; do not read one as the other.
   *
   * Anything displaying these two numbers should display them together,
   * or a reader will go looking for the shortfall.
   */
  forfeited_slices: number;
  /**
   * Non-empty when the ledger contains rows this pass cannot evaluate.
   * Everything else in the result is then a placeholder, not an answer.
   */
  blockers: RecoveryBlocker[];
  /** Per-contribution decisions, for the audit snapshot + UI. */
  detail: RecoveryRowDetail[];
  explanation: string[];
}

// ------------------------------------------------------------
// Phase 1 — attribute each payment's drawdown to what it consumed
// ------------------------------------------------------------
// This is the piece that makes a departure possible at all for someone
// who has already been paid.
//
// A payment row records ONE negative slice figure and one negative cash
// figure, but the money it removed came out of two different buckets —
// cash-type and non-cash-type contributions. A per-row pass can only
// attribute the whole row to one category, which is how it used to end
// up allocating NEGATIVE slices (the very thing HARD-VAL-004 forbids).
//
// So the drawdown is replayed here and attributed, in slices, to the
// rows it actually drew from: the cash/tangible portion spread across
// the cash/tangible rows, the rest across the others, each in proportion
// to what it still holds. A payment's own row is then held to `kept = 0`
// (see `computeRecovery`): its slice effect MOVES to the rows it
// consumed, and its money is left exactly where history put it.
//
// What gets taken off those rows is the payment's OWN slice count, not a
// fresh conversion of the money. `planDrawdown` measured that count
// against these same rows when the payment was made, so replaying it is
// exact — and exactness is what the arithmetic needs, because the
// payment row corrects by precisely `+that count`. Re-converting the
// money here would be the same mistake the payment path used to make: a
// bucket is not one multiplier, so money × the bucket's headline
// multiplier is not the slices those rows hold.
//
// The money split is still read from the row's own `inputs`, where the
// payment path froze it at the time (see planDrawdown in ./policy).
// Where it is absent — a row written before the split was recorded — it
// is solved from the row itself: |fmv| = cash + non-cash, and
// |slices| = cash × cashMultiplier + non-cash × nonCashMultiplier, which
// is two equations in the two unknowns. That solved split only decides
// the PROPORTION between the two buckets, so an inexact solve costs
// attribution accuracy, never the total.

export interface PaymentAttribution {
  payment_id: string;
  /** Money drawn from the cash/tangible bucket, in minor units. */
  cash_minor: number;
  /** Money drawn from the other buckets, in minor units. */
  non_cash_minor: number;
  /** Slices taken off the cash/tangible rows. */
  cash_slices: number;
  /** Slices taken off the non-cash rows. */
  non_cash_slices: number;
  /** True when the split had to be solved from the row instead of read. */
  derived: boolean;
}

function readNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** How a payment split itself across the two buckets. */
export interface PaymentDrawdownShape {
  /** Money drawn from the cash/tangible bucket, in minor units. */
  cash_minor: number;
  /** Money drawn from the other buckets, in minor units. */
  non_cash_minor: number;
  /** Slices the cash/tangible portion removed. */
  cash_slices: number;
  /** Slices the rest removed. */
  non_cash_slices: number;
  /** True when the row did not carry its split and it had to be solved. */
  derived: boolean;
}

/**
 * The split a payment applied: how much money came out of each bucket,
 * and how many slices that took off the rows in it.
 *
 * The row stores both, frozen when the payment was made (see
 * planDrawdown in ./policy), and they are used as recorded. They are not
 * re-derived, because they cannot be: the slice figure depends on which
 * rows the money drew on and what they were booked at, and a bucket
 * holds rows at more than one multiplier — cash at ×4 alongside
 * equipment at ×2. Money × the bucket's headline multiplier is not the
 * slices those rows hold, and can exceed them.
 *
 * A row written before those figures were recorded falls back to
 * solving/re-deriving, which is exactly what the payment path itself
 * used to do — so those older rows still land on their own total and the
 * arithmetic closes. See `attributePaymentDrawdowns`.
 */
export function paymentDrawdownShape(
  payment: Contribution,
  settings: PieSettings
): PaymentDrawdownShape {
  const dp = settings.slice_decimal_places;
  const inputs = (payment.inputs ?? {}) as Record<string, unknown>;
  const totalSlices = Math.abs(payment.slices);

  const cash = readNumber(inputs.cash_drawdown_minor);
  const nonCash = readNumber(inputs.non_cash_drawdown_minor);

  let cashMinor: number;
  let nonCashMinor: number;
  let derived = false;

  if (cash !== null && nonCash !== null) {
    cashMinor = Math.max(0, cash);
    nonCashMinor = Math.max(0, nonCash);
  } else {
    derived = true;
    // Solve the money split. Value and slices are both absolute here:
    // the sign of a payment row is an artefact of it being a withdrawal.
    const valueTotal = Math.abs(payment.fmv_minor);
    const cm = settings.cash_multiplier;
    const nm = settings.non_cash_multiplier;

    // Equal multipliers leave the split undetermined and don't matter:
    // every split removes the same number of slices. Put it all on cash.
    if (cm === nm || valueTotal === 0) {
      cashMinor = valueTotal;
      nonCashMinor = 0;
    } else {
      // nonCash = (100·slices − value·multCash) / (multNonCash − multCash)
      const solved = (100 * totalSlices - valueTotal * cm) / (nm - cm);
      nonCashMinor = Math.min(Math.max(0, Math.round(solved)), valueTotal);
      cashMinor = valueTotal - nonCashMinor;
    }
  }

  const recordedCashSlices = readNumber(inputs.cash_drawdown_slices);
  const recordedNonCashSlices = readNumber(inputs.non_cash_drawdown_slices);

  let cashSlices: number;
  let nonCashSlices: number;

  if (recordedCashSlices !== null && recordedNonCashSlices !== null) {
    cashSlices = Math.max(0, recordedCashSlices);
    nonCashSlices = Math.max(0, recordedNonCashSlices);
  } else {
    // Legacy row. Convert the money the way the payment path did when it
    // wrote this row, then normalise those two figures onto the row's
    // own slice total so the replay always lands exactly.
    const legacyCash = slicesFromMinor(cashMinor, "cash", settings);
    const legacyNonCash = slicesFromMinor(nonCashMinor, "non_cash", settings);
    const legacyTotal = legacyCash + legacyNonCash;
    if (legacyTotal > 0) {
      cashSlices = roundSlices(totalSlices * (legacyCash / legacyTotal), dp);
    } else {
      cashSlices = totalSlices;
    }
    nonCashSlices = Math.max(0, roundSlices(totalSlices - cashSlices, dp));
  }

  return {
    cash_minor: cashMinor,
    non_cash_minor: nonCashMinor,
    cash_slices: roundSlices(cashSlices, dp),
    non_cash_slices: roundSlices(nonCashSlices, dp),
    derived,
  };
}

/**
 * Take `sliceAmount` off the rows in one bucket, in proportion to what
 * each still holds. Nothing is taken from a row that has nothing left.
 * Returns how much was actually taken, so a caller can tell whether the
 * whole request landed.
 */
function consumeBucket(
  sliceAmount: number,
  bucket: "cash" | "non_cash",
  contributions: Contribution[],
  standing: Map<string, number>,
  dp: number
): number {
  if (sliceAmount <= 0) return 0;

  let pool = 0;
  const members: Contribution[] = [];
  for (const c of contributions) {
    if (c.type === "cash_payment_to_participant") continue;
    const inBucket =
      retainedAtCashValue(recoveryCategory(c.type)) === (bucket === "cash");
    if (!inBucket) continue;
    const held = standing.get(c.id) ?? 0;
    if (held <= 0) continue;
    members.push(c);
    pool += held;
  }
  if (pool <= 0) return 0;

  // Deterministic order (largest holding first, then id) so the same
  // ledger always attributes the same way. A payment can never remove
  // more than the bucket holds — the money was capped at the balance
  // when it was made, and the slice figure measured against these same
  // rows — but if a hand-written row ever did, the excess is dropped
  // rather than driven negative, and the caller reports the shortfall.
  members.sort((a, b) => {
    const diff = (standing.get(b.id) ?? 0) - (standing.get(a.id) ?? 0);
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });

  const take = Math.min(sliceAmount, pool);

  // Every share is worked out from the holdings as they were BEFORE
  // anything is taken — one pass, over a fixed `pool`. The last member
  // absorbs the rounding residue, so the shares always add back to
  // exactly `take`. (Deriving a later share from a holding that an
  // earlier share had already reduced over-consumes the bucket: 200
  // slices spread across holdings of 1000 and 500 would take 218.)
  const shares: number[] = [];
  let assigned = 0;
  for (let i = 0; i < members.length; i++) {
    if (i === members.length - 1) {
      shares.push(roundSlices(take - assigned, dp));
    } else {
      const held = standing.get(members[i].id) ?? 0;
      const share = roundSlices(take * (held / pool), dp);
      shares.push(share);
      assigned = roundSlices(assigned + share, dp);
    }
  }

  let applied = 0;
  members.forEach((c, i) => {
    const held = standing.get(c.id) ?? 0;
    const takeFromRow = Math.min(Math.max(0, shares[i]), held);
    standing.set(c.id, roundSlices(held - takeFromRow, dp));
    applied = roundSlices(applied + takeFromRow, dp);
  });
  return applied;
}

/**
 * Replay every payment in event order and return, per row, how many of
 * its slices are still standing when the money has been accounted for.
 *
 * The total to take off the rows is the payment's own slice count, read
 * straight from the row. That is deliberate: `planDrawdown` measured it
 * against these very rows when the payment was made, so replaying it
 * cannot drift, and the arithmetic is guaranteed to close — the payment
 * row corrects by exactly `+that figure` and the consumption takes
 * exactly `that figure` off the rows it drew on. The money split is
 * used for one thing only: what PROPORTION of it came out of the
 * cash/tangible bucket rather than the rest.
 *
 * `unattributed` is the part of a payment's slice count that could not
 * be laid on any row. It should always be zero; a non-zero value means
 * the ledger holds something this replay cannot explain, and the caller
 * refuses to produce figures rather than write a number that will never
 * be questioned again.
 */
export function attributePaymentDrawdowns(
  contributions: Contribution[],
  settings: PieSettings
): {
  standing: Map<string, number>;
  attributions: PaymentAttribution[];
  unattributed: number;
} {
  const dp = settings.slice_decimal_places;
  const standing = new Map<string, number>(
    contributions.map((c) => [c.id, roundSlices(c.slices, dp)])
  );
  const attributions: PaymentAttribution[] = [];
  let unattributed = 0;

  const payments = contributions
    .filter((c) => c.type === "cash_payment_to_participant")
    .sort((a, b) => {
      if (a.event_date !== b.event_date) {
        return a.event_date.localeCompare(b.event_date);
      }
      return a.id.localeCompare(b.id);
    });

  for (const p of payments) {
    const shape = paymentDrawdownShape(p, settings);
    const totalSlices = roundSlices(Math.abs(p.slices), dp);
    const requested = roundSlices(
      shape.cash_slices + shape.non_cash_slices,
      dp
    );
    // The shape is normalised onto the row's own slice total on every
    // path but "both figures recorded", and those are written by the
    // same code that writes the row's slices. If they ever disagree, the
    // difference is reported rather than absorbed.
    unattributed = roundSlices(unattributed + (totalSlices - requested), dp);

    const takenCash = consumeBucket(
      shape.cash_slices,
      "cash",
      contributions,
      standing,
      dp
    );
    const takenNonCash = consumeBucket(
      shape.non_cash_slices,
      "non_cash",
      contributions,
      standing,
      dp
    );
    unattributed = roundSlices(
      unattributed + (requested - takenCash - takenNonCash),
      dp
    );

    attributions.push({
      payment_id: p.id,
      cash_minor: shape.cash_minor,
      non_cash_minor: shape.non_cash_minor,
      cash_slices: shape.cash_slices,
      non_cash_slices: shape.non_cash_slices,
      derived: shape.derived,
    });
  }

  return { standing, attributions, unattributed };
}

/**
 * Recalculate a departing participant's slices per the separation rules.
 *
 * Bad leaver:
 *   • cash / tangible   → retained at value ("cash spent times one"),
 *                          but only the part still at risk of loss: a
 *                          payment already made against it has bought
 *                          that value back.
 *   • royalty / rent    → per the configured §24 policy.
 *   • everything else   → forfeited (subject to the loyal-employee clause).
 * Good leaver keeps everything, uncleaned.
 */
export function computeRecovery(
  reason: DepartureReason,
  contributions: Contribution[],
  settings: PieSettings,
  opts: { loyalMonthsMet?: boolean } = {}
): RecoveryResult {
  const leaver = classifyLeaver(reason);
  const dp = settings.slice_decimal_places;
  const explanation: string[] = [
    `Scenario "${reason}" ⇒ ${leaver} leaver.`,
  ];

  const totalHeld = roundSlices(
    contributions.reduce((sum, c) => sum + c.slices, 0),
    dp
  );

  const { standing, attributions, unattributed } = attributePaymentDrawdowns(
    contributions,
    settings
  );
  if (attributions.length > 0) {
    explanation.push(
      `Attributing ${attributions.length} payment${attributions.length === 1 ? "" : "s"} to the contributions they consumed: ${attributions
        .map(
          (a) =>
            `${a.cash_slices} slice${Math.abs(a.cash_slices) === 1 ? "" : "s"} off cash/tangible + ${a.non_cash_slices} off the rest`
        )
        .join("; ")}.`
    );
  }

  const detail: RecoveryRowDetail[] = [];
  let retained = 0;

  // Every ledger row is considered — including reversing rows from an
  // earlier correction, which carry negative slices and therefore
  // subtract themselves back out. (See ./captable: `status` is
  // informational and must never be used as a filter.)
  for (const c of contributions) {
    const rowSlices = roundSlices(c.slices, dp);
    const standingSlices = roundSlices(standing.get(c.id) ?? rowSlices, dp);

    // ---- Payment rows: the money stays, the slices move ----
    // The payment's slice effect has been attributed to the rows it
    // consumed above, so counting it here as well would remove those
    // slices twice. `kept = 0` is therefore what makes the arithmetic
    // work out: the row's −N slices and its +N correction cancel, and
    // the consumption lands where it belongs. Its VALUE is untouched —
    // money that left the Pie is a fact, not a policy question.
    if (c.type === "cash_payment_to_participant") {
      detail.push({
        contribution_id: c.id,
        type: c.type,
        slices: rowSlices,
        kept: 0,
        forfeited: rowSlices,
        standing: rowSlices,
        remaining_fmv_minor: c.fmv_minor,
        retained_fmv_minor: c.fmv_minor,
        reason:
          "Cash payment to the participant — its money stands as recorded, and its slice effect is re-attributed to the contributions it drew down.",
      });
      continue;
    }

    // ---- Value still un-consumed on this row ----
    // De-multiplied value is "cash spent times one"; scaling it by the
    // standing share says how much of that value is still at risk once
    // any payment against it has been taken into account. Rows that hold
    // no slices (corrections, reversals) have nothing to scale.
    const rowValueMinor = Math.round(deMultipliedSlices(c, dp) * 100);
    const remainingMinor =
      rowSlices > 0
        ? Math.round(rowValueMinor * (standingSlices / rowSlices))
        : 0;

    let kept = rowSlices;
    let why = "";
    /** Fraction of the remaining at-risk value the participant keeps. */
    let valueFraction = 1;

    if (leaver === "good") {
      // Good leaver keeps everything, multiplier included.
      why = "Good leaver keeps all slices.";
    } else if (rowSlices <= 0) {
      // A correction or reversal row is already a net delta. There is
      // nothing left to recover on it, and pushing it further would add
      // slices back to the participant.
      why = "Correction row — left as recorded.";
    } else {
      // Bad leaver.
      const category = recoveryCategory(c.type);

      if (retainedAtCashValue(category)) {
        // "Cash contributions and the fair market value of tangible
        // property are the amount of cash spent times one" — the
        // multiplier is REMOVED (×4 → ×1, ×2 → ×1). Never more than the
        // participant still holds, and never more than they still have
        // at risk: value a payment has already bought back is not
        // retained a second time.
        const atRiskMajor = remainingMinor / 100;
        kept = roundSlices(Math.min(atRiskMajor, standingSlices), dp);
        why =
          category === "cash"
            ? "Cash contribution — retained at cash value (multiplier removed, ×1), net of anything already paid."
            : "Tangible property — retained at fair-market value (multiplier removed, ×1), net of anything already paid.";
      } else if (category === "royalty" || category === "rent") {
        // Special policy (§24 Conflict #1).
        switch (settings.royalty_rent_bad_leaver_policy) {
          case "continue":
            kept = standingSlices;
            why = "Royalty/rent policy = continue: retained.";
            break;
          case "freeze":
            kept = standingSlices;
            why = "Royalty/rent policy = freeze: retained at departure value.";
            break;
          case "lost":
          default:
            kept = 0;
            valueFraction = 0;
            why = "Royalty/rent policy = lost: forfeited.";
            break;
        }
      } else {
        // Ordinary non-cash (time, commission, etc.) forfeited.
        // Loyal-employee clause may retain some, but only for the
        // "resigned_no_good_reason" scenario.
        const loyal = settings.loyal_employee_clause;
        if (reason === "resigned_no_good_reason" && loyal.mode !== "off") {
          if (loyal.mode === "percentage" && loyal.percentage) {
            kept = roundSlices(standingSlices * loyal.percentage, dp);
            valueFraction = loyal.percentage;
            why = `Loyal-employee clause: retained ${(loyal.percentage * 100).toFixed(0)}%.`;
          } else if (loyal.mode === "months") {
            if (opts.loyalMonthsMet) {
              kept = standingSlices;
              why = `Loyal-employee clause: tenure met, retained.`;
            } else {
              kept = 0;
              valueFraction = 0;
              why = `Non-cash forfeited (loyal tenure not met).`;
            }
          } else {
            kept = 0;
            valueFraction = 0;
            why = "Non-cash contribution forfeited (bad leaver).";
          }
        } else {
          kept = 0;
          valueFraction = 0;
          why = "Non-cash contribution forfeited (bad leaver).";
        }
      }
    }

    // The row carries its full recorded value minus whatever is written
    // off. Where nothing is written off, the correction is nil — which is
    // deliberate for cash: the money the participant spent is still
    // theirs, and the payment that repaid it is recorded on its own row.
    const retainedFmvMinor = Math.round(
      c.fmv_minor - remainingMinor * (1 - valueFraction)
    );

    retained += kept;
    detail.push({
      contribution_id: c.id,
      type: c.type,
      slices: rowSlices,
      kept: roundSlices(kept, dp),
      forfeited: roundSlices(rowSlices - kept, dp),
      standing: standingSlices,
      remaining_fmv_minor: remainingMinor,
      retained_fmv_minor: retainedFmvMinor,
      reason: why,
    });
  }

  retained = roundSlices(retained, dp);
  const forfeited = roundSlices(totalHeld - retained, dp);

  // The arithmetic above cannot produce either of these: retention is
  // bounded by what each row still holds, and the holds sum to the
  // ledger. If it ever did, the ledger contains something this pass does
  // not understand — and a plausible-looking wrong number in an
  // append-only ledger is worse than a stopped workflow, because it
  // records itself consistently and is never questioned again.
  const unplaced =
    Math.abs(unattributed) > 1e-9
      ? `A payment's slice count could not be fully laid on the rows it should have drawn from (${unattributed} slice${Math.abs(unattributed) === 1 ? "" : "s"} unaccounted for). Correcting the payment row without placing those slices would leave the cap table disagreeing with this report.`
      : "";
  const blockers: RecoveryBlocker[] = [];
  if (unplaced) {
    const p = contributions.find(
      (c) => c.type === "cash_payment_to_participant"
    );
    blockers.push({
      contribution_id: p?.id ?? contributions[0]?.id ?? "unknown",
      type: p?.type ?? "cash_payment_to_participant",
      reason: unplaced,
    });
  }
  if (retained < 0 || retained > totalHeld) {
    blockers.push({
      contribution_id: contributions[0]?.id ?? "unknown",
      type: contributions[0]?.type ?? "other",
      reason: `Aggregate recovery landed outside the range the ledger can support (retained ${retained} of ${totalHeld} held). This means a ledger row could not be adjudicated. Nothing should be written — please report this ledger.`,
    });
  }

  explanation.push(
    `Held ${totalHeld} slices at departure; retained ${retained}; ${forfeited} returned to the Pie.`
  );

  return {
    leaver_kind: leaver,
    retained_slices: retained,
    forfeited_slices: forfeited,
    blockers,
    detail,
    explanation,
  };
}


// ------------------------------------------------------------
// Recovery → ledger rows (append-only, §14 + §21)
// ------------------------------------------------------------
// The ledger is append-only, so a recovery is not applied by editing
// the rows it affects. It is applied by inserting, for each affected
// row, a single compensating row that carries the DELTA — how many
// slices and how much at-risk value the departure removes. The cap
// table sums every row, so original + delta = the amount retained.
//
// The subtlety worth stating: removing the multiplier changes SLICES
// but not VALUE. A participant who spent $200 of cash holds 800 slices
// (×4). On a bad-leaver exit they keep the $200 of value — but at ×1,
// so 200 slices. The delta is therefore −600 slices and $0 of value,
// not −600 slices and −$150 of value. Value only falls when the
// contribution itself is lost (forfeited intangibles, or a
// royalty/rent row on the "lost" policy).
export interface RecoveryLedgerEntry {
  /** The ledger row this entry corrects. */
  contribution_id: string;
  /** Slice delta to insert (negative removes slices). */
  slices: number;
  /** At-risk-value delta to insert, in minor units. */
  fmv_minor: number;
  /** Copied from the original row so the entry reads sensibly. */
  type: Contribution["type"];
  reason: string;
  /**
   * Hour delta, for rows that recorded hours (time, contractor_time,
   * advisor_time). Without it a cumulative-hours gate replayed from the
   * ledger (§4.3) would still see the corrected hours as standing.
   * Absent when the original carried no usable hour figure, or when
   * the row kept no slices to prorate against.
   */
  hours?: number;
}

/**
 * Turn a `RecoveryResult` into the compensating ledger rows that apply
 * it. Rows whose decision changes nothing are skipped, so a good leaver
 * produces an empty array (nothing to correct).
 *
 * The value delta comes straight from the engine (`retained_fmv_minor`),
 * which is the only place that knows how much of a row's value was still
 * at risk after a payment had drawn on it. Re-deriving it here from the
 * row's category — as this function used to — cannot see the drawdown,
 * and would write off value that has already been paid out.
 */
export function planRecoveryEntries(
  recovery: RecoveryResult,
  contributions: Contribution[],
  settings: PieSettings
): RecoveryLedgerEntry[] {
  const byId = new Map(contributions.map((c) => [c.id, c]));
  const entries: RecoveryLedgerEntry[] = [];

  for (const d of recovery.detail) {
    const original = byId.get(d.contribution_id);
    if (!original) continue;

    const kept = roundSlices(d.kept, settings.slice_decimal_places);
    const deltaSlices = roundSlices(
      kept - original.slices,
      settings.slice_decimal_places
    );

    // Value is money, and money is integer minor units.
    const deltaFmv = Math.round(d.retained_fmv_minor) - original.fmv_minor;

    // Nothing about this row changes → no correction needed.
    if (deltaSlices === 0 && deltaFmv === 0) continue;

    // Carry the hour delta alongside the slice delta. Hours are not
    // slices: the slice delta is already the net of multiplier and
    // recovery policy, so the only reliable way to prorate the hours is
    // by the slice proportion retained. Skipped when the row booked no
    // slices at all — nothing was prorated, so nothing is corrected.
    const originalHours = Number(
      (original.inputs as Record<string, unknown> | null)?.hours
    );
    const hours =
      Number.isFinite(originalHours) && original.slices !== 0
        ? roundSlices(
            originalHours * (deltaSlices / original.slices),
            settings.slice_decimal_places
          )
        : undefined;

    entries.push({
      contribution_id: original.id,
      slices: deltaSlices,
      fmv_minor: deltaFmv,
      type: original.type,
      reason: d.reason,
      ...(hours !== undefined && hours !== 0 ? { hours } : {}),
    });
  }

  return entries;
}

// ------------------------------------------------------------
// Buyout price (§14.3)
// ------------------------------------------------------------
export interface BuyoutQuote {
  slices: number;
  rate_per_slice_minor: number;
  amount_minor: number;
  explanation: string[];
}

export function computeBuyout(
  retainedSlices: number,
  settings: PieSettings,
  rateOverrideMinor?: number
): BuyoutQuote {
  const rate = rateOverrideMinor ?? settings.buyout_rate_per_slice_minor;
  const amount = Math.round(retainedSlices * rate);
  return {
    slices: retainedSlices,
    rate_per_slice_minor: rate,
    amount_minor: amount,
    explanation: [
      `Buyout = ${retainedSlices} slices × ${rate} minor/slice = ${amount} minor.`,
    ],
  };
}

// ------------------------------------------------------------
// Clawback (§14.4)
// ------------------------------------------------------------
// If, within the clawback window after a good-leaver buyout, the
// company is sold (or raises) at a per-slice value higher than the
// buyout rate, the departed good-leaver is owed the difference.
export interface ClawbackResult {
  triggered: boolean;
  sale_price_per_slice_minor: number;
  buyout_rate_per_slice_minor: number;
  retained_slices: number;
  amount_owed_minor: number;
  explanation: string[];
}

export function computeClawback(params: {
  saleValuationMinor: number; // total company valuation at the event
  totalSlices: number; // total Pie slices at the event
  retainedSlices: number; // slices the good-leaver was bought out of
  buyoutRatePerSliceMinor: number;
  withinWindow: boolean; // event occurred within clawback_window_days
}): ClawbackResult {
  const {
    saleValuationMinor,
    totalSlices,
    retainedSlices,
    buyoutRatePerSliceMinor,
    withinWindow,
  } = params;

  const salePerSlice = Math.round(
    safeDivide(saleValuationMinor, totalSlices)
  );
  const deltaPerSlice = salePerSlice - buyoutRatePerSliceMinor;
  const triggered = withinWindow && deltaPerSlice > 0;
  const owed = triggered
    ? Math.round(deltaPerSlice * retainedSlices)
    : 0;

  const explanation: string[] = [];
  if (!withinWindow) {
    explanation.push("Event is outside the clawback window — no clawback.");
  } else if (deltaPerSlice <= 0) {
    explanation.push(
      `Sale price/slice (${salePerSlice}) ≤ buyout rate (${buyoutRatePerSliceMinor}) — no clawback.`
    );
  } else {
    explanation.push(
      `Sale price/slice = ${saleValuationMinor} / ${totalSlices} = ${salePerSlice} minor.`,
      `Difference = ${salePerSlice} − ${buyoutRatePerSliceMinor} = ${deltaPerSlice} minor/slice.`,
      `Clawback owed = ${deltaPerSlice} × ${retainedSlices} = ${owed} minor ($${fromMinor(owed).toFixed(2)}).`
    );
  }

  return {
    triggered,
    sale_price_per_slice_minor: salePerSlice,
    buyout_rate_per_slice_minor: buyoutRatePerSliceMinor,
    retained_slices: retainedSlices,
    amount_owed_minor: owed,
    explanation,
  };
}

// ------------------------------------------------------------
// Contractor forced buyout cap (§4.2 / CONFIG-012)
// ------------------------------------------------------------
// The company may force-buy a contractor's slices within the window
// for up to cap_pct × the base billed value.
export function contractorBuyoutCeilingMinor(
  baseBilledMinor: number,
  settings: PieSettings
): number {
  return Math.round(baseBilledMinor * settings.contractor_buyout_cap_pct);
}

export interface ContractorBuyoutPlan {
  /** Slices whose billing is still inside the buyout window. */
  eligible_slices: number;
  /** Slices excluded because the billing is older than the window. */
  expired_slices: number;
  /**
   * "Base billed value" of the eligible billings, in minor units.
   *
   * For a contractor the frozen FMV of a `contractor_time` row is the
   * UNPAID (at-risk) portion of the invoice — `hours × rate − paid` —
   * so this is the amount the company still owes them, which is what
   * the 200% ceiling is measured against. (Interpretation to confirm:
   * reading it against the GROSS invoice instead would raise the
   * ceiling substantially.)
   */
  base_billed_minor: number;
  /** The cap itself: base_billed × contractor_buyout_cap_pct. */
  ceiling_minor: number;
  /** Price of the eligible slices at the standing buyout rate. */
  rate_quote_minor: number;
  /** What may actually be paid: the lower of the quote and the cap. */
  amount_minor: number;
  /** True when the cap (not the rate) is what limits the payment. */
  capped: boolean;
  explanation: string[];
}

/**
 * The billings still inside the CONFIG-012 window. Each contribution
 * carries its own window, counted from its own `event_date`, because the
 * source is per-billing: "the buyout option goes away for any billings
 * more than a year old".
 */
export function contractorEligibleContributions(
  contributions: Contribution[],
  settings: PieSettings,
  asOf: Date = new Date()
): { eligible: Contribution[]; expired: Contribution[] } {
  const cutoff = new Date(asOf.getTime());
  cutoff.setUTCDate(
    cutoff.getUTCDate() - settings.contractor_buyout_window_days
  );
  const cutoffISO = cutoff.toISOString().split("T")[0];

  const eligible: Contribution[] = [];
  const expired: Contribution[] = [];
  for (const c of contributions) {
    if (c.event_date >= cutoffISO) eligible.push(c);
    else expired.push(c);
  }
  return { eligible, expired };
}

/**
 * Plan a company-*forced* buyout of a contractor's slices.
 *
 * CONFIG-012 gives the right two limits, and both are per-billing
 * rather than global: "the buyout price rises to 200% of the base
 * billed price by end of year 1", and "after that, the buyout option
 * goes away for any billings more than a year old". Billings that have
 * aged out are reported separately rather than silently dropped.
 *
 * A contractor is outside the Recovery Framework entirely
 * (HARD-VAL-003), so this is the ONLY route by which their slices can
 * be taken — which is why the limits are enforced here rather than in
 * the route.
 */
export function planContractorForcedBuyout(
  contributions: Contribution[],
  settings: PieSettings,
  asOf: Date = new Date()
): ContractorBuyoutPlan {
  const { eligible, expired } = contractorEligibleContributions(
    contributions,
    settings,
    asOf
  );

  const cutoffISO = expired.length
    ? expired.reduce(
        (latest, c) => (c.event_date > latest ? c.event_date : latest),
        expired[0].event_date
      )
    : "";

  const eligibleSlices = roundSlices(
    eligible.reduce((s, c) => s + c.slices, 0),
    settings.slice_decimal_places
  );
  const expiredSlices = roundSlices(
    expired.reduce((s, c) => s + c.slices, 0),
    settings.slice_decimal_places
  );
  const baseBilled = eligible.reduce((s, c) => s + c.fmv_minor, 0);

  const ceiling = contractorBuyoutCeilingMinor(baseBilled, settings);
  const rateQuote = Math.round(
    eligibleSlices * settings.buyout_rate_per_slice_minor
  );
  const amount = Math.max(0, Math.min(rateQuote, ceiling));
  const capped = rateQuote > ceiling;

  const explanation: string[] = [
    `Window: billings newer than ${settings.contractor_buyout_window_days} days are still buyable.`,
    cutoffISO
      ? `The oldest aged-out billing is dated ${cutoffISO}.`
      : `No billings have aged out.`,
    `Eligible ${eligibleSlices} slices; ${expiredSlices} slices aged out and can no longer be force-bought.`,
    `Base billed value = ${baseBilled} minor; ceiling at ${settings.contractor_buyout_cap_pct * 100}% = ${ceiling} minor.`,
    `Rate quote = ${eligibleSlices} × ${settings.buyout_rate_per_slice_minor} = ${rateQuote} minor.`,
  ];
  if (capped) {
    explanation.push(
      `CONFIG-012: the rate quote exceeds the cap, so the payout is limited to ${amount} minor.`
    );
  }

  return {
    eligible_slices: eligibleSlices,
    expired_slices: expiredSlices,
    base_billed_minor: baseBilled,
    ceiling_minor: ceiling,
    rate_quote_minor: rateQuote,
    amount_minor: amount,
    capped,
    explanation,
  };
}
