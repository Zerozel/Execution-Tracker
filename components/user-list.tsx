// ============================================================
// Execution Tracker — User List Component (With Reliability)
// ============================================================

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserActions } from "@/components/user-actions";
import { UserReliabilityBar } from "@/components/user-reliability-bar";
import { formatDate } from "@/lib/utils";
import type { User } from "@/types";
import type { UserReliabilityStats } from "@/app/api/users/stats/route";

interface UserListProps {
  users: User[];
  isArchived?: boolean;
}

export function UserList({ users, isArchived = false }: UserListProps) {
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const [reliabilityStats, setReliabilityStats] = useState<
    UserReliabilityStats[]
  >([]);

  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await fetch("/api/users/stats");
        if (response.ok) {
          const result = await response.json();
          setReliabilityStats(result.data || []);
        }
      } catch {
        // Stats are non-critical — fail silently
      }
    }

    if (!isArchived) {
      fetchStats();
    }
  }, [isArchived]);

  function handleActionComplete() {
    setActionError(null);
    router.refresh();
  }

  function handleActionError(message: string) {
    setActionError(message);
  }

  function getStatsForUser(
    userId: string
  ): UserReliabilityStats | undefined {
    return reliabilityStats.find((s) => s.user_id === userId);
  }

  if (users.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex min-h-[100px] items-center justify-center py-8">
          <p className="text-sm text-muted-foreground">
            {isArchived ? "No archived users" : "No active users"}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {actionError && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="py-3">
            <p className="text-sm text-destructive">{actionError}</p>
          </CardContent>
        </Card>
      )}

      {/* Column Headers (desktop only) */}
      <div className="hidden md:grid md:grid-cols-12 gap-4 px-4 py-2 text-xs font-medium text-muted-foreground">
        <div className="col-span-4">User</div>
        <div className="col-span-3">Reliability</div>
        <div className="col-span-3">Joined</div>
        <div className="col-span-2 text-right">Actions</div>
      </div>

      {users.map((user) => {
        const stats = getStatsForUser(user.id);

        return (
          <Card key={user.id}>
            <CardContent className="py-4">
              {/* Desktop Layout */}
              <div className="hidden md:grid md:grid-cols-12 gap-4 items-center">
                {/* User Info */}
                <div className="col-span-4 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{user.display_name}</p>
                    <Badge
                      variant={user.role === "admin" ? "default" : "secondary"}
                      className="text-xs capitalize shrink-0"
                    >
                      {user.role}
                    </Badge>
                    {user.is_archived && (
                      <Badge variant="outline" className="text-xs shrink-0">
                        Archived
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    @{user.nickname}
                  </p>
                </div>

                {/* Reliability Bar */}
                <div className="col-span-3">
                  {!isArchived && stats ? (
                    <UserReliabilityBar
                      totalCompleted={stats.total_completed_with_due_date}
                      completedOnTime={stats.completed_on_time}
                      completedLate={stats.completed_late}
                      reliabilityPercentage={stats.reliability_percentage}
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {isArchived ? "Archived" : "Loading..."}
                    </span>
                  )}
                </div>

                {/* Joined Date */}
                <div className="col-span-3">
                  <p className="text-sm text-muted-foreground">
                    {formatDate(user.created_at)}
                  </p>
                </div>

                {/* Actions */}
                <div className="col-span-2 flex justify-end">
                  <UserActions
                    user={user}
                    onComplete={handleActionComplete}
                    onError={handleActionError}
                  />
                </div>
              </div>

              {/* Mobile Layout */}
              <div className="md:hidden space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="font-medium truncate">{user.display_name}</p>
                    <Badge
                      variant={user.role === "admin" ? "default" : "secondary"}
                      className="text-xs capitalize shrink-0"
                    >
                      {user.role}
                    </Badge>
                  </div>
                  <UserActions
                    user={user}
                    onComplete={handleActionComplete}
                    onError={handleActionError}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  @{user.nickname}
                </p>

                {/* Mobile Reliability Bar */}
                {!isArchived && stats && (
                  <div className="pt-1">
                    <UserReliabilityBar
                      totalCompleted={stats.total_completed_with_due_date}
                      completedOnTime={stats.completed_on_time}
                      completedLate={stats.completed_late}
                      reliabilityPercentage={stats.reliability_percentage}
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
