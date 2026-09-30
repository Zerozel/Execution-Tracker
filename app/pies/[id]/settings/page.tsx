// ============================================================
// Execution Tracker — Slicing Pie: Settings Console (Admin page)
// ============================================================
// The admin-only screen for the rules that govern this Pie. Loads the
// resolved settings (what is actually in force today), the shipped
// defaults, and the full version history, then hands them to the
// console, which renders every control from SETTING_DESCRIPTORS.
//
// Admin only: the rules reveal how the Pie is valued, and decision D1
// keeps the Pie itself out of members' view.
// ============================================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase";
import { resolvePieConfig } from "@/lib/slicing-pie/server/context";
import { DEFAULT_PIE_SETTINGS } from "@/lib/slicing-pie/config/schema";
import { PieSettingsConsole } from "@/components/pie-settings-console";
import type { Pie } from "@/types/slicing-pie";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PieSettingsPage({ params }: PageProps) {
  await requireAdmin();
  const { id } = await params;

  const supabase = await createClient();
  const { data: pieData } = await supabase
    .from("pies")
    .select("*")
    .eq("id", id)
    .single();

  if (!pieData) notFound();
  const pie = pieData as Pie;

  // The settings actually in force today, plus every version ever saved.
  const { settings, versions } = await resolvePieConfig(id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href={`/pies/${id}`}
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {pie.name}
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-muted-foreground">
          The rules this Pie runs on. Every change is versioned and dated.
        </p>
      </div>

      <PieSettingsConsole
        pieId={id}
        currency={pie.currency}
        settings={settings}
        defaults={DEFAULT_PIE_SETTINGS}
        versions={versions}
      />
    </div>
  );
}
