// ============================================================
// Execution Tracker — GET /api/terms/status
// ============================================================
// Returns the current terms version, the user's acceptance state,
// and how many confirmation steps they have completed. Used by the
// /terms page to decide what to render, and by any other screen
// that wants to show "terms accepted" or "terms outstanding".
// ============================================================

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getTermsStatus } from "@/lib/terms";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const status = await getTermsStatus(user.id);
    return NextResponse.json({ data: status, error: null });
  } catch (err) {
    console.error("Unexpected error in GET /api/terms/status:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
