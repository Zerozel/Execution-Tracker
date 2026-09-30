// ============================================================
// Execution Tracker — Slicing Pie: Departure Panel (§14)
// ============================================================
// Records someone leaving. The engine for this was written first and
// had no screen at all, which meant the most consequential event in a
// Pie — the moment slices move back from a person to the Pie — could
// only be triggered by hand.
//
// Two things shape this screen:
//
//   1. THE REASON IDS ARE COUNTER-INTUITIVE. "fired_good_reason" means
//      the COMPANY had a good reason, which makes the person a BAD
//      leaver. Both directions of that trap are spelled out on the
//      option labels rather than left to the id, because choosing the
//      wrong one moves a large number of slices the wrong way.
//
//   2. IT PREVIEWS BEFORE IT WRITES. Recording a departure appends
//      correcting rows to an append-only ledger and marks the person
//      departed. There is no undo, so the panel asks the server what
//      the exact consequence would be — same code path, nothing
//      persisted — and shows the figures and the ledger rows that
//      confirming would produce.
//
// The preview is keyed to the exact form values it was computed from,
// so editing any field invalidates it. That is done by comparison at
// render rather than by clearing state in each setter: a setter added
// later cannot forget to do it, and a stale preview cannot be
// confirmed. See `previewKey` below.
//
// Admin only (the route enforces it too).
// ============================================================

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatMoney, formatSlices, fromMinor } from "@/lib/slicing-pie/format";
import { LogOut } from "lucide-react";
import type {
  DepartureReason,
  LeaverKind,
  PieRole,
  ParticipantStatus,
} from "@/types/slicing-pie";
import type {
  BuyoutQuote,
  RecoveryLedgerEntry,
  RecoveryResult,
} from "@/lib/slicing-pie/engine/departure";

/** One participant, as the server decided they stand today. */
export interface DepartureCandidate {
  id: string;
  display_name: string;
  pie_role: PieRole;
  status: ParticipantStatus;
  /** Slices currently held (sum of their whole ledger). */
  slices: number;
  pct: number;
  /** §20 guards, evaluated server-side so screen and route agree. */
  can_terminate: boolean;
  termination_reason: string | null;
  can_standard_recovery: boolean;
  recovery_reason: string | null;
}

interface DeparturePreview {
  leaver_kind: LeaverKind;
  recovery: RecoveryResult;
  buyout: BuyoutQuote;
  ledger_entries: RecoveryLedgerEntry[];
}

interface Props {
  pieId: string;
  currency: string;
  sliceDecimalPlaces: number;
  percentDecimalPlaces: number;
  /** CONFIG-013/014 — decides whether the tenure checkbox is offered. */
  loyalClauseMode: "off" | "months" | "percentage";
  candidates: DepartureCandidate[];
}

// ------------------------------------------------------------
// The four scenarios, in the language of the person reading them
// ------------------------------------------------------------
// Each entry states BOTH directions on purpose: what happened, and
// what it means for their slices. The ids alone are read backwards
// about half the time.
const REASONS: {
  value: DepartureReason;
  who: string;
  why: string;
  kind: LeaverKind;
}[] = [
  {
    value: "fired_good_reason",
    who: "Dismissed — the company had a good reason",
    why: "Misconduct, breach, non-performance. BAD leaver: intangible slices (time, commission) are forfeited; cash and tangible property are kept at value.",
    kind: "bad",
  },
  {
    value: "fired_no_good_reason",
    who: "Dismissed — the company had no good reason",
    why: "The company ended it without cause. GOOD leaver: keeps every slice, multiplier included.",
    kind: "good",
  },
  {
    value: "resigned_good_reason",
    who: "Resigned — for good reason",
    why: "They left because of something the company did (e.g. unpaid agreed salary, relocation). GOOD leaver: keeps every slice in full.",
    kind: "good",
  },
  {
    value: "resigned_no_good_reason",
    who: "Resigned — for no good reason",
    why: "They walked away, or simply stopped showing up. BAD leaver: intangible slices are forfeited; cash and tangible property are kept at value.",
    kind: "bad",
  },
];

function reasonById(id: DepartureReason) {
  return REASONS.find((r) => r.value === id);
}

const TODAY = () => new Date().toISOString().split("T")[0];

export function PieDeparturePanel({
  pieId,
  currency,
  sliceDecimalPlaces,
  percentDecimalPlaces,
  loyalClauseMode,
  candidates,
}: Props) {
  const router = useRouter();

  const [openFor, setOpenFor] = useState<DepartureCandidate | null>(null);
  const [reason, setReason] = useState<DepartureReason | "">("");
  const [departureDate, setDepartureDate] = useState(TODAY());
  const [justification, setJustification] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [loyalMonthsMet, setLoyalMonthsMet] = useState(false);

  const [preview, setPreview] = useState<{
    key: string;
    data: DeparturePreview;
  } | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  // Every value the preview depends on. The preview is only ever
  // treated as current while this string is unchanged, so no setter
  // has to remember to invalidate it.
  const previewKey = JSON.stringify({
    participant: openFor?.id ?? null,
    reason,
    departureDate,
    justification,
    evidenceUrl,
    loyalMonthsMet,
  });
  const currentPreview =
    preview && preview.key === previewKey ? preview.data : null;

  // The tenure checkbox only means anything for one scenario: a
  // "resigned for no good reason" exit when the loyal-employee clause
  // is measured in months. Everywhere else the answer is ignored by the
  // engine, so asking would be noise.
  const showTenure =
    loyalClauseMode === "months" && reason === "resigned_no_good_reason";

  function openDialog(candidate: DepartureCandidate) {
    setOpenFor(candidate);
    setReason("");
    setDepartureDate(TODAY());
    setJustification("");
    setEvidenceUrl("");
    setLoyalMonthsMet(false);
    setPreview(null);
    setError(null);
    setBlockers([]);
    setMessage(null);
  }

  /** Assemble the request body — used for both preview and confirm. */
  function bodyFor(isPreview: boolean) {
    return {
      participant_id: openFor?.id,
      reason,
      departure_date: departureDate,
      justification: justification.trim() || undefined,
      evidence_url: evidenceUrl.trim() || undefined,
      loyal_months_met: showTenure ? loyalMonthsMet : undefined,
      ...(isPreview ? { preview: true } : {}),
    };
  }

  async function runPreview() {
    setIsWorking(true);
    setError(null);
    setBlockers([]);
    try {
      const res = await fetch(`/api/pies/${pieId}/departures`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyFor(true)),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not preview this departure");
        // The 409 carries the engine's own list of rows it refuses to
        // adjudicate. Showing them beats making the admin guess.
        const extra = Array.isArray(body.meta?.blockers)
          ? body.meta.blockers.map(
              (b: { reason?: string }) => b.reason ?? String(b)
            )
          : [];
        setBlockers(extra);
        setIsWorking(false);
        return;
      }
      setPreview({ key: previewKey, data: body.data as DeparturePreview });
      setIsWorking(false);
    } catch {
      setError("Network error. Please try again.");
      setIsWorking(false);
    }
  }

  async function confirm() {
    setIsWorking(true);
    setError(null);
    setBlockers([]);
    try {
      const res = await fetch(`/api/pies/${pieId}/departures`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyFor(false)),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not record this departure");
        const extra = Array.isArray(body.meta?.blockers)
          ? body.meta.blockers.map(
              (b: { reason?: string }) => b.reason ?? String(b)
            )
          : [];
        setBlockers(extra);
        setIsWorking(false);
        return;
      }
      const rec = body.data?.recovery as RecoveryResult | undefined;
      setMessage(
        `${openFor?.display_name} recorded as departed. Retained ${formatSlices(
          rec?.retained_slices ?? 0,
          sliceDecimalPlaces
        )} slices, ${formatSlices(
          rec?.forfeited_slices ?? 0,
          sliceDecimalPlaces
        )} returned to the Pie.`
      );
      setIsWorking(false);
      setOpenFor(null);
      setPreview(null);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setIsWorking(false);
    }
  }

  // Leaving is only meaningful while the Pie is live. Once it is frozen
  // the ownership snapshot is locked and the dashboard says so.
  if (candidates.length === 0) return null;

  const departable = candidates.filter(
    (c) =>
      c.status !== "departed" &&
      c.status !== "bought_out" &&
      c.can_terminate &&
      c.can_standard_recovery
  );
  const closed = candidates.filter(
    (c) => c.status === "departed" || c.status === "bought_out"
  );
  const barred = candidates.filter(
    (c) =>
      c.status !== "departed" &&
      c.status !== "bought_out" &&
      !(c.can_terminate && c.can_standard_recovery)
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <LogOut className="h-4 w-4" />
          Departures
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Recording a departure recalculates what the person keeps and returns
          the rest to the Pie. It is added to the ledger as correcting
          entries — the original contributions stay visible, and nothing is
          ever edited or deleted. There is no undo, so this screen always
          shows you the consequence before it writes anything.
        </p>

        {message && <p className="text-sm text-emerald-600">{message}</p>}

        {departable.length > 0 ? (
          <ul className="divide-y">
            {departable.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3"
              >
                <div>
                  <span className="font-medium">{c.display_name}</span>
                  <span className="ml-2 text-xs capitalize text-muted-foreground">
                    {c.pie_role}
                  </span>
                  <div className="text-xs text-muted-foreground">
                    {formatSlices(c.slices, sliceDecimalPlaces)} slices ·{" "}
                    {c.pct.toFixed(percentDecimalPlaces)}%
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openDialog(c)}
                >
                  Record departure
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nobody is currently eligible to depart.
          </p>
        )}

        {/* People the rules do not let leave this way. Listed rather
            than hidden: an admin looking for someone who is missing
            from the list above needs to see why. */}
        {barred.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            {barred.map((c) => (
              <div key={c.id} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {c.display_name}
                </span>{" "}
                cannot be recorded here — {c.termination_reason ??
                  c.recovery_reason}
              </div>
            ))}
          </div>
        )}

        {closed.length > 0 && (
          <div className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
            {closed.map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <span>{c.display_name}</span>
                <Badge variant="outline" className="text-xs capitalize">
                  {c.status.replace("_", " ")}
                </Badge>
                <span>
                  {formatSlices(c.slices, sliceDecimalPlaces)} slices
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* ---- The dialog -------------------------------------------- */}
      <Dialog
        open={openFor !== null}
        onOpenChange={(open) => {
          if (!open && !isWorking) setOpenFor(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Record a departure</DialogTitle>
            <DialogDescription>
              {openFor?.display_name} ·{" "}
              {formatSlices(openFor?.slices ?? 0, sliceDecimalPlaces)} slices ·{" "}
              {(openFor?.pct ?? 0).toFixed(percentDecimalPlaces)}% of the Pie.
              Nothing is written until you confirm.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                What happened? <span className="text-destructive">*</span>
              </label>
              <select
                value={reason}
                onChange={(e) =>
                  setReason(e.target.value as DepartureReason | "")
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                disabled={isWorking}
              >
                <option value="">Select…</option>
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.who}
                  </option>
                ))}
              </select>
              {reason && (
                <p className="text-xs text-muted-foreground">
                  {reasonById(reason as DepartureReason)?.why}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Departure date</label>
              <Input
                type="date"
                value={departureDate}
                onChange={(e) => setDepartureDate(e.target.value)}
                disabled={isWorking}
              />
            </div>

            {showTenure && (
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={loyalMonthsMet}
                  onChange={(e) => setLoyalMonthsMet(e.target.checked)}
                  className="mt-0.5 h-4 w-4"
                  disabled={isWorking}
                />
                <span>
                  They had already completed the required loyal service period
                  <span className="block text-xs text-muted-foreground">
                    The loyal-employee clause retains their non-cash slices if
                    they served long enough. Tick this only if the tenure was
                    actually met — it is the difference between keeping and
                    losing everything they accrued in time.
                  </span>
                </span>
              </label>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Justification</label>
              <Textarea
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="What happened, in your own words. This is stored with the departure and is what a reviewer would read."
                rows={3}
                disabled={isWorking}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Evidence link</label>
              <Input
                value={evidenceUrl}
                onChange={(e) => setEvidenceUrl(e.target.value)}
                placeholder="Optional — a link to the notice, warning, or agreement"
                disabled={isWorking}
              />
            </div>

            {error && (
              <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
                {blockers.map((b, i) => (
                  <p key={i} className="text-xs text-muted-foreground">
                    {b}
                  </p>
                ))}
              </div>
            )}

            {/* ---- Preview ------------------------------------------ */}
            {currentPreview && (
              <div className="space-y-3 rounded-md border bg-muted/40 p-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {currentPreview.leaver_kind === "bad"
                      ? "Bad leaver"
                      : "Good leaver"}
                  </span>
                  <Badge
                    variant={
                      currentPreview.leaver_kind === "bad"
                        ? "destructive"
                        : "default"
                    }
                    className="text-xs"
                  >
                    {reasonById(reason as DepartureReason)?.who}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">
                      Retained
                    </div>
                    <div className="font-medium tabular-nums">
                      {formatSlices(
                        currentPreview.recovery.retained_slices,
                        sliceDecimalPlaces
                      )}{" "}
                      slices
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">
                      Returned to the Pie
                    </div>
                    <div className="font-medium tabular-nums">
                      {formatSlices(
                        currentPreview.recovery.forfeited_slices,
                        sliceDecimalPlaces
                      )}{" "}
                      slices
                    </div>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Retained + returned ={" "}
                  {formatSlices(
                    currentPreview.recovery.retained_slices +
                      currentPreview.recovery.forfeited_slices,
                    sliceDecimalPlaces
                  )}{" "}
                  slices — everything they held on the day they left. (The
                  figure above is from the last page load; this one is read
                  fresh from the ledger.) “Returned” includes the cash/tangible
                  uplift that gets stripped off: those slices go back to the
                  Pie even though the money spent stays with them.
                </p>

                <div className="text-sm">
                  <div className="text-xs text-muted-foreground">
                    Buyout quote for the retained slices
                  </div>
                  <div className="font-medium tabular-nums">
                    {formatMoney(currentPreview.buyout.amount_minor, currency)}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      ({formatSlices(
                        currentPreview.buyout.slices,
                        sliceDecimalPlaces
                      )}{" "}
                      × {fromMinor(currentPreview.buyout.rate_per_slice_minor)}{" "}
                      {currency}/slice, not paid by this action)
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">
                    {currentPreview.ledger_entries.length} correcting{" "}
                    {currentPreview.ledger_entries.length === 1
                      ? "entry"
                      : "entries"}{" "}
                    will be added:
                  </div>
                  <ul className="space-y-1">
                    {currentPreview.ledger_entries.map((e) => (
                      <li key={e.contribution_id} className="text-xs">
                        <span className="tabular-nums">
                          {e.slices > 0 ? "+" : ""}
                          {formatSlices(e.slices, sliceDecimalPlaces)}
                        </span>{" "}
                        slices ·{" "}
                        <span className="text-muted-foreground">
                          {e.reason}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {currentPreview.ledger_entries.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No corrections needed — this person keeps everything they
                      hold.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={runPreview}
              disabled={isWorking || !reason}
            >
              {isWorking
                ? "Working…"
                : currentPreview
                  ? "Re-preview"
                  : "Preview the effect"}
            </Button>
            <Button
              onClick={confirm}
              disabled={isWorking || !reason || !currentPreview}
              title={
                currentPreview
                  ? undefined
                  : "Preview first — this tells you exactly what will be written"
              }
            >
              Confirm &amp; record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
