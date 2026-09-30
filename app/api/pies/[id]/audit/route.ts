// ============================================================
// Execution Tracker — GET /api/pies/[id]/audit
// ============================================================
// Read the immutable audit log (§18) for a Pie, newest first.
// Supports ?entity_type= and ?limit= filters. Any authenticated user
// may read (transparency); only the system writes (via writeAudit).
// ============================================================

import { createClient } from "@/lib/supabase";
import {
  ok,
  fail,
  requireUser,
  isUuid,
} from "@/lib/slicing-pie/server/context";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { response } = await requireUser();
    if (response) return response;

    const { id } = await context.params;
    if (!isUuid(id)) return fail("Invalid pie id", 400);

    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get("entity_type");
    const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500);

    const supabase = await createClient();
    let query = supabase
      .from("pie_audit_log")
      .select("*")
      .eq("pie_id", id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (entityType) query = query.eq("entity_type", entityType);

    const { data, error } = await query;
    if (error) {
      console.error("Error fetching audit log:", error);
      return fail("Failed to fetch audit log", 500);
    }

    return ok(data ?? []);
  } catch (err) {
    console.error("Unexpected error in GET audit:", err);
    return fail("Internal server error", 500);
  }
}
