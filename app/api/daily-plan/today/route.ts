// ============================================================
// Execution Tracker — GET /api/daily-plan/today
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
    const today = new Date().toISOString().split("T")[0];

    // Get today's plan
    const { data: plan, error: planError } = await supabase
      .from("daily_plans")
      .select("*")
      .eq("user_id", user.id)
      .eq("plan_date", today)
      .single();

    if (planError && planError.code !== "PGRST116") {
      console.error("Error fetching today's plan:", planError);
      return NextResponse.json(
        { error: "Failed to fetch today's plan" },
        { status: 500 }
      );
    }

    // If plan exists, return it
    if (plan) {
      return NextResponse.json({
        data: {
          plan,
          carry_forward: null,
        },
        error: null,
      });
    }

    // No plan today — check yesterday for carry-forward
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    const { data: yesterdayPlan } = await supabase
      .from("daily_plans")
      .select("plan_data, plan_date")
      .eq("user_id", user.id)
      .eq("plan_date", yesterdayStr)
      .single();

    if (
      yesterdayPlan?.plan_data?.morning?.goals &&
      Array.isArray(yesterdayPlan.plan_data.morning.goals)
    ) {
      const unfinishedGoals = yesterdayPlan.plan_data.morning.goals
        .filter((g: any) => !g.is_completed)
        .map((g: any) => ({
          goal_id: g.id,
          content: g.content,
        }));

      if (unfinishedGoals.length > 0) {
        return NextResponse.json({
          data: {
            plan: null,
            carry_forward: {
              from_date: yesterdayStr,
              goals: unfinishedGoals,
            },
          },
          error: null,
        });
      }
    }

    // No plan, nothing to carry forward
    return NextResponse.json({
      data: {
        plan: null,
        carry_forward: null,
      },
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in GET /api/daily-plan/today:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
