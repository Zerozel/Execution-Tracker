// ============================================================
// Execution Tracker — Root Loading State
// ============================================================

import { DashboardStatsSkeleton, TaskListSkeleton } from "@/components/loading-skeleton";

export default function RootLoading() {
  return (
    <div className="space-y-8">
      {/* Header skeleton */}
      <div>
        <div className="h-8 w-64 animate-pulse rounded bg-gray-200" />
        <div className="mt-2 h-4 w-96 animate-pulse rounded bg-gray-200" />
      </div>

      {/* Stats skeleton */}
      <DashboardStatsSkeleton />

      {/* Task list skeletons */}
      <TaskListSkeleton count={3} />
      <TaskListSkeleton count={3} />
    </div>
  );
}
