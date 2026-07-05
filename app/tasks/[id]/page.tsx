// ============================================================
// Execution Tracker — Task Detail Page (With Submissions)
// ============================================================

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AcceptTaskButton } from "@/components/accept-task-button";
import { SubmissionForm } from "@/components/submission-form";
import { SubmissionHistory } from "@/components/submission-history";
import {
  formatDate,
  formatDateTime,
  getOverdueStatus,
  overdueColor,
} from "@/lib/utils";

interface TaskDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function TaskDetailPage({ params }: TaskDetailPageProps) {
  const user = await getCurrentUser();

  if (!user) {
    notFound();
  }

  const { id } = await params;
  const supabase = await createClient();

  const { data: task } = await supabase
    .from("tasks")
    .select(
      `
      *,
      owner:owner_id (id, nickname, display_name),
      creator:creator_id (id, nickname, display_name)
    `
    )
    .eq("id", id)
    .eq("is_archived", false)
    .single();

  if (!task) {
    notFound();
  }

  // Members can only see their own tasks
  if (user.role === "member" && task.owner_id !== user.id) {
    notFound();
  }

  const overdue = getOverdueStatus(task);
  const isOwner = task.owner_id === user.id;
  const canAccept = isOwner && task.status === "assigned";
  const canSubmit =
    isOwner &&
    (task.status === "accepted" || task.status === "submitted");

  // Status badge color mapping
  const statusBadgeVariant: Record<string, "secondary" | "default" | "outline"> = {
    assigned: "secondary",
    accepted: "default",
    submitted: "default",
    completed: "outline",
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Back Link */}
      <a
        href={user.role === "admin" ? "/tasks" : "/dashboard"}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to {user.role === "admin" ? "all tasks" : "dashboard"}
      </a>

      {/* Task Header */}
      <div>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold">{task.title}</h1>
          <Badge
            variant={
              statusBadgeVariant[task.status as keyof typeof statusBadgeVariant] ||
              "outline"
            }
          >
            {task.status}
          </Badge>
        </div>
        {task.due_date && (
          <p
            className={`mt-2 inline-block rounded-md border px-2 py-0.5 text-xs font-medium ${overdueColor(overdue)}`}
          >
            Due: {formatDate(task.due_date)}
            {overdue === "overdue" && " (Overdue)"}
            {overdue === "due_soon" && " (Due soon)"}
          </p>
        )}
      </div>

      {/* Task Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Description */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">
              Description
            </h3>
            <p className="mt-1 text-sm">
              {task.description || "No description provided"}
            </p>
          </div>

          {/* Assignment Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">
                Assigned To
              </h3>
              <p className="mt-1 text-sm">
                {task.owner?.display_name || "Unassigned"}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">
                Created By
              </h3>
              <p className="mt-1 text-sm">
                {task.creator?.display_name || "Unknown"}
              </p>
            </div>
          </div>

          {/* Timestamps */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">
                Created
              </h3>
              <p className="mt-1 text-sm">
                {formatDateTime(task.created_at)}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">
                Accepted
              </h3>
              <p className="mt-1 text-sm">
                {task.accepted_at
                  ? formatDateTime(task.accepted_at)
                  : "Not yet accepted"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Accept Button */}
      {canAccept && (
        <div className="flex justify-center">
          <AcceptTaskButton taskId={task.id} />
        </div>
      )}

      {/* Submission Form (for owner when task is accepted or submitted) */}
      {canSubmit && <SubmissionForm taskId={task.id} />}

      {/* Non-owner notice for admins */}
      {!isOwner && user.role === "admin" && task.status !== "completed" && (
        <p className="text-center text-sm text-muted-foreground">
          This task is assigned to {task.owner?.display_name || "Unassigned"}.
          Only they can accept and submit work.
        </p>
      )}

      {/* Completed notice */}
      {task.status === "completed" && (
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="py-4 text-center">
            <p className="text-sm font-medium text-green-700">
              ✅ This task has been completed
            </p>
          </CardContent>
        </Card>
      )}

      {/* Submission History */}
      <SubmissionHistory taskId={task.id} currentUser={user} />
    </div>
  );
}
