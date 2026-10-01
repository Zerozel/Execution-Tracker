// ============================================================
// Execution Tracker — Slicing Pie: Self-Service Time Log
// ============================================================

"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Cloud, CloudOff, RefreshCw } from "lucide-react";
import {
  enqueue,
  flush,
  pendingCount,
  registerAutoFlush,
  isOnline as outboxOnline,
} from "@/lib/slicing-pie/client/time-log-outbox";
import type { TimeLog } from "@/types/time-tracking";

interface Props {
  pieId: string;
  projectTags: string[];
  frozen: boolean;
}

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

export function TimeLogPanel({ pieId, projectTags, frozen }: Props) {
  const [hours, setHours] = useState("");
  const [workDate, setWorkDate] = useState(todayStr());
  const [projectTag, setProjectTag] = useState("");
  const [notes, setNotes] = useState("");

  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);
  const [recent, setRecent] = useState<TimeLog[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshRecent = useCallback(async () => {
    try {
      const res = await fetch(`/api/pies/${pieId}/time-logs`, {
        cache: "no-store",
      });
      if (res.ok) {
        const json = await res.json();
        setRecent((json.data ?? []).slice(0, 8));
      }
    } catch {
      // offline — keep whatever we have
    }
  }, [pieId]);

  const refreshQueued = useCallback(async () => {
    setQueued(await pendingCount(pieId));
  }, [pieId]);

  useEffect(() => {
    // Sync with browser online state on mount — external system subscription.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOnline(outboxOnline());
    const onUp = () => setOnline(true);
    const onDown = () => setOnline(false);
    window.addEventListener("online", onUp);
    window.addEventListener("offline", onDown);

    const unregister = registerAutoFlush(pieId, (r) => {
      if (r.synced > 0) {
        setMessage(
          `Synced ${r.synced} queued log${r.synced === 1 ? "" : "s"}.`
        );
        refreshRecent();
      }
      refreshQueued();
    });

    refreshRecent();
    refreshQueued();

    return () => {
      window.removeEventListener("online", onUp);
      window.removeEventListener("offline", onDown);
      unregister();
    };
  }, [pieId, refreshRecent, refreshQueued]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const h = Number(hours);
    if (!Number.isFinite(h) || h <= 0 || h > 24) {
      setError("Enter hours between 0 and 24.");
      return;
    }

    setBusy(true);

    await enqueue(pieId, {
      work_date: workDate || todayStr(),
      hours: h,
      project_tag: projectTag || undefined,
      notes: notes.trim() || undefined,
    });
    await refreshQueued();

    if (outboxOnline()) {
      const r = await flush(pieId);
      if (r.synced > 0) {
        setMessage("Time logged and synced.");
        await refreshRecent();
      } else if (r.remaining > 0) {
        setMessage("Saved locally — will sync when connection returns.");
      }
    } else {
      setMessage("You're offline. Saved locally — will sync automatically.");
    }

    await refreshQueued();
    setHours("");
    setNotes("");
    setBusy(false);
  }

  async function manualSync() {
    setBusy(true);
    setError(null);
    const r = await flush(pieId);
    setMessage(
      r.synced > 0
        ? `Synced ${r.synced} log${r.synced === 1 ? "" : "s"}.`
        : r.remaining > 0
        ? "Still offline or server unreachable."
        : "Nothing to sync."
    );
    await refreshQueued();
    await refreshRecent();
    setBusy(false);
  }

  if (frozen) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          This Pie is frozen — time logging is closed.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            {online ? (
              <>
                <Cloud className="h-4 w-4 text-emerald-600" />
                <span className="text-emerald-700">Online</span>
              </>
            ) : (
              <>
                <CloudOff className="h-4 w-4 text-amber-600" />
                <span className="text-amber-700">
                  Offline — logging still works
                </span>
              </>
            )}
          </div>
          {queued > 0 && (
            <button
              type="button"
              onClick={manualSync}
              disabled={busy || !online}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className="h-3 w-3" />
              {queued} pending sync
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 border-t pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Hours *</label>
              <Input
                type="number"
                min="0"
                max="24"
                step="0.25"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="e.g. 6.5"
                disabled={busy}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Date</label>
              <Input
                type="date"
                value={workDate}
                max={todayStr()}
                onChange={(e) => setWorkDate(e.target.value)}
                disabled={busy}
              />
            </div>
          </div>

          {projectTags.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Project</label>
              <select
                value={projectTag}
                onChange={(e) => setProjectTag(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                disabled={busy}
              >
                <option value="">No project tag</option>
                {projectTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Notes</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What did you work on?"
              disabled={busy}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Hours become equity slices at the next payday, using your
            fair-market salary. Logs are saved on your device first, so this
            works even with no connection.
          </p>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="text-sm text-emerald-700" role="status">
              {message}
            </p>
          )}

          <Button type="submit" disabled={busy}>
            <Clock className="mr-2 h-4 w-4" />
            {busy ? "Saving…" : "Log Time"}
          </Button>
        </form>

        {recent.length > 0 && (
          <div className="space-y-2 border-t pt-4">
            <p className="text-sm font-medium">Recent logs</p>
            <div className="space-y-1.5">
              {recent.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="tabular-nums text-muted-foreground">
                    {log.work_date}
                  </span>
                  <span className="font-medium tabular-nums">
                    {Number(log.hours)}h
                  </span>
                  <Badge
                    variant={
                      log.status === "converted" ? "default" : "outline"
                    }
                    className="text-xs capitalize"
                  >
                    {log.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
