// ============================================================
// Execution Tracker — Slicing Pie: The Well (§4.5, §8, WELL-001)
// ============================================================
// The Well is a pool of cash that participants (and friends, family
// and small angels) pay in before the company spends it. Depositing
// earns nothing — "if the cash isn't spent, it's not at risk. It's
// just sitting in the bank. Slices get allocated when the cash gets
// spent." Slices appear only when money LEAVES the Well, and they go
// to the people whose money it was, in proportion to how much of the
// Well is theirs at that moment:
//
//   WELL-001: slices_i = (withdrawal × contributor_i's % of the Well
//              balance at the time of withdrawal) × cash multiplier
//
// ── The ownership model ──────────────────────────────────────
// Each contributor holds a *stake* — their share of the CURRENT
// balance, in minor units:
//
//   deposit      → the depositor's stake grows by the amount
//   withdrawal   → every stake is scaled down pro rata
//
// The pro-rata scaling is what makes this "ownership at the moment of
// withdrawal" rather than "whatever you originally put in": a later
// deposit dilutes the earlier contributors automatically, because the
// new money grows the balance without growing their stakes. It also
// reproduces the book's own worked numbers exactly — Julie and Chuck
// at $1,000 each, a $1,000 withdrawal, and WELL-001 attributing $500
// to each (2,000 slices at ×4).
//
// The book's *later* figures in that same example (Suzanne depositing
// $15,000 and everyone landing on 50/25/25) cannot be reconciled with
// any deposit-based rule, including the book's own: $15,000 out of
// $17,000 deposited is 88%, not 50%. That discrepancy is flagged in
// the implementation plan as a decision to confirm; the model here is
// the one the book's normative sentence describes and the one its
// clean sub-example demonstrates.
//
// Pure functions. No I/O — the caller supplies the transactions.
// ============================================================

import type { PieSettings } from "@/types/slicing-pie";
import { computeSlices } from "./calculate";
import { formatMoney, roundSlices, safeDivide } from "../format";

export interface WellTransactionRow {
  participant_id: string | null;
  kind: "deposit" | "withdrawal";
  amount_minor: number;
  /** ISO timestamp — transactions are applied in this order. */
  created_at: string;
  /** Tiebreaker when timestamps collide (e.g. a batch import). */
  id?: string;
}

export interface WellStake {
  /** Null when a deposit was made by someone with no participant row. */
  participant_id: string | null;
  /** This contributor's share of the CURRENT balance, in minor units. */
  stake_minor: number;
  /** stake ÷ balance, 0..1. Zero when the Well is empty. */
  fraction: number;
  /** Everything they have ever paid in, in minor units (reporting). */
  deposited_minor: number;
}

export interface WellOwnership {
  /** Current balance = sum of every stake. */
  balance_minor: number;
  /** Everything ever deposited, for context. */
  total_deposited_minor: number;
  /** Everything ever withdrawn. */
  total_withdrawn_minor: number;
  stakes: WellStake[];
  /** Stake held by contributors with no participant row — cannot earn slices. */
  unattributed_minor: number;
}

// ------------------------------------------------------------
// Ownership
// ------------------------------------------------------------

/**
 * Scale every stake down to fit `newBalance`, keeping the total exact.
 *
 * Rounding each stake independently would leave the stakes not adding
 * up to the balance (and cents would appear or vanish over time). So
 * every stake is floored and the leftover units are handed to the
 * largest remainders — the standard largest-remainder apportionment.
 */
function scaleStakes(
  stakes: number[],
  oldBalance: number,
  newBalance: number
): number[] {
  if (oldBalance <= 0) return stakes.map(() => 0);

  const out: number[] = [];
  const remainders: { index: number; remainder: number }[] = [];
  let assigned = 0;

  for (let i = 0; i < stakes.length; i++) {
    const exact = (stakes[i] * newBalance) / oldBalance;
    const floored = Math.floor(exact);
    out.push(floored);
    remainders.push({ index: i, remainder: exact - floored });
    assigned += floored;
  }

  let leftover = newBalance - assigned;
  remainders.sort(
    (a, b) => b.remainder - a.remainder || a.index - b.index
  );
  for (let k = 0; k < remainders.length && leftover > 0; k++) {
    out[remainders[k].index] += 1;
    leftover -= 1;
  }

  return out;
}

/**
 * Replay the Well's transactions to find who owns what right now.
 *
 * Deposits are applied oldest-first; each withdrawal scales every
 * existing stake down pro rata, so contributions made earlier are
 * diluted by later ones without anyone's stake ever going negative.
 */
export function wellOwnership(
  transactions: WellTransactionRow[]
): WellOwnership {
  const ordered = [...transactions].sort((a, b) => {
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
    return (a.id ?? "") < (b.id ?? "") ? -1 : 1;
  });

  // participant_id → stake. A null key collects unattributed deposits.
  const stakes = new Map<string | null, number>();
  const deposited = new Map<string | null, number>();
  let balance = 0;
  let totalDeposited = 0;
  let totalWithdrawn = 0;

  const add = (map: Map<string | null, number>, key: string | null, n: number) =>
    map.set(key, (map.get(key) ?? 0) + n);

  for (const tx of ordered) {
    const amount = Math.round(tx.amount_minor);

    if (tx.kind === "deposit") {
      if (amount <= 0) continue;
      add(stakes, tx.participant_id, amount);
      add(deposited, tx.participant_id, amount);
      balance += amount;
      totalDeposited += amount;
      continue;
    }

    // Withdrawal: cannot take out more than is there, and cannot
    // distort stakes by more than the balance.
    const take = Math.min(amount, balance);
    if (take <= 0) continue;

    const newBalance = balance - take;
    const keys = Array.from(stakes.keys());
    const scaled = scaleStakes(
      keys.map((k) => stakes.get(k) ?? 0),
      balance,
      newBalance
    );
    keys.forEach((k, i) => stakes.set(k, scaled[i]));

    balance = newBalance;
    totalWithdrawn += take;
  }

  const rows: WellStake[] = Array.from(stakes.entries())
    .map(([participant_id, stake]) => ({
      participant_id,
      stake_minor: stake,
      fraction: safeDivide(stake, balance),
      deposited_minor: deposited.get(participant_id) ?? 0,
    }))
    .sort((a, b) => b.stake_minor - a.stake_minor);

  return {
    balance_minor: balance,
    total_deposited_minor: totalDeposited,
    total_withdrawn_minor: totalWithdrawn,
    stakes: rows,
    unattributed_minor:
      rows.find((r) => r.participant_id === null)?.stake_minor ?? 0,
  };
}

// ------------------------------------------------------------
// Withdrawal allocation (WELL-001)
// ------------------------------------------------------------

export interface WellAllocation {
  participant_id: string;
  /** Their stake at the moment of withdrawal, minor units. */
  stake_minor: number;
  /** Their share of the Well, 0..1. */
  fraction: number;
  /** The portion of the withdrawal attributed to them, minor units. */
  amount_minor: number;
  /** Slices they earn: amount × cash multiplier. */
  slices: number;
}

export interface WellWithdrawalPlan {
  withdrawal_minor: number;
  allocations: WellAllocation[];
  /** Value belonging to contributors with no participant row. */
  unattributed_minor: number;
  /** Value that could not be attributed to anyone (empty Well). */
  unallocated_minor: number;
  total_slices: number;
  explanation: string[];
  warnings: string[];
}

/**
 * Split a withdrawal across the Well's contributors per WELL-001.
 *
 * Slices go to everyone in proportion to what they own of the Well —
 * not to whoever happened to trigger the payment. Drawing cash out of
 * the Well is the moment the pooled money becomes at-risk, so it is
 * the Well's contributors, not the spender, who earned it.
 *
 * @param ownership  The Well's state BEFORE the withdrawal is applied.
 */
export function planWellWithdrawal(
  ownership: WellOwnership,
  withdrawalMinor: number,
  settings: PieSettings
): WellWithdrawalPlan {
  const explanation: string[] = [];
  const warnings: string[] = [];

  const withdrawal = Math.max(0, Math.round(withdrawalMinor));
  const allocations: WellAllocation[] = [];

  if (ownership.balance_minor <= 0 || ownership.stakes.length === 0) {
    return {
      withdrawal_minor: withdrawal,
      allocations: [],
      unattributed_minor: ownership.unattributed_minor,
      unallocated_minor: withdrawal,
      total_slices: 0,
      explanation: [
        "The Well is empty, so this withdrawal earns no slices.",
      ],
      warnings:
        withdrawal > 0
          ? [
              "A withdrawal was recorded against an empty Well — there was nobody to attribute slices to.",
            ]
          : [],
    };
  }

  // Apportion the withdrawal over the WHOLE balance first, so each
  // stake takes its true share. Splitting it over the participant-held
  // stakes alone would quietly hand an unlinked investor's share to
  // everyone else, inventing slices against money nobody is tracking.
  const scaled = scaleStakes(
    ownership.stakes.map((s) => s.stake_minor),
    ownership.balance_minor,
    withdrawal
  );

  let totalSlices = 0;
  let attributed = 0;

  ownership.stakes.forEach((stake, i) => {
    const amount = scaled[i];
    if (amount <= 0) return;
    if (stake.participant_id === null) return; // no one to credit

    const computation = computeSlices(
      { type: "well_withdrawal", amount_minor: amount },
      settings
    );

    allocations.push({
      participant_id: stake.participant_id,
      stake_minor: stake.stake_minor,
      fraction: safeDivide(stake.stake_minor, ownership.balance_minor),
      amount_minor: amount,
      slices: computation.slices,
    });
    attributed += amount;
    totalSlices = roundSlices(totalSlices + computation.slices, 4);
  });

  const unallocated = withdrawal - attributed;

  explanation.push(
    `Withdrawal of ${formatMoney(withdrawal, settings.currency)} is attributed across the Well's ${allocations.length} participant contributor${allocations.length === 1 ? "" : "s"} in proportion to their share of the balance at the time of withdrawal (WELL-001).`
  );
  for (const a of allocations) {
    explanation.push(
      `  • ${(a.fraction * 100).toFixed(2)}% owner → ${formatMoney(a.amount_minor, settings.currency)} → ${a.slices} slices (×${settings.cash_multiplier} cash multiplier).`
    );
  }
  explanation.push(`Total slices allocated: ${totalSlices}.`);

  if (unallocated > 0) {
    explanation.push(
      `${formatMoney(unallocated, settings.currency)} of the withdrawal belongs to non-participant depositors and earns no slices.`
    );
  }

  if (ownership.unattributed_minor > 0) {
    warnings.push(
      `${formatMoney(ownership.unattributed_minor, settings.currency)} of the Well is held by depositors with no participant record (an outside investor, or a deposit logged without choosing a depositor). Their share of every withdrawal earns no slices and is skipped.`
    );
  }

  return {
    withdrawal_minor: withdrawal,
    allocations,
    unattributed_minor: ownership.unattributed_minor,
    unallocated_minor: unallocated,
    total_slices: totalSlices,
    explanation,
    warnings,
  };
}
