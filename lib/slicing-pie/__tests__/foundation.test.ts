// ============================================================
// Execution Tracker — Slicing Pie: Foundation Functional Tests
// ============================================================
// Dependency-free test harness (no jest/vitest installed). Compiled
// with tsconfig.test.json and executed by plain Node. Exits non-zero
// on any failure so it can gate CI.
//
// Covers the deterministic logic most likely to harbor bugs:
//   • format.ts   — rounding (half-up) + minor-unit money helpers
//   • resolve.ts  — PROSPECTIVE-ONLY effective-dated config resolver
//   • schema.ts   — config/UI descriptor coherence
//   • decisions.ts— human-decision registry integrity
// ============================================================

import {
  roundTo,
  roundSlices,
  roundPercent,
  toMinor,
  fromMinor,
  formatMoney,
  safeDivide,
  rateToPercent,
  percentToRate,
} from "../format";
import {
  resolveConfig,
  diffFromDefaults,
  settingsDelta,
} from "../config/resolve";
import {
  DEFAULT_PIE_SETTINGS,
  SETTING_DESCRIPTORS,
  SETTING_DESCRIPTOR_MAP,
  ALL_CONTRIBUTION_TYPES,
} from "../config/schema";
import { HUMAN_DECISIONS, decisionsByPriority } from "../config/decisions";
import type { PieSettings, PieSettingsVersion } from "@/types/slicing-pie";

// ------------------------------------------------------------
// Tiny assertion harness
// ------------------------------------------------------------
let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    // eslint-disable-next-line no-console
    console.log(`  \u2713 ${name}`);
  } else {
    failed++;
    const msg = detail ? `${name} — ${detail}` : name;
    failures.push(msg);
    // eslint-disable-next-line no-console
    console.log(`  \u2717 ${msg}`);
  }
}

function eq(name: string, actual: unknown, expected: unknown): void {
  const a = typeof actual === "object" ? JSON.stringify(actual) : String(actual);
  const e =
    typeof expected === "object" ? JSON.stringify(expected) : String(expected);
  check(name, a === e, `expected ${e}, got ${a}`);
}

function section(title: string): void {
  // eslint-disable-next-line no-console
  console.log(`\n${title}`);
}

// ------------------------------------------------------------
// format.ts — rounding
// ------------------------------------------------------------
section("format.ts — rounding (round-half-up)");
eq("roundTo(1.005, 2) = 1.01", roundTo(1.005, 2), 1.01);
eq("roundTo(2.675, 2) = 2.68", roundTo(2.675, 2), 2.68);
eq("roundTo(0.5, 0) = 1", roundTo(0.5, 0), 1);
eq("roundTo(1.5, 0) = 2", roundTo(1.5, 0), 2);
eq("roundTo(2.5, 0) = 3 (half-up, not bankers)", roundTo(2.5, 0), 3);
eq("roundTo(-2.5, 0) = -3 (half away from zero)", roundTo(-2.5, 0), -3);
eq("roundTo(Infinity) = 0 (guarded)", roundTo(Infinity, 2), 0);
eq("roundSlices(1.23456, 4) = 1.2346", roundSlices(1.23456, 4), 1.2346);
eq("roundPercent(50.005, 2) = 50.01", roundPercent(50.005, 2), 50.01);

// ------------------------------------------------------------
// format.ts — money & misc
// ------------------------------------------------------------
section("format.ts — money helpers");
eq("toMinor(10.10) = 1010", toMinor(10.1), 1010);
eq("toMinor(0.07) = 7", toMinor(0.07), 7);
eq("fromMinor(1010) = 10.1", fromMinor(1010), 10.1);
eq("formatMoney(123456, USD) = $1,234.56", formatMoney(123456, "USD"), "$1,234.56");
eq("formatMoney(100, USD) = $1.00", formatMoney(100, "USD"), "$1.00");
eq("formatMoney(0, USD) = $0.00", formatMoney(0, "USD"), "$0.00");
eq("safeDivide(10, 4) = 2.5", safeDivide(10, 4), 2.5);
eq("safeDivide(5, 0) = 0 (no NaN/Infinity)", safeDivide(5, 0), 0);
eq("safeDivide(0, 0) = 0", safeDivide(0, 0), 0);
eq("percentToRate(10) = 0.1", percentToRate(10), 0.1);
eq("rateToPercent(0.1) = 10", rateToPercent(0.1), 10);
eq("rateToPercent(0.025) = 2.5", rateToPercent(0.025), 2.5);

// Naira is the house currency (founder decision 2026-09-30). Asserted
// loosely on purpose: whether the NGN symbol or the ISO code is printed
// depends on how much ICU data the runtime shipped, and both are correct.
// What must never happen is a bare number with no currency on it.
{
  const ngn = formatMoney(123456, "NGN");
  check(
    "formatMoney renders Naira (symbol or ISO code, never a bare number)",
    ngn.includes("1,234.56") && (ngn.includes("₦") || ngn.includes("NGN")),
    ngn
  );
  const unknown = formatMoney(123456, "ZZZ");
  check(
    "an unrecognised currency code still prints a labelled amount",
    // Measured, not assumed: this runtime does NOT throw on an unknown
    // 3-letter code — Intl prints the code itself as the symbol, giving
    // "ZZZ 1,234.56". (The try/catch in formatMoney is therefore a
    // belt-and-braces path this runtime does not reach; other JS engines
    // do throw, hence it stays.) What matters is that the number is never
    // shown unlabelled.
    unknown.includes("ZZZ") && unknown.includes("1,234.56"),
    unknown
  );
}

// ------------------------------------------------------------
// resolve.ts — prospective-only effective-dated resolver
// ------------------------------------------------------------
section("resolve.ts — config resolution & prospective guarantee");

function mkVersion(
  id: string,
  effective_from: string,
  settings: Partial<PieSettings>,
  created_at = `${effective_from}T00:00:00Z`
): PieSettingsVersion {
  return {
    id,
    pie_id: "pie-1",
    settings,
    effective_from,
    note: null,
    created_by: null,
    created_at,
  };
}

// Empty version list resolves to shipped defaults.
eq(
  "resolveConfig([]) === DEFAULT_PIE_SETTINGS",
  resolveConfig([]),
  DEFAULT_PIE_SETTINGS
);

const versions: PieSettingsVersion[] = [
  mkVersion("v1", "2020-01-01", { cash_multiplier: 3 }),
  mkVersion("v2", "2030-01-01", { cash_multiplier: 9 }),
];

eq(
  "past override applies at 2025 (cash_multiplier=3)",
  resolveConfig(versions, "2025-06-01").cash_multiplier,
  3
);
eq(
  "FUTURE override does NOT apply early — prospective (2025 still =3)",
  resolveConfig(versions, "2025-06-01").cash_multiplier,
  3
);
eq(
  "future override applies once effective (2031 =9)",
  resolveConfig(versions, "2031-01-01").cash_multiplier,
  9
);
eq(
  "before any version → shipped default (2019 =4)",
  resolveConfig(versions, "2019-01-01").cash_multiplier,
  4
);

// Nested merge: overriding one finder_fee field keeps the others.
const nested = resolveConfig(
  [mkVersion("v3", "2021-01-01", { finder_fee: { pre_cutoff_rate: 0.07 } as PieSettings["finder_fee"] })],
  "2022-01-01"
);
eq("nested merge: finder_fee.pre_cutoff_rate overridden", nested.finder_fee.pre_cutoff_rate, 0.07);
eq(
  "nested merge: finder_fee.post_cutoff_rate retained from default",
  nested.finder_fee.post_cutoff_rate,
  DEFAULT_PIE_SETTINGS.finder_fee.post_cutoff_rate
);

// Same-day tie-break: later created_at wins.
const sameDay: PieSettingsVersion[] = [
  mkVersion("a", "2022-01-01", { commission_rate: 0.1 }, "2022-01-01T09:00:00Z"),
  mkVersion("b", "2022-01-01", { commission_rate: 0.2 }, "2022-01-01T17:00:00Z"),
];
eq(
  "same-day tie-break: later created_at wins (0.2)",
  resolveConfig(sameDay, "2022-02-01").commission_rate,
  0.2
);

// diffFromDefaults returns only what differs.
const modified: PieSettings = { ...DEFAULT_PIE_SETTINGS, cash_multiplier: 7 };
const diff = diffFromDefaults(modified);
eq("diffFromDefaults keys = [cash_multiplier]", Object.keys(diff), ["cash_multiplier"]);
eq("diffFromDefaults value = 7", diff.cash_multiplier, 7);
eq(
  "diffFromDefaults on unchanged = {}",
  diffFromDefaults({ ...DEFAULT_PIE_SETTINGS }),
  {}
);

// settingsDelta reports before/after per changed key.
const delta = settingsDelta(DEFAULT_PIE_SETTINGS, modified);
eq("settingsDelta length = 1", delta.length, 1);
eq("settingsDelta key = cash_multiplier", delta[0]?.key, "cash_multiplier");
eq("settingsDelta before = 4", delta[0]?.before, 4);
eq("settingsDelta after = 7", delta[0]?.after, 7);

// ------------------------------------------------------------
// schema.ts — descriptor/config coherence
// ------------------------------------------------------------
section("schema.ts — descriptor & default coherence");
const settingKeys = new Set(Object.keys(DEFAULT_PIE_SETTINGS));
const allDescriptorsValid = SETTING_DESCRIPTORS.every((d) =>
  settingKeys.has(d.key as string)
);
check("every SETTING_DESCRIPTOR.key exists in DEFAULT_PIE_SETTINGS", allDescriptorsValid);

const decisionDescriptorsHaveDefault = SETTING_DESCRIPTORS.filter(
  (d) => d.decisionRequired
).every((d) => d.shippedDefault !== undefined);
check(
  "every decision-required descriptor ships a default (never silent-undefined)",
  decisionDescriptorsHaveDefault
);

eq(
  "enabled_contribution_types default covers every type",
  DEFAULT_PIE_SETTINGS.enabled_contribution_types.length,
  ALL_CONTRIBUTION_TYPES.length
);
// Deliberate tripwire, not a number to bump on reflex. Adding a
// contribution type changes what every Pie offers on its entry form and
// what the engine must be able to compute, so it should always be a
// decision someone made on purpose. It was 17 until §20's
// cash_payment_to_participant was added in migration 0006 — a payment
// OUT of the Pie, booked with negative FMV and slices.
eq(
  "ALL_CONTRIBUTION_TYPES has 18 entries",
  ALL_CONTRIBUTION_TYPES.length,
  18
);

// ------------------------------------------------------------
// Currency — Naira is the shipped default (CONFIG-007)
// ------------------------------------------------------------
section("schema.ts — operating currency");
eq(
  "the shipped Pie runs in Naira",
  DEFAULT_PIE_SETTINGS.currency,
  "NGN"
);
eq(
  "the currency descriptor ships the same default (a mismatch would mean the console shows one thing and the engine uses another)",
  SETTING_DESCRIPTOR_MAP.currency?.shippedDefault,
  "NGN"
);
{
  const opts = SETTING_DESCRIPTOR_MAP.currency?.options ?? [];
  check("the currency field renders as a dropdown", opts.length > 0);
  eq("...with Naira first", opts[0]?.value, "NGN");
  // A free-text currency box invites a typo, and a Pie denominated in a
  // currency that does not exist cannot be FX-corrected later (CONFIG-007
  // forbids conversion). Every option must be a real 3-letter ISO code.
  check(
    "every currency option is a 3-letter uppercase ISO code",
    opts.every((o) => /^[A-Z]{3}$/.test(o.value))
  );
  check(
    "the currency default is one of the offered options",
    opts.some((o) => o.value === DEFAULT_PIE_SETTINGS.currency)
  );
}

// ------------------------------------------------------------
// decisions.ts — registry integrity
// ------------------------------------------------------------
section("decisions.ts — human-decision registry");
check("HUMAN_DECISIONS is non-empty", HUMAN_DECISIONS.length > 0);

const ids = HUMAN_DECISIONS.map((d) => d.id);
eq("decision ids are unique", new Set(ids).size, ids.length);

const allDecisionKeysValid = HUMAN_DECISIONS.every((d) =>
  d.settingKeys.every((k) => settingKeys.has(k as string))
);
check("every decision.settingKeys entry exists in PieSettings", allDecisionKeysValid);

const ordered = decisionsByPriority();
eq("decisionsByPriority keeps full set", ordered.length, HUMAN_DECISIONS.length);
check(
  "decisionsByPriority sorts high before low",
  ordered[0]?.priority === "high" &&
    ordered[ordered.length - 1]?.priority !== "high"
);

// ------------------------------------------------------------
// Summary
// ------------------------------------------------------------
// eslint-disable-next-line no-console
console.log(`\n============================================`);
// eslint-disable-next-line no-console
console.log(`Slicing Pie foundation tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  // eslint-disable-next-line no-console
  console.log(`Failures:\n - ${failures.join("\n - ")}`);
  process.exit(1);
}
// eslint-disable-next-line no-console
console.log(`All foundation tests passed.\n`);
