// ============================================================
// Execution Tracker — My Slices (Member Self-Service)
// ============================================================
// What a team member is entitled to see about their own equity, and
// nothing more. Open to ALL authenticated users (not just admins) —
// this is the member's own number, not the Pie.
//
// Everything on this page comes from loadMySlices(), which finds the
// caller's participant row BY user_id and scopes every other query to
// it. There is no parameter anywhere in this path that widens the scope,
// so a member cannot reach another member's figures by editing a URL.
//
// Open items carried as TODO(confirm) below:
//   1. Source of the Pie's non-cash multiplier (CONFIG-001). The spec
//      says it is a Pie-level setting; this page reads it from
//      `compensation.non_cash_multiplier`, which my-slices.ts must
//      populate from resolvePieConfig(). If that derivation is wrong,
//      the "what one hour earns" figure is wrong by the same factor.
//   2. "Still at risk" is derived from planDrawdown(0, …), which the
//      implementation plan (§8) identifies as the top open correctness
//      risk for ledgers containing cash_payment_to_participant rows
//      (HARD-VAL-004). A disclaimer is shown; the authoritative figure
//      is computed at departure.
// ============================================================

import { requireAuthWithTerms } from "@/lib/auth";
import { createClient } from "@/lib/supabase";
import { loadMySlices } from "@/lib/slicing-pie/server/my-slices";
import { formatMoney, formatPercent, formatSlices } from "@/lib/slicing-pie/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, PieChart, ShieldCheck, Wallet } from "lucide-react";
import Link from "next/link";
import type { PieParticipant } from "@/types/slicing-pie";

/** Plain-language names for the member's status in the Pie. */
const STATUS_WORDS: Record<string, string> = {
  candidate: "Not started yet",
  active: "Contributing",
  absentee: "Stepped back — keeping the slices you earned",
  departed: "Left — your exit has been recorded",
  bought_out: "Bought out — settled and closed",
};

export default async function MySlicesPage() {
  const user = await requireAuthWithTerms();
  const supabase = await createClient();

  const { data: participantRows } = await supabase
    .from("pie_participants")
    .select("id, pie_id, display_name, pie_role, status")
    .eq("user_id", user.id);

  const memberships = (participantRows ?? []) as Pick<
    PieParticipant,
    "id" | "pie_id" | "display_name" | "pie_role" | "status"
  >[];

  const results = await Promise.all(
    memberships.map(async (m) => ({
      membership: m,
      result: await loadMySlices(m.pie_id, user.id),
    }))
  );

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <PieChart className="h-7 w-7" />
          My Slices
        </h1>
        <p className="mt-1 text-muted-foreground">
          Your own equity: what you have earned, what it is worth, and where
          it came from.
        </p>
        <p className="mt-3 flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            This page shows only your own numbers. Nobody else on the team can
            see them, and you cannot see theirs — only an administrator sees
            the whole Pie.
          </span>
        </p>
      </div>

      {memberships.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            You&apos;re not part of any equity Pie yet. An administrator needs
            to add you as a participant, and your slices will show up here.
          </CardContent>
        </Card>
      )}

      {results.map(({ membership, result }) => {
        if (!result.ok) {
          return (
            <Card key={membership.pie_id}>
              <CardContent className="py-6 text-sm text-muted-foreground">
                {result.error}
              </CardContent>
            </Card>
          );
        }

        const d = result.payload;
        const { currency } = d.pie;
        const { slice_decimal_places: sdp, percent_decimal_places: pdp } =
          d.ownership;
        const hasSlices = d.ownership.slices !== 0;
        const comp = d.compensation;

        // One hour of approved work earns: (hourly rate in major units)
        // × the Slicing Pie non-cash time multiplier.
        //
        // Spec TIME-003: Slices Per Hour = Hourly Rate × Non-Cash Multiplier.
        // Spec TIME-001: Hourly Rate = Annual FMV Salary ÷ Working Hours,
        //   denominated in major currency units.
        // Spec CORE-002: Slices = Fair Market Value × Multiplier; a slice
        //   is dimensionless (Ch.3) — 1 slice is not 1 kobo.
        //
        // hourly_minor is in minor units, so divide by 100 before applying
        // the multiplier. ₦8,400/hr × 2 = 16,800 slices (not 1,680,000).
        const oneHourSlices =
          comp?.hourly_minor != null && comp.non_cash_multiplier > 0
            ? (comp.hourly_minor / 100) * comp.non_cash_multiplier
            : null;

        return (
          <section key={d.pie.id} className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-semibold">{d.pie.name}</h2>
              <Badge variant="outline" className="text-xs capitalize">
                {d.me.pie_role}
              </Badge>
              {d.pie.status === "frozen" && (
                <Badge variant="secondary" className="text-xs">
                  Frozen — ownership locked
                </Badge>
              )}
              {d.me.status !== "active" && (
                <Badge variant="secondary" className="text-xs">
                  {STATUS_WORDS[d.me.status] ?? d.me.status}
                </Badge>
              )}
            </div>

            {/* ---- The headline numbers ---- */}
            <div className="grid gap-3 sm:grid-cols-3">
              <Card>
                <CardContent className="py-5">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Your slices
                  </p>
                  <p className="mt-1 text-2xl font-bold tabular-nums">
                    {formatSlices(d.ownership.slices, sdp)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-5">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Your share of the Pie
                  </p>
                  <p className="mt-1 text-2xl font-bold tabular-nums">
                    {hasSlices
                      ? formatPercent(d.ownership.percent, { decimalPlaces: pdp })
                      : "—"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {d.ownership.pie_total_slices > 0
                      ? `out of ${formatSlices(
                          d.ownership.pie_total_slices,
                          sdp
                        )} slices in this Pie`
                      : "the Pie has no slices yet"}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-5">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Still at risk
                  </p>
                  <p className="mt-1 text-2xl font-bold tabular-nums">
                    {formatMoney(d.at_risk.total_minor, currency)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    value you have put in that has not been paid back
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* ---- Compensation terms (collapsible) ---- */}
            {comp && (
              <Card>
                <CardContent className="py-0">
                  <details className="group">
                    <summary className="cursor-pointer list-none py-4 flex items-center justify-between">
                      <span className="flex items-center gap-2 font-medium">
                        <Wallet className="h-4 w-4 text-emerald-600" />
                        Your compensation terms
                      </span>
                      <span className="text-xs text-muted-foreground group-open:hidden">
                        Show
                      </span>
                      <span className="text-xs text-muted-foreground hidden group-open:inline">
                        Hide
                      </span>
                    </summary>

                    <div className="space-y-4 pb-4 border-t pt-4">
                      {/* Rates grid */}
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            Annual FMV
                          </p>
                          <p className="mt-1 text-base font-semibold tabular-nums">
                            {comp.annual_minor != null
                              ? formatMoney(comp.annual_minor, currency)
                              : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            Monthly
                          </p>
                          <p className="mt-1 text-base font-semibold tabular-nums">
                            {comp.monthly_minor != null
                              ? formatMoney(comp.monthly_minor, currency)
                              : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            Hourly rate
                          </p>
                          <p className="mt-1 text-base font-semibold tabular-nums">
                            {comp.hourly_minor != null
                              ? `${formatMoney(comp.hourly_minor, currency)}/hr`
                              : "—"}
                          </p>
                        </div>
                      </div>

                      {/* Working hours */}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          Working hours per year
                        </span>
                        <span className="tabular-nums">
                          {comp.effective_working_hours.toLocaleString()}
                          {comp.working_hours_override != null && (
                            <span className="ml-2 text-xs text-amber-700">
                              (custom override)
                            </span>
                          )}
                        </span>
                      </div>

                      {/* Effective date + historical-rate caveat (EDGE-024) */}
                      {comp.effective_from && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            Current rate since
                          </span>
                          <span className="tabular-nums">
                            {comp.effective_from}
                          </span>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">
                        These are your <em>current</em> terms. A rate change
                        never rewrites past entries — slices you earned before
                        the date above were calculated at the rate then in
                        force, and are unaffected by this update.
                      </p>

                      {/* Calculation */}
                      <div className="rounded-md bg-muted/40 p-3 space-y-1.5 text-xs text-muted-foreground">
                        <p className="font-medium text-foreground">
                          How this is calculated
                        </p>
                        <ul className="space-y-1 list-disc list-inside">
                          <li>
                            Hourly rate = Annual ÷ Working hours
                            {comp.annual_minor != null &&
                              comp.hourly_minor != null && (
                                <>
                                  {" "}
                                  ={" "}
                                  {formatMoney(comp.annual_minor, currency)} ÷{" "}
                                  {comp.effective_working_hours.toLocaleString()}{" "}
                                  = {formatMoney(comp.hourly_minor, currency)}/hr
                                </>
                              )}
                          </li>
                          <li>
                            Monthly = Annual ÷ 12
                            {comp.annual_minor != null &&
                              comp.monthly_minor != null && (
                                <>
                                  {" "}
                                  = {formatMoney(comp.annual_minor, currency)} ÷
                                  12 ={" "}
                                  {formatMoney(comp.monthly_minor, currency)}
                                </>
                              )}
                          </li>
                          {comp.contractor_rate_minor != null && (
                            <li>
                              A contractor rate of{" "}
                              {formatMoney(comp.contractor_rate_minor, currency)}
                              /hr is on file and overrides the derived rate.
                            </li>
                          )}
                        </ul>
                      </div>

                      {/* What one hour earns */}
                      {oneHourSlices != null && (
                        <div className="rounded-md border border-emerald-200 bg-emerald-50/50 p-3 text-xs">
                          <p className="font-medium text-emerald-900">
                            What one hour of approved work earns you
                          </p>
                          <p className="text-emerald-800 mt-1">
                            {formatMoney(comp.hourly_minor!, currency)} ×{" "}
                            {comp.non_cash_multiplier}× (Pie&apos;s non-cash
                            multiplier, CONFIG-001) ={" "}
                            <span className="font-semibold tabular-nums">
                              {formatSlices(oneHourSlices, sdp)} slices
                            </span>
                          </p>
                          <p className="text-emerald-700 mt-1.5 text-[11px]">
                            Slices are not the same as money. A slice&apos;s
                            cash value only exists when the business is sold or
                            pays out.
                          </p>
                        </div>
                      )}

                      <p className="text-xs text-muted-foreground">
                        FMV is a valuation benchmark, not a cash obligation. It
                        is what the Pie uses to price your logged hours — not a
                        promise of salary.
                      </p>
                    </div>
                  </details>
                </CardContent>
              </Card>
            )}

            {/* ---- Not set warning ---- */}
            {!comp && (
              <Card className="border-amber-200 bg-amber-50/50">
                <CardContent className="py-4 text-sm text-amber-800">
                  No fair-market salary has been set for you in this Pie yet.
                  Payday will skip your logged hours until an administrator
                  sets one. Ask them to set your FMV on the Pie dashboard.
                </CardContent>
              </Card>
            )}

            {!hasSlices && d.hours.logged === 0 && (
              <Card>
                <CardContent className="py-6 text-sm text-muted-foreground">
                  Nothing has been recorded for you in this Pie yet. Log your
                  hours on{" "}
                  <Link href="/my-time" className="underline">
                    My Time
                  </Link>{" "}
                  — they turn into slices at payday.
                </CardContent>
              </Card>
            )}

            {/* ---- Where the slices came from ---- */}
            {d.by_category.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    Where your slices came from
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {d.by_category.map((row) => (
                    <div
                      key={row.category}
                      className="flex items-center justify-between gap-4 text-sm"
                    >
                      <span className="text-muted-foreground">
                        {row.category}
                      </span>
                      <span className="font-medium tabular-nums">
                        {formatSlices(row.slices, sdp)}
                      </span>
                    </div>
                  ))}
                  <p className="pt-2 text-xs text-muted-foreground">
                    Slices are not the same as money. Each contribution is
                    multiplied by the Pie&apos;s factor for its type before it
                    becomes slices, and a slice&apos;s cash value only exists
                    when the business is sold or pays out. Whether new royalty
                    or rent entries still accrue after you leave depends on
                    the Pie&apos;s departure policy.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* ---- What is still at risk ---- */}
            {d.at_risk.total_minor > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    Still at risk
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">
                      Money and property you put in
                    </span>
                    <span className="font-medium tabular-nums">
                      {formatMoney(d.at_risk.cash_minor, currency)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">
                      Work you did unpaid
                    </span>
                    <span className="font-medium tabular-nums">
                      {formatMoney(d.at_risk.non_cash_minor, currency)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4 border-t pt-2 font-medium">
                    <span>Total unpaid</span>
                    <span className="tabular-nums">
                      {formatMoney(d.at_risk.total_minor, currency)}
                    </span>
                  </div>
                  <p className="pt-1 text-xs text-muted-foreground">
                    This is what the Pie still owes you for. Anything you have
                    already been paid comes off automatically — you are never
                    credited twice for the same money.
                  </p>
                  {/* Plan §8: recovery-vs-payment is the top open correctness
                      item. The figure above is informational; departure
                      recalculates it against the full ledger. */}
                  <p className="pt-1 text-xs text-muted-foreground">
                    This figure is for information. When you leave, your final
                    recovery is recalculated against the full ledger.
                  </p>
                  <details className="pt-1">
                    <summary className="cursor-pointer text-xs text-muted-foreground">
                      How this is calculated
                    </summary>
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {d.at_risk.explanation.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  </details>
                </CardContent>
              </Card>
            )}

            {/* ---- Hours ---- */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock className="h-4 w-4" />
                  Your hours
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Logged in total
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {d.hours.logged}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Waiting for payday
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {d.hours.awaiting_payday}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Already turned into slices
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {d.hours.converted}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground sm:col-span-3">
                  Hours sitting at &ldquo;waiting for payday&rdquo; are logged
                  but not yet slices. That happens on the next payday run —
                  log more on{" "}
                  <Link href="/my-time" className="underline">
                    My Time
                  </Link>
                  .
                </p>
              </CardContent>
            </Card>

            {/* ---- The ledger rows behind the numbers ---- */}
            {d.recent.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    Your entries
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {d.recent.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-start justify-between gap-4 border-b pb-2 text-sm last:border-b-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">
                          {c.type_label}
                          {c.corrects_a_previous_row && (
                            <Badge
                              variant="outline"
                              className="ml-2 align-middle text-[10px]"
                            >
                              correction
                            </Badge>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {c.event_date}
                          {c.multiplier_applied > 1 && (
                            <> · ×{c.multiplier_applied} multiplier</>
                          )}
                          {c.notes ? <> · {c.notes}</> : null}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-medium tabular-nums">
                          {c.slices > 0 ? "+" : ""}
                          {formatSlices(c.slices, sdp)}
                        </p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {formatMoney(c.fmv_minor, currency)}
                        </p>
                      </div>
                    </div>
                  ))}
                  {d.recent_total > d.recent.length && (
                    <p className="text-xs text-muted-foreground">
                      Showing the most recent {d.recent.length} of{" "}
                      {d.recent_total} entries.
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Negative figures are payments out of the Pie to you. The
                    ledger keeps every entry forever, so a correction appears
                    as an extra row rather than as a change to an old one.
                  </p>
                </CardContent>
              </Card>
            )}
          </section>
        );
      })}
    </div>
  );
}
