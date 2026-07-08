// ============================================================
// Execution Tracker — User Reliability Summary (Team View)
// ============================================================

"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { UserReliabilityStats } from "@/app/api/users/stats/route";

export function UserReliabilitySummary() {
  const [stats, setStats] = useState<UserReliabilityStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await fetch("/api/users/stats");
        if (response.ok) {
          const result = await response.json();
          setStats(result.data || []);
        }
      } catch {
        // Non-critical
      } finally {
        setIsLoading(false);
      }
    }
    fetchStats();
  }, []);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="animate-pulse space-y-2">
            <div className="h-4 w-48 rounded bg-gray-200" />
            <div className="h-8 w-32 rounded bg-gray-200" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const usersWithData = stats.filter((s) => s.reliability_percentage !== null);
  
  if (usersWithData.length === 0) {
    return null; // Don't show if no one has completed tasks with due dates
  }

  const averageReliability = Math.round(
    usersWithData.reduce((sum, s) => sum + (s.reliability_percentage || 0), 0) /
      usersWithData.length
  );

  const totalOnTime = usersWithData.reduce(
    (sum, s) => sum + s.completed_on_time,
    0
  );
  const totalLate = usersWithData.reduce(
    (sum, s) => sum + s.completed_late,
    0
  );

  const getTrendIcon = () => {
    if (averageReliability >= 85) {
      return <TrendingUp className="h-5 w-5 text-green-600" />;
    }
    if (averageReliability >= 60) {
      return <Minus className="h-5 w-5 text-amber-600" />;
    }
    return <TrendingDown className="h-5 w-5 text-red-600" />;
  };

  const getBarColor = (pct: number): string => {
    if (pct >= 90) return "bg-green-500";
    if (pct >= 75) return "bg-emerald-400";
    if (pct >= 60) return "bg-yellow-400";
    if (pct >= 40) return "bg-amber-500";
    return "bg-red-500";
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          {getTrendIcon()}
          Team Reliability
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Team Average Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Team Average
              </span>
              <span className="text-2xl font-bold">{averageReliability}%</span>
            </div>
            <div className="h-3 w-full rounded-full bg-gray-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${getBarColor(averageReliability)}`}
                style={{ width: `${averageReliability}%` }}
              />
            </div>
          </div>

          {/* Breakdown */}
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-green-600">
                {totalOnTime}
              </p>
              <p className="text-xs text-muted-foreground">On Time</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">{totalLate}</p>
              <p className="text-xs text-muted-foreground">Late</p>
            </div>
            <div>
              <p className="text-2xl font-bold">
                {usersWithData.length}
              </p>
              <p className="text-xs text-muted-foreground">Members</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
