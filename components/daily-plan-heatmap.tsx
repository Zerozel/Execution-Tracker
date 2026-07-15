// ============================================================
// Execution Tracker — Daily Plan Engagement Heat Map
// ============================================================

"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CheckCircle2,
  Minus,
  X,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
import type { EngagementResponse } from "@/types";

export function DailyPlanHeatmap() {
  const [data, setData] = useState<EngagementResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);

  useEffect(() => {
    async function fetchEngagement() {
      try {
        setIsLoading(true);
        setError(null);

        // Calculate week start based on offset
        const now = new Date();
        const day = now.getDay();
        const monday = new Date(now);
        monday.setDate(now.getDate() - day + (day === 0 ? -6 : 1) + weekOffset * 7);
        const weekStart = monday.toISOString().split("T")[0];

        const response = await fetch(
          `/api/daily-plan/team/engagement?week_start=${weekStart}`
        );
        if (!response.ok) throw new Error("Failed to fetch engagement data");
        const result = await response.json();
        setData(result.data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load engagement data"
        );
      } finally {
        setIsLoading(false);
      }
    }
    fetchEngagement();
  }, [weekOffset]);

  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri"];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "checked_in":
        return (
          <span title="Checked in">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          </span>
        );
      case "committed":
        return (
          <span title="Committed only">
            <Minus className="h-5 w-5 text-amber-500" />
          </span>
        );
      case "no_plan":
        return (
          <span title="No plan">
            <X className="h-5 w-5 text-red-400" />
          </span>
        );
      default:
        return <span className="h-5 w-5" />;
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case "checked_in":
        return "bg-green-50";
      case "committed":
        return "bg-amber-50";
      case "no_plan":
        return "bg-red-50";
      default:
        return "";
    }
  };

  const formatWeekRange = (): string => {
    if (!data) return "";
    const start = new Date(data.week_start);
    const end = new Date(data.week_end);
    const startStr = start.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    const endStr = end.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    return `${startStr} — ${endStr}`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3">
                <div className="h-4 w-24 rounded bg-gray-200" />
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((j) => (
                    <div key={j} className="h-8 w-8 rounded bg-gray-200" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="py-6">
          <p className="text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.users.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-indigo-600" />
            Team Engagement
          </CardTitle>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWeekOffset((prev) => prev - 1)}
              className="p-1 rounded hover:bg-gray-100"
              title="Previous week"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm text-muted-foreground min-w-[140px] text-center">
              {formatWeekRange()}
            </span>
            <button
              onClick={() => setWeekOffset((prev) => prev + 1)}
              className="p-1 rounded hover:bg-gray-100"
              title="Next week"
              disabled={weekOffset === 0}
            >
              <ChevronRight
                className={`h-4 w-4 ${weekOffset === 0 ? "text-gray-300" : ""}`}
              />
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Legend */}
        <div className="flex items-center gap-4 mb-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-green-500" />
            Checked in
          </div>
          <div className="flex items-center gap-1">
            <Minus className="h-3 w-3 text-amber-500" />
            Planned only
          </div>
          <div className="flex items-center gap-1">
            <X className="h-3 w-3 text-red-400" />
            No plan
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-left text-xs font-medium text-muted-foreground pb-2 pr-4">
                  Team Member
                </th>
                {dayLabels.map((day) => (
                  <th
                    key={day}
                    className="text-center text-xs font-medium text-muted-foreground pb-2 px-1"
                  >
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.users.map((user) => (
                <tr key={user.user_id} className="border-t border-gray-100">
                  <td className="py-2 pr-4">
                    <p className="text-sm font-medium truncate max-w-[120px]">
                      {user.display_name}
                    </p>
                  </td>
                  {user.days.map((day) => (
                    <td
                      key={day.date}
                      className={`text-center px-1 py-2 ${getStatusBg(day.status)}`}
                    >
                      {getStatusIcon(day.status)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
