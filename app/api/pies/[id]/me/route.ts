// ============================================================
// Execution Tracker — GET /api/pies/[id]/me
// ============================================================
// A member's own slice of the Pie, and nothing else.
//
// Why this endpoint exists at all (decision A5): a member cannot be
// allowed to read the Pie tables. "Only admins see the Pie" (D1) is the
// point of the product — the founder's ownership numbers are not
// everyone's business — but a member still has to be able to see their
// OWN standing, or they have no reason to trust the ledger they are
// feeding.
//
// The scoping lives in lib/slicing-pie/server/my-slices.ts, which the
// /my-slices page also calls, so the page and the API cannot end up
// disagreeing about what a member may see. This handler is deliberately
// the thinnest possible wrapper around it, and takes NO query
// parameters: there is nothing here to widen.
// ============================================================

import {
  ok,
  fail,
  requireUser,
  isUuid,
} from "@/lib/slicing-pie/server/context";
import { loadMySlices } from "@/lib/slicing-pie/server/my-slices";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { user, response } = await requireUser();
    if (response) return response;

    const { id } = await context.params;
    if (!isUuid(id)) return fail("Invalid pie id", 400);

    const result = await loadMySlices(id, user.id);
    if (!result.ok) {
      return fail(
        result.error,
        result.status,
        result.rule ? { rule: result.rule } : undefined
      );
    }

    return ok(result.payload);
  } catch (err) {
    console.error("Unexpected error in GET pie me:", err);
    return fail("Internal server error", 500);
  }
}
