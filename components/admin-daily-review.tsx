// ============================================================
// Execution Tracker — Admin Daily Review Panel
// ============================================================
// Lists today's sessions grouped by participant. Each group has an
// Approve-day button (bulk approves every pending log by that person
// today) and per-session flag/reject actions.
// ============================================================

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Flag, ClipboardCheck } from "lucide-react";

interface Entry {
  id: string;
  logged_at: string;
  minutes: number;
  description: string;
}

interface Session {
  id: string;
  participant_id: string;
  participant_name: string;
  participant_role: string | null;
  started_at: string;
  ended_at: string | null;
  end_reason: string | null;
  counted_minutes: number | null;
  entries: Entry[];
}

interface TimeLog {
  id: string;
  work_date: string;
  hours: number;
  notes: string | null;
  review_status: "pending" | "approved" | "flagged" | "void";
  review_note: string | null;
  session_id: string | null;
  participant_id: string;
}

interface Props {
  pieId: string;
}

const REVIEW_STATUS_LABEL: Record<TimeLog["review_status"], string> = {
  pending: "Pending",
  approved: "Approved",
  flagged: "Flagged",
  void: "Voided",
};

const REVIEW_STATUS_CLASS: Record<TimeLog["review_status"], string> = {
  pending: "bg-gray-100 text-gray-700 border-gray-300",
  approved: "bg-green-100 text-green-700 border-green-300",
  flagged: "bg-amber-100 text-amber-700 border-amber-300",
  void: "bg-red-100 text-red-700 border-red-300",
};

export function AdminDailyReview({ pieId }: Props) {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [flaggingId, setFlaggingId] = useState<string | null>(null);
  const [flagNote, setFlagNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      const [sessRes, logsRes] = await Promise.all([
        fetch(`/api/pies/${pieId}/work-sessions/today`, { cache: "no-store" }),
        fetch(`/api/pies/${pieId}/time-logs`, { cache: "no-store" }),
      ]);
      const sessJson = sessRes.ok ? await sessRes.json() : { data: [] };
      const logsJson = logsRes.ok ? await logsRes.json() : { data: [] };
      setSessions(sessJson.data ?? []);
      setLogs(logsJson.data ?? []);
    } finally {
      setIsLoading(false);
    }
  }, [pieId]);

  useEffect(() => {
    load();
  }, [load]);

  async function review(
    logId: string,
    action: "approve" | "flag" | "reject",
    note?: string
  ) {
    setBusy(logId);
    setError(null);
    try {
      const response = await fetch(`/api/pies/${pieId}/time-logs/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ log_id: logId, action, review_note: note }),
      });
      const json = await response.json();
      if (!response.ok) {
        setError(json.error || "Failed to record review");
        return;
      }
      setRejectingId(null);
      setRejectNote("");
      setFlaggingId(null);
      setFlagNote("");
      await load();
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function approveDayFor(participantId: string) {
    const pending = logs.filter(
      (l) => l.participant_id === participantId && l.review_status === "pending"
    );
    for (const log of pending) {
      await review(log.id, "approve");
    }
  }

  if (isLoading) return null;
  if (sessions.length === 0 && logs.length === 0) return null;

  // Group sessions by participant
  const sessionsByParticipant = new Map<string, Session[]>();
  for (const s of sessions) {
    const list = sessionsByParticipant.get(s.participant_id) ?? [];
    list.push(s);
    sessionsByParticipant.set(s.participant_id, list);
  }

  const participants = Array.from(sessionsByParticipant.keys());

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-indigo-600" />
          Today&apos;s work
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        {participants.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No sessions today yet.
          </p>
        )}

        {participants.map((pid) => {
          const pSessions = sessionsByParticipant.get(pid) ?? [];
          const name = pSessions[0]?.participant_name ?? "Unknown";
          const role = pSessions[0]?.participant_role ?? null;
          const pLogs = logs.filter((l) => l.participant_id === pid);
          const pendingCount = pLogs.filter((l) => l.review_status === "pending").length;

          return (
            <div key={pid} className="space-y-3 border-t pt-4 first:border-t-0 first:pt-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{name}</p>
                  {role && (
                    <Badge variant="outline" className="text-xs capitalize">
                      {role}
                    </Badge>
                  )}
                </div>
                {pendingCount > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => approveDayFor(pid)}
                    disabled={busy !== null}
                  >
                    <CheckCircle className="h-3.5 w-3.5 mr-1" />
                    Approve day ({pendingCount})
                  </Button>
                )}
              </div>

              {/* Sessions */}
              {pSessions.map((s) => (
                <div key={s.id} className="rounded-md border bg-muted/30 p-3 text-sm space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="tabular-nums text-muted-foreground">
                      {new Date(s.started_at).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                      {" → "}
                      {s.ended_at
                        ? new Date(s.ended_at).toLocaleTimeString("en-US", {
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : "in progress"}
                    </span>
                    {s.ended_at ? (
                      <Badge variant="outline" className="text-xs">
                        {s.end_reason === "manual" ? "Stopped" : `Auto: ${s.end_reason}`}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300 text-xs">
                        Active
                      </Badge>
                    )}
                  </div>
                  {s.entries.map((e) => (
                    <p key={e.id} className="text-sm whitespace-pre-wrap">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {new Date(e.logged_at).toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                        {" · "}
                      </span>
                      {e.description}
                    </p>
                  ))}
                </div>
              ))}

              {/* Time logs pending review */}
              {pLogs.length > 0 && (
                <div className="space-y-2">
                  {pLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-medium tabular-nums">
                          {log.work_date} · {Number(log.hours).toFixed(2)}h
                        </p>
                        {log.notes && (
                          <p className="text-xs text-muted-foreground">
                            {log.notes}
                          </p>
                        )}
                        {log.review_note && (
                          <p className="mt-1 text-xs text-amber-700">
                            Note: {log.review_note}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          variant="outline"
                          className={`text-xs ${REVIEW_STATUS_CLASS[log.review_status]}`}
                        >
                          {REVIEW_STATUS_LABEL[log.review_status]}
                        </Badge>
                        {log.review_status === "pending" && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy === log.id}
                              onClick={() => review(log.id, "approve")}
                              title="Approve"
                            >
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy === log.id}
                              onClick={() => setFlaggingId(log.id)}
                              title="Flag for review"
                            >
                              <Flag className="h-4 w-4 text-amber-600" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy === log.id}
                              onClick={() => setRejectingId(log.id)}
                              title="Reject"
                            >
                              <XCircle className="h-4 w-4 text-red-600" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Inline flag/reject forms */}
              {pLogs.map((log) => {
                if (rejectingId !== log.id && flaggingId !== log.id) return null;
                const isReject = rejectingId === log.id;
                return (
                  <div
                    key={`form-${log.id}`}
                    className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3"
                  >
                    <p className="text-sm font-medium">
                      {isReject ? "Reject this log?" : "Flag this log for follow-up"}
                    </p>
                    <Textarea
                      value={isReject ? rejectNote : flagNote}
                      onChange={(e) =>
                        isReject
                          ? setRejectNote(e.target.value)
                          : setFlagNote(e.target.value)
                      }
                      placeholder={
                        isReject
                          ? "Explain why this time does not count"
                          : "What question do you have for the member?"
                      }
                      rows={2}
                      className="resize-none bg-white"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={isReject ? "destructive" : "default"}
                        disabled={
                          busy === log.id ||
                          (isReject ? !rejectNote.trim() : !flagNote.trim())
                        }
                        onClick={() =>
                          review(
                            log.id,
                            isReject ? "reject" : "flag",
                            isReject ? rejectNote.trim() : flagNote.trim()
                          )
                        }
                      >
                        {isReject ? "Confirm reject" : "Confirm flag"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRejectingId(null);
                          setRejectNote("");
                          setFlaggingId(null);
                          setFlagNote("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
