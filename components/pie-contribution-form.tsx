// ============================================================
// Execution Tracker — Slicing Pie: Contribution Entry Form
// ============================================================
// A schema-driven form that adapts its fields to the selected
// contribution type, shows a LIVE PREVIEW of the slices that will be
// earned (POST .../contributions/preview, no persistence), then logs
// the contribution (POST .../contributions).
//
// Money fields are entered in MAJOR units (dollars) and converted to
// integer minor units before submit, matching the engine contract.
// ============================================================

"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toMinor } from "@/lib/slicing-pie/format";
import { CONTRIBUTION_TYPE_LABELS } from "@/lib/slicing-pie/labels";
import { Sparkles } from "lucide-react";
import type {
  ContributionType,
  PieParticipant,
  SliceComputation,
} from "@/types/slicing-pie";

// ------------------------------------------------------------
// Per-type field schema (keys match the server input bridge).
// ------------------------------------------------------------
type FieldKind = "money" | "number" | "enum" | "text" | "date";

interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  help?: string;
  options?: { value: string; label: string }[];
}

// Labels live in lib/slicing-pie/labels so the member's own view calls a
// row the same thing this form does. Re-exported under the name the rest
// of this file already uses.
const TYPE_LABELS = CONTRIBUTION_TYPE_LABELS;

const FIELDS: Partial<Record<ContributionType, FieldDef[]>> = {
  time: [
    { key: "hours", label: "Hours", kind: "number", required: true },
    {
      key: "fair_market_salary_minor",
      label: "FMV salary (annual)",
      kind: "money",
      help: "Optional if participant terms are set.",
    },
  ],
  contractor_time: [
    { key: "hours", label: "Hours", kind: "number", required: true },
    { key: "contractor_rate_minor", label: "Rate (hourly)", kind: "money" },
    { key: "paid_amount_minor", label: "Amount already paid", kind: "money" },
  ],
  advisor_time: [
    { key: "hours", label: "Hours", kind: "number", required: true },
    {
      key: "hourly_rate_minor",
      label: "Advisor hourly rate",
      kind: "money",
      required: true,
    },
  ],
  expense: [
    { key: "amount_minor", label: "Amount", kind: "money", required: true },
    { key: "reimbursed_minor", label: "Reimbursed", kind: "money" },
  ],
  loan_payment: [
    { key: "amount_minor", label: "Payment amount", kind: "money", required: true },
  ],
  loan_missed_payment: [
    { key: "amount_minor", label: "Missed amount", kind: "money", required: true },
  ],
  equipment: [
    { key: "fmv_minor", label: "Fair-market value", kind: "money", required: true },
    {
      key: "condition",
      label: "Condition",
      kind: "enum",
      required: true,
      options: [
        { value: "new", label: "New" },
        { value: "preowned_lt_1yr", label: "Pre-owned < 1 yr" },
        { value: "preowned_gte_1yr", label: "Pre-owned ≥ 1 yr" },
      ],
    },
    { key: "reimbursed_minor", label: "Reimbursed", kind: "money" },
  ],
  idea_royalty: [
    { key: "revenue_minor", label: "Revenue", kind: "money", required: true },
    {
      key: "cash_paid_minor",
      label: "Royalty already paid in cash",
      kind: "money",
      help: "Cash already paid on this deal is not at risk, so it earns no slices (IDEA-002).",
    },
  ],
  commission: [
    { key: "revenue_minor", label: "Sale revenue", kind: "money", required: true },
    {
      key: "cash_paid_minor",
      label: "Commission already paid in cash",
      kind: "money",
      help: "Cash already paid on this sale is not at risk, so it earns no slices (SALES-002).",
    },
  ],
  finder_fee: [
    { key: "investment_minor", label: "Investment raised", kind: "money", required: true },
  ],
  partner_vendor: [
    { key: "savings_minor", label: "Savings delivered", kind: "money", required: true },
  ],
  referral: [
    { key: "fee_minor", label: "Referral fee (override)", kind: "money" },
    {
      key: "hired_on",
      label: "Referred hire's start date",
      kind: "date",
      required: true,
      help: "Slices are withheld until the referral waiting period has elapsed (CONFIG-016). The date is taken as of the contribution's event date.",
    },
  ],
  facilities: [
    { key: "rent_fmv_minor", label: "Rent FMV", kind: "money", required: true },
    {
      key: "cash_paid_minor",
      label: "Rent already paid in cash",
      kind: "money",
      help: "Rent already paid is not at risk, so it earns no slices (FACILITY-002).",
    },
  ],
  personal_car: [
    { key: "reimbursement_minor", label: "Reimbursement", kind: "money" },
    { key: "fuel_minor", label: "Fuel cost", kind: "money" },
    { key: "miles", label: "Miles", kind: "number" },
  ],
  cash_payment_to_participant: [
    {
      key: "amount_minor",
      label: "Payment amount",
      kind: "money",
      required: true,
      help: "Money paid out to this participant. It draws their at-risk slices down, cash first, and never below zero — any excess buys nothing (HARD-VAL-004). Enter only the amount; the split is worked out for you from their current balance.",
    },
  ],
  other: [
    { key: "slices", label: "Slices (direct)", kind: "number" },
    { key: "fmv_minor", label: "FMV (converts to slices)", kind: "money" },
    {
      key: "multiplier_kind",
      label: "Multiplier",
      kind: "enum",
      options: [
        { value: "none", label: "None" },
        { value: "non_cash", label: "Non-cash" },
        { value: "cash", label: "Cash" },
      ],
    },
    { key: "label", label: "Label", kind: "text" },
  ],
};

interface Props {
  pieId: string;
  participants: PieParticipant[];
  enabledTypes: ContributionType[];
  projectTags: string[];
}

export function PieContributionForm({
  pieId,
  participants,
  enabledTypes,
  projectTags,
}: Props) {
  const router = useRouter();

  // Types offered here exclude Well movements (handled by the Well panel).
  const offeredTypes = enabledTypes.filter(
    (t) => t !== "well_deposit" && t !== "well_withdrawal"
  );

  const [participantId, setParticipantId] = useState(participants[0]?.id ?? "");
  const [type, setType] = useState<ContributionType>(offeredTypes[0] ?? "time");
  const [eventDate, setEventDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [projectTag, setProjectTag] = useState("");

  const [preview, setPreview] = useState<SliceComputation | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  // CONFIG-016: an unvested referral is recorded but holds nothing until
  // its waiting period ends. The preview reports the eventual figure plus
  // the date, and this flags it so the number is not read as earned.
  const [referralPending, setReferralPending] = useState(false);
  const [referralGrantsOn, setReferralGrantsOn] = useState<string | null>(null);
  const [pendingNotice, setPendingNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const fields = FIELDS[type] ?? [];

  // Build the `inputs` payload, converting money fields to minor units.
  const buildInputs = useCallback((): Record<string, unknown> => {
    const inputs: Record<string, unknown> = {};
    for (const f of fields) {
      const raw = values[f.key];
      if (raw === undefined || raw === "") continue;
      if (f.kind === "money") {
        inputs[f.key] = toMinor(Number(raw));
      } else if (f.kind === "number") {
        inputs[f.key] = Number(raw);
      } else {
        inputs[f.key] = raw;
      }
    }
    return inputs;
  }, [fields, values]);

  // Live preview (debounced).
  useEffect(() => {
    if (!participantId) return;
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/pies/${pieId}/contributions/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            participant_id: participantId,
            type,
            event_date: eventDate,
            inputs: buildInputs(),
          }),
        });
        const result = await res.json();
        if (!res.ok) {
          setPreview(null);
          setPreviewError(result.error ?? "Cannot preview yet");
          return;
        }
        setPreview(result.data.computation as SliceComputation);
        setReferralPending(result.data.pending === true);
        setReferralGrantsOn(
          typeof result.data.grants_on === "string"
            ? result.data.grants_on
            : null
        );
        setPreviewError(null);
      } catch {
        setPreview(null);
        setPreviewError(null);
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [pieId, participantId, type, eventDate, buildInputs]);

  function setField(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    setSuccess(false);

    if (!participantId) {
      setSubmitError("Select a participant");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/pies/${pieId}/contributions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participant_id: participantId,
          type,
          event_date: eventDate,
          inputs: buildInputs(),
          notes: notes.trim() || undefined,
          project_tag: projectTag || undefined,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        setSubmitError(result.error ?? "Failed to log contribution");
        setIsSubmitting(false);
        return;
      }

      // A pending referral saves successfully but grants nothing yet, so
      // the plain "saved" confirmation would be misleading on its own.
      setPendingNotice(
        result.data?.pending === true
          ? `Referral recorded. Slices will be granted on ${result.data.grants_on ?? "the vesting date"}.`
          : null
      );

      setSuccess(true);
      setValues({});
      setNotes("");
      setIsSubmitting(false);
      router.refresh();
      setTimeout(() => {
        setSuccess(false);
        setPendingNotice(null);
      }, 6000);
    } catch {
      setSubmitError("Network error. Please try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New Contribution</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Participant + type + date */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Participant</label>
              <select
                value={participantId}
                onChange={(e) => setParticipantId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                disabled={isSubmitting}
              >
                {participants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Type</label>
              <select
                value={type}
                onChange={(e) => {
                  setType(e.target.value as ContributionType);
                  setValues({});
                  setPreview(null);
                }}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                disabled={isSubmitting}
              >
                {offeredTypes.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t] ?? t}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Event date</label>
              <Input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Dynamic per-type fields */}
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.key} className="space-y-2">
                <label className="text-sm font-medium">
                  {f.label}
                  {f.required ? " *" : ""}
                </label>
                {f.kind === "enum" ? (
                  <select
                    value={values[f.key] ?? ""}
                    onChange={(e) => setField(f.key, e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    disabled={isSubmitting}
                  >
                    <option value="">Select…</option>
                    {f.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    type={
                      f.kind === "money" || f.kind === "number"
                        ? "number"
                        : f.kind === "date"
                          ? "date"
                          : "text"
                    }
                    step={f.kind === "money" ? "0.01" : "any"}
                    min={f.kind === "money" || f.kind === "number" ? "0" : undefined}
                    value={values[f.key] ?? ""}
                    onChange={(e) => setField(f.key, e.target.value)}
                    disabled={isSubmitting}
                  />
                )}
                {f.help && (
                  <p className="text-xs text-muted-foreground">{f.help}</p>
                )}
              </div>
            ))}
          </div>

          {/* Notes + project tag */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Notes</label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional"
                disabled={isSubmitting}
              />
            </div>
            {projectTags.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Project</label>
                <select
                  value={projectTag}
                  onChange={(e) => setProjectTag(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  disabled={isSubmitting}
                >
                  <option value="">None</option>
                  {projectTags.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Live preview */}
          <div className="rounded-md border bg-muted/40 p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4" />
              Live preview
            </div>
            {preview ? (
              <div className="mt-2 space-y-1">
                <p className="text-lg font-semibold">
                  {preview.slices} slices
                </p>
                {/* A pending referral holds no slices yet — say so here
                    rather than letting the number above read as earned. */}
                {referralPending && (
                  <p className="text-xs font-medium text-violet-600">
                    Not earned yet — this referral &ldquo;hold back&rdquo;
                    period has not ended. The slices above are what it will be
                    worth, and they will switch on
                    {referralGrantsOn ? ` on ${referralGrantsOn}` : " later"}.
                    Until then it sits in the ledger holding nothing.
                  </p>
                )}
                {preview.explanation.map((line, i) => (
                  <p key={i} className="text-xs text-muted-foreground">
                    {line}
                  </p>
                ))}
                {preview.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-600">
                    ⚠ {w}
                  </p>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                {previewError ?? "Fill in the fields to see the slice estimate."}
              </p>
            )}
          </div>

          {submitError && (
            <p className="text-sm text-destructive" role="alert">
              {submitError}
            </p>
          )}
          {success && (
            <p className="text-sm text-green-600" role="status">
              Contribution logged.
            </p>
          )}
          {pendingNotice && (
            <p className="text-sm text-violet-600" role="status">
              {pendingNotice}
            </p>
          )}

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Logging…" : "Log Contribution"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
