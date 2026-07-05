// ============================================================
// Execution Tracker — POST /api/submissions/[id]/approve
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Admin-only endpoint
    const admin = await requireAdmin();

    const { id: submissionId } = await params;
    const supabase = await createClient();

    // Step 1: Fetch the submission to verify it exists and get the task_id
    const { data: submission, error: fetchError } = await supabase
      .from("submissions")
      .select("id, task_id, status")
      .eq("id", submissionId)
      .single();

    if (fetchError || !submission) {
      return NextResponse.json(
        { error: "Submission not found" },
        { status: 404 }
      );
    }

    // Rule: Can only approve pending submissions
    if (submission.status !== "pending") {
      return NextResponse.json(
        {
          error: `Cannot approve a submission with status "${submission.status}". Only pending submissions can be approved.`,
        },
        { status: 400 }
      );
    }

    // Step 2: Update the submission
    const now = new Date().toISOString();
    const { error: submissionError } = await supabase
      .from("submissions")
      .update({
        status: "approved",
        reviewed_by: admin.id,
        reviewed_at: now,
      })
      .eq("id", submissionId);

    if (submissionError) {
      console.error("Error approving submission:", submissionError);
      return NextResponse.json(
        { error: "Failed to approve submission" },
        { status: 500 }
      );
    }

    // Step 3: Update the parent task to "completed"
    const { error: taskError } = await supabase
      .from("tasks")
      .update({ status: "completed" })
      .eq("id", submission.task_id);

    if (taskError) {
      console.error("Error completing task:", taskError);
      // Submission was approved but task status update failed
      // This is a partial success — submission is approved
      return NextResponse.json(
        { error: "Submission approved but failed to update task status" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: {
        id: submissionId,
        status: "approved",
        reviewed_by: admin.id,
        reviewed_at: now,
        task_status: "completed",
      },
      error: null,
    });
  } catch (error) {
    console.error(
      "Unexpected error in POST /api/submissions/[id]/approve:",
      error
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
