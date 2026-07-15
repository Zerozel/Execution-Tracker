// ============================================================
// Execution Tracker — GET /api/daily-plan/team/engagement
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(request.url);
    const weekStartParam = searchParams.get("week_start");

    // Default to current week's Monday
    let weekStart: Date;
    if (weekStartParam) {
      weekStart = new Date(weekStartParam);
    } else {
      weekStart = new Date();
      const day = weekStart.getDay();
      const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
      weekStart.setDate(diff);
    }

    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 4); // Friday
    weekEnd.setHours(23, 59, 59, 999);

    const weekStartStr = weekStart.toISOString().split("T")[0];
    const weekEndStr = weekEnd.toISOString().split("T")[0];

    const supabase = await createClient();

    // Get all active users
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id, display_name")
      .eq("is_archived", false)
      .order("display_name");

    if (usersError) {
      console.error("Error fetching users:", usersError);
      return NextResponse.json(
        { error: "Failed to fetch users" },
        { status: 500 }
      );
    }

    // Get all plans for this week
    const { data: plans, error: plansError } = await supabase
      .from("daily_plans")
      .select("user_id, plan_date, status")
      .gte("plan_date", weekStartStr)
      .lte("plan_date", weekEndStr);

    if (plansError) {
      console.error("Error fetching plans:", plansError);
      return NextResponse.json(
        { error: "Failed to fetch plans" },
        { status: 500 }
      );
    }

    // Build engagement data per user
    const engagementUsers = (users || []).map((u) => {
      const days: Array<{
        date: string;
        status: "checked_in" | "committed" | "no_plan";
      }> = [];

      for (let i = 0; i < 5; i++) {
        const date = new Date(weekStart);
        date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().split("T")[0];

        const plan = (plans || []).find(
          (p) => p.user_id === u.id && p.plan_date === dateStr
        );

        days.push({
          date: dateStr,
          status: plan
            ? (plan.status as "checked_in" | "committed")
            : "no_plan",
        });
      }

      return {
        user_id: u.id,
        display_name: u.display_name,
        days,
      };
    });

    return NextResponse.json({
      data: {
        week_start: weekStartStr,
        week_end: weekEndStr,
        users: engagementUsers,
      },
      error: null,
    });
  } catch (error) {
    console.error(
      "Unexpected error in GET /api/daily-plan/team/engagement:",
      error
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
