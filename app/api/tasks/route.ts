// ============================================================
// Execution Tracker — GET & POST /api/tasks
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";
import { getCurrentUser, requireAdmin } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const limit = searchParams.get("limit");
    const offset = searchParams.get("offset");
    const mode = searchParams.get("mode"); // "paginated" or "full"

    const supabase = await createClient();

    // Build query
    let query = supabase
      .from("tasks")
      .select(
        `
        *,
        owner:owner_id (id, nickname, display_name),
        creator:creator_id (id, nickname, display_name)
      `,
        { count: "exact" }
      )
      .eq("is_archived", false)
      .order("created_at", { ascending: false });

    // Members see only their own tasks
    if (user.role === "member") {
      query = query.eq("owner_id", user.id);
    }

    // Server-side status filter
    if (status && ["assigned", "accepted", "submitted", "completed"].includes(status)) {
      query = query.eq("status", status);
    }

    // Pagination — only apply when mode is "paginated"
    if (mode === "paginated") {
      const pageLimit = Math.min(parseInt(limit || "5"), 20); // max 20 per page
      const pageOffset = parseInt(offset || "0");
      query = query.range(pageOffset, pageOffset + pageLimit - 1);
    }

    const { data: tasks, error, count } = await query;

    if (error) {
      console.error("Error fetching tasks:", error);
      return NextResponse.json(
        { error: "Failed to fetch tasks" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: tasks,
      total: count || 0,
      error: null,
    });
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
    await requireAdmin();

    const body = await request.json();
    const { title, description, owner_id, due_date } = body;

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
      .select(
        `
        *,
        owner:owner_id (id, nickname, display_name),
        creator:creator_id (id, nickname, display_name)
      `
      )
      .single();

    if (error) {
      console.error("Error creating task:", error);
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
    console.error("Unexpected error in POST /api/tasks:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
