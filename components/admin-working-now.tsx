// ============================================================
// Execution Tracker — Admin Working Now Panel
// ============================================================
// Shows every currently open work session on the Pie. Refreshes
// every 60 seconds while the tab is open.
// ============================================================

"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, AlertTriangle } from "lucide-react";

interface WorkingSession {
  id: string;
  participant_id: string;
  participant_name: string;
  participant_role: string | null;
  started_at: string;
  last_heartbeat_at: string;
  minutes_active: number;
  minutes_since_heartbeat: number;
  warning: boolean;
}

interface Props {
  pieId: string;
}

function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function AdminWorkingNow({ pieId }: Props) {
  const [sessions, setSessions] = useState<WorkingSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/pies/${pieId}/work-sessions/working-now`,
        { cache: "no-store" }
      );
      if (!response.ok) return;
      const json = await response.json();
      setSessions(json.data ?? []);
    } finally {
      setIsLoading(false);
    }
  }, [pieId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  if (isLoading || sessions.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4 text-emerald-600" />
          Working now
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {sessions.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between gap-3 border-b pb-2 last:border-b-0 last:pb-0 text-sm"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-medium truncate">
                {s.participant_name}
              </span>
              {s.participant_role && (
                <Badge variant="outline" className="text-xs capitalize shrink-0">
                  {s.participant_role}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs shrink-0">
              <span className="tabular-nums text-muted-foreground">
                {fmtDuration(s.minutes_active)}
              </span>
              {s.warning ? (
                <Badge
                  variant="outline"
                  className="bg-amber-100 text-amber-700 border-amber-300"
                >
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {fmtDuration(s.minutes_since_heartbeat)} silent
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="bg-green-100 text-green-700 border-green-300"
                >
                  Active
                </Badge>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
