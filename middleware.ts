// ============================================================
// Execution Tracker — Middleware (Production Hardened)
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
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths without any auth check
  if (PUBLIC_PATHS.includes(pathname)) {
    // If user is already logged in and on login page, redirect to dashboard
    if (pathname === "/login") {
      const userId = request.cookies.get("user_id")?.value;
      if (userId && UUID_REGEX.test(userId)) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
    }
    return NextResponse.next();
  }

  // Allow public prefixes (static files, Next.js internals)
  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname.startsWith(prefix)) {
      return NextResponse.next();
    }
  }

  // Allow API auth endpoints specifically
  if (pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  // For all other routes, check authentication
  const userId = request.cookies.get("user_id")?.value;
  const isAuthenticated = !!userId && UUID_REGEX.test(userId);

  // If not authenticated, redirect to login
  if (!isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated — allow the request
  return NextResponse.next();
}

/**
 * Matcher configuration.
 *
 * Excludes:
 * - Static files (_next/static)
 * - Image optimization (_next/image)
 * - Favicon
 * - Common static assets (images, fonts, etc.)
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest\\.json|sw\\.js|offline\\.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|eot|json)$).*)",
  ],
};
