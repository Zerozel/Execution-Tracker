
// ============================================================
// Execution Tracker — POST /api/auth/login (Production)
// ============================================================
// Only the cookie-setting lines change from Session 2.
// The rest of the file remains identical.

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";
import { AUTH_COOKIE_CONFIG } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const nickname = body?.nickname?.trim().toLowerCase();

    if (!nickname) {
      return NextResponse.json(
        { error: "Nickname is required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data: user, error } = await supabase
      .from("users")
      .select("id, nickname, display_name, role")
      .eq("nickname", nickname)
      .eq("is_archived", false)
      .single();

    if (error) {
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

    if (!user) {
      return NextResponse.json(
        { error: "Access denied. Nickname not found." },
        { status: 401 }
      );
    }

    const cookieStore = await cookies();
    cookieStore.set(AUTH_COOKIE_CONFIG.name, user.id, AUTH_COOKIE_CONFIG.options);

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
