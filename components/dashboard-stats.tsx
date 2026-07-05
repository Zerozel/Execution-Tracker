// ============================================================
// Execution Tracker — Dashboard Stats Component
// ============================================================

"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  ClipboardList,
  CheckCircle2,
  Send,
  Trophy,
  AlertTriangle,
} from "lucide-react";
import type { DashboardStats } from "@/app/api/dashboard/stats/route";

export function DashboardStats() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        setIsLoading(true);
        const response = await fetch("/api/dashboard/stats");

        if (!response.ok) {
          throw new Error("Failed to fetch stats");
        }

        const result = await response.json();
        setStats(result.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load stats");
      } finally {
        setIsLoading(false);
      }
    }

    fetchStats();
  }, []);

  if (error) {
    return (
      <div className="grid gap-4 md:grid-cols-5">
        {[1, 2, 3, 4, 5].map((i) => (
          <Card key={i} className="border-destructive/50">
            <CardContent className="py-6 text-center">
              <p className="text-sm text-destructive">Error</p>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const cards = [
    {
      label: "Assigned",
      count: stats?.assigned ?? "—",
      icon: ClipboardList,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      borderColor: "border-blue-200",
      description: "Awaiting acceptance",
    },
    {
      label: "Accepted",
      count: stats?.accepted ?? "—",
      icon: CheckCircle2,
      color: "text-amber-600",
      bgColor: "bg-amber-50",
      borderColor: "border-amber-200",
      description: "In progress",
    },
    {
      label: "Submitted",
      count: stats?.submitted ?? "—",
      icon: Send,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
      borderColor: "border-purple-200",
      description: "Awaiting review",
    },
    {
      label: "Completed",
      count: stats?.completed ?? "—",
      icon: Trophy,
      color: "text-green-600",
      bgColor: "bg-green-50",
      borderColor: "border-green-200",
      description: "Approved work",
    },
    {
      label: "Overdue",
      count: stats?.overdue ?? "—",
      icon: AlertTriangle,
      color: stats && stats.overdue > 0 ? "text-red-600" : "text-gray-400",
      bgColor: stats && stats.overdue > 0 ? "bg-red-50" : "bg-gray-50",
      borderColor:
        stats && stats.overdue > 0 ? "border-red-200" : "border-gray-200",
      description: "Past due date",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-5">
      {cards.map((card) => (
        <Card
          key={card.label}
          className={`${card.bgColor} ${card.borderColor} border`}
        >
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  {card.label}
                </p>
                <p className={`text-2xl font-bold ${card.color}`}>
                  {isLoading ? (
                    <span className="inline-block h-7 w-8 animate-pulse rounded bg-gray-200" />
                  ) : (
                    card.count
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {card.description}
                </p>
              </div>
              <card.icon className={`h-8 w-8 ${card.color} opacity-50`} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
