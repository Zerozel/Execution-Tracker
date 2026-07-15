// ============================================================
// Execution Tracker — GET /api/daily-plan/team/today
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  try {
    await requireAdmin();

    const supabase = await createClient();
    const today = new Date().toISOString().split("T")[0];

    const { data: plans, error } = await supabase
      .from("daily_plans")
      .select(`
        *,
        user:user_id (
          id,
          nickname,
          display_name
        )
      `)
      .eq("plan_date", today)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching team plans:", error);
      return NextResponse.json(
        { error: "Failed to fetch team plans" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: plans, error: null });
  } catch (error) {
    console.error(
      "Unexpected error in GET /api/daily-plan/team/today:",
      error
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
