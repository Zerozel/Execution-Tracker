// ============================================================
// Execution Tracker — Founder Accountability Dashboard
// ============================================================

// NO "use client" directive here! This is a secure Server Component.
import { requireAuth } from "@/lib/auth";
import { DashboardStats } from "@/components/dashboard-stats";
import { TaskList } from "@/components/task-list";
import { TaskCreateDialog } from "@/components/task-create-dialog";
import { OverdueSection } from "@/components/overdue-section";
import { ClipboardList, Send, CheckCircle2, Trophy } from "lucide-react";
import { ClientTaskCreateWrapper } from "./client-wrapper"; // We will create this small file next!

export default async function DashboardPage() {
  // Safe server-side cookies work perfectly here now
  const user = await requireAuth();

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {user.role === "admin" ? "Team Dashboard" : "My Dashboard"}
          </h1>
          <p className="text-muted-foreground">
            {user.role === "admin"
              ? "Accountability overview for the entire team"
              : `Welcome back, ${user.display_name}`}
          </p>
        </div>
        {user.role === "admin" && (
          /* We safely use the wrapper to handle the interactive window.location.reload event */
          <ClientTaskCreateWrapper />
        )}
      </div>

      {/* Stats Overview */}
      <DashboardStats />

      {/* SECTION 1: Overdue Tasks (Priority) */}
      <OverdueSection />

      {/* SECTION 2: Pending Acceptance (Admin only) */}
      {user.role === "admin" && (
        <SectionWithIcon
          icon={<ClipboardList className="h-5 w-5 text-blue-600" />}
          title="Pending Acceptance"
          description="Tasks assigned but not yet accepted by team members"
        >
          <TaskList user={user} filterStatus="assigned" />
        </SectionWithIcon>
      )}

      {/* SECTION 3: Awaiting Review (Admin only) */}
      {user.role === "admin" && (
        <SectionWithIcon
          icon={<Send className="h-5 w-5 text-purple-600" />}
          title="Awaiting Review"
          description="Work submitted and waiting for your approval"
        >
          <TaskList user={user} filterStatus="submitted" />
        </SectionWithIcon>
      )}

      {/* SECTION 4: In Progress */}
      <SectionWithIcon
        icon={<CheckCircle2 className="h-5 w-5 text-amber-600" />}
        title="In Progress"
        description="Tasks that have been accepted and are being worked on"
      >
        <TaskList user={user} filterStatus="accepted" />
      </SectionWithIcon>

      {/* SECTION 5: Recently Completed */}
      <SectionWithIcon
        icon={<Trophy className="h-5 w-5 text-green-600" />}
        title="Recently Completed"
        description="Approved and completed work"
      >
        <TaskList user={user} filterStatus="completed" />
      </SectionWithIcon>

      {/* SECTION 6: All Tasks (full list) */}
      <div className="space-y-4 border-t pt-8">
        <h2 className="text-lg font-semibold">All Tasks</h2>
        <TaskList user={user} />
      </div>
    </div>
  );
}

function SectionWithIcon({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-lg font-semibold">{title}</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}
