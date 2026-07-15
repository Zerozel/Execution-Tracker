// ============================================================
// Execution Tracker — Check if user needs evening reminder
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createClient();
    const today = new Date().toISOString().split("T")[0];

    // Check if user already checked in today
    const { data: plan } = await supabase
      .from("daily_plans")
      .select("status")
      .eq("user_id", user.id)
      .eq("plan_date", today)
      .single();

    const needsReminder = !plan || plan.status !== "checked_in";

    return NextResponse.json({
      needsReminder,
      message: needsReminder
        ? "You haven't checked in yet today. How did your day go?"
        : null,
    });
  } catch {
    return NextResponse.json({ needsReminder: false, message: null });
  }
}
