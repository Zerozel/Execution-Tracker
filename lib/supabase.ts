// ============================================================
// Execution Tracker — Supabase Server Client
// ============================================================
// WHY THIS CLIENT USES THE SERVICE-ROLE KEY
//
// The app authenticates people with its own signed cookie (`user_id`,
// see lib/auth.ts) — it does NOT use Supabase Auth. So when a request
// reaches Supabase, there is no Supabase session and `auth.uid()` is
// null. Every Row Level Security policy in supabase/migrations is
// written against `auth.uid()` (and `public.is_admin()`, which calls
// it), which means:
//
//   • a policy `to authenticated` can never match the anon key,
//   • a policy scoped per-user can never match at all, because there
//     is no user for the database to scope to.
//
// Read with the anon key, the Pie tables therefore return NOTHING. That
// is not a safety feature that can be kept — it is a broken feature.
//
// So the arrangement is:
//
//   • The app's server routes read and write with the service role.
//     RLS does not apply to it; the authorisation check that matters is
//     `requireAdminApi()` / `requireUser()` plus the per-route scoping,
//     which is where the D4 visibility rules already live.
//   • RLS stays enabled, and its policies deny the anon key everything.
//     That is the backstop that matters: the anon key ships to browsers
//     inside the JavaScript bundle, so anyone can hold it, and it must
//     unlock nothing. See 0008 for the explicit lockdown.
//
// The service-role key must NEVER be exported as NEXT_PUBLIC_* and must
// never be read by a Client Component. Everything in this file is
// server-only, and no Client Component imports it.
// ============================================================

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Warned once per process, not once per query. */
let warnedAboutMissingKey = false;

/** Set once we've thrown in production, so we only fail once per process. */
let thrownAboutMissingKey = false;

/**
 * Create a Supabase client for server-side usage.
 *
 * Used by:
 * - Route Handlers (API routes)
 * - Server Components (data fetching)
 * - Server Actions (mutations)
 *
 * Never imported in client components.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    const isProduction = process.env.NODE_ENV === "production";

    // In production, the fallback is not acceptable: falling back to the
    // anon key turns every Pie write into a 42501 with a hint that reads
    // like a database misconfiguration, when the real problem is a missing
    // Vercel environment variable. Fail loudly, once per process, with an
    // error message that names the actual fix.
    if (isProduction && !thrownAboutMissingKey) {
      thrownAboutMissingKey = true;
      throw new Error(
        [
          "",
          "════════════════════════════════════════════════════════════",
          "  SUPABASE_SERVICE_ROLE_KEY is not set in production.",
          "",
          "  The app reads with the service role because it uses its own",
          "  cookie session rather than Supabase Auth. Without this key,",
          "  every Pie read comes back empty and every Pie write fails",
          "  with a 42501 'permission denied' error, because Row Level",
          "  Security denies the anon key that would otherwise be used.",
          "",
          "  Fix: Vercel dashboard → Project → Settings → Environment",
          "       Variables → add for Production, Preview, and Development:",
          "",
          "       SUPABASE_SERVICE_ROLE_KEY=<the service_role secret>",
          "",
          "  The key comes from Supabase → Project Settings → API →",
          "  Project API keys → service_role. It is server-only.",
          "  Never prefix it with NEXT_PUBLIC_.",
          "",
          "  Redeploy after adding the variable.",
          "════════════════════════════════════════════════════════════",
          "",
        ].join("\n")
      );
    }

    // Development: warn once and fall back to anon so local work can
    // continue. This path exists so a fresh contributor isn't blocked on
    // obtaining the service key before they can run the app at all.
    if (!warnedAboutMissingKey) {
      warnedAboutMissingKey = true;
      console.error(
        [
          "",
          "════════════════════════════════════════════════════════════",
          "  SUPABASE_SERVICE_ROLE_KEY is not set (development).",
          "",
          "  The app reads with the service role because it uses its own",
          "  cookie session rather than Supabase Auth — without this key,",
          "  every Pie screen comes back EMPTY (Row Level Security denies",
          "  the anon key), even though the data is there.",
          "",
          "  Fix: Supabase dashboard → Project Settings → API →",
          "       Project API keys → service_role → copy into .env.local",
          "",
          "       SUPABASE_SERVICE_ROLE_KEY=<the service_role secret>",
          "",
          "  This key is server-only. Never prefix it with NEXT_PUBLIC_.",
          "  Falling back to the anon key so the rest of the app still runs.",
          "════════════════════════════════════════════════════════════",
          "",
        ].join("\n")
      );
    }
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[]
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from Server Component — ignore if immutable
          }
        },
      },
    }
  );
}
