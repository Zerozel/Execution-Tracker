// ============================================================
// Execution Tracker — My Time (Member Self-Service)
// ============================================================
// The member's home for logging hours. Finds every Pie the current
// user participates in and renders a work-session panel plus a
// history of their own logs with review status. Available to ALL
// authenticated users (not just admins).
// ============================================================

import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase";
import { resolvePieConfig } from "@/lib/slicing-pie/server/context";
import { WorkSessionPanel } from "@/components/work-session-panel";
import { MemberLogHistory } from "@/components/member-log-history";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";
import type { Pie, PieParticipant } from "@/types/slicing-pie";

export default async function MyTimePage() {
  const user = await requireAuth();
  const supabase = await createClient();

  // Which Pies is this user a participant in?
  const { data: participantRows } = await supabase
    .from("pie_participants")
    .select("id, pie_id, display_name, pie_role, status")
    .eq("user_id", user.id);

  const participants = (participantRows ?? []) as Pick<
    PieParticipant,
    "id" | "pie_id" | "display_name" | "pie_role" | "status"
  >[];

  if (participants.length === 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Time</h1>
          <p className="mt-1 text-muted-foreground">
            Log the hours you work — they become equity at payday.
          </p>
        </div>
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            You&apos;re not part of any equity Pie yet. An administrator needs
            to add you as a participant before you can log time.
          </CardContent>
        </Card>
      </div>
    );
  }

  const pieIds = Array.from(new Set(participants.map((p) => p.pie_id)));
  const { data: piesData } = await supabase
    .from("pies")
    .select("*")
    .in("id", pieIds);
  const pies = (piesData ?? []) as Pie[];

  const pieConfigs = await Promise.all(
    pies.map(async (pie) => {
      const { settings } = await resolvePieConfig(pie.id);
      return { pie, projectTags: settings.project_tags };
    })
  );

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <Clock className="h-7 w-7" />
          My Time
        </h1>
        <p className="mt-1 text-muted-foreground">
          Start a session when you begin working. Log what you did every
          hour. The session ends automatically two hours after your last
          check-in. Every session goes to the admin for review before it
          becomes equity slices at payday.
        </p>
      </div>

      {pieConfigs.map(({ pie, projectTags }) => {
        const membership = participants.find((p) => p.pie_id === pie.id);
        return (
          <section key={pie.id} className="space-y-3">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold">{pie.name}</h2>
              {membership && (
                <Badge variant="outline" className="text-xs capitalize">
                  {membership.pie_role}
                </Badge>
              )}
              {pie.status === "frozen" && (
                <Badge variant="secondary" className="text-xs">
                  Frozen
                </Badge>
              )}
            </div>
            <WorkSessionPanel
              pieId={pie.id}
              projectTags={projectTags}
              frozen={pie.status === "frozen"}
            />
            <MemberLogHistory pieId={pie.id} />
          </section>
        );
      })}
    </div>
  );
}
