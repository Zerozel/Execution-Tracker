// ============================================================
// Execution Tracker — Environment Variable Validation
// ============================================================

const REQUIRED_ENV_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

/**
 * Optional, but the Pie feature is empty without it.
 *
 * Deliberately NOT in REQUIRED_ENV_VARS: a missing service key must not
 * stop the whole app from booting — the execution tracker itself does
 * not need it. `createClient()` logs a loud warning instead. See the
 * header of lib/supabase.ts for why the key is needed at all.
 */
const RECOMMENDED_ENV_VARS = ["SUPABASE_SERVICE_ROLE_KEY"] as const;

/**
 * Validates that all required environment variables are set.
 *
 * Call this at application startup (instrumentation or layout).
 * Throws immediately with a clear error if any are missing,
 * preventing mysterious runtime failures from misconfiguration.
 */
export function validateEnv(): void {
  const missing: string[] = [];

  for (const varName of REQUIRED_ENV_VARS) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  if (missing.length > 0) {
    const message = [
      "",
      "╔══════════════════════════════════════════════════════════╗",
      "║  EXECUTION TRACKER — ENVIRONMENT MISCONFIGURED           ║",
      "╠══════════════════════════════════════════════════════════╣",
      "║  Missing required environment variables:                 ║",
      ...missing.map(
        (v) => `║    • ${v.padEnd(46)}║`
      ),
      "║                                                          ║",
      "║  Action:                                                 ║",
      "║    1. Copy .env.example to .env.local                    ║",
      "║    2. Fill in your Supabase project credentials          ║",
      "║    3. Restart the development server                     ║",
      "║                                                          ║",
      "║  Supabase credentials are available at:                  ║",
      "║    Project Settings → API → Project URL / Anon Key       ║",
      "╚══════════════════════════════════════════════════════════╝",
      "",
    ].join("\n");

    throw new Error(message);
  }

  const missingRecommended = RECOMMENDED_ENV_VARS.filter(
    (varName) => !process.env[varName]
  );
  if (missingRecommended.length > 0) {
    console.warn(
      [
        "",
        "  Optional Supabase credentials not set:",
        ...missingRecommended.map((v) => `    • ${v}`),
        "  The equity Pie screens read through the service role, so they",
        "  will come back EMPTY without the service_role key.",
        "  Supabase dashboard → Project Settings → API → service_role key.",
        "",
      ].join("\n")
    );
  }
}

/**
 * Returns the Supabase URL with validation.
 * Use in places where throwing is not appropriate.
 */
export function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    console.error(
      "NEXT_PUBLIC_SUPABASE_URL is not set. Check your .env.local file."
    );
    return "";
  }
  return url;
}

/**
 * Returns the Supabase anon key with validation.
 */
export function getSupabaseAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) {
    console.error(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. Check your .env.local file."
    );
    return "";
  }
  return key;
}
