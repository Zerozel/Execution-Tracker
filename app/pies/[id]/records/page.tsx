// ============================================================
// Execution Tracker — Slicing Pie: Records & proof (W6)
// ============================================================
// The page that answers "prove it" (decision D3).
//
// Three things, in the order a challenge actually arrives:
//
//   1. The check. Every ledger row is re-derived from its own stored
//      inputs and its own frozen settings, and the result is shown as a
//      plain pass or fail. A failure is a defect, not a judgement call.
//   2. The structural claims — corrections name real rows, are not
//      backdated, every row has an owner. Stated as sentences, so a
//      reader can see WHAT was checked and not just that it passed.
//   3. The evidence: the ledger at any past date, and a download of the
//      whole history in a form that does not need this app to read.
//
// Admin only — the whole Pie, per D1.
//
// No client JavaScript: the as-of control is a plain GET form, so the
// page works even if hydration fails, and a chosen date is a shareable
// URL rather than component state. That matters here — the output of this
// page is meant to be shown to someone else.
// ============================================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { loadPieForExport } from "@/lib/slicing-pie/server/export";
import { probeLedgerImmutability } from "@/lib/slicing-pie/server/immutability";
import { auditLedger, possibleDoubleEntries } from "@/lib/slicing-pie/engine/audit";
import { buildCapTable, capTableAsOf } from "@/lib/slicing-pie/engine/captable";
import { formatSlices } from "@/lib/slicing-pie/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileJson,
  ShieldCheck,
  XCircle,
} from "lucide-react";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ as_of?: string; probe?: string }>;
}

/** Today, as the ledger would write it. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function RecordsPage({ params, searchParams }: PageProps) {
  await requireAdmin();
  const { id } = await params;
  const { as_of, probe } = await searchParams;

  const loaded = await loadPieForExport(id);
  if (!loaded.ok) notFound();
  const { pie, settings, participants, contributions, time_logs } = loaded.data;

  const audit = auditLedger(contributions);
  const duplicates = possibleDoubleEntries(contributions);

  const sdp = settings.slice_decimal_places;
  const current = buildCapTable(id, participants, contributions, {
    sliceDecimalPlaces: sdp,
    percentDecimalPlaces: settings.percent_decimal_places,
    frozen: pie.status === "frozen",
  });

  // The as-of view is opt-in: with no date the page shows the check and
  // the download, which is what it is for nine times out of ten. Asking
  // for a date adds the historical table underneath.
  const asOf = as_of && /^\d{4}-\d{2}-\d{2}$/.test(as_of) ? as_of : null;
  const historic = asOf
    ? capTableAsOf(id, participants, contributions, asOf, {
        sliceDecimalPlaces: sdp,
        percentDecimalPlaces: settings.percent_decimal_places,
      })
    : null;

  const nameOf = new Map(participants.map((p) => [p.id, p.display_name]));

  // Only ever run on an explicit request. A probe writes to the database,
  // so it must not happen as a side effect of somebody opening a page.
  const probeResult = probe === "1" ? await probeLedgerImmutability(id) : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          href={`/pies/${id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {pie.name}
        </Link>
        <h1 className="mt-2 flex items-center gap-2 text-3xl font-bold tracking-tight">
          <ShieldCheck className="h-7 w-7" />
          Records &amp; proof
        </h1>
        <p className="mt-1 text-muted-foreground">
          The evidence behind every ownership figure: checked, explained, and
          downloadable.
        </p>
      </div>

      {/* ---------- 1. The check ---------- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            {audit.ok ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                Every entry checks out
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-red-600" />
                {audit.problems.length} entr
                {audit.problems.length === 1 ? "y" : "ies"} need attention
              </>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Each of the {audit.rows_checked} entries in this Pie was
            recalculated from the inputs stored on the entry itself, using the
            rules that were frozen onto it at the time it was written — not
            today&apos;s rules. An entry that does not reproduce is a defect in
            the tool, and it is reported here rather than hidden.
          </p>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-md border p-3">
              <span>Recalculated and matched</span>
              <span className="font-semibold tabular-nums">
                {audit.counts.reproduced}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <span>Corrections (carry a change, not a rule)</span>
              <span className="font-semibold tabular-nums">
                {audit.counts.correction}
              </span>
            </div>
            {audit.counts.converted > 0 && (
              <div className="flex items-center justify-between rounded-md border p-3">
                <span>Converted from the older model</span>
                <span className="font-semibold tabular-nums">
                  {audit.counts.converted}
                </span>
              </div>
            )}
            {audit.counts.mismatch > 0 && (
              <div className="flex items-center justify-between rounded-md border border-red-300 bg-red-50 p-3">
                <span className="text-red-800">Did not recalculate</span>
                <span className="font-semibold tabular-nums text-red-800">
                  {audit.counts.mismatch}
                </span>
              </div>
            )}
            {audit.counts.not_reproducible > 0 && (
              <div className="flex items-center justify-between rounded-md border border-amber-300 bg-amber-50 p-3">
                <span className="text-amber-800">Could not be re-derived</span>
                <span className="font-semibold tabular-nums text-amber-800">
                  {audit.counts.not_reproducible}
                </span>
              </div>
            )}
          </div>

          {audit.problems.length > 0 && (
            <div className="space-y-2">
              <p className="font-medium">
                These entries are the ones to look at:
              </p>
              {audit.problems.slice(0, 25).map((p) => (
                <div
                  key={p.id}
                  className={
                    "rounded-md border p-3 " +
                    (p.verdict === "mismatch"
                      ? "border-red-300 bg-red-50"
                      : "border-amber-300 bg-amber-50")
                  }
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">
                      {p.type_label} — {nameOf.get(p.participant_id) ?? p.participant_id}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {p.event_date} · entry {p.id.slice(0, 8)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs">{p.note}</p>
                  {p.explanation.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                      {p.explanation.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
              {audit.problems.length > 25 && (
                <p className="text-xs text-muted-foreground">
                  {audit.problems.length - 25} more not shown.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---------- 1b. Can the ledger be edited? Ask it. ---------- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            The ledger cannot be edited — check it
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Everything above depends on history being unchangeable. That is not
            a promise the app makes to itself — it is a rule inside the
            database, so it holds even if the app is bypassed. You can ask the
            database directly, and read its answer.
          </p>

          <form method="get" className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="probe" value="1" />
            {asOf && <input type="hidden" name="as_of" value={asOf} />}
            <Button type="submit" variant="outline" size="sm">
              Try to edit a ledger entry
            </Button>
            <span className="text-xs text-muted-foreground">
              Aimed at the oldest entry in this Pie. It sets the entry to the
              value it already has, so nothing changes either way.
            </span>
          </form>

          {probeResult && (
            <div
              className={
                "rounded-md border p-3 " +
                (probeResult.blocked
                  ? "border-green-300 bg-green-50"
                  : "border-red-300 bg-red-50")
              }
            >
              <p className="flex items-center gap-2 font-medium">
                {probeResult.blocked ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-700" />
                    <span className="text-green-900">
                      Refused, as it should be
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 text-red-700" />
                    <span className="text-red-900">
                      The change was accepted — this needs fixing
                    </span>
                  </>
                )}
              </p>
              <p className="mt-2 text-xs">
                {probeResult.attempted ? (
                  <>
                    Refused by: <strong>{probeResult.mechanism}</strong>. The
                    database said:
                  </>
                ) : (
                  "Nothing to test."
                )}
              </p>
              <p className="mt-1 rounded bg-background/70 p-2 font-mono text-xs">
                {probeResult.message}
              </p>
              {probeResult.target_id && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Aimed at entry {probeResult.target_id.slice(0, 8)}.
                </p>
              )}
              {!probeResult.blocked && (
                <p className="mt-2 text-xs text-red-900">
                  Do not rely on these records until this is resolved: an entry
                  could be altered without anyone being able to tell.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---------- 2. The structural claims ---------- */}      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            What else is checked, and what it means
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {audit.checks.map((c) => (
            <div key={c.id} className="flex items-start gap-3">
              {c.passed ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              )}
              <div>
                <p>{c.claim}</p>
                <p className="text-xs text-muted-foreground">
                  {c.inspected} checked
                  {!c.passed && c.offenders.length > 0 && (
                    <> · affected: {c.offenders.map((o) => o.slice(0, 8)).join(", ")}</>
                  )}
                </p>
              </div>
            </div>
          ))}

          {duplicates.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
              <p className="flex items-center gap-2 font-medium text-amber-900">
                <AlertTriangle className="h-4 w-4" />
                {duplicates.length} possible double entr
                {duplicates.length === 1 ? "y" : "ies"}
              </p>
              <p className="mt-1 text-xs text-amber-900">
                The same entry, for the same person, on the same day, for the
                same number of slices. That can be genuine — someone really can
                log twice — but it is the first thing a challenger will point
                at, so it is worth a look.
              </p>
              <ul className="mt-2 space-y-0.5 text-xs text-amber-900">
                {duplicates.slice(0, 10).map((group) => (
                  <li key={group[0].id}>
                    {nameOf.get(group[0].participant_id) ?? group[0].participant_id} ·{" "}
                    {group[0].event_date} · {formatSlices(group[0].slices, sdp)} slices
                    (×{group.length})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---------- 3a. As-of-date ownership ---------- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Ownership on a past date
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Rebuilt from the ledger, not from a stored snapshot. Nothing is
            recalculated backwards: the entries dated after the date you choose
            are simply left out, so a change recorded later cannot alter what
            ownership looked like earlier.
          </p>

          <form method="get" className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Show ownership as it stood on
              <input
                type="date"
                name="as_of"
                defaultValue={asOf ?? current.as_of}
                max={today()}
                className="rounded-md border bg-background px-3 py-2 text-sm text-foreground"
              />
            </label>
            <Button type="submit" variant="outline" size="sm">
              Show that date
            </Button>
            {asOf && (
              <Link href={`/pies/${id}/records`}>
                <Button type="button" variant="ghost" size="sm">
                  Clear
                </Button>
              </Link>
            )}
          </form>

          {historic && (
            <div className="space-y-2">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Person</th>
                      <th className="py-2 pr-4 text-right font-medium">Slices</th>
                      <th className="py-2 pr-4 text-right font-medium">Share</th>
                      <th className="py-2 text-right font-medium">Today</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historic.rows.map((r) => {
                      const now = current.rows.find(
                        (c) => c.participant_id === r.participant_id
                      );
                      return (
                        <tr key={r.participant_id} className="border-b last:border-b-0">
                          <td className="py-2 pr-4">{r.display_name}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">
                            {formatSlices(r.slices, sdp)}
                          </td>
                          <td className="py-2 pr-4 text-right tabular-nums">
                            {r.pct}%
                          </td>
                          <td className="py-2 text-right text-muted-foreground tabular-nums">
                            {now ? `${now.pct}%` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="font-medium">
                      <td className="py-2 pr-4">Total</td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {formatSlices(historic.total_slices, sdp)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">100%</td>
                      <td className="py-2 text-right text-muted-foreground tabular-nums">
                        {formatSlices(current.total_slices, sdp)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                Entries on or before {historic.as_of} are included; later ones
                are not. &ldquo;Today&rdquo; is the same table without the cut-off.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---------- 3b. The download ---------- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Download the history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            The point of keeping records is being able to produce them. Both
            files are generated fresh from the ledger each time you ask for
            them — there is no stored copy to go stale.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border p-3">
              <p className="font-medium">Ledger as a spreadsheet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                One row per entry, {contributions.length} in total, oldest
                first, with each entry&apos;s recalculated figure beside the
                recorded one and a totals block at the bottom. Opens in Excel
                or Google Sheets.
              </p>
              <a href={`/api/pies/${id}/export?format=csv`} className="mt-3 inline-block">
                <Button variant="outline" size="sm">
                  <Download className="mr-2 h-4 w-4" />
                  Download CSV
                </Button>
              </a>
            </div>

            <div className="rounded-md border p-3">
              <p className="font-medium">Everything, as a data file</p>
              <p className="mt-1 text-xs text-muted-foreground">
                The complete record: the ledger verbatim, the settings, the
                people, the hours, and the departure and buyout history. This
                is the copy that still makes sense if this tool is ever not
                here.
              </p>
              <a href={`/api/pies/${id}/export?format=json`} className="mt-3 inline-block">
                <Button variant="outline" size="sm">
                  <FileJson className="mr-2 h-4 w-4" />
                  Download JSON
                </Button>
              </a>
            </div>
          </div>

          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground">
              What is in the export
            </summary>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              <li>
                <strong>{contributions.length}</strong> ledger entries — every
                one, including every correction, with the inputs and rules each
                was calculated under. Nothing is summarised away.
              </li>
              <li>
                <strong>{participants.length}</strong> people, with their role
                and status at the time of export.
              </li>
              <li>
                <strong>{time_logs.length}</strong> time entries, including
                hours not yet converted to slices.
              </li>
              <li>
                The full settings, so the multipliers and caps in force can be
                checked rather than taken on trust.
              </li>
              <li>
                Money figures are in the smallest unit (for Naira, kobo), which
                is why the spreadsheet shows whole numbers — ₦1 is 100.
              </li>
            </ul>
          </details>

          <p className="text-xs text-muted-foreground">
            The ledger itself cannot be edited or deleted, by anyone including
            you. A mistake is corrected by adding an entry that reverses it, so
            both the original and the correction stay visible. That is what
            makes this export evidence rather than a report.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
