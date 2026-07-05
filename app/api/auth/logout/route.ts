// ============================================================
// Execution Tracker — POST /api/auth/logout (Production)
// ============================================================

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_COOKIE_CONFIG } from "@/lib/auth";

export async function POST() {
  try {
    const cookieStore = await cookies();

    // Clear the cookie by using the same config but maxAge = 0
    cookieStore.set(AUTH_COOKIE_CONFIG.name, "", {
      ...AUTH_COOKIE_CONFIG.options,
      maxAge: 0,
    });

    return NextResponse.json({
      data: { success: true },
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error during logout:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
