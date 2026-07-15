// ============================================================
// Execution Tracker — Founder Accountability Dashboard
// ============================================================

import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase";
import { DashboardStats } from "@/components/dashboard-stats";
import { TaskList } from "@/components/task-list";
import { OverdueSection } from "@/components/overdue-section";
import { DailyPlan } from "@/components/daily-plan";
import { ClientTaskCreateWrapper } from "./client-wrapper";
import { ClipboardList, Send, CheckCircle2, Trophy } from "lucide-react";

export default async function DashboardPage() {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: acceptedTasks } = await supabase
    .from("tasks")
    .select("id, title, status")
    .eq("owner_id", user.id)
    .in("status", ["assigned", "accepted", "submitted"])
    .eq("is_archived", false)
    .order("created_at", { ascending: false })
    .limit(10);

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
        {user.role === "admin" && <ClientTaskCreateWrapper />}
      </div>

      {/* Daily Plan */}
      <DailyPlan
        userRole={user.role}
        acceptedTasks={(acceptedTasks || []).map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
        }))}
      />

      {/* Stats */}
      <DashboardStats />

      {/* Overdue */}
      <OverdueSection />

      {/* Pending Acceptance */}
      {user.role === "admin" && (
        <SectionWithIcon
          icon={<ClipboardList className="h-5 w-5 text-blue-600" />}
          title="Pending Acceptance"
          description="Tasks assigned but not yet accepted"
        >
          <TaskList
            user={user}
            filterStatus="assigned"
            dashboardLimit={3}
            viewAllHref="/tasks?status=assigned"
          />
        </SectionWithIcon>
      )}

      {/* Awaiting Review */}
      {user.role === "admin" && (
        <SectionWithIcon
          icon={<Send className="h-5 w-5 text-purple-600" />}
          title="Awaiting Review"
          description="Work submitted and waiting for approval"
        >
          <TaskList
            user={user}
            filterStatus="submitted"
            dashboardLimit={3}
            viewAllHref="/tasks?status=submitted"
          />
        </SectionWithIcon>
      )}

      {/* In Progress */}
      <SectionWithIcon
        icon={<CheckCircle2 className="h-5 w-5 text-amber-600" />}
        title="In Progress"
        description="Tasks being worked on"
      >
        <TaskList
          user={user}
          filterStatus="accepted"
          dashboardLimit={3}
          viewAllHref="/tasks?status=accepted"
        />
      </SectionWithIcon>

      {/* Recently Completed */}
      <SectionWithIcon
        icon={<Trophy className="h-5 w-5 text-green-600" />}
        title="Recently Completed"
        description="Approved and completed work"
      >
        <TaskList
          user={user}
          filterStatus="completed"
          dashboardLimit={3}
          viewAllHref="/tasks?status=completed"
        />
      </SectionWithIcon>
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
