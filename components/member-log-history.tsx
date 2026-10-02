// ============================================================
// Execution Tracker — Member Log History
// ============================================================
// The member's own history of time logs, with review status shown.
// Fetched from GET /api/pies/[id]/time-logs, which is already scoped
// to the caller's own logs.
// ============================================================

"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";

interface TimeLog {
  id: string;
  work_date: string;
  hours: number;
  notes: string | null;
  review_status: "pending" | "approved" | "flagged" | "void";
  review_note: string | null;
  reviewed_at: string | null;
  status: string;
}

interface Props {
  pieId: string;
}

const STATUS_STYLES: Record<
  TimeLog["review_status"],
  { label: string; className: string }
> = {
  pending: {
    label: "Pending review",
    className: "bg-gray-100 text-gray-700 border-gray-300",
  },
  approved: {
    label: "Approved",
    className: "bg-green-100 text-green-700 border-green-300",
  },
  flagged: {
    label: "Flagged",
    className: "bg-amber-100 text-amber-700 border-amber-300",
  },
  void: {
    label: "Voided",
    className: "bg-red-100 text-red-700 border-red-300",
  },
};

export function MemberLogHistory({ pieId }: Props) {
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch(`/api/pies/${pieId}/time-logs`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const json = await response.json();
        setLogs(json.data ?? []);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [pieId]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="animate-pulse space-y-2">
            <div className="h-4 w-32 rounded bg-gray-200" />
            <div className="h-3 w-48 rounded bg-gray-200" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (logs.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Your logged time
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {logs.map((log) => {
          const style = STATUS_STYLES[log.review_status];
          return (
            <div
              key={log.id}
              className="flex items-start justify-between gap-3 border-b pb-2 last:border-b-0 last:pb-0 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium tabular-nums">
                  {log.work_date} · {Number(log.hours).toFixed(2)}h
                </p>
                {log.notes && (
                  <p className="text-xs text-muted-foreground">{log.notes}</p>
                )}
                {log.review_status === "flagged" && log.review_note && (
                  <p className="mt-1 text-xs text-amber-700">
                    Admin: {log.review_note}
                  </p>
                )}
              </div>
              <Badge variant="outline" className={`text-xs shrink-0 ${style.className}`}>
                {style.label}
              </Badge>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
