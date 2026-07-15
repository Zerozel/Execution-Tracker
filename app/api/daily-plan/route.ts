// ============================================================
// Execution Tracker — POST /api/daily-plan (Phase 5 Hardened)
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";

const MAX_GOAL_LENGTH = 500;
const MAX_NOTE_LENGTH = 2000;
const MAX_ACCOMPLISHMENT_LENGTH = 5000;
const MAX_BLOCKERS_LENGTH = 2000;
const MAX_REFLECTION_LENGTH = 3000;
const MAX_GOALS_PER_PLAN = 10;
const MAX_COMMITTED_TASKS = 20;
const EDIT_WINDOW_MINUTES = 30;

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Parse and validate body
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    // Edge case: empty body
    if (!body || Object.keys(body).length === 0) {
      return NextResponse.json(
        { error: "Request body is required" },
        { status: 400 }
      );
    }

    const { plan_data, status } = body;

    // Edge case: missing plan_data
    if (!plan_data) {
      return NextResponse.json(
        { error: "plan_data is required" },
        { status: 400 }
      );
    }

    // Edge case: plan_data is not an object
    if (typeof plan_data !== "object" || Array.isArray(plan_data)) {
      return NextResponse.json(
        { error: "plan_data must be an object" },
        { status: 400 }
      );
    }

    // Edge case: invalid status
    if (!status || !["draft", "committed", "checked_in"].includes(status)) {
      return NextResponse.json(
        { error: "Status must be 'draft', 'committed', or 'checked_in'" },
        { status: 400 }
      );
    }

    // ============================================
    // MORNING VALIDATION
    // ============================================
    if (status === "committed" || status === "checked_in") {
      // Morning section must exist
      if (!plan_data.morning || typeof plan_data.morning !== "object") {
        return NextResponse.json(
          { error: "Morning plan data is required to commit" },
          { status: 400 }
        );
      }

      // Goals must be a non-empty array
      if (
        !plan_data.morning.goals ||
        !Array.isArray(plan_data.morning.goals) ||
        plan_data.morning.goals.length === 0
      ) {
        return NextResponse.json(
          { error: "At least one goal is required to commit" },
          { status: 400 }
        );
      }

      // Max goals limit
      if (plan_data.morning.goals.length > MAX_GOALS_PER_PLAN) {
        return NextResponse.json(
          { error: `Maximum ${MAX_GOALS_PER_PLAN} goals allowed per plan` },
          { status: 400 }
        );
      }

      // Validate each goal
      for (let i = 0; i < plan_data.morning.goals.length; i++) {
        const goal = plan_data.morning.goals[i];

        if (!goal || typeof goal !== "object") {
          return NextResponse.json(
            { error: `Goal at index ${i} must be an object` },
            { status: 400 }
          );
        }

        if (!goal.id || typeof goal.id !== "string") {
          return NextResponse.json(
            { error: `Goal at index ${i} must have a string id` },
            { status: 400 }
          );
        }

        if (!goal.content || typeof goal.content !== "string" || !goal.content.trim()) {
          return NextResponse.json(
            { error: `Goal at index ${i} must have non-empty content` },
            { status: 400 }
          );
        }

        if (goal.content.length > MAX_GOAL_LENGTH) {
          return NextResponse.json(
            { error: `Goal content must be under ${MAX_GOAL_LENGTH} characters` },
            { status: 400 }
          );
        }

        if (typeof goal.is_completed !== "boolean") {
          return NextResponse.json(
            { error: `Goal at index ${i} must have a boolean is_completed field` },
            { status: 400 }
          );
        }
      }

      // Validate committed_tasks if present
      if (plan_data.morning.committed_tasks) {
        if (!Array.isArray(plan_data.morning.committed_tasks)) {
          return NextResponse.json(
            { error: "committed_tasks must be an array" },
            { status: 400 }
          );
        }

        if (plan_data.morning.committed_tasks.length > MAX_COMMITTED_TASKS) {
          return NextResponse.json(
            { error: `Maximum ${MAX_COMMITTED_TASKS} committed tasks allowed` },
            { status: 400 }
          );
        }

        for (let i = 0; i < plan_data.morning.committed_tasks.length; i++) {
          const task = plan_data.morning.committed_tasks[i];

          if (!task || typeof task !== "object") {
            return NextResponse.json(
              { error: `Committed task at index ${i} must be an object` },
              { status: 400 }
            );
          }

          if (!task.task_id || typeof task.task_id !== "string") {
            return NextResponse.json(
              { error: `Committed task at index ${i} must have a string task_id` },
              { status: 400 }
            );
          }
        }
      }

      // Validate morning note length
      if (plan_data.morning.note) {
        if (typeof plan_data.morning.note !== "string") {
          return NextResponse.json(
            { error: "Morning note must be a string" },
            { status: 400 }
          );
        }

        if (plan_data.morning.note.length > MAX_NOTE_LENGTH) {
          return NextResponse.json(
            { error: `Morning note must be under ${MAX_NOTE_LENGTH} characters` },
            { status: 400 }
          );
        }
      }
    }

    // ============================================
    // EVENING VALIDATION
    // ============================================
    if (status === "checked_in") {
      // Evening section must exist
      if (!plan_data.evening || typeof plan_data.evening !== "object") {
        return NextResponse.json(
          { error: "Evening plan data is required for check-in" },
          { status: 400 }
        );
      }

      // Accomplishment is required
      if (!plan_data.evening.accomplishment || typeof plan_data.evening.accomplishment !== "string" || !plan_data.evening.accomplishment.trim()) {
        return NextResponse.json(
          { error: "Accomplishment is required for check-in" },
          { status: 400 }
        );
      }

      // Accomplishment max length
      if (plan_data.evening.accomplishment.length > MAX_ACCOMPLISHMENT_LENGTH) {
        return NextResponse.json(
          { error: `Accomplishment must be under ${MAX_ACCOMPLISHMENT_LENGTH} characters` },
          { status: 400 }
        );
      }

      // Blockers max length
      if (plan_data.evening.blockers && typeof plan_data.evening.blockers === "string") {
        if (plan_data.evening.blockers.length > MAX_BLOCKERS_LENGTH) {
          return NextResponse.json(
            { error: `Blockers must be under ${MAX_BLOCKERS_LENGTH} characters` },
            { status: 400 }
          );
        }
      }

      // Reflection max length
      if (plan_data.evening.reflection && typeof plan_data.evening.reflection === "string") {
        if (plan_data.evening.reflection.length > MAX_REFLECTION_LENGTH) {
          return NextResponse.json(
            { error: `Reflection must be under ${MAX_REFLECTION_LENGTH} characters` },
            { status: 400 }
          );
        }
      }

      // Validate mood if provided
      const VALID_MOODS = ["great", "good", "okay", "struggling", "stressed"];
      if (plan_data.evening.mood && !VALID_MOODS.includes(plan_data.evening.mood)) {
        return NextResponse.json(
          { error: `Mood must be one of: ${VALID_MOODS.join(", ")}` },
          { status: 400 }
        );
      }
    }

    // ============================================
    // DATABASE OPERATIONS
    // ============================================

    const supabase = await createClient();
    const today = new Date().toISOString().split("T")[0];
    const now = new Date().toISOString();

    // Check if a plan already exists for today
    const { data: existingPlan } = await supabase
      .from("daily_plans")
      .select("id, status, committed_at, checked_in_at, plan_data")
      .eq("user_id", user.id)
      .eq("plan_date", today)
      .single();

    // ============================================
    // CHECK-IN EDIT WINDOW LOGIC
    // ============================================
    if (existingPlan?.status === "checked_in" && existingPlan.checked_in_at) {
      const checkedInTime = new Date(existingPlan.checked_in_at);
      const editDeadline = new Date(
        checkedInTime.getTime() + EDIT_WINDOW_MINUTES * 60 * 1000
      );

      // Past edit window — reject entirely
      if (new Date() > editDeadline) {
        return NextResponse.json(
          {
            error: `Today's check-in is locked. Check-ins can only be edited within ${EDIT_WINDOW_MINUTES} minutes.`,
          },
          { status: 403 }
        );
      }

      // Within edit window — allow append-only updates
      if (plan_data.evening?.accomplishment && existingPlan.plan_data) {
        const currentEvening = existingPlan.plan_data?.evening || {};
        const originalAccomplishment = currentEvening.accomplishment || "";
        const newAccomplishment = plan_data.evening.accomplishment || "";

        // Only append if there's genuinely new content
        if (newAccomplishment && newAccomplishment !== originalAccomplishment) {
          const timestamp = new Date().toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          });

          plan_data.evening.accomplishment =
            originalAccomplishment +
            (originalAccomplishment ? "\n\n" : "") +
            `[Edit ${timestamp}] ${newAccomplishment.replace(originalAccomplishment, "").trim()}`;
        }

        // Append to reflection history
        if (plan_data.evening?.reflection && currentEvening.reflection) {
          if (!plan_data.evening.reflection_history) {
            plan_data.evening.reflection_history = currentEvening.reflection_history || [];
          }

          if (plan_data.evening.reflection !== currentEvening.reflection) {
            plan_data.evening.reflection_history.push({
              time: new Date().toISOString(),
              content: plan_data.evening.reflection,
            });
          }
        }

        // Preserve original reflection if not explicitly changed
        if (!plan_data.evening.reflection && currentEvening.reflection) {
          plan_data.evening.reflection = currentEvening.reflection;
        }

        // Preserve original blockers if not explicitly changed
        if (!plan_data.evening.blockers && currentEvening.blockers) {
          plan_data.evening.blockers = currentEvening.blockers;
        }

        // Preserve original mood if not explicitly changed
        if (!plan_data.evening.mood && currentEvening.mood) {
          plan_data.evening.mood = currentEvening.mood;
        }
      }
    }

    // ============================================
    // UPSERT
    // ============================================

    const upsertData: Record<string, any> = {
      user_id: user.id,
      plan_date: today,
      status,
      plan_data,
      updated_at: now,
    };

    // Only set committed_at on first commit (don't overwrite on updates)
    if (status === "committed" && !existingPlan?.committed_at) {
      upsertData.committed_at = now;
    }

    // Set or preserve checked_in_at
    if (status === "checked_in") {
      upsertData.checked_in_at = existingPlan?.checked_in_at || now;
    }

    const { data: plan, error: upsertError } = await supabase
      .from("daily_plans")
      .upsert(upsertData, {
        onConflict: "user_id,plan_date",
      })
      .select("*")
      .single();

    if (upsertError) {
      console.error("Error upserting daily plan:", upsertError);
      return NextResponse.json(
        { error: "Failed to save daily plan" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { data: plan, error: null },
      { status: existingPlan ? 200 : 201 }
    );
  } catch (error) {
    console.error("Unexpected error in POST /api/daily-plan:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
