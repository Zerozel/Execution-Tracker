// ============================================================
// Execution Tracker — DELETE /api/users/[id]
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    const { id: targetUserId } = await params;

    // Prevent self-deletion
    if (targetUserId === admin.id) {
      return NextResponse.json(
        { error: "You cannot delete your own account. Ask another admin to delete your account." },
        { status: 403 }
      );
    }

    const supabase = await createClient();

    // Fetch the user to verify they exist
    const { data: user, error: fetchError } = await supabase
      .from("users")
      .select("id, nickname, display_name")
      .eq("id", targetUserId)
      .single();

    if (fetchError || !user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Check if user has active tasks (optional — warn before deleting)
    const { count: activeTaskCount } = await supabase
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("owner_id", targetUserId)
      .eq("is_archived", false)
      .neq("status", "completed");

    // Delete the user
    // Due to ON DELETE SET NULL on tasks and submissions,
    // those records will have their user_id fields set to NULL
    const { error: deleteError } = await supabase
      .from("users")
      .delete()
      .eq("id", targetUserId);

    if (deleteError) {
      console.error("Error deleting user:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete user" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: {
        deleted: true,
        nickname: user.nickname,
        display_name: user.display_name,
        active_tasks_reassigned: activeTaskCount || 0,
      },
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in DELETE /api/users/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
