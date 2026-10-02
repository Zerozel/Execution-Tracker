// ============================================================
// Execution Tracker — Work Session Panel (Member)
// ============================================================
// The member's home for logging work. Handles:
//   • Sessions awaiting explanation (renders one prompt per session)
//   • No active session  → "Start working" button
//   • Active session     → timer, entry form with duration, entries
//   • Warning banner     → when 90m have passed since last heartbeat
//   • Stop confirmation  → when stopping with no entries
//
// Heartbeat: a setInterval fires every 60 minutes.
// ============================================================

"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Play, Square, AlertTriangle, Send } from "lucide-react";
import { SessionExplanationForm } from "@/components/session-explanation-form";

interface Entry {
  id: string;
  logged_at: string;
  minutes: number;
  description: string;
}

interface Session {
  id: string;
  started_at: string;
  last_heartbeat_at: string;
  last_entry_at: string | null;
}

interface UnexplainedSession {
  id: string;
  started_at: string;
  ended_at: string;
  end_reason: string | null;
  counted_minutes: number | null;
  entry_total_minutes: number;
  gap_minutes: number;
}

interface ActiveResponse {
  active: Session | null;
  entries: Entry[];
  awaiting_explanation: UnexplainedSession[];
}

interface Props {
  pieId: string;
  projectTags: string[];
  frozen: boolean;
}

const HEARTBEAT_INTERVAL_MS = 60 * 60 * 1000;      // 60 minutes
const WARNING_THRESHOLD_MS = 90 * 60 * 1000;        // 90 minutes
const TIMEOUT_THRESHOLD_MS = 2 * 60 * 60 * 1000;    // 2 hours
const TICK_MS = 30 * 1000;

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];

function fmtDuration(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function WorkSessionPanel({ pieId, projectTags, frozen }: Props) {
  const router = useRouter();
  const [active, setActive] = useState<Session | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [awaiting, setAwaiting] = useState<UnexplainedSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const [entryText, setEntryText] = useState("");
  const [entryMinutes, setEntryMinutes] = useState(60);
  const [confirmStop, setConfirmStop] = useState(false);

  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadActive = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/pies/${pieId}/work-sessions/active`, {
        cache: "no-store",
      });
      if (!response.ok) {
        if (response.status === 401) return;
        throw new Error("Failed to load session");
      }
      const json: { data: ActiveResponse } = await response.json();
      setActive(json.data.active);
      setEntries(json.data.entries ?? []);
      setAwaiting(json.data.awaiting_explanation ?? []);
    } catch {
      // offline — keep previous
    } finally {
      setIsLoading(false);
    }
  }, [pieId]);

  useEffect(() => {
    loadActive();
  }, [loadActive]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!active) return;

    heartbeatRef.current = setInterval(async () => {
      try {
        await fetch(
          `/api/pies/${pieId}/work-sessions/${active.id}/heartbeat`,
          { method: "POST" }
        );
        setActive((s) =>
          s ? { ...s, last_heartbeat_at: new Date().toISOString() } : s
        );
      } catch {
        // offline — retry on next tick
      }
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [pieId, active]);

  async function handleStart() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/pies/${pieId}/work-sessions/start`, {
        method: "POST",
      });
      const json = await response.json();
      if (!response.ok) {
        setError(json.error || "Failed to start session");
        return;
      }
      await loadActive();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!active) return;
    if (!entryText.trim()) {
      setError("Please describe what you are working on");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/pies/${pieId}/work-sessions/${active.id}/entry`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: entryText.trim(),
            minutes: entryMinutes,
          }),
        }
      );
      const json = await response.json();
      if (!response.ok) {
        setError(json.error || "Failed to log entry");
        return;
      }
      setEntryText("");
      await loadActive();
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function doStop() {
    if (!active) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/pies/${pieId}/work-sessions/${active.id}/stop`,
        { method: "POST" }
      );
      const json = await response.json();
      if (!response.ok) {
        setError(json.error || "Failed to stop session");
        return;
      }
      setConfirmStop(false);
      await loadActive();
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function handleStopClick() {
    if (!active) return;
    // If there are no entries, ask for confirmation.
    if (entries.length === 0) {
      setConfirmStop(true);
      return;
    }
    doStop();
  }

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardContent className="min-h-[80px] py-6" />
      </Card>
    );
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

  // Explanation prompts render above everything else.
  const explanationPrompts = awaiting.map((s) => (
    <SessionExplanationForm key={s.id} pieId={pieId} session={s} />
  ));

  // No active session — show start button (plus any explanations).
  if (!active) {
    return (
      <div className="space-y-4">
        {explanationPrompts}
        <Card>
          <CardContent className="space-y-4 pt-6">
            <p className="text-sm text-muted-foreground">
              Start a session when you begin working. Log an entry every hour so
              your time is evidence-backed. The session ends automatically two
              hours after your last check-in.
            </p>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <Button onClick={handleStart} disabled={busy}>
              <Play className="mr-2 h-4 w-4" />
              {busy ? "Starting…" : "Start working"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Active session rendering.
  const startedMs = new Date(active.started_at).getTime();
  const lastHbMs = new Date(active.last_heartbeat_at).getTime();
  const elapsed = now - startedMs;
  const sinceHeartbeat = now - lastHbMs;
  const showWarning = sinceHeartbeat > WARNING_THRESHOLD_MS;
  const nearTimeout = sinceHeartbeat > TIMEOUT_THRESHOLD_MS - 15 * 60 * 1000;
  const nextHeartbeatIn = Math.max(0, HEARTBEAT_INTERVAL_MS - sinceHeartbeat);

  return (
    <div className="space-y-4">
      {explanationPrompts}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-emerald-600" />
            Working now
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Started</p>
              <p className="font-medium tabular-nums">
                {fmtTime(active.started_at)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Elapsed</p>
              <p className="font-medium tabular-nums">{fmtDuration(elapsed)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Next check-in</p>
              <p className="font-medium tabular-nums">
                in {fmtDuration(nextHeartbeatIn)}
              </p>
            </div>
          </div>

          {showWarning && (
            <div
              className={`flex items-start gap-2 rounded-md border p-3 ${
                nearTimeout
                  ? "border-red-200 bg-red-50 text-red-800"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              }`}
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="text-sm">
                {nearTimeout
                  ? "This session will end soon. Submit an entry to keep it alive."
                  : "We have not heard from this tab in a while. Submit an entry to keep working."}
              </p>
            </div>
          )}

          {entries.length > 0 && (
            <div className="space-y-1.5 border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground">
                Logged so far
              </p>
              {entries.map((e) => (
                <div key={e.id} className="flex items-start gap-2 text-sm">
                  <span className="tabular-nums text-muted-foreground shrink-0">
                    {fmtTime(e.logged_at)}
                  </span>
                  <span className="flex-1 whitespace-pre-wrap">
                    {e.description}
                  </span>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {e.minutes}m
                  </Badge>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleEntry} className="space-y-3 border-t pt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                What are you working on?
              </label>
              <Textarea
                value={entryText}
                onChange={(e) => {
                  setEntryText(e.target.value);
                  setError(null);
                }}
                placeholder="e.g., Reviewed the login flow and fixed the redirect bug"
                rows={3}
                className="resize-none"
                disabled={busy}
                maxLength={1000}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Duration</label>
              <select
                value={entryMinutes}
                onChange={(e) => setEntryMinutes(Number(e.target.value))}
                className="flex h-10 w-full max-w-[160px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                disabled={busy}
              >
                {DURATION_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m} minutes
                  </option>
                ))}
              </select>
            </div>

            {projectTags.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Project (optional)
                </label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  disabled={busy}
                >
                  <option value="">No tag</option>
                  {projectTags.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            {confirmStop ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2">
                <p className="text-sm text-amber-800">
                  This session has no entries. If you stop now, it will count
                  zero minutes. Are you sure?
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={doStop}
                    disabled={busy}
                  >
                    {busy ? "Stopping…" : "Yes, stop anyway"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setConfirmStop(false)}
                    disabled={busy}
                  >
                    Go back
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy}>
                  <Send className="mr-2 h-4 w-4" />
                  {busy ? "Saving…" : "Log entry"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleStopClick}
                  disabled={busy}
                >
                  <Square className="mr-2 h-4 w-4" />
                  Stop working
                </Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
