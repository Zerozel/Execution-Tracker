// ============================================================
// Execution Tracker — Slicing Pie: Cap Table (display)
// ============================================================
// Renders an ownership snapshot: each participant's slices, %, and a
// proportional bar. Pure presentational client component.
// ============================================================

"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatSlices, formatPercent } from "@/lib/slicing-pie/format";
import type { CapTable } from "@/types/slicing-pie";

interface Props {
  capTable: CapTable;
  currency: string;
  sliceDecimalPlaces: number;
}

export function PieCapTable({ capTable, sliceDecimalPlaces }: Props) {
  if (capTable.rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No participants yet.
        </CardContent>
      </Card>
    );
  }

  if (capTable.total_slices === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No slices earned yet. Log a contribution to see ownership.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="divide-y p-0">
        {capTable.rows.map((row) => (
          <div key={row.participant_id} className="px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium">{row.display_name}</span>
                <span className="text-xs capitalize text-muted-foreground">
                  {row.pie_role}
                </span>
                {row.status !== "active" && (
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {row.status}
                  </Badge>
                )}
              </div>
              <div className="text-right">
                <div className="font-semibold tabular-nums">
                  {formatPercent(row.pct)}
                </div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {formatSlices(row.slices, sliceDecimalPlaces)} slices
                </div>
              </div>
            </div>
            {/* Proportional bar */}
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.min(row.pct, 100)}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
