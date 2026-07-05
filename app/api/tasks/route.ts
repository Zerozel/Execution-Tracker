// ============================================================
// Execution Tracker — GET & POST /api/tasks
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";
import { getCurrentUser, requireAdmin } from "@/lib/auth";

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

    // Build query based on role
    let query = supabase
      .from("tasks")
      .select(`
        *,
        owner:owner_id (id, nickname, display_name),
        creator:creator_id (id, nickname, display_name)
      `)
      .eq("is_archived", false)
      .order("created_at", { ascending: false });

    // Members see only their own tasks
    if (user.role === "member") {
      query = query.eq("owner_id", user.id);
    }

    const { data: tasks, error } = await query;

    if (error) {
      console.error("Error fetching tasks:", error);
      return NextResponse.json(
        { error: "Failed to fetch tasks" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: tasks, error: null });
  } catch (error) {
    console.error("Unexpected error in GET /api/tasks:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    // Admin-only endpoint
    await requireAdmin();

    const body = await request.json();
    const { title, description, owner_id, due_date } = body;

    // Validate required fields
    if (!title || !title.trim()) {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }

    if (!owner_id) {
      return NextResponse.json(
        { error: "Owner (assignee) is required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const user = await getCurrentUser();

    // Create the task
    const { data: task, error } = await supabase
      .from("tasks")
      .insert({
        title: title.trim(),
        description: description?.trim() || null,
        owner_id,
        creator_id: user!.id,
        due_date: due_date || null,
        status: "assigned",
      })
      .select(`
        *,
        owner:owner_id (id, nickname, display_name),
        creator:creator_id (id, nickname, display_name)
      `)
      .single();

    if (error) {
      console.error("Error creating task:", error);

      // Handle foreign key violation (invalid owner_id)
      if (error.code === "23503") {
        return NextResponse.json(
          { error: "Assigned user does not exist" },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: "Failed to create task" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: task, error: null }, { status: 201 });
  } catch (error) {
    // requireAdmin throws if not admin — redirect happens automatically
    console.error("Unexpected error in POST /api/tasks:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
