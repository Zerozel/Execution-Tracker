// ============================================================
// Execution Tracker — Auth Helpers (Production Hardened)
// ============================================================
// NOTE: This file replaces the Session 2 lib/auth.ts.
// The getCurrentUser(), requireAuth(), and requireAdmin()
// functions remain identical. Only additions are below.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase";
import type { AuthUser } from "@/types";

// ============================================================
// COOKIE CONFIGURATION CONSTANTS
// ============================================================

/**
 * Cookie configuration used by login and logout routes.
 *
 * Production settings:
 *   - httpOnly: true  → Cookie is inaccessible to JavaScript (XSS protection)
 *   - secure: true    → Cookie is only sent over HTTPS
 *   - sameSite: "lax" → Protects against CSRF while allowing normal navigation
 *   - path: "/"       → Cookie is available on all routes
 *   - maxAge: 7 days  → Session lasts one week
 *
 * Development:
 *   - secure: false   → Allows HTTP on localhost
 *
 * IMPORTANT: Never store role or nickname in the cookie.
 * Always fetch from the database via getCurrentUser().
 */
export const AUTH_COOKIE_CONFIG = {
  name: "user_id" as const,
  options: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days in seconds
  },
};

// ============================================================
// AUTH FUNCTIONS (unchanged from Session 2)
// ============================================================

export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get("user_id")?.value;

    if (!userId) {
      return null;
    }

    // Basic UUID format check — prevents malformed cookies
    // from generating unnecessary database lookups
    const UUID_REGEX =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(userId)) {
      return null;
    }

    const supabase = await createClient();
    const { data: user, error } = await supabase
      .from("users")
      .select("id, nickname, display_name, role")
      .eq("id", userId)
      .eq("is_archived", false)
      .single();

    if (error || !user) {
      return null;
    }

    return {
      id: user.id,
      nickname: user.nickname,
      display_name: user.display_name,
      role: user.role,
    };
  } catch (error) {
    console.error("Error getting current user:", error);
    return null;
  }
}

export async function requireAuth(): Promise<AuthUser> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireAuth();

  if (user.role !== "admin") {
    redirect("/dashboard");
  }

  return user;
}
