// ============================================================
// Execution Tracker — GET /api/users/stats
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";

export interface UserReliabilityStats {
  user_id: string;
  nickname: string;
  display_name: string;
  total_completed_with_due_date: number;
  completed_on_time: number;
  completed_late: number;
  reliability_percentage: number | null;
}

export async function GET() {
  try {
    await requireAdmin();

    const supabase = await createClient();

    // Get all active users
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id, nickname, display_name")
      .eq("is_archived", false);

    if (usersError) {
      console.error("Error fetching users:", usersError);
      return NextResponse.json(
        { error: "Failed to fetch users" },
        { status: 500 }
      );
    }

    // Get all completed tasks with due dates and their approved submissions
    const { data: completedTasks, error: tasksError } = await supabase
      .from("tasks")
      .select(`
        id,
        title,
        owner_id,
        due_date,
        submissions!inner (
          status,
          reviewed_at
        )
      `)
      .eq("status", "completed")
      .eq("is_archived", false)
      .not("due_date", "is", null)
      .eq("submissions.status", "approved");

    if (tasksError) {
      console.error("Error fetching completed tasks:", tasksError);
      return NextResponse.json(
        { error: "Failed to fetch task statistics" },
        { status: 500 }
      );
    }

    // Calculate stats per user
    const stats: UserReliabilityStats[] = (users || []).map((user) => {
      const userTasks = (completedTasks || []).filter(
        (task: any) => task.owner_id === user.id
      );

      const totalCompleted = userTasks.length;

      if (totalCompleted === 0) {
        return {
          user_id: user.id,
          nickname: user.nickname,
          display_name: user.display_name,
          total_completed_with_due_date: 0,
          completed_on_time: 0,
          completed_late: 0,
          reliability_percentage: null,
        };
      }

      let onTime = 0;
      let late = 0;

      userTasks.forEach((task: any) => {
        // Get the approved submission's review date (this is when the task was completed)
        const approvedSubmission = task.submissions?.[0];
        
        if (approvedSubmission?.reviewed_at && task.due_date) {
          const completedDate = new Date(approvedSubmission.reviewed_at);
          const dueDate = new Date(task.due_date);
          
          // Set both to start of day for fair comparison
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

      return {
        user_id: user.id,
        nickname: user.nickname,
        display_name: user.display_name,
        total_completed_with_due_date: totalCompleted,
        completed_on_time: onTime,
        completed_late: late,
        reliability_percentage: percentage,
      };
    });

    // Sort by reliability (highest first), users with no data at bottom
    stats.sort((a, b) => {
      if (a.reliability_percentage === null && b.reliability_percentage === null) return 0;
      if (a.reliability_percentage === null) return 1;
      if (b.reliability_percentage === null) return -1;
      return b.reliability_percentage - a.reliability_percentage;
    });

    return NextResponse.json({ data: stats, error: null });
  } catch (error) {
    console.error("Unexpected error in GET /api/users/stats:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
