// ============================================================
// Execution Tracker — Slicing Pie: Add Participant Form
// ============================================================
// Adds a participant to a Pie via POST /api/pies/[id]/participants.
// Optionally seeds initial terms (FMV salary / contractor rate) that
// the time & contractor calculators consume. Amounts are entered in
// major units and converted to minor units before submit.
// ============================================================

"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toMinor } from "@/lib/slicing-pie/format";
import { UserPlus } from "lucide-react";
import type { PieRole } from "@/types/slicing-pie";

const ROLES: PieRole[] = [
  "owner",
  "executive",
  "employee",
  "advisor",
  "contractor",
  "investor",
];

interface Props {
  pieId: string;
}

export function PieParticipantForm({ pieId }: Props) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<PieRole>("employee");
  const [salary, setSalary] = useState("");
  const [contractorRate, setContractorRate] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!displayName.trim()) {
      setError("Display name is required");
      return;
    }

    setIsLoading(true);
    try {
      const payload: Record<string, unknown> = {
        display_name: displayName.trim(),
        pie_role: role,
        status: "active",
      };
      if (salary.trim() && !Number.isNaN(Number(salary))) {
        payload.fair_market_salary_minor = toMinor(Number(salary));
      }
      if (contractorRate.trim() && !Number.isNaN(Number(contractorRate))) {
        payload.contractor_rate_minor = toMinor(Number(contractorRate));
      }

      const response = await fetch(`/api/pies/${pieId}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Failed to add participant");
        setIsLoading(false);
        return;
      }

      setDisplayName("");
      setSalary("");
      setContractorRate("");
      setRole("employee");
      setIsLoading(false);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setIsLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add Participant</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="p-name" className="text-sm font-medium">
                Display Name *
              </label>
              <Input
                id="p-name"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  setError(null);
                }}
                placeholder="e.g., Alice Founder"
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="p-role" className="text-sm font-medium">
                Pie Role
              </label>
              <select
                id="p-role"
                value={role}
                onChange={(e) => setRole(e.target.value as PieRole)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm capitalize ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                disabled={isLoading}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r} className="capitalize">
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="p-salary" className="text-sm font-medium">
                Fair-Market Salary (annual)
              </label>
              <Input
                id="p-salary"
                type="number"
                min="0"
                step="0.01"
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
                placeholder="e.g., 120000"
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Used to value logged time (§4.1).
              </p>
            </div>
            <div className="space-y-2">
              <label htmlFor="p-rate" className="text-sm font-medium">
                Contractor Rate (hourly)
              </label>
              <Input
                id="p-rate"
                type="number"
                min="0"
                step="0.01"
                value={contractorRate}
                onChange={(e) => setContractorRate(e.target.value)}
                placeholder="e.g., 85"
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Used for contractor time (§4.2).
              </p>
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" disabled={isLoading}>
            <UserPlus className="mr-2 h-4 w-4" />
            {isLoading ? "Adding..." : "Add Participant"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
