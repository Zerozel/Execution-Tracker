// ============================================================
// Execution Tracker — PATCH /api/users/[id]
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";
import { requireAdmin, getCurrentUser } from "@/lib/auth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    const { id: targetUserId } = await params;

    const body = await request.json();
    const { nickname, display_name, role } = body;

    // Validate: at least one field to update
    if (!nickname && !display_name && !role) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    // Validate role if provided
    if (role && !["admin", "member"].includes(role)) {
      return NextResponse.json(
        { error: "Role must be 'admin' or 'member'" },
        { status: 400 }
      );
    }

    // Validate nickname if provided
    if (nickname && !nickname.trim()) {
      return NextResponse.json(
        { error: "Nickname cannot be empty" },
        { status: 400 }
      );
    }

    // Prevent self-demotion: an admin cannot remove their own admin role
    if (role && targetUserId === admin.id && role !== "admin") {
      return NextResponse.json(
        { error: "You cannot remove your own admin role. Ask another admin to change your role." },
        { status: 403 }
      );
    }

    const supabase = await createClient();

    // Fetch the target user to verify they exist
    const { data: targetUser, error: fetchError } = await supabase
      .from("users")
      .select("id, nickname, display_name, role, is_archived")
      .eq("id", targetUserId)
      .single();

    if (fetchError || !targetUser) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // If nickname is being changed, check for duplicates
    if (nickname && nickname.trim().toLowerCase() !== targetUser.nickname) {
      const normalizedNickname = nickname.trim().toLowerCase();
      const { data: existingUser } = await supabase
        .from("users")
        .select("id")
        .eq("nickname", normalizedNickname)
        .neq("id", targetUserId)
        .single();

      if (existingUser) {
        return NextResponse.json(
          { error: `Nickname "${nickname.trim()}" is already taken. Choose a different nickname.` },
          { status: 409 }
        );
      }
    }

    // Build update object with only provided fields
    const updates: Record<string, string> = {};
    
    if (nickname && nickname.trim()) {
      updates.nickname = nickname.trim().toLowerCase();
    }
    
    if (display_name && display_name.trim()) {
      updates.display_name = display_name.trim();
    }
    
    if (role) {
      updates.role = role;
    }

    const { data: updatedUser, error: updateError } = await supabase
      .from("users")
      .update(updates)
      .eq("id", targetUserId)
      .select("id, nickname, display_name, role, is_archived, created_at")
      .single();

    if (updateError) {
      console.error("Error updating user:", updateError);
      
      // Handle unique constraint violation (safety net for nickname duplicates)
      if (updateError.code === "23505") {
        return NextResponse.json(
          { error: `Nickname "${nickname?.trim()}" is already taken` },
          { status: 409 }
        );
      }
      
      return NextResponse.json(
        { error: "Failed to update user" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: updatedUser, error: null });
  } catch (error) {
    console.error("Unexpected error in PATCH /api/users/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
