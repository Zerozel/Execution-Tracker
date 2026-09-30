// ============================================================
// Execution Tracker — Slicing Pie: "My slices" (decision A5)
// ============================================================
// Everything a member is allowed to know about their own position in a
// Pie, assembled in one place so the HTTP endpoint and the page cannot
// disagree about it.
//
// The scoping rule, stated once:
//
//   The caller's participant row is found BY user_id. Every other query
//   is then filtered to that participant's id. There is no argument to
//   this function that widens the scope — no participant id, no "all".
//
// The Pie's total is summed here because an ownership percentage is
// meaningless without it, but only the caller's share of that total ever
// leaves. An admin wanting the whole picture builds the cap table
// directly (see app/pies/[id]/page.tsx).
//
// Reads go through the service role (lib/supabase.ts), so RLS will not
// do this scoping for us. Nothing here may be relaxed without moving the
// membership check.
// ============================================================

import { createClient } from "@/lib/supabase";
import { participantForUser, resolvePieConfig } from "./context";
import { buildCapTable } from "@/lib/slicing-pie/engine/captable";
import { planDrawdown } from "@/lib/slicing-pie/engine/policy";
import { contributionCategoryLabel } from "@/lib/slicing-pie/engine/recovery-categories";
import { contributionTypeLabel } from "@/lib/slicing-pie/labels";
import type {
  Contribution,
  Pie,
  PieParticipant,
  PieRole,
  ParticipantStatus,
} from "@/types/slicing-pie";

/** How many of the member's own rows to include for the drill-down. */
const RECENT_LIMIT = 25;

export interface MySlicesPayload {
  pie: {
    id: string;
    name: string;
    currency: string;
    status: string;
  };
  me: {
    id: string;
    display_name: string;
    pie_role: PieRole;
    status: ParticipantStatus;
    joined_at: string | null;
  };
  ownership: {
    slices: number;
    percent: number;
    pie_total_slices: number;
    slice_decimal_places: number;
    percent_decimal_places: number;
  };
  by_category: { category: string; slices: number }[];
  at_risk: {
    /** Unpaid value still riding on this member's contributions. */
    total_minor: number;
    cash_minor: number;
    non_cash_minor: number;
    explanation: string[];
  };
  hours: {
    logged: number;
    awaiting_payday: number;
    converted: number;
  };
  recent: {
    id: string;
    type: Contribution["type"];
    type_label: string;
    event_date: string;
    slices: number;
    fmv_minor: number;
    multiplier_applied: number;
    status: string;
    notes: string | null;
    corrects_a_previous_row: boolean;
  }[];
  recent_total: number;
}

export type MySlicesResult =
  | { ok: true; payload: MySlicesPayload }
  | { ok: false; status: number; error: string; rule?: string };

export async function loadMySlices(
  pieId: string,
  userId: string
): Promise<MySlicesResult> {
  const supabase = await createClient();

  const { data: pieRow } = await supabase
    .from("pies")
    .select("id, name, currency, status, created_at")
    .eq("id", pieId)
    .single();
  if (!pieRow) {
    return { ok: false, status: 404, error: "Pie not found" };
  }
  const pie = pieRow as Pick<
    Pie,
    "id" | "name" | "currency" | "status" | "created_at"
  >;

  const me = await participantForUser(pieId, userId);
  if (!me) {
    return {
      ok: false,
      status: 404,
      error: "You are not a participant in this Pie",
      rule: "NOT-A-MEMBER",
    };
  }

  const [{ data: participants }, { data: contributions }, { data: logs }] =
    await Promise.all([
      supabase.from("pie_participants").select("*").eq("pie_id", pieId),
      supabase.from("contributions").select("*").eq("pie_id", pieId),
      supabase
        .from("time_logs")
        .select("hours, status, work_date")
        .eq("pie_id", pieId)
        .eq("participant_id", me.id),
    ]);

  const { settings } = await resolvePieConfig(pieId);

  const rows = (contributions ?? []) as Contribution[];
  const capTable = buildCapTable(
    pieId,
    (participants ?? []) as PieParticipant[],
    rows,
    {
      sliceDecimalPlaces: settings.slice_decimal_places,
      percentDecimalPlaces: settings.percent_decimal_places,
      frozen: pie.status === "frozen",
    }
  );
  const mine = capTable.rows.find((r) => r.participant_id === me.id);

  const myRows = rows
    .filter((c) => c.participant_id === me.id)
    .sort((a, b) => {
      if (a.event_date !== b.event_date) {
        return b.event_date.localeCompare(a.event_date);
      }
      return b.id.localeCompare(a.id);
    });

  // What is still at risk: value contributed that no payment has bought
  // back yet. planDrawdown() already measures exactly that, so it is
  // reused with a zero payment rather than re-implemented — the split
  // into buckets, and the replay of every payment already made, then
  // come out identical to the payment path's own view.
  const atRisk = planDrawdown(0, myRows, settings);

  // Hours logged but not yet converted, from the same rows the member
  // sees on My Time. Converted hours are already in the slices above.
  const hours = { logged: 0, awaiting_payday: 0, converted: 0 };
  for (const l of (logs ?? []) as { hours: number | string; status: string }[]) {
    const h = Number(l.hours);
    if (!Number.isFinite(h) || h <= 0) continue;
    hours.logged += h;
    if (l.status === "converted") hours.converted += h;
    else if (l.status === "pending") hours.awaiting_payday += h;
  }
  const round2 = (n: number) => Math.round(n * 100) / 100;

  // Their slices by category, so "where did my equity come from" has an
  // answer that is not a wall of 18 ledger types.
  const byCategory = new Map<string, number>();
  for (const c of myRows) {
    const key = contributionCategoryLabel(c.type);
    byCategory.set(key, (byCategory.get(key) ?? 0) + c.slices);
  }

  return {
    ok: true,
    payload: {
      pie: {
        id: pie.id,
        name: pie.name,
        currency: pie.currency,
        status: pie.status,
      },
      me: {
        id: me.id,
        display_name: me.display_name,
        pie_role: me.pie_role,
        status: me.status,
        joined_at: me.joined_at,
      },
      ownership: {
        slices: mine?.slices ?? 0,
        percent: mine?.pct ?? 0,
        pie_total_slices: capTable.total_slices,
        slice_decimal_places: settings.slice_decimal_places,
        percent_decimal_places: settings.percent_decimal_places,
      },
      by_category: Array.from(byCategory.entries())
        .map(([category, slices]) => ({ category, slices }))
        .sort((a, b) => b.slices - a.slices),
      at_risk: {
        total_minor: Math.max(0, atRisk.balance_minor),
        cash_minor: Math.max(0, Math.min(atRisk.cash_minor, atRisk.balance_minor)),
        non_cash_minor: Math.max(
          0,
          Math.min(atRisk.non_cash_minor, atRisk.balance_minor)
        ),
        explanation: atRisk.explanation,
      },
      hours: {
        logged: round2(hours.logged),
        awaiting_payday: round2(hours.awaiting_payday),
        converted: round2(hours.converted),
      },
      recent: myRows.slice(0, RECENT_LIMIT).map((c) => ({
        id: c.id,
        type: c.type,
        type_label: contributionTypeLabel(c.type),
        event_date: c.event_date,
        slices: c.slices,
        fmv_minor: c.fmv_minor,
        multiplier_applied: c.multiplier_applied,
        status: c.status,
        notes: c.notes,
        corrects_a_previous_row: Boolean(c.reverses_id),
      })),
      recent_total: myRows.length,
    },
  };
}
