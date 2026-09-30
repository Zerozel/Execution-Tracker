// ============================================================
// Execution Tracker — Slicing Pie: Payday Panel (Admin)
// ============================================================
// The month-end action: preview how pending logged hours will convert
// into slices, then commit the payday. Preview is a dry run
// (GET /payday); Run commits (POST /payday), creating immutable `time`
// contributions and marking logs converted.
//
// Participants without a fair-market salary are flagged and skipped —
// the admin sets their salary (below the cap table) and re-runs.
// ============================================================

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatSlices } from "@/lib/slicing-pie/format";
import { CalendarClock, AlertTriangle } from "lucide-react";
import type { PaydayPreview } from "@/types/time-tracking";

interface Props {
  pieId: string;
  frozen: boolean;
  sliceDecimalPlaces: number;
}

function monthStart(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1)
    .toISOString()
    .split("T")[0];
}
function today(): string {
  return new Date().toISOString().split("T")[0];
}

export function PaydayPanel({ pieId, frozen, sliceDecimalPlaces }: Props) {
  const router = useRouter();
  const [periodStart, setPeriodStart] = useState(monthStart());
  const [periodEnd, setPeriodEnd] = useState(today());
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<PaydayPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadPreview() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const params = new URLSearchParams({
        period_start: periodStart,
        period_end: periodEnd,
      });
      const res = await fetch(`/api/pies/${pieId}/payday?${params}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to load preview");
      } else {
        setPreview(json.data as PaydayPreview);
      }
    } catch {
      setError("Network error while loading preview.");
    }
    setBusy(false);
  }

  async function runPayday() {
    if (
      !confirm(
        "Commit payday? This converts all pending logs in the period into permanent slice contributions."
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/pies/${pieId}/payday`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period_start: periodStart,
          period_end: periodEnd,
          note: note.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Payday failed");
      } else {
        const d = json.data;
        setMessage(
          `Payday complete: ${d.logs_converted} logs → ${formatSlices(
            d.total_slices,
            sliceDecimalPlaces
          )} slices for ${d.participants_count} participant(s)` +
            (d.skipped_no_salary > 0
              ? `. ${d.skipped_no_salary} skipped (no salary set).`
              : ".")
        );
        setPreview(null);
        router.refresh();
      }
    } catch {
      setError("Network error while running payday.");
    }
    setBusy(false);
  }

  if (frozen) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          This Pie is frozen — payday is closed.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 text-violet-600">
            <CalendarClock className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium">Run Payday</p>
            <p className="text-xs text-muted-foreground">
              Convert logged hours into equity slices.
            </p>
          </div>
        </div>

        <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Period start</label>
            <Input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Period end</label>
            <Input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              disabled={busy}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Note</label>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional (e.g. 'August payday')"
            disabled={busy}
          />
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={loadPreview} disabled={busy}>
            {busy ? "Loading…" : "Preview"}
          </Button>
          <Button
            onClick={runPayday}
            disabled={busy || !preview || preview.total_logs === 0}
          >
            Run Payday
          </Button>
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="text-sm text-emerald-700" role="status">
            {message}
          </p>
        )}

        {/* Preview table */}
        {preview && (
          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                Projection ({preview.total_logs} pending logs)
              </span>
              <span className="text-muted-foreground">
                {formatSlices(preview.total_slices, sliceDecimalPlaces)} slices
              </span>
            </div>

            {preview.total_logs === 0 ? (
              <p className="text-sm text-muted-foreground">
                No pending logs in this period.
              </p>
            ) : (
              <div className="space-y-1.5">
                {preview.rows.map((row) => (
                  <div
                    key={row.participant_id}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{row.display_name}</span>
                      {!row.has_salary && (
                        <Badge
                          variant="outline"
                          className="gap-1 border-amber-300 text-amber-700"
                        >
                          <AlertTriangle className="h-3 w-3" />
                          No salary
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 tabular-nums">
                      <span className="text-muted-foreground">
                        {row.total_hours}h
                      </span>
                      <span className="font-medium">
                        {row.has_salary
                          ? formatSlices(
                              row.projected_slices,
                              sliceDecimalPlaces
                            )
                          : "—"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {preview.skipped_no_salary > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                {preview.skipped_no_salary} participant(s) will be skipped until
                a fair-market salary is set.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
