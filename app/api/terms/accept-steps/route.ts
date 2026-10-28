// ============================================================
// Execution Tracker — POST /api/terms/accept-step
// ============================================================
// Record one confirmation. The user must call this three times,
// each time from a freshly loaded page, before the acceptance is
// recorded. The step count lives in the database, not in the
// browser, so clearing cookies or reloading does not skip steps.
//
// On the third call the acceptance is recorded and the response
// includes { completed: true, accepted_at }.
// ============================================================

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { recordConfirmationStep } from "@/lib/terms";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Capture IP and user agent for the audit trail. These are
    // best-effort — the acceptance is valid without them.
    const forwarded = request.headers.get("x-forwarded-for");
    const ipAddress =
      forwarded?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      null;
    const userAgent = request.headers.get("user-agent");

    const result = await recordConfirmationStep(user.id, ipAddress, userAgent);

    return NextResponse.json({ data: result, error: null }, { status: 200 });
  } catch (err) {
    console.error("Unexpected error in POST /api/terms/accept-step:", err);
    const message =
      err instanceof Error ? err.message : "Failed to record acceptance";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
