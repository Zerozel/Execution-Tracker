// ============================================================
// Execution Tracker — GET /api/tasks/[id]/submissions
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";

export async function GET(
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
    const supabase = await createClient();

    // Step 1: Fetch the task to verify access
    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .select("id, owner_id")
      .eq("id", taskId)
      .eq("is_archived", false)
      .single();

    if (taskError || !task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }

    // Authorization: members can only see submissions for their own tasks
    if (user.role === "member" && task.owner_id !== user.id) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }

    // Step 2: Fetch all submissions for this task
    const { data: submissions, error: submissionsError } = await supabase
      .from("submissions")
      .select(`
        *,
        submitter:user_id (id, nickname, display_name),
        reviewer:reviewed_by (id, nickname, display_name)
      `)
      .eq("task_id", taskId)
      .order("created_at", { ascending: false });

    if (submissionsError) {
      console.error("Error fetching submissions:", submissionsError);
      return NextResponse.json(
        { error: "Failed to fetch submissions" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: submissions, error: null });
  } catch (error) {
    console.error(
      "Unexpected error in GET /api/tasks/[id]/submissions:",
      error
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
