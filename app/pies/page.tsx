// ============================================================
// Execution Tracker — Slicing Pie: Pies List Page
// ============================================================
// Admin-only index of all Pies with a create form. Each Pie links to
// its dashboard (cap table, contributions, well, settings).
// ============================================================

import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase";
import { PieCreateForm } from "@/components/pie-create-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PieChart, ArrowRight, BookOpen } from "lucide-react";
import type { Pie } from "@/types/slicing-pie";

export default async function PiesPage() {
  await requireAdmin();

  const supabase = await createClient();
  const { data } = await supabase
    .from("pies")
    .select("*")
    .order("created_at", { ascending: false });

  const pies: Pie[] = data || [];

  const statusVariant: Record<Pie["status"], "default" | "secondary" | "outline"> = {
    setup: "outline",
    active: "default",
    frozen: "secondary",
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <PieChart className="h-6 w-6" />
          <h1 className="text-3xl font-bold tracking-tight">Slicing Pie</h1>
        </div>
        <p className="mt-1 text-muted-foreground">
          Track dynamic equity splits based on at-risk contributions.
        </p>
        {/* The manual lives here, at the top of the admin's own screen, and
            not buried in the navbar — the moment a founder needs it is the
            moment they are looking at this page wondering what to do next. */}
        <Link
          href="/help"
          className="mt-3 inline-flex items-center gap-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <BookOpen className="h-4 w-4" />
          New to this? Read the guide — how the system works, and what to do
          when
        </Link>
      </div>

      <PieCreateForm />

      {/* Pies list */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">All Pies ({pies.length})</h2>

        {pies.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              No Pies yet. Create one above to get started.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {pies.map((pie) => (
              <Link key={pie.id} href={`/pies/${pie.id}`} className="block">
                <Card className="transition-colors hover:bg-accent">
                  <CardContent className="flex items-center justify-between py-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{pie.name}</span>
                        <Badge
                          variant={statusVariant[pie.status]}
                          className="text-xs capitalize"
                        >
                          {pie.status}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {pie.currency} ·{" "}
                        {new Date(pie.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
