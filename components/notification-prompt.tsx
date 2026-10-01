// ============================================================
// Execution Tracker — Notification Permission Prompt
// ============================================================

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";

/**
 * Read the initial notification permission synchronously.
 * Runs once during the first render — no effect, no setState-in-effect.
 * Returns "default" during SSR so server and client render match.
 */
function getInitialPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined") return "default";
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export function NotificationPrompt() {
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >(getInitialPermission);
  const [dismissed, setDismissed] = useState(false);

  async function requestPermission() {
    const result = await Notification.requestPermission();
    setPermission(result);
  }

  // Don't show if unsupported, already granted, or dismissed
  if (
    permission === "granted" ||
    permission === "unsupported" ||
    dismissed
  ) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-lg">
      <div className="flex items-start gap-3">
        <Bell className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-amber-800">
            Get evening reminders
          </p>
          <p className="text-xs text-amber-700 mt-0.5">
            We&apos;ll remind you if you haven&apos;t checked in by 5 PM.
          </p>
          <div className="flex items-center gap-2 mt-3">
            <Button
              size="sm"
              variant="outline"
              className="bg-white text-xs h-7"
              onClick={requestPermission}
            >
              Enable
            </Button>
            <button
              onClick={() => setDismissed(true)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
