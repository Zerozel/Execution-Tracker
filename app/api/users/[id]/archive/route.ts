// ============================================================
// Execution Tracker — PATCH /api/users/[id]/archive
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    const { id: targetUserId } = await params;

    // Prevent self-archiving
    if (targetUserId === admin.id) {
      return NextResponse.json(
        { error: "You cannot archive your own account. Ask another admin to archive your account." },
        { status: 403 }
      );
    }

    const supabase = await createClient();

    // Fetch the user to verify they exist
    const { data: user, error: fetchError } = await supabase
      .from("users")
      .select("id, nickname, display_name, is_archived")
      .eq("id", targetUserId)
      .single();

    if (fetchError || !user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Check if already archived
    if (user.is_archived) {
      return NextResponse.json(
        { error: "User is already archived" },
        { status: 400 }
      );
    }

    // Archive the user
    const { data: archivedUser, error: updateError } = await supabase
      .from("users")
      .update({ is_archived: true })
      .eq("id", targetUserId)
      .select("id, nickname, display_name, role, is_archived, created_at")
      .single();

    if (updateError) {
      console.error("Error archiving user:", updateError);
      return NextResponse.json(
        { error: "Failed to archive user" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: archivedUser, error: null });
  } catch (error) {
    console.error("Unexpected error in PATCH /api/users/[id]/archive:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
