// ============================================================
// Execution Tracker — Slicing Pie: Pie Dashboard
// ============================================================
// The single-Pie workspace. Server-renders the live cap table (via the
// pure engine) plus the Well, and composes client panels for adding
// participants, logging contributions (with live preview), Well
// transactions, setting fair-market salaries, and running payday.
// Admin only.
// ============================================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase";
import { resolvePieConfig } from "@/lib/slicing-pie/server/context";
import { buildCapTable } from "@/lib/slicing-pie/engine/captable";
import { wellOwnership } from "@/lib/slicing-pie/engine/well";
import {
  canApplyStandardRecovery,
  canTerminate,
} from "@/lib/slicing-pie/engine/policy";
import { PieCapTable } from "@/components/pie-cap-table";
import { PieParticipantForm } from "@/components/pie-participant-form";
import { PieContributionForm } from "@/components/pie-contribution-form";
import { PieWellPanel } from "@/components/pie-well-panel";
import { PaydayPanel } from "@/components/payday-panel";
import { ParticipantSalaryEditor } from "@/components/participant-salary-editor";
import { PendingReferralsPanel } from "@/components/pending-referrals-panel";
import { AdminWorkingNow } from "@/components/admin-working-now";
import { AdminDailyReview } from "@/components/admin-daily-review";
import {
  PieDeparturePanel,
  type DepartureCandidate,
} from "@/components/pie-departure-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatSlices } from "@/lib/slicing-pie/format";
import { ArrowLeft, Settings, ShieldCheck } from "lucide-react";
import type {
  Contribution,
  ParticipantTermsVersion,
  Pie,
  PieParticipant,
  Well,
} from "@/types/slicing-pie";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PieDashboardPage({ params }: PageProps) {
  await requireAdmin();
  const { id } = await params;

  const supabase = await createClient();

  const { data: pieData } = await supabase
    .from("pies")
    .select("*")
    .eq("id", id)
    .single();

  if (!pieData) notFound();
  const pie = pieData as Pie;

  const [{ data: participantsData }, { data: contributionsData }, { data: wellData }] =
    await Promise.all([
      supabase.from("pie_participants").select("*").eq("pie_id", id),
      supabase.from("contributions").select("*").eq("pie_id", id),
      supabase.from("wells").select("*").eq("pie_id", id).single(),
    ]);

  const participants = (participantsData ?? []) as PieParticipant[];
  const contributions = (contributionsData ?? []) as Contribution[];
  const well = (wellData ?? null) as Well | null;

  const { data: wellTxData } = well
    ? await supabase
        .from("well_transactions")
        .select("id, participant_id, kind, amount_minor, created_at")
        .eq("well_id", well.id)
    : { data: [] };
  const wellOwn = wellOwnership(
    (wellTxData ?? []) as Parameters<typeof wellOwnership>[0]
  );

  const { settings } = await resolvePieConfig(id);

  const today = new Date().toISOString().split("T")[0];
  const participantIds = participants.map((p) => p.id);
  const termsByParticipant = new Map<string, number | null>();
  if (participantIds.length > 0) {
    const { data: termsData } = await supabase
      .from("participant_terms_versions")
      .select("*")
      .in("participant_id", participantIds);
    const terms = (termsData ?? []) as ParticipantTermsVersion[];
    for (const pid of participantIds) {
      const effective = terms
        .filter(
          (t) => t.participant_id === pid && (t.effective_from || "") <= today
        )
        .sort((a, b) =>
          (b.effective_from || "").localeCompare(a.effective_from || "")
        )[0];
      termsByParticipant.set(
        pid,
        effective?.fair_market_salary_minor ?? null
      );
    }
  }

  const participantsWithSalary = participants.map((p) => ({
    ...p,
    current_salary_minor: termsByParticipant.get(p.id) ?? null,
  }));

  const capTable = buildCapTable(id, participants, contributions, {
    sliceDecimalPlaces: settings.slice_decimal_places,
    percentDecimalPlaces: settings.percent_decimal_places,
    frozen: pie.status === "frozen",
  });

  const statusVariant: Record<Pie["status"], "default" | "secondary" | "outline"> = {
    setup: "outline",
    active: "default",
    frozen: "secondary",
  };

  const activeParticipants = participants.filter(
    (p) => p.status === "active" || p.status === "candidate"
  );

  const capRowById = new Map(capTable.rows.map((r) => [r.participant_id, r]));
  const departureCandidates: DepartureCandidate[] = participants.map((p) => {
    const row = capRowById.get(p.id);
    const termination = canTerminate(p);
    const recoveryGuard = canApplyStandardRecovery(p);
    return {
      id: p.id,
      display_name: p.display_name,
      pie_role: p.pie_role,
      status: p.status,
      slices: row?.slices ?? 0,
      pct: row?.pct ?? 0,
      can_terminate: termination.allowed,
      termination_reason: termination.reason ?? null,
      can_standard_recovery: recoveryGuard.allowed,
      recovery_reason: recoveryGuard.reason ?? null,
    };
  });

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Header */}
      <div>
        <Link
          href="/pies"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          All Pies
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">{pie.name}</h1>
          <Badge variant={statusVariant[pie.status]} className="capitalize">
            {pie.status}
          </Badge>
          <Link
            href={`/pies/${id}/records`}
            className="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ShieldCheck className="h-4 w-4" />
            Records &amp; proof
          </Link>
          <Link
            href={`/pies/${id}/settings`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </div>
        <p className="mt-1 text-muted-foreground">
          {pie.currency} · Total slices:{" "}
          <span className="font-medium text-foreground">
            {formatSlices(capTable.total_slices, settings.slice_decimal_places)}
          </span>
        </p>
      </div>

      {/* Cap table */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Ownership (Cap Table)</h2>
        <PieCapTable
          capTable={capTable}
          currency={pie.currency}
          sliceDecimalPlaces={settings.slice_decimal_places}
        />
      </section>

      {/* Working now — live session dashboard */}
      <AdminWorkingNow pieId={id} />

      {/* Today's work — review queue */}
      <AdminDailyReview pieId={id} />

      {/* Payday — convert logged hours into slices */}
      {pie.status !== "frozen" && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Payday</h2>
          <PaydayPanel
            pieId={id}
            frozen={false}
            sliceDecimalPlaces={settings.slice_decimal_places}
          />
        </section>
      )}

      {/* Fair-market salaries — drive payday conversion */}
      {participants.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Fair-Market Salaries</h2>
          <ParticipantSalaryEditor
            pieId={id}
            currency={pie.currency}
            participants={participantsWithSalary}
          />
        </section>
      )}

      {/* The Well */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">The Well</h2>
        <PieWellPanel
          pieId={id}
          balanceMinor={well?.balance_minor ?? 0}
          currency={pie.currency}
          participants={activeParticipants}
          ownership={wellOwn}
          frozen={pie.status === "frozen"}
        />
      </section>

      {/* Referrals waiting out the CONFIG-016 period. Self-hiding. */}
      <PendingReferralsPanel
        pieId={id}
        currency={pie.currency}
        participants={participants}
      />

      {/* Contributions entry */}
      {pie.status !== "frozen" ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Log a Contribution</h2>
          {activeParticipants.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                Add a participant below before logging contributions.
              </CardContent>
            </Card>
          ) : (
            <PieContributionForm
              pieId={id}
              participants={activeParticipants}
              enabledTypes={settings.enabled_contribution_types}
              projectTags={settings.project_tags}
            />
          )}
        </section>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pie is frozen</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Ownership is locked at the freeze snapshot. No new contributions,
            Well transactions, or buyouts can be recorded.
          </CardContent>
        </Card>
      )}

      {/* Participants */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          Participants ({participants.length})
        </h2>
        <div className="space-y-2">
          {participants.map((p) => (
            <Card key={p.id}>
              <CardContent className="flex items-center justify-between py-3">
                <div>
                  <span className="font-medium">{p.display_name}</span>
                  <span className="ml-2 text-xs capitalize text-muted-foreground">
                    {p.pie_role}
                  </span>
                </div>
                <Badge variant="outline" className="text-xs capitalize">
                  {p.status}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
        <PieParticipantForm pieId={id} />
      </section>

      {/* Departures — recover slices when someone leaves */}
      {pie.status !== "frozen" && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Someone is leaving</h2>
          <PieDeparturePanel
            pieId={id}
            currency={pie.currency}
            sliceDecimalPlaces={settings.slice_decimal_places}
            percentDecimalPlaces={settings.percent_decimal_places}
            loyalClauseMode={settings.loyal_employee_clause.mode}
            candidates={departureCandidates}
          />
        </section>
      )}
    </div>
  );
}
