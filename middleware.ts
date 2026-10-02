// ============================================================
// Execution Tracker — Middleware (Production Hardened)
// ============================================================
// Protects every route except the ones listed as public.
//
// History: an earlier version also redirected logged-in users AWAY
// from /login to /dashboard. That created a redirect loop whenever a
// cookie survived a user row being deleted — the middleware trusted
// the cookie's presence, the page trusted the database, and the two
// disagreed. The login page now decides for itself whether to skip
// the form, and the middleware never redirects to /dashboard.
// ============================================================

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * UUID v4 format validator.
 * Rejects malformed user_id cookies at the edge
 * before they reach the database.
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Paths that are always public (no auth required).
 */
const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
];

/**
 * Paths that start with these prefixes are public.
 */
const PUBLIC_PREFIXES = [
  "/_next",
  "/favicon.ico",
  "/api/auth/",
  "/api/daily-plan/",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow public paths without any auth check.
  if (PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  // Always allow public prefixes (static files, Next.js internals,
  // auth endpoints, daily-plan endpoints that handle their own auth).
  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname.startsWith(prefix)) {
      return NextResponse.next();
    }
  }

  // For all other routes, require a valid-looking user_id cookie.
  // The cookie is a coarse filter: page-level getCurrentUser() does
  // the authoritative check against the database. If a stale cookie
  // gets through here but the user no longer exists, the page will
  // redirect to /login and the login page will clear the cookie.
  const userId = request.cookies.get("user_id")?.value;
  const isAuthenticated = !!userId && UUID_REGEX.test(userId);

  if (!isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

/**
 * Matcher configuration.
 *
 * Excludes:
 * - Static files (_next/static)
 * - Image optimization (_next/image)
 * - Favicon
 * - Manifest, service worker, offline fallback
 * - Common static assets (images, fonts, JSON)
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest\\.json|sw\\.js|offline\\.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|eot|json)$).*)",
  ],
};
