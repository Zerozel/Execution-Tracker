// ============================================================
// Execution Tracker — GET /api/daily-plan/history
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get("user_id");

    // Members can only view their own history
    if (user.role === "member" && targetUserId && targetUserId !== user.id) {
      return NextResponse.json(
        { error: "You can only view your own history" },
        { status: 403 }
      );
    }

    // Admin can view any user's history
    const queryUserId = targetUserId || user.id;

    const supabase = await createClient();

    const { data: plans, error } = await supabase
      .from("daily_plans")
      .select("*")
      .eq("user_id", queryUserId)
      .order("plan_date", { ascending: false })
      .limit(30);

    if (error) {
      console.error("Error fetching plan history:", error);
      return NextResponse.json(
        { error: "Failed to fetch plan history" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: plans, error: null });
  } catch (error) {
    console.error("Unexpected error in GET /api/daily-plan/history:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
