// ============================================================
// Execution Tracker — Task Card Component (With Reliability Bar - Fixed)
// ============================================================

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, getOverdueStatus, overdueColor } from "@/lib/utils";
import type { Task } from "@/types";

interface TaskCardProps {
  task: Task & {
    owner?: { id: string; nickname: string; display_name: string } | null;
    creator?: { id: string; nickname: string; display_name: string } | null;
  };
}

export function TaskCard({ task }: TaskCardProps) {
  const router = useRouter();
  const overdue = getOverdueStatus(task);
  const [reliabilityPct, setReliabilityPct] = useState<number | null>(null);

  const statusVariant: Record<string, "secondary" | "default" | "outline"> = {
    assigned: "secondary",
    accepted: "default",
    submitted: "default",
    completed: "outline",
  };

  // Fetch the CURRENT USER'S reliability (not all users)
  // Uses a new endpoint that doesn't require admin access
  useEffect(() => {
    async function fetchMyReliability() {
      try {
        // Use /api/users/stats/me — an endpoint that returns
        // only the current user's stats, no admin required
        const response = await fetch("/api/users/stats/me");
        if (response.ok) {
          const result = await response.json();
          if (result.data && result.data.reliability_percentage !== undefined) {
            setReliabilityPct(result.data.reliability_percentage);
          }
        }
      } catch {
        // Reliability stats are non-critical — fail silently
      }
    }
    fetchMyReliability();
  }, []);

  // Determine bar color based on percentage
  const getBarColor = (pct: number): string => {
    if (pct >= 90) return "bg-green-500";
    if (pct >= 75) return "bg-emerald-400";
    if (pct >= 60) return "bg-yellow-400";
    if (pct >= 40) return "bg-amber-500";
    return "bg-red-500";
  };

  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-md overflow-hidden"
      onClick={() => router.push(`/tasks/${task.id}`)}
    >
      {/* Thin reliability indicator bar — subtle, no numbers */}
      {reliabilityPct !== null && (
        <div className="h-1 w-full bg-gray-100">
          <div
            className={`h-full transition-all ${getBarColor(reliabilityPct)}`}
            style={{ width: `${reliabilityPct}%` }}
          />
        </div>
      )}

      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base font-semibold leading-snug">
            {task.title}
          </CardTitle>
          <Badge
            variant={statusVariant[task.status] || "outline"}
            className="shrink-0 text-xs capitalize"
          >
            {task.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm text-muted-foreground">
          {/* Owner */}
          {task.owner && (
            <p>
              <span className="font-medium">Assignee:</span>{" "}
              {task.owner.display_name}
            </p>
          )}

          {/* Due Date */}
          {task.due_date && (
            <p className={overdueColor(overdue)}>
              <span className="font-medium">Due:</span>{" "}
              {formatDate(task.due_date)}
              {overdue === "overdue" && " (Overdue)"}
            </p>
          )}

          {/* Description Preview */}
          {task.description && (
            <p className="line-clamp-2 text-xs whitespace-pre-wrap">{task.description}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
