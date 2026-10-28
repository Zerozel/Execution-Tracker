// ============================================================
// Execution Tracker — POST /api/terms/revoke
// ============================================================
// Admin-only. Deletes a user's acceptance of the current version
// and any pending progress, forcing them to re-accept on their
// next visit.
//
// Use cases:
//   • A user accepted too quickly and the admin wants them to
//     re-read
//   • A user's acceptance is disputed and the admin needs to
//     re-verify
//
// Not the mechanism for updating terms — that is a version bump
// in lib/terms.ts, which invalidates everyone's acceptance at once.
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";
import { requireAdminApi, isUuid } from "@/lib/slicing-pie/server/context";
import { CURRENT_TERMS_VERSION } from "@/lib/terms";

export async function POST(request: Request) {
  try {
    const { response } = await requireAdminApi();
    if (response) return response;

    const body = await request.json().catch(() => ({}));
    const userId = typeof body?.user_id === "string" ? body.user_id : "";

    if (!isUuid(userId)) {
      return NextResponse.json(
        { error: "user_id must be a UUID" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Delete the acceptance for the CURRENT version. Older acceptances
    // (for prior versions) are left untouched — they are the audit
    // trail of what the user agreed to historically.
    const { error: deleteError } = await supabase
      .from("terms_acceptances")
      .delete()
      .eq("user_id", userId)
      .eq("terms_version", CURRENT_TERMS_VERSION);

    if (deleteError) {
      console.error("Error revoking terms acceptance:", deleteError);
      return NextResponse.json(
        { error: "Failed to revoke acceptance" },
        { status: 500 }
      );
    }

    // Also clear any pending progress, so the user starts fresh.
    await supabase
      .from("terms_pending_acceptance")
      .delete()
      .eq("user_id", userId);

    return NextResponse.json({
      data: { user_id: userId, revoked: true },
      error: null,
    });
  } catch (err) {
    console.error("Unexpected error in POST /api/terms/revoke:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
