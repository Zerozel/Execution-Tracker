// ============================================================
// Execution Tracker — GET & POST /api/users
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";
import { requireAdmin, getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    await requireAdmin();

    const supabase = await createClient();

    const { data: users, error } = await supabase
      .from("users")
      .select("id, nickname, display_name, role, is_archived, created_at")
      .order("display_name", { ascending: true });

    if (error) {
      console.error("Error fetching users:", error);
      return NextResponse.json(
        { error: "Failed to fetch users" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: users, error: null });
  } catch (error) {
    console.error("Unexpected error in GET /api/users:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();

    const body = await request.json();
    const { nickname, display_name, role } = body;

    // Validate required fields
    const errors: string[] = [];

    if (!nickname || !nickname.trim()) {
      errors.push("Nickname is required");
    }

    if (!display_name || !display_name.trim()) {
      errors.push("Display name is required");
    }

    if (role && !["admin", "member"].includes(role)) {
      errors.push("Role must be 'admin' or 'member'");
    }

    if (errors.length > 0) {
      return NextResponse.json(
        { error: errors.join(". ") },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Check for duplicate nickname (case-insensitive)
    const normalizedNickname = nickname.trim().toLowerCase();
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("nickname", normalizedNickname)
      .single();

    if (existingUser) {
      return NextResponse.json(
        { error: `Nickname "${nickname.trim()}" is already taken. Choose a different nickname.` },
        { status: 409 }
      );
    }

    // Create the user
    const { data: newUser, error: createError } = await supabase
      .from("users")
      .insert({
        nickname: normalizedNickname,
        display_name: display_name.trim(),
        role: role || "member",
        is_archived: false,
      })
      .select("id, nickname, display_name, role, is_archived, created_at")
      .single();

    if (createError) {
      console.error("Error creating user:", createError);

      // Handle unique constraint violation (safety net)
      if (createError.code === "23505") {
        return NextResponse.json(
          { error: `Nickname "${nickname.trim()}" is already taken` },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: "Failed to create user" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { data: newUser, error: null },
      { status: 201 }
    );
  } catch (error) {
    console.error("Unexpected error in POST /api/users:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
