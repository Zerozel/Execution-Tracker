// ============================================================
// Execution Tracker — Task List Component (Paginated)
// ============================================================

"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { TaskCard } from "@/components/task-card";
import { TaskCreateDialog } from "@/components/task-create-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2 } from "lucide-react";
import type { Task, AuthUser } from "@/types";

interface TaskListProps {
  user?: AuthUser | null;
  filterStatus?: string;
  title?: string;
  /** Maximum items to show before "View all" link. Default: 0 = show all */
  dashboardLimit?: number;
  /** Link for "View all" button. Default: /tasks?status= */
  viewAllHref?: string;
}

const PAGE_SIZE = 5;

export function TaskList({
  user,
  filterStatus,
  title,
  dashboardLimit = 0,
  viewAllHref,
}: TaskListProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const isPaginated = dashboardLimit === 0;

  const fetchTasks = useCallback(
    async (currentOffset: number, append: boolean = false) => {
      try {
        if (append) {
          setIsLoadingMore(true);
        } else {
          setIsLoading(true);
        }
        setError(null);

        const params = new URLSearchParams();
        if (isPaginated) {
          params.set("mode", "paginated");
          params.set("limit", String(PAGE_SIZE));
          params.set("offset", String(currentOffset));
        }
        if (filterStatus) {
          params.set("status", filterStatus);
        }

        const url = `/api/tasks${params.toString() ? "?" + params.toString() : ""}`;
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error("Failed to fetch tasks");
        }

        const result = await response.json();
        const fetchedTasks: Task[] = result.data || [];
        const total: number = result.total || 0;

        if (append) {
          setTasks((prev) => [...prev, ...fetchedTasks]);
        } else {
          setTasks(fetchedTasks);
        }

        setTotalCount(total);
        setHasMore(currentOffset + PAGE_SIZE < total);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load tasks");
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [filterStatus, isPaginated]
  );

  useEffect(() => {
    setOffset(0);
    fetchTasks(0, false);
  }, [fetchTasks]);

  function handleLoadMore() {
    const newOffset = offset + PAGE_SIZE;
    setOffset(newOffset);
    fetchTasks(newOffset, true);
  }

  // Dashboard: show limited tasks with "View all" link
  if (dashboardLimit > 0 && tasks.length > dashboardLimit) {
    const limitedTasks = tasks.slice(0, dashboardLimit);

    return (
      <div className="space-y-4">
        {title && <h2 className="text-lg font-semibold">{title}</h2>}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {limitedTasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
        {viewAllHref && (
          <Link
            href={viewAllHref}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            View all {totalCount} tasks
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4">
        {title && <h2 className="text-lg font-semibold">{title}</h2>}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="min-h-[100px]" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-4">
        {title && <h2 className="text-lg font-semibold">{title}</h2>}
        <Card className="border-destructive">
          <CardContent className="flex min-h-[100px] items-center justify-center py-8">
            <div className="text-center">
              <p className="text-sm text-destructive">{error}</p>
              <button
                onClick={() => fetchTasks(0, false)}
                className="mt-2 text-sm text-primary hover:underline"
              >
                Try again
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Empty state
  if (tasks.length === 0) {
    const emptyMessages: Record<string, string> = {
      assigned: "No tasks waiting for acceptance",
      accepted: "No tasks currently in progress",
      submitted: "No tasks awaiting review",
      completed: "No completed tasks yet",
    };

    return (
      <div className="space-y-4">
        {title && <h2 className="text-lg font-semibold">{title}</h2>}
        <Card className="border-dashed">
          <CardContent className="flex min-h-[100px] items-center justify-center py-8">
            <div className="text-center">
              <p className="text-sm font-medium text-muted-foreground">
                {filterStatus
                  ? emptyMessages[filterStatus] || "No tasks found"
                  : "No tasks yet"}
              </p>
              {user?.role === "admin" && !filterStatus && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Create a task to get started
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {title && (
          <h2 className="text-lg font-semibold">
            {title}
            {isPaginated && totalCount > 0 && (
              <span className="text-sm font-normal text-muted-foreground ml-2">
                ({totalCount})
              </span>
            )}
          </h2>
        )}
        {user?.role === "admin" && !filterStatus && (
          <TaskCreateDialog onTaskCreated={() => fetchTasks(0, false)} />
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
      </div>

      {/* Load more button — only in paginated mode */}
      {isPaginated && hasMore && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            onClick={handleLoadMore}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Loading...
              </>
            ) : (
              `Load more (${totalCount - tasks.length} remaining)`
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
