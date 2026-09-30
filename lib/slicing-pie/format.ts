// ============================================================
// Execution Tracker — Slicing Pie: Formatting & Rounding
// ============================================================
// The source is SILENT on rounding rules for both slices and
// percentages (§12, EDGE-021). We therefore make rounding an
// explicit, configurable decision (round-half-up to N places).
//
// Money is stored throughout as INTEGER MINOR UNITS (e.g. cents)
// to avoid floating-point drift. Slices are decimals rounded to a
// configurable precision.
// ============================================================

/**
 * Round-half-up to `places` decimal places.
 * Deterministic and independent of locale/float quirks.
 */
export function roundTo(value: number, places: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = Math.pow(10, Math.max(0, places));
  // Add a tiny epsilon to counter binary representation errors
  // (e.g. 1.005 * 100 = 100.49999...).
  const shifted = value * factor;
  const rounded = Math.round(shifted + (shifted >= 0 ? 1e-9 : -1e-9));
  return rounded / factor;
}

/** Round a slice count to the configured precision. */
export function roundSlices(slices: number, decimalPlaces = 4): number {
  return roundTo(slices, decimalPlaces);
}

/** Round a percentage (0..100) to the configured precision. */
export function roundPercent(pct: number, decimalPlaces = 2): number {
  return roundTo(pct, decimalPlaces);
}

// ------------------------------------------------------------
// Minor-unit money helpers
// ------------------------------------------------------------

/** Convert a major-unit amount (e.g. dollars) to integer minor units. */
export function toMinor(major: number): number {
  return Math.round(major * 100);
}

/** Convert integer minor units back to a major-unit number. */
export function fromMinor(minor: number): number {
  return minor / 100;
}

/**
 * Format integer minor units as a currency string.
 * No FX conversion is ever performed (CONFIG-007: single currency).
 * The default is Naira, matching DEFAULT_PIE_SETTINGS.currency; callers
 * should still pass the Pie's own currency explicitly.
 */
export function formatMoney(minor: number, currency = "NGN"): string {
  const major = fromMinor(minor);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(major);
  } catch {
    // Fallback for non-ISO / unknown currency codes.
    return `${currency} ${major.toFixed(2)}`;
  }
}

/** Format a slice count for display. */
export function formatSlices(slices: number, decimalPlaces = 4): string {
  const rounded = roundSlices(slices, decimalPlaces);
  // Trim trailing zeros but keep it readable.
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimalPlaces,
  }).format(rounded);
}

/** Format a fraction (0..1) or a whole percent (0..100) as `xx.xx%`. */
export function formatPercent(
  value: number,
  { isFraction = false, decimalPlaces = 2 }: { isFraction?: boolean; decimalPlaces?: number } = {}
): string {
  const pct = isFraction ? value * 100 : value;
  return `${roundPercent(pct, decimalPlaces).toFixed(decimalPlaces)}%`;
}

/**
 * Convert a stored fractional rate (e.g. 0.10) to a percent for display
 * (10) and back. Used by the settings UI for percent-type fields.
 */
export function rateToPercent(rate: number): number {
  return roundTo(rate * 100, 4);
}

export function percentToRate(percent: number): number {
  return roundTo(percent / 100, 6);
}

/**
 * Safe division that returns 0 instead of NaN/Infinity when the
 * denominator is 0 (e.g. ownership % when the Pie has no slices yet).
 */
export function safeDivide(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : 0;
}
