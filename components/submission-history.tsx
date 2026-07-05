// ============================================================
// Execution Tracker — Submission History
// ============================================================

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";
import { CheckCircle, XCircle, Clock, FileText } from "lucide-react";
import type { SubmissionWithRelations, AuthUser } from "@/types";

interface SubmissionHistoryProps {
  taskId: string;
  currentUser: AuthUser;
}

export function SubmissionHistory({
  taskId,
  currentUser,
}: SubmissionHistoryProps) {
  const router = useRouter();
  const [submissions, setSubmissions] = useState<SubmissionWithRelations[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Rejection state
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionNote, setRejectionNote] = useState("");
  const [rejectionError, setRejectionError] = useState<string | null>(null);

  // Action loading state
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  async function fetchSubmissions() {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/tasks/${taskId}/submissions`);

      if (!response.ok) {
        throw new Error("Failed to fetch submissions");
      }

      const result = await response.json();
      setSubmissions(result.data || []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load submissions"
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchSubmissions();
  }, [taskId]);

  async function handleApprove(submissionId: string) {
    setActionLoading(submissionId);
    try {
      const response = await fetch(`/api/submissions/${submissionId}/approve`, {
        method: "POST",
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Failed to approve");
        return;
      }

      // Refresh data
      await fetchSubmissions();
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(submissionId: string) {
    if (!rejectionNote.trim()) {
      setRejectionError("Please provide a reason for rejection");
      return;
    }

    setActionLoading(submissionId);
    setRejectionError(null);

    try {
      const response = await fetch(`/api/submissions/${submissionId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewer_note: rejectionNote.trim() }),
      });

      const result = await response.json();

      if (!response.ok) {
        setRejectionError(result.error || "Failed to reject");
        return;
      }

      // Reset rejection state and refresh data
      setRejectingId(null);
      setRejectionNote("");
      await fetchSubmissions();
      router.refresh();
    } catch {
      setRejectionError("Network error. Please try again.");
    } finally {
      setActionLoading(null);
    }
  }

  // Status badge configuration
  function getStatusBadge(status: string) {
    switch (status) {
      case "pending":
        return (
          <Badge variant="secondary" className="gap-1">
            <Clock className="h-3 w-3" />
            Pending Review
          </Badge>
        );
      case "approved":
        return (
          <Badge variant="default" className="gap-1 bg-green-600">
            <CheckCircle className="h-3 w-3" />
            Approved
          </Badge>
        );
      case "rejected":
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" />
            Rejected
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="min-h-[150px] py-8">
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="animate-pulse space-y-2">
                <div className="h-4 w-3/4 rounded bg-gray-200" />
                <div className="h-3 w-1/2 rounded bg-gray-200" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="min-h-[150px] py-8">
          <div className="text-center">
            <p className="text-sm text-destructive">{error}</p>
            <button
              onClick={fetchSubmissions}
              className="mt-2 text-sm text-primary hover:underline"
            >
              Try again
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (submissions.length === 0) {
    return (
      <Card>
        <CardContent className="flex min-h-[150px] items-center justify-center py-8">
          <div className="text-center">
            <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium text-muted-foreground">
              No submissions yet
            </p>
            <p className="text-xs text-muted-foreground">
              Work submissions will appear here after you submit
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">
        Submission History ({submissions.length})
      </h2>
      {submissions.map((submission, index) => (
        <Card
          key={submission.id}
          className={
            submission.status === "approved"
              ? "border-green-200 bg-green-50/50"
              : submission.status === "rejected"
              ? "border-red-200 bg-red-50/50"
              : ""
          }
        >
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground">
                    Submission #{submissions.length - index}
                  </span>
                  {getStatusBadge(submission.status)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Submitted by{" "}
                  {submission.submitter?.display_name || "Unknown"}{" "}
                  on {formatDateTime(submission.created_at)}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Submission Description */}
            <div>
              <h4 className="text-sm font-medium text-muted-foreground">
                Work Description
              </h4>
              <p className="mt-1 text-sm whitespace-pre-wrap">
                {submission.description || "No description provided"}
              </p>
            </div>

            {/* Evidence URL */}
            {submission.evidence_url && (
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">
                  Evidence
                </h4>
                <a
                  href={submission.evidence_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-sm text-primary hover:underline break-all"
                >
                  {submission.evidence_url}
                </a>
              </div>
            )}

            {/* Reviewer Info (for approved/rejected) */}
            {(submission.status === "approved" ||
              submission.status === "rejected") && (
              <div className="rounded-md bg-white p-3 border">
                <div className="flex items-center gap-2">
                  {submission.status === "approved" ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600" />
                  )}
                  <span className="text-sm font-medium">
                    {submission.status === "approved" ? "Approved" : "Rejected"}{" "}
                    by {submission.reviewer?.display_name || "Unknown"}
                  </span>
                  {submission.reviewed_at && (
                    <span className="text-xs text-muted-foreground">
                      on {formatDateTime(submission.reviewed_at)}
                    </span>
                  )}
                </div>
                {submission.reviewer_note && (
                  <div className="mt-2">
                    <h4 className="text-xs font-medium text-muted-foreground">
                      Reviewer Note
                    </h4>
                    <p className="mt-1 text-sm whitespace-pre-wrap">
                      {submission.reviewer_note}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Admin Review Actions (only for pending submissions) */}
            {currentUser.role === "admin" &&
              submission.status === "pending" && (
                <div className="space-y-3 border-t pt-3">
                  {rejectingId === submission.id ? (
                    /* Rejection Form */
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">
                          Why are you rejecting this submission? *
                        </label>
                        <Textarea
                          value={rejectionNote}
                          onChange={(e) => {
                            setRejectionNote(e.target.value);
                            setRejectionError(null);
                          }}
                          placeholder="Provide specific feedback so the team member knows what to improve"
                          rows={3}
                          disabled={actionLoading === submission.id}
                          autoFocus
                        />
                        {rejectionError && (
                          <p className="text-sm text-destructive">
                            {rejectionError}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleReject(submission.id)}
                          disabled={actionLoading === submission.id}
                        >
                          {actionLoading === submission.id
                            ? "Rejecting..."
                            : "Confirm Rejection"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setRejectingId(null);
                            setRejectionNote("");
                            setRejectionError(null);
                          }}
                          disabled={actionLoading === submission.id}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    /* Approve / Reject Buttons */
                    <div className="flex gap-2">
                      <Button
                        variant="default"
                        size="sm"
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => handleApprove(submission.id)}
                        disabled={actionLoading === submission.id}
                      >
                        <CheckCircle className="mr-1 h-4 w-4" />
                        {actionLoading === submission.id
                          ? "Approving..."
                          : "Approve"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-red-200 text-red-600 hover:bg-red-50"
                        onClick={() => setRejectingId(submission.id)}
                        disabled={actionLoading === submission.id}
                      >
                        <XCircle className="mr-1 h-4 w-4" />
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
