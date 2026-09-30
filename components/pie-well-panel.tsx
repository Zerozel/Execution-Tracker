// ============================================================
// Execution Tracker — Slicing Pie: The Well Panel
// ============================================================
// Shows the Well balance and its ownership breakdown, and lets an admin
// record deposits and withdrawals via POST /api/pies/[id]/well.
//
// A deposit is made BY someone and earns no slices. A withdrawal is the
// company spending pooled cash, and its slices go to every contributor
// in proportion to their share of the balance at that moment
// (WELL-001) — so the form does NOT ask who the withdrawal is "for",
// and the result is shown back as the per-person split. Amounts are
// entered in major units.
// ============================================================

"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  formatMoney,
  formatPercent,
  formatSlices,
  toMinor,
} from "@/lib/slicing-pie/format";
import { Droplet } from "lucide-react";
import type { PieParticipant } from "@/types/slicing-pie";
import type { WellOwnership, WellWithdrawalPlan } from "@/lib/slicing-pie/engine/well";

interface Props {
  pieId: string;
  balanceMinor: number;
  currency: string;
  participants: PieParticipant[];
  /** Who owns the balance right now — the split the next withdrawal uses. */
  ownership?: WellOwnership;
  frozen: boolean;
}

export function PieWellPanel({
  pieId,
  balanceMinor,
  currency,
  participants,
  ownership,
  frozen,
}: Props) {
  const router = useRouter();
  const [kind, setKind] = useState<"deposit" | "withdrawal">("deposit");
  const [amount, setAmount] = useState("");
  const [participantId, setParticipantId] = useState(participants[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WellWithdrawalPlan | null>(null);

  const nameById = new Map(participants.map((p) => [p.id, p.display_name]));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Enter a positive amount");
      return;
    }
    // Only a deposit needs a depositor: it is made by someone. A
    // withdrawal is split across the owners automatically.
    if (kind === "deposit" && !participantId) {
      setError("A deposit requires a participant");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`/api/pies/${pieId}/well`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          amount_minor: toMinor(amt),
          participant_id: participantId || undefined,
          note: note.trim() || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Failed to record transaction");
        setIsLoading(false);
        return;
      }
      setAmount("");
      setNote("");
      // A withdrawal is split across the owners, so show them the
      // split rather than making them take it on trust.
      setResult(kind === "withdrawal" ? (body.data?.allocation ?? null) : null);
      setIsLoading(false);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setIsLoading(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        {/* Balance */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-100 text-sky-600">
            <Droplet className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Well balance</p>
            <p className="text-2xl font-bold tabular-nums">
              {formatMoney(balanceMinor, currency)}
            </p>
          </div>
        </div>

        {frozen ? (
          <p className="text-sm text-muted-foreground">
            The Well is locked while the Pie is frozen.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 border-t pt-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Action</label>
                <select
                  value={kind}
                  onChange={(e) =>
                    setKind(e.target.value as "deposit" | "withdrawal")
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  disabled={isLoading}
                >
                  <option value="deposit">Deposit</option>
                  <option value="withdrawal">Withdrawal</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Amount</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Depositor{kind === "deposit" ? " *" : ""}
                </label>
                {kind === "deposit" ? (
                  <select
                    value={participantId}
                    onChange={(e) => setParticipantId(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    disabled={isLoading}
                  >
                    <option value="">None (company cash)</option>
                    {participants.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.display_name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="flex h-10 items-center text-sm text-muted-foreground">
                    Split across the owners below
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Note</label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional"
                disabled={isLoading}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              {kind === "deposit"
                ? "Deposits increase the Well and earn no slices — slices are allocated when the cash is actually spent."
                : `Withdrawals earn slices for every owner of the Well, in proportion to their share of the balance at this moment, at the cash multiplier (WELL-001).${
                    ownership && ownership.unattributed_minor > 0
                      ? " Deposits with no participant chosen earn nobody slices."
                      : ""
                  }`}
            </p>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" disabled={isLoading}>
              {isLoading
                ? "Recording…"
                : kind === "deposit"
                  ? "Record Deposit"
                  : "Record Withdrawal"}
            </Button>
          </form>
        )}

        {/* Ownership breakdown — the split the next withdrawal uses. */}
        {ownership && ownership.stakes.length > 0 && (
          <div className="space-y-2 border-t pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Owners of the Well
            </p>
            <ul className="space-y-1">
              {ownership.stakes.map((s) => (
                <li
                  key={s.participant_id ?? "unattributed"}
                  className="flex items-center justify-between text-sm"
                >
                  <span>
                    {s.participant_id
                      ? (nameById.get(s.participant_id) ?? "Unknown participant")
                      : "Unattributed deposit"}
                    <span className="ml-2 text-xs text-muted-foreground">
                      deposited {formatMoney(s.deposited_minor, currency)}
                    </span>
                  </span>
                  <span className="tabular-nums">
                    {formatMoney(s.stake_minor, currency)}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {formatPercent(s.fraction, { isFraction: true })}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            {ownership.unattributed_minor > 0 && (
              <p className="text-xs text-amber-600">
                {formatMoney(ownership.unattributed_minor, currency)} is held by
                depositors with no participant record. Their share of every
                withdrawal earns no slices.
              </p>
            )}
          </div>
        )}

        {/* What the withdrawal that was just recorded actually did. */}
        {result && (
          <div className="space-y-2 border-t pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Slices allocated
            </p>
            <ul className="space-y-1">
              {result.allocations.map((a) => (
                <li
                  key={a.participant_id}
                  className="flex items-center justify-between text-sm"
                >
                  <span>
                    {nameById.get(a.participant_id) ?? "Unknown participant"}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {formatMoney(a.amount_minor, currency)} attributed
                    </span>
                  </span>
                  <span className="tabular-nums">
                    +{formatSlices(a.slices)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              {formatSlices(result.total_slices)} slices total.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
