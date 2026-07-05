// ============================================================
// Execution Tracker — GET /api/users
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  try {
    await requireAdmin();

    const supabase = await createClient();

    const { data: users, error } = await supabase
      .from("users")
      .select("id, nickname, display_name, role, is_archived")
      .eq("is_archived", false)
      .order("display_name", { ascending: true });

    if (error) {
      console.error("Error fetching users:", error);
      return NextResponse.json(
        { error: "Failed to fetch users" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: users, error: null });
  } catch (error) {
    console.error("Unexpected error in GET /api/users:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
