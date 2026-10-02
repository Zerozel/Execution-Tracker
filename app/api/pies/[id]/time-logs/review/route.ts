// ============================================================
// Execution Tracker — POST /api/pies/[id]/time-logs/review
// ============================================================
// Admin-only. Actions on a single time_log:
//   approve → review_status = 'approved'
//   flag    → review_status = 'flagged'  (note required)
//   reject  → review_status = 'void'     (note required)
// ============================================================

import { createClient } from "@/lib/supabase";
import {
  ok,
  fail,
  requireAdminApi,
  isUuid,
} from "@/lib/slicing-pie/server/context";

interface RouteContext {
  params: Promise<{ id: string }>;
}

type Action = "approve" | "flag" | "reject";

const VALID_ACTIONS: Action[] = ["approve", "flag", "reject"];

const NEXT_STATUS: Record<Action, "approved" | "flagged" | "void"> = {
  approve: "approved",
  flag: "flagged",
  reject: "void",
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { user, response } = await requireAdminApi();
    if (response) return response;

    const { id } = await context.params;
    if (!isUuid(id)) return fail("Invalid pie id", 400);

    const body = await request.json();
    const logId = typeof body?.log_id === "string" ? body.log_id : "";
    const actionRaw = body?.action;
    const note = typeof body?.review_note === "string" ? body.review_note.trim() : "";

    if (!isUuid(logId)) return fail("log_id must be a UUID", 400);
    if (!VALID_ACTIONS.includes(actionRaw)) {
      return fail(`action must be one of: ${VALID_ACTIONS.join(", ")}`, 400);
    }
    const action = actionRaw as Action;

    if ((action === "flag" || action === "reject") && !note) {
      return fail("A note is required when flagging or rejecting", 400);
    }

    const supabase = await createClient();

    const { data: log, error } = await supabase
      .from("time_logs")
      .select("id, pie_id, review_status")
      .eq("id", logId)
      .eq("pie_id", id)
      .single();

    if (error || !log) return fail("Time log not found", 404);
    if (log.review_status === "void") {
      return fail("This log has already been voided", 409);
    }

    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
      .from("time_logs")
      .update({
        review_status: NEXT_STATUS[action],
        reviewed_by: user.id,
        reviewed_at: now,
        review_note: note || null,
      })
      .eq("id", logId)
      .select("*")
      .single();

    if (updateError || !updated) {
      console.error("Error updating time log review:", updateError);
      return fail("Failed to record review", 500);
    }

    return ok(updated);
  } catch (err) {
    console.error("Unexpected error in review:", err);
    return fail("Internal server error", 500);
  }
}
