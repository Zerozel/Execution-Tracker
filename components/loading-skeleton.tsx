// ============================================================
// Execution Tracker — Loading Skeleton Components
// ============================================================

import { Card, CardContent, CardHeader } from "@/components/ui/card";

/**
 * Skeleton for a single task card.
 */
export function TaskCardSkeleton() {
  return (
    <Card className="animate-pulse">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="h-5 w-3/4 rounded bg-gray-200" />
          <div className="h-5 w-16 rounded-full bg-gray-200" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="h-4 w-1/2 rounded bg-gray-200" />
          <div className="h-4 w-1/3 rounded bg-gray-200" />
          <div className="h-3 w-2/3 rounded bg-gray-200" />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Skeleton grid for task lists (shows multiple card skeletons).
 */
export function TaskListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <TaskCardSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * Skeleton for a stat card.
 */
export function StatCardSkeleton() {
  return (
    <Card className="animate-pulse">
      <CardContent className="py-4">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-3 w-16 rounded bg-gray-200" />
            <div className="h-7 w-8 rounded bg-gray-200" />
            <div className="h-3 w-20 rounded bg-gray-200" />
          </div>
          <div className="h-8 w-8 rounded bg-gray-200" />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Skeleton for dashboard stats row.
 */
export function DashboardStatsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * Skeleton for task detail page.
 */
export function TaskDetailSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Back link */}
      <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />

      {/* Title + status */}
      <div className="flex items-start justify-between gap-4">
        <div className="h-8 w-3/4 animate-pulse rounded bg-gray-200" />
        <div className="h-6 w-20 animate-pulse rounded-full bg-gray-200" />
      </div>

      {/* Due date */}
      <div className="h-6 w-32 animate-pulse rounded bg-gray-200" />

      {/* Details card */}
      <Card className="animate-pulse">
        <CardHeader>
          <div className="h-6 w-20 rounded bg-gray-200" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-4 w-full rounded bg-gray-200" />
          <div className="h-4 w-2/3 rounded bg-gray-200" />
          <div className="grid grid-cols-2 gap-4">
            <div className="h-4 w-3/4 rounded bg-gray-200" />
            <div className="h-4 w-3/4 rounded bg-gray-200" />
          </div>
        </CardContent>
      </Card>

      {/* Submission history skeleton */}
      <Card className="animate-pulse">
        <CardContent className="min-h-[150px] py-8" />
      </Card>
    </div>
  );
}

/**
 * Inline text skeleton (for use within other components).
 */
export function TextSkeleton({
  width = "100%",
  height = "1rem",
}: {
  width?: string;
  height?: string;
}) {
  return (
    <div
      className="animate-pulse rounded bg-gray-200"
      style={{ width, height }}
    />
  );
}
