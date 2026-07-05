// ============================================================
// Execution Tracker — POST /api/auth/login
// ============================================================

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    // Parse the request body
    const body = await request.json();
    const nickname = body?.nickname?.trim().toLowerCase();

    // Validate input
    if (!nickname) {
      return NextResponse.json(
        { error: "Nickname is required" },
        { status: 400 }
      );
    }

    // Create Supabase client and query for active user
    const supabase = await createClient();

    const { data: user, error } = await supabase
      .from("users")
      .select("id, nickname, display_name, role")
      .eq("nickname", nickname)
      .eq("is_archived", false)
      .single();

    // Handle database errors
    if (error) {
      // .single() throws an error when no row found
      // PGRST116 is the "no rows" error code from PostgREST
      if (error.code === "PGRST116") {
        return NextResponse.json(
          { error: "Access denied. Nickname not found." },
          { status: 401 }
        );
      }

      console.error("Database error during login:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    // Handle no user found (safety net — .single() should catch this)
    if (!user) {
      return NextResponse.json(
        { error: "Access denied. Nickname not found." },
        { status: 401 }
      );
    }

    // Set the user_id cookie
    // - httpOnly: Not accessible via JavaScript (XSS protection)
    // - secure: Only sent over HTTPS (disable in development if needed)
    // - sameSite: lax — allows navigation from external sites
    // - maxAge: 7 days in seconds
    const cookieStore = await cookies();
    cookieStore.set("user_id", user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    // Return success with user info (for client-side display only)
    return NextResponse.json({
      data: {
        id: user.id,
        nickname: user.nickname,
        display_name: user.display_name,
        role: user.role,
      },
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error during login:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
