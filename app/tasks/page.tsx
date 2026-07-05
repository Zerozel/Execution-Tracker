// ============================================================
// Execution Tracker — All Tasks Page (Admin Only)
// ============================================================

import { requireAdmin } from "@/lib/auth";
import { TaskList } from "@/components/task-list";

export default async function TasksPage() {
  await requireAdmin();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">All Tasks</h1>
          <p className="text-muted-foreground">
            Manage and track all team tasks
          </p>
        </div>
      </div>

      <TaskList />
    </div>
  );
}
