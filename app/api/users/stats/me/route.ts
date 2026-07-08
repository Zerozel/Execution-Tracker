// ============================================================
// Execution Tracker — GET /api/users/stats/me
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const supabase = await createClient();

    // Get completed tasks with due dates for the current user
    const { data: completedTasks, error: tasksError } = await supabase
      .from("tasks")
      .select(`
        id,
        due_date,
        submissions!inner (
          status,
          reviewed_at
        )
      `)
      .eq("owner_id", user.id)
      .eq("status", "completed")
      .eq("is_archived", false)
      .not("due_date", "is", null)
      .eq("submissions.status", "approved");

    if (tasksError) {
      console.error("Error fetching completed tasks:", tasksError);
      return NextResponse.json(
        { error: "Failed to fetch statistics" },
        { status: 500 }
      );
    }

    const totalCompleted = (completedTasks || []).length;

    if (totalCompleted === 0) {
      return NextResponse.json({
        data: {
          total_completed_with_due_date: 0,
          completed_on_time: 0,
          completed_late: 0,
          reliability_percentage: null,
        },
        error: null,
      });
    }

    let onTime = 0;
    let late = 0;

    (completedTasks || []).forEach((task: any) => {
      const approvedSubmission = task.submissions?.[0];

      if (approvedSubmission?.reviewed_at && task.due_date) {
        const completedDate = new Date(approvedSubmission.reviewed_at);
        const dueDate = new Date(task.due_date);

        // Compare dates only (ignore time)
        completedDate.setHours(0, 0, 0, 0);
        dueDate.setHours(0, 0, 0, 0);

        if (completedDate <= dueDate) {
          onTime++;
        } else {
          late++;
        }
      }
    });

    const percentage = Math.round((onTime / totalCompleted) * 100);

    return NextResponse.json({
      data: {
        total_completed_with_due_date: totalCompleted,
        completed_on_time: onTime,
        completed_late: late,
        reliability_percentage: percentage,
      },
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in GET /api/users/stats/me:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
