// ============================================================
// Execution Tracker — Slicing Pie: Settings Console (Admin)
// ============================================================
// Architecture decision A6: this screen contains NO hand-written field
// list. Every control is generated from SETTING_DESCRIPTORS, so adding
// or retyping a rule in lib/slicing-pie/config/schema.ts makes it appear
// here automatically and it can never drift out of sync with the engine.
//
// Saving appends a NEW effective-dated settings version (never an edit),
// and only the diff-from-defaults is persisted. Two consequences the UI
// states plainly because they surprise people:
//
//   • Changes are PROSPECTIVE ONLY. They apply from today forward.
//     Contributions already recorded keep the config_snapshot they were
//     computed with, so history does not move (decision D3).
//   • An empty field is not zero. A few settings are deliberately
//     nullable — "leave blank to require a manual trigger" — so blanks
//     are sent as null, not 0.
//
// Money is entered in MAJOR units (dollars) and stored in MINOR units
// (cents); percentages are entered as 10 and stored as 0.1.
// ============================================================

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ALL_CONTRIBUTION_TYPES,
  SETTING_DESCRIPTORS,
  SETTING_DESCRIPTOR_MAP,
  SETTING_GROUP_ORDER,
} from "@/lib/slicing-pie/config/schema";
import { fromMinor, rateToPercent, toMinor } from "@/lib/slicing-pie/format";
import type {
  PieSettings,
  PieSettingsVersion,
  SettingDescriptor,
} from "@/types/slicing-pie";

interface Props {
  pieId: string;
  currency: string;
  settings: PieSettings;
  defaults: PieSettings;
  versions: PieSettingsVersion[];
}

/** The value a control holds while being edited (UI-native, not stored form). */
type UiValue = string | boolean | string[];

// Nested objects need a sub-form rather than a single control. They are
// rendered read-only here so nothing in the console can write a
// half-built object; the API still accepts them, so an admin who needs
// them is not blocked, just not served by a text box.
const NESTED_TYPES = new Set(["tiered_finder_fee", "loyal_employee_clause"]);

function humanize(token: string): string {
  return token
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Stored value → what the control shows. The money and percent
 * conversions live here and in `fromUi`, and nowhere else: every other
 * part of this component treats values as opaque.
 */
function toUi(d: SettingDescriptor, value: unknown): UiValue {
  switch (d.type) {
    case "boolean":
      return Boolean(value);
    case "enum_list":
      return Array.isArray(value) ? (value as string[]) : [];
    case "string_list":
      // The operating currency (CONFIG-007) is declared as `string_list`
      // in the descriptor but is stored as a bare ISO token ("USD"), not
      // an array. Pass a string straight through rather than joining it
      // into a blank field.
      if (typeof value === "string") return value;
      return Array.isArray(value) ? (value as string[]).join(", ") : "";
    case "currency":
    case "currency_per_unit":
      // Stored in minor units (cents). Blank stays blank — see the
      // nullable-settings note at the top of the file.
      return value === null || value === undefined || value === ""
        ? ""
        : String(fromMinor(Number(value)));
    case "percent":
      // Stored as a fraction (0.1 = 10%).
      return value === null || value === undefined
        ? ""
        : String(rateToPercent(Number(value)));
    default:
      return value === null || value === undefined ? "" : String(value);
  }
}

/** What the control shows → stored value, for the API payload. */
function fromUi(d: SettingDescriptor, ui: UiValue, currency: string): unknown {
  switch (d.type) {
    case "boolean":
      return Boolean(ui);
    case "enum_list":
      return Array.isArray(ui) ? ui : [];
    case "string_list":
      // The operating currency is a bare token, not a comma list; and an
      // empty tag list should clear rather than persist [""].
      if (d.key === "currency") return String(ui).trim() || currency;
      return String(ui)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    case "currency":
    case "currency_per_unit": {
      const raw = String(ui).trim();
      return raw === "" ? null : toMinor(Number(raw));
    }
    case "percent":
      return Number(ui) / 100;
    case "multiplier":
    case "number":
    case "duration_days":
      return Number(ui);
    default:
      return ui;
  }
}

function stepFor(d: SettingDescriptor): string {
  if (d.type === "currency" || d.type === "currency_per_unit") return "0.01";
  if (d.type === "percent") return "0.1";
  return "any";
}

export function PieSettingsConsole({
  pieId,
  currency,
  settings,
  defaults,
  versions,
}: Props) {
  const router = useRouter();
  const [edits, setEdits] = useState<Record<string, UiValue>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const editable = useMemo(
    () => SETTING_DESCRIPTORS.filter((d) => d.uiEditable),
    []
  );
  const changedKeys = Object.keys(edits);

  function currentUi(d: SettingDescriptor): UiValue {
    if (d.key in edits) return edits[d.key];
    return toUi(d, settings[d.key] as unknown);
  }

  function setValue(d: SettingDescriptor, value: UiValue) {
    setEdits((prev) => ({ ...prev, [d.key]: value }));
    setSaved(null);
  }

  function revert(key: string) {
    setEdits((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setSaved(null);
  }

  function differsFromDefault(d: SettingDescriptor): boolean {
    return (
      JSON.stringify(settings[d.key] ?? null) !==
      JSON.stringify(defaults[d.key] ?? null)
    );
  }

  async function save() {
    const payload: Record<string, unknown> = {};
    for (const key of changedKeys) {
      const d = SETTING_DESCRIPTOR_MAP[key];
      if (!d) continue;
      payload[key] = fromUi(d, edits[key], currency);
    }

    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const res = await fetch(`/api/pies/${pieId}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: payload, note: note.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to save settings");
        setBusy(false);
        return;
      }
      const count = Array.isArray(json.data?.delta) ? json.data.delta.length : 0;
      setEdits({});
      setNote("");
      setBusy(false);
      setSaved(
        `Saved ${count} change${count === 1 ? "" : "s"}. They apply from today onward.`
      );
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  }

  // Only render groups that actually contain an editable setting.
  const groups = SETTING_GROUP_ORDER.map((g) => ({
    ...g,
    items: editable.filter((d) => d.group === g.group),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6">
      {/* Save bar — sticky so it stays reachable in a long form. */}
      <div className="sticky top-0 z-10 -mx-1 rounded-lg border bg-background/95 px-3 py-2 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why are you changing this? (recorded in the audit log)"
            className="h-9 min-w-[16rem] flex-1"
            disabled={busy}
          />
          <Badge variant={changedKeys.length ? "default" : "outline"}>
            {changedKeys.length} unsaved
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEdits({});
              setSaved(null);
            }}
            disabled={busy || changedKeys.length === 0}
          >
            Discard
          </Button>
          <Button
            size="sm"
            onClick={save}
            disabled={busy || changedKeys.length === 0}
          >
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </div>
        {error && (
          <p className="mt-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {saved && <p className="mt-2 text-sm text-emerald-700">{saved}</p>}
      </div>

      <p className="text-sm text-muted-foreground">
        Changes are recorded as a new dated version and apply from today
        forward. Contributions already logged keep the rules they were
        calculated with, so past numbers never move.
      </p>

      {groups.map((g) => (
        <section key={g.group} className="space-y-3">
          <h2 className="text-lg font-semibold">{g.label}</h2>
          <Card>
            <CardContent className="divide-y pt-2">
              {g.items.map((d) => {
                const ui = currentUi(d);
                const changed = d.key in edits;
                const overridden = differsFromDefault(d);

                return (
                  <div key={d.key} className="py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{d.label}</span>
                        {d.configRef && (
                          <span className="text-xs text-muted-foreground">
                            {d.configRef}
                          </span>
                        )}
                        {overridden && (
                          <Badge variant="secondary" className="text-xs">
                            Changed from default
                          </Badge>
                        )}
                        {d.decisionRequired && (
                          <Badge
                            variant="outline"
                            className="border-amber-300 text-xs text-amber-700"
                          >
                            Decision required
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          Default: {formatDefault(d, defaults[d.key], currency)}
                        </span>
                        {changed && (
                          <button
                            type="button"
                            onClick={() => revert(d.key)}
                            className="text-xs text-muted-foreground underline hover:text-foreground"
                          >
                            undo
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="mt-2">
                      <Control
                        descriptor={d}
                        value={ui}
                        onChange={(v) => setValue(d, v)}
                        disabled={busy}
                        currency={currency}
                      />
                    </div>

                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {d.helpText}
                    </p>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </section>
      ))}

      {/* Version history — the defensibility record (D3). */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          Change history ({versions.length})
        </h2>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Every saved version, newest first. Old versions are never
              overwritten.
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {versions.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No changes yet — this Pie is running on the shipped defaults.
              </p>
            )}
            {[...versions]
              .sort((a, b) =>
                (b.effective_from || "").localeCompare(a.effective_from || "")
              )
              .slice(0, 10)
              .map((v) => {
                const keys = Object.keys(
                  (v.settings ?? {}) as Record<string, unknown>
                );
                return (
                  <div
                    key={v.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <span className="text-sm tabular-nums">
                        {v.effective_from}
                      </span>
                      {v.note && (
                        <span className="ml-2 text-sm text-muted-foreground">
                          {v.note}
                        </span>
                      )}
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {keys.length === 0
                        ? "no overrides"
                        : keys.map((k) => SETTING_DESCRIPTOR_MAP[k]?.label ?? k).join(", ")}
                    </Badge>
                  </div>
                );
              })}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

// ------------------------------------------------------------
// Default rendering (read-only, beside the field)
// ------------------------------------------------------------
function formatDefault(
  d: SettingDescriptor,
  value: unknown,
  currency: string
): string {
  if (NESTED_TYPES.has(d.type)) return "advanced";
  if (d.type === "currency" || d.type === "currency_per_unit") {
    return value === null || value === undefined
      ? "blank"
      : `${fromMinor(Number(value))} ${currency}`;
  }
  if (d.type === "percent") {
    return value === null || value === undefined
      ? "blank"
      : `${rateToPercent(Number(value))}%`;
  }
  if (d.type === "boolean") return value ? "on" : "off";
  if (Array.isArray(value)) {
    return value.length === 0 ? "none" : value.join(", ");
  }
  if (value === null || value === undefined) return "blank";
  if (typeof value === "object") return "advanced";
  return String(value);
}

// ------------------------------------------------------------
// The control itself — chosen by descriptor.type (A6)
// ------------------------------------------------------------
interface ControlProps {
  descriptor: SettingDescriptor;
  value: UiValue;
  onChange: (v: UiValue) => void;
  disabled: boolean;
  currency: string;
}

function Control({
  descriptor: d,
  value,
  onChange,
  disabled,
  currency,
}: ControlProps) {
  if (NESTED_TYPES.has(d.type)) {
    return (
      <p className="text-xs italic text-muted-foreground">
        Structured setting — kept at its current value. Changing it needs the{" "}
        {d.label} sub-form, which this console does not yet render.
      </p>
    );
  }

  if (d.type === "boolean") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="h-4 w-4 rounded border-input"
        />
        <span>{Boolean(value) ? "On" : "Off"}</span>
      </label>
    );
  }

  if (d.type === "enum_list") {
    const selected = Array.isArray(value) ? value : [];
    const options = d.options?.length
      ? d.options.map((o) => ({ value: o.value, label: o.label }))
      : ALL_CONTRIBUTION_TYPES.map((t) => ({ value: t as string, label: humanize(t) }));

    return (
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              disabled={disabled}
              onClick={() =>
                onChange(
                  on
                    ? selected.filter((s) => s !== o.value)
                    : [...selected, o.value]
                )
              }
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input text-muted-foreground hover:text-foreground"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    );
  }

  if (d.type === "enum" || (d.options && d.options.length > 0)) {
    return (
      <select
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="h-9 w-full max-w-md rounded-md border border-input bg-background px-3 text-sm"
      >
        {!d.options?.some((o) => o.value === String(value)) && (
          <option value={String(value)}>{String(value) || "—"}</option>
        )}
        {d.options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  if (d.type === "string_list") {
    return (
      <Input
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="comma, separated, list"
        className="h-9 max-w-md"
      />
    );
  }

  // Everything remaining is numeric.
  const money = d.type === "currency" || d.type === "currency_per_unit";
  return (
    <div className="flex max-w-md items-center gap-2">
      <Input
        type="number"
        step={stepFor(d)}
        min={d.min}
        max={d.max}
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="h-9"
      />
      <span className="whitespace-nowrap text-xs text-muted-foreground">
        {money
          ? currency
          : d.type === "percent"
            ? "%"
            : d.type === "duration_days"
              ? "days"
              : d.type === "multiplier"
                ? "×"
                : d.type === "currency_per_unit"
                  ? `per unit, ${currency}`
                  : ""}
      </span>
    </div>
  );
}
