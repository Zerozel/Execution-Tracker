// ============================================================
// Execution Tracker — PATCH /api/users/[id]/restore
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id: targetUserId } = await params;

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

    // Check if already active
    if (!user.is_archived) {
      return NextResponse.json(
        { error: "User is already active" },
        { status: 400 }
      );
    }

    // Restore the user
    const { data: restoredUser, error: updateError } = await supabase
      .from("users")
      .update({ is_archived: false })
      .eq("id", targetUserId)
      .select("id, nickname, display_name, role, is_archived, created_at")
      .single();

    if (updateError) {
      console.error("Error restoring user:", updateError);
      return NextResponse.json(
        { error: "Failed to restore user" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: restoredUser, error: null });
  } catch (error) {
    console.error("Unexpected error in PATCH /api/users/[id]/restore:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
