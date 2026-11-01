// ============================================================
// Execution Tracker — Slicing Pie: Participant Salary Editor (Admin)
// ============================================================
// Lets an admin set each participant's FAIR-MARKET SALARY (annual),
// which payday uses to convert their logged hours into slices. Edits
// are effective-dated and PROSPECTIVE — historical contributions keep
// their frozen snapshot (§21).
//
// Input is ANNUAL salary. The hourly rate is derived:
//   hourly = annual / working_hours_per_year
//
// Default working hours = 2,000 (40h/wk × 50wk, allowing two weeks
// holiday). The admin can override per participant for contractors
// or part-time roles.
// ============================================================

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMoney, toMinor, fromMinor } from "@/lib/slicing-pie/format";
import { Pencil, Check, X } from "lucide-react";
import type { PieParticipant } from "@/types/slicing-pie";

interface ParticipantWithSalary extends PieParticipant {
  /** Current effective annual salary in minor units, if any. */
  current_salary_minor: number | null;
}

interface Props {
  pieId: string;
  currency: string;
  participants: ParticipantWithSalary[];
}

const DEFAULT_WORKING_HOURS = 2000;

export function ParticipantSalaryEditor({
  pieId,
  currency,
  participants,
}: Props) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [annualValue, setAnnualValue] = useState("");
  const [hoursOverride, setHoursOverride] = useState("");
  const [showHoursOverride, setShowHoursOverride] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit(p: ParticipantWithSalary) {
    setEditingId(p.id);
    setAnnualValue(
      p.current_salary_minor != null
        ? String(fromMinor(p.current_salary_minor))
        : ""
    );
    setHoursOverride("");
    setShowHoursOverride(false);
    setError(null);
  }

  function cancel() {
    setEditingId(null);
    setAnnualValue("");
    setHoursOverride("");
    setShowHoursOverride(false);
    setError(null);
  }

  // Derived hourly rate for display while typing.
  function computedHourly(): number | null {
    const annual = Number(annualValue);
    if (!Number.isFinite(annual) || annual <= 0) return null;

    const hours = showHoursOverride
      ? Number(hoursOverride) || DEFAULT_WORKING_HOURS
      : DEFAULT_WORKING_HOURS;

    if (!Number.isFinite(hours) || hours <= 0) return null;
    return annual / hours;
  }

  async function save(participantId: string) {
    const annualMajor = Number(annualValue);
    if (!Number.isFinite(annualMajor) || annualMajor < 0) {
      setError("Enter a valid annual salary.");
      return;
    }

    const hours = showHoursOverride
      ? Number(hoursOverride) || DEFAULT_WORKING_HOURS
      : DEFAULT_WORKING_HOURS;

    if (showHoursOverride && (!Number.isFinite(hours) || hours <= 0)) {
      setError("Working hours per year must be a positive number.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const payload: Record<string, unknown> = {
        fair_market_salary_minor: toMinor(annualMajor),
        note: "Salary update",
      };

      // Only send working_hours_override when the admin has explicitly
      // set it. Null means "use the default".
      if (showHoursOverride && hours !== DEFAULT_WORKING_HOURS) {
        payload.working_hours_override = hours;
      }

      const res = await fetch(
        `/api/pies/${pieId}/participants/${participantId}/terms`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to save salary");
        setBusy(false);
        return;
      }
      setEditingId(null);
      setAnnualValue("");
      setHoursOverride("");
      setShowHoursOverride(false);
      setBusy(false);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-2 pt-6">
        <p className="text-sm text-muted-foreground">
          Fair-market salaries drive how logged hours convert to slices at
          payday. Enter the ANNUAL salary — the hourly rate is derived
          automatically. Changes apply going forward only.
        </p>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <div className="space-y-1.5">
          {participants.map((p) => {
            const isEditing = editingId === p.id;
            const hourly = isEditing ? computedHourly() : null;

            return (
              <div
                key={p.id}
                className="rounded-md border px-3 py-2 space-y-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{p.display_name}</span>
                    <span className="ml-2 text-xs capitalize text-muted-foreground">
                      {p.pie_role}
                    </span>
                  </div>

                  {!isEditing && (
                    <div className="flex items-center gap-3">
                      {p.current_salary_minor != null ? (
                        <span className="text-sm tabular-nums">
                          {formatMoney(p.current_salary_minor, currency)}/yr
                        </span>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-amber-300 text-amber-700"
                        >
                          No salary set
                        </Badge>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => startEdit(p)}
                        className="h-8 px-2"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>

                {isEditing && (
                  <div className="space-y-2 border-t pt-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex-1 min-w-[180px]">
                        <label className="text-xs text-muted-foreground">
                          Annual salary
                        </label>
                        <Input
                          type="number"
                          min="0"
                          step="1000"
                          value={annualValue}
                          onChange={(e) => setAnnualValue(e.target.value)}
                          placeholder="e.g. 120000"
                          className="h-9 mt-1"
                          disabled={busy}
                          autoFocus
                        />
                      </div>

                      <div className="flex-1 min-w-[180px]">
                        <label className="text-xs text-muted-foreground">
                          Hourly rate (computed)
                        </label>
                        <div className="h-9 mt-1 flex items-center px-3 rounded-md border bg-muted text-sm tabular-nums">
                          {hourly != null
                            ? `${formatMoney(toMinor(hourly), currency)}/hr`
                            : "—"}
                        </div>
                      </div>
                    </div>

                    {/* Working hours override toggle */}
                    <div>
                      <button
                        type="button"
                        onClick={() =>
                          setShowHoursOverride(!showHoursOverride)
                        }
                        className="text-xs text-muted-foreground hover:text-foreground"
                        disabled={busy}
                      >
                        {showHoursOverride
                          ? "− Hide working-hours override"
                          : "+ Override working hours per year"}
                      </button>
                      {showHoursOverride && (
                        <div className="mt-2 flex items-center gap-2">
                          <label className="text-xs text-muted-foreground">
                            Hours/year
                          </label>
                          <Input
                            type="number"
                            min="1"
                            step="100"
                            value={hoursOverride}
                            onChange={(e) =>
                              setHoursOverride(e.target.value)
                            }
                            placeholder={String(DEFAULT_WORKING_HOURS)}
                            className="h-8 w-28"
                            disabled={busy}
                          />
                          <span className="text-xs text-muted-foreground">
                            (default {DEFAULT_WORKING_HOURS})
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={cancel}
                        disabled={busy}
                      >
                        <X className="mr-1 h-3.5 w-3.5" />
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => save(p.id)}
                        disabled={busy}
                      >
                        <Check className="mr-1 h-3.5 w-3.5" />
                        {busy ? "Saving…" : "Save"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="pt-2 text-xs text-muted-foreground">
          Hourly rate = annual salary ÷ working hours per year. The default
          assumes 2,000 hours (40h/week × 50 weeks, allowing two weeks of
          holiday). Override this for contractors or part-time roles.
        </p>
      </CardContent>
    </Card>
  );
}
