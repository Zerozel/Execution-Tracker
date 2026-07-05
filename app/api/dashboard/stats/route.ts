// ============================================================
// Execution Tracker — GET /api/dashboard/stats
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";

export interface DashboardStats {
  assigned: number;
  accepted: number;
  submitted: number;
  completed: number;
  overdue: number;
  total: number;
}

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

    // Prepare each query separately to avoid Supabase builder type-splitting bugs
    let assignedQuery = supabase.from("tasks").select("*", { count: "exact", head: true }).eq("is_archived", false).eq("status", "assigned");
    let acceptedQuery = supabase.from("tasks").select("*", { count: "exact", head: true }).eq("is_archived", false).eq("status", "accepted");
    let submittedQuery = supabase.from("tasks").select("*", { count: "exact", head: true }).eq("is_archived", false).eq("status", "submitted");
    let completedQuery = supabase.from("tasks").select("*", { count: "exact", head: true }).eq("is_archived", false).eq("status", "completed");
    let overdueQuery = supabase.from("tasks").select("*", { count: "exact", head: true }).eq("is_archived", false).neq("status", "completed").not("due_date", "is", null).lt("due_date", new Date().toISOString().split("T")[0]);

    // Securely scope queries to the specific logged-in user if they are a member
    if (user.role === "member") {
      assignedQuery = assignedQuery.eq("owner_id", user.id);
      acceptedQuery = acceptedQuery.eq("owner_id", user.id);
      submittedQuery = submittedQuery.eq("owner_id", user.id);
      completedQuery = completedQuery.eq("owner_id", user.id);
      overdueQuery = overdueQuery.eq("owner_id", user.id);
    }

    // Run all queries simultaneously in parallel for high performance
    const [
      assignedResult,
      acceptedResult,
      submittedResult,
      completedResult,
      overdueResult,
    ] = await Promise.all([
      assignedQuery,
      acceptedQuery,
      submittedQuery,
      completedQuery,
      overdueQuery,
    ]);

    // Check for errors across any of the concurrent requests
    const errors = [
      assignedResult.error,
      acceptedResult.error,
      submittedResult.error,
      completedResult.error,
      overdueResult.error,
    ].filter(Boolean);

    if (errors.length > 0) {
      console.error("Error fetching dashboard stats:", errors);
      return NextResponse.json(
        { error: "Failed to fetch dashboard statistics" },
        { status: 500 }
      );
    }

    // Map responses directly to the DashboardStats contract
    const stats: DashboardStats = {
      assigned: assignedResult.count ?? 0,
      accepted: acceptedResult.count ?? 0,
      submitted: submittedResult.count ?? 0,
      completed: completedResult.count ?? 0,
      overdue: overdueResult.count ?? 0,
      total:
        (assignedResult.count ?? 0) +
        (acceptedResult.count ?? 0) +
        (submittedResult.count ?? 0) +
        (completedResult.count ?? 0),
    };

    return NextResponse.json({ data: stats, error: null });
  } catch (error) {
    console.error("Unexpected error in GET /api/dashboard/stats:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
