// ============================================================
// Execution Tracker — Slicing Pie: Pending Referrals Panel
// ============================================================
// A referral fee is recorded the day it is entered but holds no slices
// until the referred hire has stayed the configured waiting period
// (CONFIG-016). This panel shows what is waiting, when each one switches
// on, and lets an admin grant everything whose date has arrived.
//
// Granting is a deliberate click rather than something that happens on
// its own: slices appearing in the cap table is a change in ownership,
// and ownership changes should be something a person chose to do.
// Admin only (the route enforces it too).
// ============================================================

"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/lib/slicing-pie/format";
import { Gift } from "lucide-react";
import type { PieParticipant } from "@/types/slicing-pie";

interface ReferralRow {
  contribution_id: string;
  participant_id: string;
  event_date: string;
  hired_on: string | null;
  grants_on: string | null;
  fee_minor: number | null;
  granted: boolean;
  due: boolean;
}

interface Props {
  pieId: string;
  currency: string;
  participants: PieParticipant[];
}

export function PendingReferralsPanel({ pieId, currency, participants }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<ReferralRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const nameById = new Map(participants.map((p) => [p.id, p.display_name]));

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/pies/${pieId}/referrals`);
      const body = await res.json();
      if (res.ok) setRows(body.data ?? []);
    } catch {
      // A failed read here is not worth interrupting the page for; the
      // grant button below reports its own errors.
    }
  }, [pieId]);

  useEffect(() => {
    load();
  }, [load]);

  async function grantDue() {
    setIsLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/pies/${pieId}/referrals`, {
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Failed to grant referrals");
        setIsLoading(false);
        return;
      }
      const count: number = body.data?.granted_count ?? 0;
      setMessage(
        count === 0
          ? "Nothing is due yet."
          : `Granted ${count} referral${count === 1 ? "" : "s"}.`
      );
      setIsLoading(false);
      await load();
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setIsLoading(false);
    }
  }

  const outstanding = rows.filter((r) => !r.granted);
  const dueCount = outstanding.filter((r) => r.due).length;
  const waiting = outstanding.filter((r) => !r.due);

  // Hide in the ordinary state — a Pie whose referrals have all been
  // granted has nothing to show. The exception is a grant that has just
  // finished: the pending row survives the grant (that is the whole point
  // of appending rather than editing), so `rows` stays non-empty forever
  // after the first referral and this card would otherwise sit on the
  // dashboard permanently showing a zero. Keeping it while there is a
  // message or an error lets the confirmation be read; the next full page
  // load clears it.
  if (outstanding.length === 0 && !message && !error) return null;

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 text-violet-600">
            <Gift className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Pending referrals</p>
            <p className="text-2xl font-bold tabular-nums">
              {outstanding.length}
            </p>
          </div>
        </div>

        {outstanding.length > 0 && (
          <ul className="space-y-2 border-t pt-4">
            {outstanding.map((r) => (
              <li
                key={r.contribution_id}
                className="flex items-center justify-between text-sm"
              >
                <span>
                  {nameById.get(r.participant_id) ?? "Unknown participant"}
                  <span className="ml-2 text-xs text-muted-foreground">
                    hire started {r.hired_on ?? "—"}
                  </span>
                </span>
                <span className="text-right">
                  <span className="tabular-nums">
                    {r.fee_minor != null
                      ? formatMoney(r.fee_minor, currency)
                      : "—"}
                  </span>
                  <span
                    className={`ml-2 text-xs ${
                      r.due ? "text-emerald-600" : "text-muted-foreground"
                    }`}
                  >
                    {r.due ? "due now" : `grants ${r.grants_on ?? "—"}`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-muted-foreground">
          A referral earns no slices until the referred hire has stayed the
          waiting period. Grants are computed using the settings that were in
          force when the referral was logged, so changing the rate later cannot
          rewrite a referral that was already earned.
        </p>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {message && <p className="text-sm text-emerald-600">{message}</p>}

        <Button onClick={grantDue} disabled={isLoading || dueCount === 0}>
          {isLoading
            ? "Granting…"
            : dueCount === 0
              ? waiting.length > 0
                ? `Nothing due yet (${waiting.length} waiting)`
                : "Nothing to grant"
              : `Grant ${dueCount} due referral${dueCount === 1 ? "" : "s"}`}
        </Button>
      </CardContent>
    </Card>
  );
}
