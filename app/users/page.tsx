// ============================================================
// Execution Tracker — User Management Page (With Daily Plans)
// ============================================================

import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase";
import { UserList } from "@/components/user-list";
import { UserCreateForm } from "@/components/user-create-form";
import { UserReliabilitySummary } from "@/components/user-reliability-summary";
import { TeamDailyPlans } from "@/components/team-daily-plans";
import { DailyPlanHeatmap } from "@/components/daily-plan-heatmap";
import { Users } from "lucide-react";
import type { User } from "@/types";

export default async function UsersPage() {
  await requireAdmin();

  const supabase = await createClient();
  const { data: users } = await supabase
    .from("users")
    .select("id, nickname, display_name, role, is_archived, created_at")
    .order("display_name", { ascending: true });

  const allUsers: User[] = users || [];
  const activeUsers = allUsers.filter((u) => !u.is_archived);
  const archivedUsers = allUsers.filter((u) => u.is_archived);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* Page Header */}
      <div>
        <div className="flex items-center gap-2">
          <Users className="h-6 w-6" />
          <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
        </div>
        <p className="mt-1 text-muted-foreground">
          Create and manage team member accounts
        </p>
      </div>

      {/* ============================================ */}
      {/* SECTION: Team Daily Plans (Today)            */}
      {/* ============================================ */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Today&apos;s Plans</h2>
          <p className="text-sm text-muted-foreground">
            What each team member committed to today
          </p>
        </div>
        <TeamDailyPlans />
      </div>

      {/* ============================================ */}
      {/* SECTION: Engagement Heat Map                 */}
      {/* ============================================ */}
      <DailyPlanHeatmap />

      {/* ============================================ */}
      {/* SECTION: Team Reliability Summary            */}
      {/* ============================================ */}
      <UserReliabilitySummary />

      {/* ============================================ */}
      {/* SECTION: Create User Form                    */}
      {/* ============================================ */}
      <UserCreateForm />

      {/* ============================================ */}
      {/* SECTION: Active Users                        */}
      {/* ============================================ */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">
            Active Users ({activeUsers.length})
          </h2>
          <p className="text-sm text-muted-foreground">
            Team members who can log in and use the platform
          </p>
        </div>
        <UserList users={activeUsers} />
      </div>

      {/* ============================================ */}
      {/* SECTION: Archived Users                      */}
      {/* ============================================ */}
      {archivedUsers.length > 0 && (
        <div className="space-y-4 border-t pt-8">
          <div>
            <h2 className="text-lg font-semibold">
              Archived Users ({archivedUsers.length})
            </h2>
            <p className="text-sm text-muted-foreground">
              These users cannot log in but their task history is preserved
            </p>
          </div>
          <UserList users={archivedUsers} isArchived />
        </div>
      )}
    </div>
  );
}
