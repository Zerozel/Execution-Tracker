// ============================================================
// Execution Tracker — Slicing Pie: Add Participant Form
// ============================================================
// Adds a participant to a Pie via POST /api/pies/[id]/participants.
// Two modes:
//   • Team member — pick from the existing users table. The
//     participant row is linked by user_id, which is what lets that
//     person log time and see their own slices.
//   • External — someone not on the platform (advisor, contractor).
//     No user_id is sent, and the participant exists only inside
//     this Pie.
//
// Terms: the admin enters the ANNUAL fair-market salary. The hourly
// rate is derived automatically (annual / working_hours_per_year,
// default 2000). An optional working-hours override lets the admin
// set a different divisor for contractors or part-time roles. An
// optional contractor_rate_minor field lets the admin override the
// derived hourly rate for contractors on a negotiated rate.
// ============================================================

"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney, toMinor } from "@/lib/slicing-pie/format";
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

const DEFAULT_WORKING_HOURS = 2000;

interface Props {
  pieId: string;
  currency: string;
}

interface TeamMember {
  id: string;
  nickname: string;
  display_name: string;
  role: string;
}

export function PieParticipantForm({ pieId, currency }: Props) {
  const router = useRouter();

  // Mode: "team" uses an existing public.users row; "external" is free text.
  const [mode, setMode] = useState<"team" | "external">("team");

  // Team member list
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [teamLoading, setTeamLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState("");

  // Form fields
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<PieRole>("employee");
  const [annualSalary, setAnnualSalary] = useState("");
  const [contractorRate, setContractorRate] = useState("");
  const [hoursOverride, setHoursOverride] = useState("");
  const [showHoursOverride, setShowHoursOverride] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch the team list on mount.
  useEffect(() => {
    let cancelled = false;
    async function loadTeam() {
      try {
        const response = await fetch("/api/users");
        if (!response.ok) throw new Error("Failed to load team");
        const result = await response.json();
        if (!cancelled) {
          const members: TeamMember[] = (result.data || []).filter(
            (u: TeamMember & { is_archived?: boolean }) => !u.is_archived
          );
          setTeam(members);
        }
      } catch {
        if (!cancelled) setError("Could not load team members");
      } finally {
        if (!cancelled) setTeamLoading(false);
      }
    }
    loadTeam();
    return () => {
      cancelled = true;
    };
  }, []);

  // When a team member is selected, autofill display name.
  function handleTeamSelect(userId: string) {
    setSelectedUserId(userId);
    setError(null);
    if (!userId) {
      setDisplayName("");
      return;
    }
    const member = team.find((m) => m.id === userId);
    if (member) {
      setDisplayName(member.display_name);
    }
  }

  // Derived hourly rate from annual salary and working hours.
  function computedHourly(): number | null {
    const annual = Number(annualSalary);
    if (!Number.isFinite(annual) || annual <= 0) return null;

    const hours = showHoursOverride
      ? Number(hoursOverride) || DEFAULT_WORKING_HOURS
      : DEFAULT_WORKING_HOURS;

    if (!Number.isFinite(hours) || hours <= 0) return null;
    return annual / hours;
  }

  // If the admin has typed a contractor rate, use it. Otherwise use
  // the derived hourly. This is what gets stored as contractor_rate.
  function effectiveContractorRate(): number | null {
    const rate = Number(contractorRate);
    if (contractorRate.trim() && Number.isFinite(rate) && rate > 0) {
      return rate;
    }
    return computedHourly();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (mode === "team" && !selectedUserId) {
      setError("Please select a team member");
      return;
    }
    if (mode === "external" && !displayName.trim()) {
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
      if (mode === "team") {
        payload.user_id = selectedUserId;
      }

      const annualMajor = Number(annualSalary);
      if (annualSalary.trim() && Number.isFinite(annualMajor) && annualMajor > 0) {
        payload.fair_market_salary_minor = toMinor(annualMajor);
      }

      // Store contractor rate: explicit entry wins, else derived.
      const rate = effectiveContractorRate();
      if (rate != null) {
        payload.contractor_rate_minor = toMinor(rate);
      }

      // Working-hours override, only when the admin actually set it.
      const hours = Number(hoursOverride);
      if (
        showHoursOverride &&
        Number.isFinite(hours) &&
        hours > 0 &&
        hours !== DEFAULT_WORKING_HOURS
      ) {
        payload.working_hours_override = hours;
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

      // Reset form
      setDisplayName("");
      setSelectedUserId("");
      setAnnualSalary("");
      setContractorRate("");
      setHoursOverride("");
      setShowHoursOverride(false);
      setRole("employee");
      setIsLoading(false);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setIsLoading(false);
    }
  }

  const hourly = computedHourly();
  const rate = effectiveContractorRate();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add Participant</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Mode toggle */}
          <div className="flex gap-2 rounded-md border p-1">
            <button
              type="button"
              onClick={() => {
                setMode("team");
                setError(null);
              }}
              className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                mode === "team"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              disabled={isLoading}
            >
              Team member
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("external");
                setError(null);
                setSelectedUserId("");
              }}
              className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                mode === "external"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              disabled={isLoading}
            >
              External person
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Left column: identity */}
            <div className="space-y-2">
              {mode === "team" ? (
                <>
                  <label htmlFor="p-user" className="text-sm font-medium">
                    Team Member *
                  </label>
                  <select
                    id="p-user"
                    value={selectedUserId}
                    onChange={(e) => handleTeamSelect(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    disabled={isLoading || teamLoading}
                  >
                    <option value="">
                      {teamLoading ? "Loading..." : "Select a team member"}
                    </option>
                    {team.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.display_name} ({m.nickname})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Links this Pie to their existing account, so they can log
                    time and see their own slices.
                  </p>
                  {selectedUserId && (
                    <p className="text-xs text-muted-foreground">
                      Display name:{" "}
                      <span className="font-medium text-foreground">
                        {displayName}
                      </span>
                    </p>
                  )}
                </>
              ) : (
                <>
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
                    placeholder="e.g., Jane Advisor"
                    disabled={isLoading}
                  />
                  <p className="text-xs text-muted-foreground">
                    For people who are not on the platform — advisors,
                    external contractors, silent investors.
                  </p>
                </>
              )}
            </div>

            {/* Right column: role */}
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

          {/* Terms: annual FMV + derived hourly + contractor override */}
          <div className="rounded-md border bg-muted/30 p-3 space-y-3">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="p-salary" className="text-sm font-medium">
                  Annual Fair-Market Salary
                </label>
                <Input
                  id="p-salary"
                  type="number"
                  min="0"
                  step="1000"
                  value={annualSalary}
                  onChange={(e) => setAnnualSalary(e.target.value)}
                  placeholder="e.g. 8400000"
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground">
                  Used to value logged time (§4.1).
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Hourly rate (derived)
                </label>
                <div className="flex h-10 items-center px-3 rounded-md border bg-white text-sm tabular-nums">
                  {hourly != null
                    ? `${formatMoney(toMinor(hourly), currency)}/hr`
                    : "—"}
                </div>
                <p className="text-xs text-muted-foreground">
                  Annual ÷ working hours. Shown for reference.
                </p>
              </div>
            </div>

            {/* Working hours override toggle */}
            <div>
              <button
                type="button"
                onClick={() => setShowHoursOverride(!showHoursOverride)}
                className="text-xs text-muted-foreground hover:text-foreground"
                disabled={isLoading}
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
                    onChange={(e) => setHoursOverride(e.target.value)}
                    placeholder={String(DEFAULT_WORKING_HOURS)}
                    className="h-8 w-28"
                    disabled={isLoading}
                  />
                  <span className="text-xs text-muted-foreground">
                    (default {DEFAULT_WORKING_HOURS})
                  </span>
                </div>
              )}
            </div>

            {/* Optional contractor rate override */}
            <div className="space-y-2">
              <label htmlFor="p-rate" className="text-sm font-medium">
                Contractor hourly rate (optional override)
              </label>
              <Input
                id="p-rate"
                type="number"
                min="0"
                step="100"
                value={contractorRate}
                onChange={(e) => setContractorRate(e.target.value)}
                placeholder={
                  hourly != null
                    ? `Leave blank to use ${formatMoney(toMinor(hourly), currency)}/hr`
                    : "e.g. 4200"
                }
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                {contractorRate.trim()
                  ? `Will store ${formatMoney(toMinor(Number(contractorRate)), currency)}/hr as the contractor rate.`
                  : rate != null
                  ? `Will store ${formatMoney(toMinor(rate), currency)}/hr (derived from annual).`
                  : "Enter an annual salary above, or type a rate here."}
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
