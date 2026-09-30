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
// ============================================================

import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase";
import { loadMySlices } from "@/lib/slicing-pie/server/my-slices";
import { formatMoney, formatPercent, formatSlices } from "@/lib/slicing-pie/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, PieChart, ShieldCheck } from "lucide-react";
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
  const user = await requireAuth();
  const supabase = await createClient();

  // Which Pies is this user a participant in? (Same lookup as My Time —
  // the caller's own rows only.)
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
                    Slices are not the same as money. A ₦100 expense earns ×
                    4 — four hundred slices — while an hour of work earns × 2,
                    and a slice&apos;s cash value only exists when the
                    business is sold or pays out.
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
