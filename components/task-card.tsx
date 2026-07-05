// ============================================================
// Execution Tracker — Task Card Component
// ============================================================

"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, getOverdueStatus, overdueColor } from "@/lib/utils";
import type { Task } from "@/types";

interface TaskCardProps {
  task: Task & {
    owner?: { id: string; nickname: string; display_name: string } | null;
    creator?: { id: string; nickname: string; display_name: string } | null;
  };
}

export function TaskCard({ task }: TaskCardProps) {
  const router = useRouter();
  const overdue = getOverdueStatus(task);

  const statusVariant: Record<string, "secondary" | "default" | "outline"> = {
    assigned: "secondary",
    accepted: "default",
    submitted: "default",
    completed: "outline",
  };

  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-md"
      onClick={() => router.push(`/tasks/${task.id}`)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base font-semibold leading-snug">
            {task.title}
          </CardTitle>
          <Badge variant={statusVariant[task.status] || "outline"} className="shrink-0 text-xs capitalize">
            {task.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm text-muted-foreground">
          {/* Owner */}
          {task.owner && (
            <p>
              <span className="font-medium">Assignee:</span>{" "}
              {task.owner.display_name}
            </p>
          )}

          {/* Due Date */}
          {task.due_date && (
            <p className={overdueColor(overdue)}>
              <span className="font-medium">Due:</span>{" "}
              {formatDate(task.due_date)}
              {overdue === "overdue" && " (Overdue)"}
            </p>
          )}

          {/* Description Preview */}
          {task.description && (
            <p className="line-clamp-2 text-xs">{task.description}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
