// ============================================================
// Execution Tracker — GET & POST /api/pies/[id]/well
// ============================================================
// The Well (§4.5): a shared pool of cash.
//   • DEPOSIT    → increases the Well balance and the depositor's
//                  stake, earns NO slices, and records a `well_deposit`
//                  contribution (0 slices) for a complete audit trail.
//   • WITHDRAWAL → decreases the Well balance and earns slices for
//                  EVERY contributor, in proportion to their share of
//                  the balance at that moment (WELL-001).
//
// The old behaviour gave the whole withdrawal to the participant who
// triggered it, which is wrong twice over: slices belong to whoever's
// money was in the Well, and the size of each person's share depends on
// what the Well looked like at that instant. See engine/well.ts.
//
// GET returns the Well, its transaction history, and the current
// ownership breakdown.
// ============================================================

import { createClient } from "@/lib/supabase";
import {
  ok,
  fail,
  requireUser,
  requireAdminApi,
  resolvePieConfig,
  writeAudit,
  isUuid,
  todayISO,
} from "@/lib/slicing-pie/server/context";
import { computeSlices } from "@/lib/slicing-pie/engine/calculate";
import {
  wellOwnership,
  planWellWithdrawal,
  type WellTransactionRow,
} from "@/lib/slicing-pie/engine/well";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Ensure a Well row exists for the Pie; create lazily if missing. */
async function ensureWell(
  supabase: Awaited<ReturnType<typeof createClient>>,
  pieId: string
): Promise<{ id: string; balance_minor: number } | null> {
  const { data } = await supabase
    .from("wells")
    .select("id, balance_minor")
    .eq("pie_id", pieId)
    .single();
  if (data) return data;

  const { data: created } = await supabase
    .from("wells")
    .insert({ pie_id: pieId, balance_minor: 0 })
    .select("id, balance_minor")
    .single();
  return created ?? null;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { response } = await requireUser();
    if (response) return response;

    const { id } = await context.params;
    if (!isUuid(id)) return fail("Invalid pie id", 400);

    const supabase = await createClient();
    const well = await ensureWell(supabase, id);
    if (!well) return fail("Failed to load well", 500);

    const { data: transactions } = await supabase
      .from("well_transactions")
      .select("*")
      .eq("well_id", well.id)
      .order("created_at", { ascending: false });

    const txs = (transactions ?? []) as (WellTransactionRow & {
      id: string;
    })[];

    // The transaction history is the source of truth for the balance;
    // `wells.balance_minor` is only a cache of it. Reporting the
    // replayed figure means the two can never visibly disagree, however
    // the cache got there.
    const ownership = wellOwnership(txs);

    return ok({
      well: { ...well, balance_minor: ownership.balance_minor },
      transactions: txs,
      // Who owns the balance right now, and in what proportion — the
      // numbers the next withdrawal will be split by.
      ownership,
    });
  } catch (err) {
    console.error("Unexpected error in GET well:", err);
    return fail("Internal server error", 500);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { user, response } = await requireAdminApi();
    if (response) return response;

    const { id } = await context.params;
    if (!isUuid(id)) return fail("Invalid pie id", 400);

    const body = await request.json();
    const {
      kind,
      amount_minor,
      participant_id,
      finder_fee_recipient_id,
      event_date,
      note,
    } = body as {
      kind?: "deposit" | "withdrawal";
      amount_minor?: number;
      participant_id?: string;
      finder_fee_recipient_id?: string;
      event_date?: string;
      note?: string;
    };

    if (kind !== "deposit" && kind !== "withdrawal") {
      return fail("kind must be 'deposit' or 'withdrawal'", 400);
    }
    const amount = Number(amount_minor);
    if (!Number.isFinite(amount) || amount <= 0) {
      return fail("amount_minor must be a positive number", 400);
    }
    // A deposit is made BY someone, so it needs a depositor. A
    // withdrawal is the company spending pooled cash — WELL-001 splits
    // it across the contributors, so no single participant_id applies.
    if (kind === "deposit" && (!participant_id || !isUuid(participant_id))) {
      return fail("A deposit requires a valid participant_id", 400);
    }

    const supabase = await createClient();

    // Reject on a frozen Pie (§17).
    const { data: pie } = await supabase
      .from("pies")
      .select("id, status")
      .eq("id", id)
      .single();
    if (!pie) return fail("Pie not found", 404);
    if (pie.status === "frozen") {
      return fail("Pie is frozen — the Well is locked", 409);
    }

    const well = await ensureWell(supabase, id);
    if (!well) return fail("Failed to load well", 500);

    const eventDate = event_date || todayISO();

    const { settings } = await resolvePieConfig(id, eventDate);

    // ---- Work out who the withdrawal belongs to (WELL-001) ----------
    // Ownership is read from the Well's history BEFORE this
    // transaction, because WELL-001 prices the split at "the moment of
    // withdrawal". The history is also what the balance check above
    // should have used, so it is read once and used for both.
    let withdrawalPlan: ReturnType<typeof planWellWithdrawal> | null = null;
    const { data: priorTxs, error: priorErr } = await supabase
      .from("well_transactions")
      .select("id, participant_id, kind, amount_minor, created_at")
      .eq("well_id", well.id);
    if (priorErr) {
      console.error("Error loading well history:", priorErr);
      return fail("Failed to load the Well's history", 500);
    }
    const ownershipBefore = wellOwnership(
      (priorTxs ?? []) as WellTransactionRow[]
    );
    if (kind === "withdrawal") {
      withdrawalPlan = planWellWithdrawal(ownershipBefore, amount, settings);
    }

    // The cached column can drift from the history (a partially-applied
    // write, a manual edit). Trust the history, not the cache, so a
    // withdrawal can never overdraw on the strength of a stale number.
    const balanceBefore = ownershipBefore.balance_minor;
    if (kind === "withdrawal" && amount > balanceBefore) {
      return fail(
        `Withdrawal exceeds the Well balance of ${balanceBefore} minor units`,
        400
      );
    }

    // Record the transaction, freezing the split onto it so the
    // allocation can be reviewed later even if the Well composition
    // changes (allocation_snapshot was previously never written).
    const { data: tx, error: txErr } = await supabase
      .from("well_transactions")
      .insert({
        well_id: well.id,
        participant_id: kind === "deposit" ? participant_id : null,
        kind,
        amount_minor: amount,
        finder_fee_recipient_id: finder_fee_recipient_id || null,
        allocation_snapshot: withdrawalPlan,
        note: note?.trim() || null,
        created_by: user.id,
      })
      .select("*")
      .single();

    if (txErr || !tx) {
      console.error("Error creating well transaction:", txErr);
      return fail("Failed to record well transaction", 500);
    }

    // Update the cached balance. The history is the source of truth, so
    // this is a cache write — but a silent failure would leave the cache
    // permanently behind, so it is checked. The transaction row is left
    // in place either way: the history is what the balance is computed
    // from, so an unsynced cache is a display problem, not a data loss.
    const newBalance =
      kind === "deposit"
        ? balanceBefore + amount
        : balanceBefore - amount;
    const { error: balErr } = await supabase
      .from("wells")
      .update({ balance_minor: newBalance })
      .eq("id", well.id);
    if (balErr) {
      console.error("Error updating well balance:", balErr);
      return fail(
        "The Well transaction was recorded, but the cached balance could not be updated. It is recomputed from the transaction history on read, so no data was lost.",
        500
      );
    }

    // ---- Record the matching contributions --------------------------
    const contributions: unknown[] = [];

    if (kind === "deposit" && participant_id) {
      // A deposit never earns slices; the row exists purely so the
      // ledger shows the money entering the Well (§4.5).
      const computation = computeSlices(
        { type: "well_deposit", amount_minor: amount },
        settings
      );
      const { data: c } = await supabase
        .from("contributions")
        .insert({
          pie_id: id,
          participant_id,
          type: "well_deposit",
          event_date: eventDate,
          inputs: { amount_minor: amount, well_transaction_id: tx.id },
          config_snapshot: settings,
          fmv_minor: computation.fmv_minor,
          multiplier_kind: computation.multiplier_kind,
          multiplier_applied: computation.multiplier_applied,
          slices: computation.slices,
          notes: note?.trim() || null,
          status: "active",
          created_by: user.id,
        })
        .select("*")
        .single();
      if (c) contributions.push(c);
    }

    if (kind === "withdrawal" && withdrawalPlan) {
      // ONE contribution per contributor, each sized by their share.
      for (const allocation of withdrawalPlan.allocations) {
        const computation = computeSlices(
          { type: "well_withdrawal", amount_minor: allocation.amount_minor },
          settings
        );
        const { data: c } = await supabase
          .from("contributions")
          .insert({
            pie_id: id,
            participant_id: allocation.participant_id,
            type: "well_withdrawal",
            event_date: eventDate,
            inputs: {
              amount_minor: allocation.amount_minor,
              well_transaction_id: tx.id,
              // The reasoning, so the row explains itself years later.
              well_stake_minor: allocation.stake_minor,
              well_ownership_fraction: allocation.fraction,
              withdrawal_total_minor: amount,
            },
            config_snapshot: settings,
            fmv_minor: computation.fmv_minor,
            multiplier_kind: computation.multiplier_kind,
            multiplier_applied: computation.multiplier_applied,
            slices: computation.slices,
            notes: note?.trim() || null,
            status: "active",
            created_by: user.id,
          })
          .select("*")
          .single();
        if (c) contributions.push(c);
      }
    }

    await writeAudit({
      pieId: id,
      actorId: user.id,
      action: `well.${kind}`,
      entityType: "well_transaction",
      entityId: tx.id,
      before: { balance_minor: balanceBefore },
      after: {
        balance_minor: newBalance,
        amount_minor: amount,
        allocation: withdrawalPlan?.allocations ?? null,
      },
      effectiveFrom: eventDate,
    });

    return ok(
      {
        transaction: tx,
        balance_minor: newBalance,
        contribution: contributions[0] ?? null,
        contributions,
        allocation: withdrawalPlan,
      },
      201
    );
  } catch (err) {
    console.error("Unexpected error in POST well:", err);
    return fail("Internal server error", 500);
  }
}
