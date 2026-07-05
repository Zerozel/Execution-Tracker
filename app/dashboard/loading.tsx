// ============================================================
// Execution Tracker — Dashboard Loading State
// ============================================================

import { DashboardStatsSkeleton, TaskListSkeleton } from "@/components/loading-skeleton";

export default function DashboardLoading() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
          <div className="mt-2 h-4 w-72 animate-pulse rounded bg-gray-200" />
        </div>
      </div>

      {/* Stats */}
      <DashboardStatsSkeleton />

      {/* Section 1 */}
      <div>
        <div className="mb-4 h-6 w-40 animate-pulse rounded bg-gray-200" />
        <TaskListSkeleton count={3} />
      </div>

      {/* Section 2 */}
      <div>
        <div className="mb-4 h-6 w-40 animate-pulse rounded bg-gray-200" />
        <TaskListSkeleton count={3} />
      </div>

      {/* Section 3 */}
      <div>
        <div className="mb-4 h-6 w-40 animate-pulse rounded bg-gray-200" />
        <TaskListSkeleton count={3} />
      </div>
    </div>
  );
}
