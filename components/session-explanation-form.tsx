// ============================================================
// Execution Tracker — Session Explanation Form (Member)
// ============================================================
// Renders when a session has ended with a gap between its counted
// duration and its logged entries. The member describes what they
// did, why they didn't log, and how long they actually worked.
// The declaration goes into the admin review queue.
//
// Defensive guard: if the session ran for less than 1 minute, the
// form cannot be satisfied (declared minutes must be >= 1 and
// <= elapsed minutes). Render a placeholder instead of a broken form.
// ============================================================

"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Send } from "lucide-react";

interface UnexplainedSession {
  id: string;
  started_at: string;
  ended_at: string;
  end_reason: string | null;
  counted_minutes: number | null;
  entry_total_minutes: number;
  gap_minutes: number;
}

interface Props {
  pieId: string;
  session: UnexplainedSession;
}

function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function SessionExplanationForm({ pieId, session }: Props) {
  const router = useRouter();
  const [whatText, setWhatText] = useState("");
  const [whyText, setWhyText] = useState("");
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const elapsedMs =
    new Date(session.ended_at).getTime() - new Date(session.started_at).getTime();
  const elapsedMinutes = Math.max(0, Math.floor(elapsedMs / 60000));

  // ------------------------------------------------------------
  // Defensive guard: a session under 1 minute cannot be explained.
  // The minimum declared time is 1 minute, and it cannot exceed the
  // session's elapsed minutes. If elapsed is 0, the form is impossible.
  // ------------------------------------------------------------
  if (elapsedMinutes < 1) {
    return (
      <Card className="border-gray-200 bg-gray-50/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-gray-700">
            <AlertTriangle className="h-4 w-4" />
            A session was too short to explain
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-gray-700">
            A session started at {fmtDateTime(session.started_at)} and ended
            less than a minute later. There is nothing to explain — it did
            not count, and it does not need to.
          </p>
          <p className="text-xs text-gray-600">
            If this was a mistake, no action is needed. If you actually worked
            during this period, the work is lost and cannot be recovered.
            Start a new session the next time you begin working.
          </p>
        </CardContent>
      </Card>
    );
  }

  const maxHours = Math.floor(elapsedMinutes / 60);
  const maxMinutes = elapsedMinutes % 60;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const what = whatText.trim();
    const why = whyText.trim();

    if (!what) {
      setError("Tell us what you worked on");
      return;
    }
    if (!why) {
      setError("Tell us why you didn't log an entry");
      return;
    }

    const declaredMinutes = hours * 60 + minutes;
    if (declaredMinutes < 1) {
      setError("Declare at least one minute");
      return;
    }
    if (declaredMinutes > elapsedMinutes) {
      setError(
        `You cannot declare more than the session's ${elapsedMinutes} elapsed minutes`
      );
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(
        `/api/pies/${pieId}/work-sessions/${session.id}/explain`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            explanation: `${what}\n\nWhy not logged: ${why}`,
            declared_minutes: declaredMinutes,
          }),
        }
      );
      const json = await response.json();
      if (!response.ok) {
        setError(json.error || "Failed to submit explanation");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-amber-800">
          <AlertTriangle className="h-4 w-4" />
          A session needs your explanation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border bg-white p-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Started</span>
            <span className="tabular-nums">
              {fmtDateTime(session.started_at)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Ended</span>
            <span className="tabular-nums">
              {fmtDateTime(session.ended_at)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Elapsed</span>
            <span className="tabular-nums">{fmtDuration(elapsedMinutes)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Logged entries</span>
            <span className="tabular-nums">
              {fmtDuration(session.entry_total_minutes)}
            </span>
          </div>
          {session.gap_minutes > 0 && (
            <div className="flex justify-between border-t pt-1 font-medium">
              <span>Gap</span>
              <span className="tabular-nums text-amber-700">
                {fmtDuration(session.gap_minutes)}
              </span>
            </div>
          )}
        </div>

        <p className="text-sm text-amber-800">
          Your explanation goes to the admin for review. Nothing is added to
          your slice count until they approve it.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              What did you work on? *
            </label>
            <Textarea
              value={whatText}
              onChange={(e) => {
                setWhatText(e.target.value);
                setError(null);
              }}
              placeholder="e.g., Reviewed the login flow and fixed the redirect bug"
              rows={3}
              className="resize-none bg-white"
              disabled={busy}
              maxLength={1000}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Why didn&apos;t you log an entry? *
            </label>
            <Textarea
              value={whyText}
              onChange={(e) => {
                setWhyText(e.target.value);
                setError(null);
              }}
              placeholder="e.g., Phone browser crashed from low memory and I couldn't reopen the tab"
              rows={2}
              className="resize-none bg-white"
              disabled={busy}
              maxLength={1000}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              How long did you actually work? *
            </label>
            <div className="flex items-center gap-2">
              <select
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
                className="flex h-10 rounded-md border border-input bg-white px-3 py-2 text-sm"
                disabled={busy}
              >
                {Array.from({ length: maxHours + 1 }, (_, i) => (
                  <option key={i} value={i}>
                    {i}h
                  </option>
                ))}
              </select>
              <select
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
                className="flex h-10 rounded-md border border-input bg-white px-3 py-2 text-sm"
                disabled={busy}
              >
                {[0, 15, 30, 45].map((m) => (
                  <option key={m} value={m}>
                    {m}m
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground">
                (max {fmtDuration(elapsedMinutes)})
              </span>
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" disabled={busy}>
            <Send className="mr-2 h-4 w-4" />
            {busy ? "Submitting…" : "Submit for review"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
