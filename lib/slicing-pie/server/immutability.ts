// ============================================================
// Execution Tracker — Slicing Pie: prove the ledger refuses edits (W6)
// ============================================================
// The whole product rests on one sentence: the ledger is append-only, so
// an ownership figure cannot be changed after the fact without a trace.
//
// That sentence is currently enforced by a database trigger installed in
// migration 0003. But "it is enforced" printed on a screen is a claim,
// and a claim is exactly what someone challenging the numbers will refuse
// to accept. So this module goes and asks the database, on demand.
//
// How the probe is made safe:
//
//   * It updates a row to the value that row ALREADY HAS. If the guard
//     is missing, the statement is semantically a no-op — nothing about
//     the Pie changes, and no history is altered.
//   * It touches exactly one row, the oldest in the Pie.
//   * It only runs when an administrator explicitly asks for it, never
//     on a page render. A check nobody asked for must not write.
//
// The expected outcome is an ERROR. A guard that works looks like a
// failure, so the absence of that error is the alarming result — which
// is why the caller is told to treat `blocked: false` as a defect, not
// as good news.
// ============================================================

import { createClient } from "@/lib/supabase";
import type { Contribution } from "@/types/slicing-pie";

export interface ImmutabilityProbe {
  /** False when the Pie has no rows to test against. */
  attempted: boolean;
  /** True when the write was refused, which is the healthy outcome. */
  blocked: boolean;
  /** The database's own words, shown to the reader unedited. */
  message: string;
  /** Which mechanism refused it, when it can be told apart. */
  mechanism: "append-only rule" | "permissions" | "unknown" | "nothing refused it";
  /** The row the attempt was aimed at. */
  target_id: string | null;
}

/**
 * Ask the database to edit a ledger row, and report what it says.
 *
 * @param pieId The Pie to probe.
 */
export async function probeLedgerImmutability(
  pieId: string
): Promise<ImmutabilityProbe> {
  const supabase = await createClient();

  // The oldest row in the Pie — the one a challenger would most want to
  // quietly adjust, and the one whose value has had the longest to drift.
  const { data } = await supabase
    .from("contributions")
    .select("id, status")
    .eq("pie_id", pieId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const target = data as Pick<Contribution, "id" | "status"> | null;
  if (!target) {
    return {
      attempted: false,
      blocked: true,
      message:
        "There is nothing in this Pie's ledger yet, so there is nothing to try to change.",
      mechanism: "unknown",
      target_id: null,
    };
  }

  // Same value it already holds. If no guard is in place this changes
  // nothing; if the guard is in place it is refused before it runs.
  const { error } = await supabase
    .from("contributions")
    .update({ status: target.status })
    .eq("id", target.id);

  if (!error) {
    return {
      attempted: true,
      blocked: false,
      message:
        "The database accepted a change to a ledger row. It should not have. " +
        "The append-only rule is missing or has been removed, which means " +
        "ownership figures can be altered with no record of it.",
      mechanism: "nothing refused it",
      target_id: target.id,
    };
  }

  const text = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`;
  const mechanism: ImmutabilityProbe["mechanism"] = /append-only/i.test(text)
    ? "append-only rule"
    : /permission|denied|privilege|policy/i.test(text)
      ? "permissions"
      : "unknown";

  return {
    attempted: true,
    blocked: true,
    message: error.message ?? "The change was refused.",
    mechanism,
    target_id: target.id,
  };
}
