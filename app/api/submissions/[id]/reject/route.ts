// ============================================================
// Execution Tracker — POST /api/submissions/[id]/reject
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
    const body = await request.json();
    const { reviewer_note } = body;

    // Validate: reviewer_note is required for rejection
    if (!reviewer_note || !reviewer_note.trim()) {
      return NextResponse.json(
        { error: "Reviewer note is required when rejecting a submission" },
        { status: 400 }
      );
    }

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

    // Rule: Can only reject pending submissions
    if (submission.status !== "pending") {
      return NextResponse.json(
        {
          error: `Cannot reject a submission with status "${submission.status}". Only pending submissions can be rejected.`,
        },
        { status: 400 }
      );
    }

    // Step 2: Update the submission
    const now = new Date().toISOString();
    const { error: submissionError } = await supabase
      .from("submissions")
      .update({
        status: "rejected",
        reviewer_note: reviewer_note.trim(),
        reviewed_by: admin.id,
        reviewed_at: now,
      })
      .eq("id", submissionId);

    if (submissionError) {
      console.error("Error rejecting submission:", submissionError);
      return NextResponse.json(
        { error: "Failed to reject submission" },
        { status: 500 }
      );
    }

    // Step 3: Reset task status to "accepted" so member can resubmit
    const { error: taskError } = await supabase
      .from("tasks")
      .update({ status: "accepted" })
      .eq("id", submission.task_id);

    if (taskError) {
      console.error("Error resetting task status:", taskError);
      return NextResponse.json(
        { error: "Submission rejected but failed to update task status" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: {
        id: submissionId,
        status: "rejected",
        reviewer_note: reviewer_note.trim(),
        reviewed_by: admin.id,
        reviewed_at: now,
        task_status: "accepted",
      },
      error: null,
    });
  } catch (error) {
    console.error(
      "Unexpected error in POST /api/submissions/[id]/reject:",
      error
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
