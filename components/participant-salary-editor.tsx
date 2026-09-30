// ============================================================
// Execution Tracker — Slicing Pie: Participant Salary Editor (Admin)
// ============================================================
// Lets an admin set each participant's FAIR-MARKET SALARY (annual),
// which payday uses to convert their logged hours into slices. Edits
// are effective-dated and PROSPECTIVE — historical contributions keep
// their frozen snapshot (§21).
//
// Salary is entered in MAJOR units (e.g. dollars) and stored as minor
// units. A missing salary is highlighted so admins know payday will
// skip that person.
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

export function ParticipantSalaryEditor({
  pieId,
  currency,
  participants,
}: Props) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit(p: ParticipantWithSalary) {
    setEditingId(p.id);
    setValue(
      p.current_salary_minor != null
        ? String(fromMinor(p.current_salary_minor))
        : ""
    );
    setError(null);
  }

  function cancel() {
    setEditingId(null);
    setValue("");
    setError(null);
  }

  async function save(participantId: string) {
    const major = Number(value);
    if (!Number.isFinite(major) || major < 0) {
      setError("Enter a valid annual salary.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/pies/${pieId}/participants/${participantId}/terms`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fair_market_salary_minor: toMinor(major),
            note: "Salary update",
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to save salary");
        setBusy(false);
        return;
      }
      setEditingId(null);
      setValue("");
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
          payday. Changes apply going forward only.
        </p>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <div className="space-y-1.5">
          {participants.map((p) => {
            const isEditing = editingId === p.id;
            return (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{p.display_name}</span>
                  <span className="ml-2 text-xs capitalize text-muted-foreground">
                    {p.pie_role}
                  </span>
                </div>

                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      step="1000"
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      placeholder="Annual salary"
                      className="h-8 w-36"
                      disabled={busy}
                      autoFocus
                    />
                    <Button
                      size="sm"
                      onClick={() => save(p.id)}
                      disabled={busy}
                      className="h-8 px-2"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={cancel}
                      disabled={busy}
                      className="h-8 px-2"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
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
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
