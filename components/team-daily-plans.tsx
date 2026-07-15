// ============================================================
// Execution Tracker — Team Daily Plans (Admin View)
// ============================================================

"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Circle,
  Target,
  ClipboardCheck,
  FileText,
  Users,
} from "lucide-react";
import type { DailyPlanWithUser } from "@/types";

export function TeamDailyPlans() {
  const [plans, setPlans] = useState<DailyPlanWithUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function fetchPlans() {
      try {
        setIsLoading(true);
        const response = await fetch("/api/daily-plan/team/today");
        if (!response.ok) throw new Error("Failed to fetch team plans");
        const result = await response.json();
        setPlans(result.data || []);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load team plans"
        );
      } finally {
        setIsLoading(false);
      }
    }
    fetchPlans();
  }, []);

  function toggleUser(userId: string) {
    setExpandedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }

  const formatTime = (isoString: string | null): string => {
    if (!isoString) return "";
    return new Date(isoString).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "checked_in":
        return (
          <Badge className="bg-green-100 text-green-700 border-green-300 text-xs">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Checked in
          </Badge>
        );
      case "committed":
        return (
          <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-xs">
            <ClipboardCheck className="h-3 w-3 mr-1" />
            Committed
          </Badge>
        );
      case "draft":
        return (
          <Badge variant="outline" className="text-xs">
            Draft
          </Badge>
        );
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 w-48 rounded bg-gray-200 mb-2" />
                <div className="h-3 w-32 rounded bg-gray-200" />
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

  if (plans.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex min-h-[150px] items-center justify-center py-8">
          <div className="text-center">
            <Users className="mx-auto h-8 w-8 text-muted-foreground/60" />
            <p className="mt-2 text-sm font-medium text-muted-foreground">
              No plans for today
            </p>
            <p className="text-xs text-muted-foreground">
              Team members haven&apos;t committed to their day yet
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {plans.map((plan) => {
        const isExpanded = expandedUsers.has(plan.user_id);
        const goals = plan.plan_data?.morning?.goals || [];
        const tasks = plan.plan_data?.morning?.committed_tasks || [];
        const completedGoals = goals.filter((g) => g.is_completed).length;

        return (
          <Card key={plan.id}>
            <CardContent className="py-4">
              {/* Header — always visible */}
              <button
                onClick={() => toggleUser(plan.user_id)}
                className="flex items-center justify-between w-full text-left"
              >
                <div className="flex items-center gap-3">
                  <div>
                    <p className="font-medium">
                      {plan.user?.display_name || "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {goals.length} {goals.length === 1 ? "goal" : "goals"}
                      {tasks.length > 0 &&
                        ` · ${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`}
                      {plan.status === "checked_in" &&
                        ` · ${completedGoals}/${goals.length} completed`}
                      {plan.committed_at &&
                        ` · Committed at ${formatTime(plan.committed_at)}`}
                      {plan.checked_in_at &&
                        ` · Checked in at ${formatTime(plan.checked_in_at)}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {statusBadge(plan.status)}
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </button>

              {/* Expanded details */}
              {isExpanded && (
                <div className="mt-4 pt-4 border-t space-y-4">
                  {/* Goals */}
                  {goals.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                        <Target className="h-3 w-3" />
                        Goals
                      </h4>
                      <div className="space-y-1">
                        {goals.map((goal) => (
                          <div
                            key={goal.id}
                            className="flex items-center gap-2 text-sm"
                          >
                            {goal.is_completed ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                            ) : (
                              <Circle className="h-4 w-4 text-gray-300 shrink-0" />
                            )}
                            <span
                              className={
                                goal.is_completed
                                  ? "line-through text-muted-foreground"
                                  : ""
                              }
                            >
                              {goal.content}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Committed Tasks */}
                  {tasks.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                        <ClipboardCheck className="h-3 w-3" />
                        Committed Tasks
                      </h4>
                      <div className="space-y-1">
                        {tasks.map((task) => (
                          <div
                            key={task.task_id}
                            className="flex items-center gap-2 text-sm"
                          >
                            <Badge
                              variant="outline"
                              className="text-xs capitalize shrink-0"
                            >
                              {task.status_when_committed}
                            </Badge>
                            <span className="truncate">{task.title}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Note */}
                  {plan.plan_data?.morning?.note && (
                    <div className="space-y-1">
                      <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        Note
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {plan.plan_data.morning.note}
                      </p>
                    </div>
                  )}

                  {/* Evening — only if checked in */}
                  {plan.status === "checked_in" && (
                    <div className="space-y-3 border-t pt-3">
                      {plan.plan_data?.evening?.accomplishment && (
                        <div className="space-y-1">
                          <h4 className="text-xs font-semibold text-muted-foreground">
                            Accomplishment
                          </h4>
                          <p className="text-sm whitespace-pre-wrap">
                            {plan.plan_data.evening.accomplishment}
                          </p>
                        </div>
                      )}
                      {plan.plan_data?.evening?.blockers && (
                        <div className="space-y-1">
                          <h4 className="text-xs font-semibold text-muted-foreground">
                            Blockers
                          </h4>
                          <p className="text-sm text-amber-700 whitespace-pre-wrap">
                            {plan.plan_data.evening.blockers}
                          </p>
                        </div>
                      )}
                      {plan.plan_data?.evening?.reflection && (
                        <div className="space-y-1">
                          <h4 className="text-xs font-semibold text-muted-foreground">
                            Reflection
                          </h4>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                            {plan.plan_data.evening.reflection}
                          </p>
                        </div>
                      )}
                      {plan.plan_data?.evening?.mood && (
                        <div className="space-y-1">
                          <h4 className="text-xs font-semibold text-muted-foreground">
                            Mood
                          </h4>
                          <Badge variant="outline" className="text-xs capitalize">
                            {plan.plan_data.evening.mood}
                          </Badge>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
