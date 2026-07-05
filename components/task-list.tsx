// ============================================================
// Execution Tracker — Task List Component (Filterable)
// ============================================================

"use client";

import { useEffect, useState } from "react";
import { TaskCard } from "@/components/task-card";
import { TaskCreateDialog } from "@/components/task-create-dialog";
import { Card, CardContent } from "@/components/ui/card";
import type { Task, AuthUser } from "@/types";

interface TaskListProps {
  user?: AuthUser | null;
  filterStatus?: string;
  title?: string;
}

export function TaskList({
  user,
  filterStatus,
  title,
}: TaskListProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchTasks() {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/tasks");

      if (!response.ok) {
        throw new Error("Failed to fetch tasks");
      }

      const result = await response.json();
      let fetchedTasks = result.data || [];

      // Apply client-side filter if filterStatus is provided
      if (filterStatus) {
        fetchedTasks = fetchedTasks.filter(
          (task: Task) => task.status === filterStatus
        );
      }

      setTasks(fetchedTasks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tasks");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchTasks();
  }, [filterStatus]);

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4">
        {title && <h2 className="text-lg font-semibold">{title}</h2>}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2].map((i) => (
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
                onClick={fetchTasks}
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

  // Empty state with contextual message
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
        {title && <h2 className="text-lg font-semibold">{title}</h2>}
        {user?.role === "admin" && !filterStatus && (
          <TaskCreateDialog onTaskCreated={fetchTasks} />
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
}
