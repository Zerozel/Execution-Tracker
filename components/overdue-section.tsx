// ============================================================
// Execution Tracker — Overdue Tasks Section
// ============================================================

"use client";

import { useEffect, useState } from "react";
import { TaskCard } from "@/components/task-card";
import { getOverdueStatus } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";
import type { Task } from "@/types";

export function OverdueSection() {
  const [overdueTasks, setOverdueTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchOverdueTasks() {
      try {
        setIsLoading(true);
        const response = await fetch("/api/tasks");

        if (!response.ok) {
          throw new Error("Failed to fetch tasks");
        }

        const result = await response.json();
        const allTasks: Task[] = result.data || [];

        // Match parameters: getOverdueStatus(deadline, status) returning a boolean
        const overdue = allTasks.filter(
          (task) => getOverdueStatus(task.deadline || task.due_date, task.status)
        );

        setOverdueTasks(overdue);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load overdue tasks"
        );
      } finally {
        setIsLoading(false);
      }
    }

    fetchOverdueTasks();
  }, []);

  // Don't render anything while loading
  if (isLoading) {
    return null;
  }

  // Don't render on error
  if (error) {
    return null;
  }

  // Don't render if there are no overdue tasks — keeps dashboard clean
  if (overdueTasks.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4 rounded-lg border-2 border-red-200 bg-red-50/50 p-6">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-red-600" />
        <h2 className="text-lg font-semibold text-red-800">
          Overdue ({overdueTasks.length})
        </h2>
      </div>
      <p className="text-sm text-red-600">
        These tasks are past their due date and need immediate attention
      </p>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {overdueTasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
}
