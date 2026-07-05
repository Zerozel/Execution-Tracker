// ============================================================
// Execution Tracker — GET /api/tasks/[id]
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const supabase = await createClient();

    const { data: task, error } = await supabase
      .from("tasks")
      .select(`
        *,
        owner:owner_id (id, nickname, display_name),
        creator:creator_id (id, nickname, display_name)
      `)
      .eq("id", id)
      .eq("is_archived", false)
      .single();

    if (error || !task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }

    // Members can only see their own tasks
    if (user.role === "member" && task.owner_id !== user.id) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: task, error: null });
  } catch (error) {
    console.error("Unexpected error in GET /api/tasks/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
