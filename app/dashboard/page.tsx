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

  // Fetch accepted tasks for the daily plan task selector
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

      {/* ============================================ */}
      {/* SECTION 0: Daily Plan                        */}
      {/* ============================================ */}
      <DailyPlan
        userRole={user.role}
        acceptedTasks={(acceptedTasks || []).map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
        }))}
      />

      {/* ============================================ */}
      {/* Stats Overview                               */}
      {/* ============================================ */}
      <DashboardStats />

      {/* ============================================ */}
      {/* SECTION 1: Overdue Tasks (Priority)          */}
      {/* ============================================ */}
      <OverdueSection />

      {/* ============================================ */}
      {/* SECTION 2: Pending Acceptance (Admin only)   */}
      {/* ============================================ */}
      {user.role === "admin" && (
        <SectionWithIcon
          icon={<ClipboardList className="h-5 w-5 text-blue-600" />}
          title="Pending Acceptance"
          description="Tasks assigned but not yet accepted by team members"
        >
          <TaskList user={user} filterStatus="assigned" />
        </SectionWithIcon>
      )}

      {/* ============================================ */}
      {/* SECTION 3: Awaiting Review (Admin only)      */}
      {/* ============================================ */}
      {user.role === "admin" && (
        <SectionWithIcon
          icon={<Send className="h-5 w-5 text-purple-600" />}
          title="Awaiting Review"
          description="Work submitted and waiting for your approval"
        >
          <TaskList user={user} filterStatus="submitted" />
        </SectionWithIcon>
      )}

      {/* ============================================ */}
      {/* SECTION 4: In Progress                       */}
      {/* ============================================ */}
      <SectionWithIcon
        icon={<CheckCircle2 className="h-5 w-5 text-amber-600" />}
        title="In Progress"
        description="Tasks that have been accepted and are being worked on"
      >
        <TaskList user={user} filterStatus="accepted" />
      </SectionWithIcon>

      {/* ============================================ */}
      {/* SECTION 5: Recently Completed                */}
      {/* ============================================ */}
      <SectionWithIcon
        icon={<Trophy className="h-5 w-5 text-green-600" />}
        title="Recently Completed"
        description="Approved and completed work"
      >
        <TaskList user={user} filterStatus="completed" />
      </SectionWithIcon>

      {/* ============================================ */}
      {/* SECTION 6: All Tasks (full list)             */}
      {/* ============================================ */}
      <div className="space-y-4 border-t pt-8">
        <h2 className="text-lg font-semibold">All Tasks</h2>
        <TaskList user={user} />
      </div>
    </div>
  );
}

/**
 * Helper component for section headers with icons.
 */
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
