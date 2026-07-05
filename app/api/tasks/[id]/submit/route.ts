// ============================================================
// Execution Tracker — POST /api/tasks/[id]/submit
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

    const { id: taskId } = await params;
    const body = await request.json();
    const { description, evidence_url } = body;

    // Validate: description is required
    if (!description || !description.trim()) {
      return NextResponse.json(
        { error: "Description of submitted work is required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Step 1: Fetch the task to verify ownership and status
    const { data: task, error: fetchError } = await supabase
      .from("tasks")
      .select("id, owner_id, status")
      .eq("id", taskId)
      .eq("is_archived", false)
      .single();

    if (fetchError || !task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }

    // Rule 1: Only the task owner can submit
    if (task.owner_id !== user.id) {
      return NextResponse.json(
        { error: "Only the assigned owner can submit work for this task" },
        { status: 403 }
      );
    }

    // Rule 2: Task must be in "accepted" status
    // (Also allow "submitted" so members can resubmit after rejection)
    if (task.status !== "accepted" && task.status !== "submitted") {
      return NextResponse.json(
        {
          error: `Cannot submit work for a task with status "${task.status}". Task must be accepted first.`,
        },
        { status: 400 }
      );
    }

    // Step 2: Create a NEW submission record (never overwrite)
    const { data: submission, error: submissionError } = await supabase
      .from("submissions")
      .insert({
        task_id: taskId,
        user_id: user.id,
        description: description.trim(),
        evidence_url: evidence_url?.trim() || null,
        status: "pending",
      })
      .select("*")
      .single();

    if (submissionError) {
      console.error("Error creating submission:", submissionError);
      return NextResponse.json(
        { error: "Failed to submit work" },
        { status: 500 }
      );
    }

    // Step 3: Update task status to "submitted"
    const { error: updateError } = await supabase
      .from("tasks")
      .update({ status: "submitted" })
      .eq("id", taskId);

    if (updateError) {
      console.error("Error updating task status:", updateError);
      // Submission was created but task update failed
      // Task remains in previous status — submission still exists for review
      return NextResponse.json(
        { error: "Work submitted but failed to update task status" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { data: submission, error: null },
      { status: 201 }
    );
  } catch (error) {
    console.error("Unexpected error in POST /api/tasks/[id]/submit:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
