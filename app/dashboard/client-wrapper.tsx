"use client";

import { TaskCreateDialog } from "@/components/task-create-dialog";

export function ClientTaskCreateWrapper() {
  return (
    <TaskCreateDialog onTaskCreated={() => window.location.reload()} />
  );
}
