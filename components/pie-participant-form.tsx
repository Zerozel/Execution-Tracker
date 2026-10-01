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
// Optionally seeds initial terms (FMV salary / contractor rate) that
// the time & contractor calculators consume. Amounts are entered in
// major units and converted to minor units before submit.
// ============================================================

"use client";

import { useState, useEffect, type FormEvent } from "react";
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

interface TeamMember {
  id: string;
  nickname: string;
  display_name: string;
  role: string;
}

export function PieParticipantForm({ pieId }: Props) {
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
  const [salary, setSalary] = useState("");
  const [contractorRate, setContractorRate] = useState("");
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

      // Reset form
      setDisplayName("");
      setSelectedUserId("");
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

  // A user who is already a participant in this Pie should not appear
  // in the "add" dropdown. The parent page passes the current list.
  // (Kept simple here: we still show all — the API allows duplicates
  // and the admin can delete one if it was a mistake. See note below.)

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

          {/* Terms */}
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
