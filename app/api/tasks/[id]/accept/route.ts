// ============================================================
// Execution Tracker — POST /api/tasks/[id]/accept
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const supabase = await createClient();

    // Fetch the task to verify ownership and current status
    const { data: task, error: fetchError } = await supabase
      .from("tasks")
      .select("id, owner_id, status")
      .eq("id", id)
      .eq("is_archived", false)
      .single();

    if (fetchError || !task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }

    // Rule 1: Only the task owner can accept
    if (task.owner_id !== user.id) {
      return NextResponse.json(
        { error: "Only the assigned owner can accept this task" },
        { status: 403 }
      );
    }

    // Rule 2: Task must be in "assigned" status
    if (task.status !== "assigned") {
      return NextResponse.json(
        { error: `Cannot accept a task with status "${task.status}"` },
        { status: 400 }
      );
    }

    // Update the task status
    const { data: updatedTask, error: updateError } = await supabase
      .from("tasks")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(`
        *,
        owner:owner_id (id, nickname, display_name),
        creator:creator_id (id, nickname, display_name)
      `)
      .single();

    if (updateError) {
      console.error("Error accepting task:", updateError);
      return NextResponse.json(
        { error: "Failed to accept task" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: updatedTask, error: null });
  } catch (error) {
    console.error("Unexpected error in POST /api/tasks/[id]/accept:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
