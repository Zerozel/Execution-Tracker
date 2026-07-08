// ============================================================
// Execution Tracker — User Reliability Bar (Admin View)
// ============================================================

"use client";

interface UserReliabilityBarProps {
  totalCompleted: number;
  completedOnTime: number;
  completedLate: number;
  reliabilityPercentage: number | null;
}

export function UserReliabilityBar({
  totalCompleted,
  completedOnTime,
  completedLate,
  reliabilityPercentage,
}: UserReliabilityBarProps) {
  // No completed tasks with due dates
  if (totalCompleted === 0) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-2.5 w-full max-w-[120px] rounded-full bg-gray-100" />
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          No data
        </span>
      </div>
    );
  }

  // Determine color based on percentage
  const getBarColor = (pct: number | null): string => {
    if (pct === null) return "bg-gray-200";
    if (pct >= 90) return "bg-green-500";
    if (pct >= 75) return "bg-emerald-400";
    if (pct >= 60) return "bg-yellow-400";
    if (pct >= 40) return "bg-amber-500";
    return "bg-red-500";
  };

  const getTextColor = (pct: number | null): string => {
    if (pct === null) return "text-gray-400";
    if (pct >= 90) return "text-green-700";
    if (pct >= 75) return "text-emerald-700";
    if (pct >= 60) return "text-yellow-700";
    if (pct >= 40) return "text-amber-700";
    return "text-red-700";
  };

  const barColor = getBarColor(reliabilityPercentage);
  const textColor = getTextColor(reliabilityPercentage);

  return (
    <div className="flex items-center gap-3">
      {/* Bar */}
      <div className="flex-1 min-w-[80px] max-w-[140px]">
        <div className="h-2.5 w-full rounded-full bg-gray-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{
              width: `${reliabilityPercentage ?? 0}%`,
            }}
          />
        </div>
      </div>

      {/* Percentage */}
      <span className={`text-sm font-bold min-w-[40px] ${textColor}`}>
        {reliabilityPercentage !== null ? `${reliabilityPercentage}%` : "—"}
      </span>

      {/* Breakdown (hover or always visible on desktop) */}
      <span className="hidden lg:inline text-xs text-muted-foreground whitespace-nowrap">
        {completedOnTime}/{totalCompleted} on time
        {completedLate > 0 && (
          <span className="text-amber-600"> · {completedLate} late</span>
        )}
      </span>
    </div>
  );
}
