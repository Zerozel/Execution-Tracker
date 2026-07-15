// ============================================================
// Execution Tracker — Daily Plan Summary Card (Phase 5 Polished)
// ============================================================

"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sun,
  Moon,
  CheckCircle2,
  ClipboardCheck,
  ChevronDown,
  Clock,
  Lock,
  Pencil,
} from "lucide-react";

// ============================================================
// TYPES
// ============================================================
interface DailyPlanCardProps {
  goalCount: number;
  taskCount: number;
  completedGoalCount: number;
  status: "draft" | "committed" | "checked_in";
  committedAt: string | null;
  checkedInAt: string | null;
  reflection: string | null;
  onExpand: () => void;
  editWindowMinutes: number;
}

// ============================================================
// HELPERS
// ============================================================
function formatTime(isoString: string | null): string {
  if (!isoString) return "";
  return new Date(isoString).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural || `${singular}s`);
}

// ============================================================
// COMPONENT
// ============================================================
export function DailyPlanCard({
  goalCount,
  taskCount,
  completedGoalCount,
  status,
  committedAt,
  checkedInAt,
  reflection,
  onExpand,
  editWindowMinutes,
}: DailyPlanCardProps) {
  // ============================================
  // CHECKED IN STATE
  // ============================================
  if (status === "checked_in") {
    const isLocked = editWindowMinutes <= 0;

    return (
      <Card className={`border-green-200 bg-green-50/50 transition-all ${isLocked ? "opacity-90" : ""}`}>
        <CardContent className="py-4">
          <div className="flex items-center justify-between gap-3">
            {/* Left: Status info */}
            <div className="flex items-center gap-3 min-w-0">
              <div className={`shrink-0 rounded-full p-1.5 ${isLocked ? "bg-green-100" : "bg-green-100"}`}>
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-green-800 flex items-center gap-2 flex-wrap">
                  Checked in today
                  {isLocked && (
                    <Lock className="h-3 w-3 text-green-500 shrink-0" />
                  )}
                </p>
                <p className="text-sm text-green-700">
                  {completedGoalCount}/{goalCount} {pluralize(goalCount, "goal")} completed
                  {taskCount > 0 && (
                    <> · {taskCount} {pluralize(taskCount, "task")}</>
                  )}
                </p>
                {reflection && (
                  <p className="text-xs text-green-600/80 mt-1 line-clamp-1 italic">
                    &ldquo;{reflection}&rdquo;
                  </p>
                )}
                {checkedInAt && (
                  <p className="text-xs text-green-600/70 mt-0.5 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatTime(checkedInAt)}
                  </p>
                )}
                {/* Edit window indicator */}
                {!isLocked ? (
                  <p className="text-xs text-blue-600 mt-0.5 flex items-center gap-1">
                    <Pencil className="h-3 w-3" />
                    Editable for {editWindowMinutes} more {pluralize(editWindowMinutes, "minute")}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <Lock className="h-3 w-3" />
                    Check-in locked
                  </p>
                )}
              </div>
            </div>

            {/* Right: Action button */}
            {!isLocked && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onExpand}
                className="shrink-0"
              >
                <Pencil className="h-4 w-4 mr-1" />
                Edit
              </Button>
            )}
            {isLocked && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onExpand}
                className="shrink-0"
              >
                <ChevronDown className="h-4 w-4 mr-1" />
                View
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // ============================================
  // DRAFT STATE
  // ============================================
  if (status === "draft") {
    return (
      <Card className="border-gray-200 bg-gray-50/50">
        <CardContent className="py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="shrink-0 rounded-full p-1.5 bg-gray-100">
                <Sun className="h-5 w-5 text-gray-400" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-gray-700">Draft plan</p>
                <p className="text-sm text-muted-foreground">
                  {goalCount} {pluralize(goalCount, "goal")}
                  {taskCount > 0 && (
                    <> · {taskCount} {pluralize(taskCount, "task")}</>
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Not yet committed
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onExpand}
              className="shrink-0"
            >
              <Pencil className="h-4 w-4 mr-1" />
              Continue
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ============================================
  // COMMITTED STATE
  // ============================================
  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardContent className="py-4">
        <div className="flex items-center justify-between gap-3">
          {/* Left: Plan info */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="shrink-0 rounded-full p-1.5 bg-amber-100">
              <Sun className="h-5 w-5 text-amber-600" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-amber-800">
                Today&apos;s Plan
              </p>
              <p className="text-sm text-amber-700">
                {goalCount} {pluralize(goalCount, "goal")}
                {taskCount > 0 && (
                  <> · {taskCount} {pluralize(taskCount, "task")}</>
                )}
              </p>
              {committedAt && (
                <p className="text-xs text-amber-600/80 mt-0.5 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Committed at {formatTime(committedAt)}
                </p>
              )}
              <p className="text-xs text-amber-600/70 mt-0.5 flex items-center gap-1">
                <Moon className="h-3 w-3" />
                Check-in due this evening
              </p>
            </div>
          </div>

          {/* Right: Badge + Action */}
          <div className="flex items-center gap-2 shrink-0">
            <Badge
              variant="outline"
              className="text-xs bg-amber-100 text-amber-700 border-amber-300 hidden sm:inline-flex"
            >
              <ClipboardCheck className="h-3 w-3 mr-1" />
              Committed
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={onExpand}
            >
              <Pencil className="h-4 w-4 mr-1" />
              Edit
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
