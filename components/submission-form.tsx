// ============================================================
// Execution Tracker — Submission Form
// ============================================================

"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Send } from "lucide-react";

interface SubmissionFormProps {
  taskId: string;
}

export function SubmissionForm({ taskId }: SubmissionFormProps) {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    if (!description.trim()) {
      setError("Please describe the work you've completed");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`/api/tasks/${taskId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description.trim(),
          evidence_url: evidenceUrl.trim() || null,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Failed to submit work");
        setIsLoading(false);
        return;
      }

      // Success
      setSuccess(true);
      setDescription("");
      setEvidenceUrl("");
      setIsLoading(false);

      // Refresh the page to show updated status and submission history
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setIsLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Submit Work</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Description */}
          <div className="space-y-2">
            <label htmlFor="submission-description" className="text-sm font-medium">
              What did you complete? *
            </label>
            <Textarea
              id="submission-description"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setError(null);
              }}
              placeholder="Describe the work you've done, decisions made, or anything the reviewer should know"
              rows={4}
              disabled={isLoading}
            />
          </div>

          {/* Evidence URL */}
          <div className="space-y-2">
            <label htmlFor="submission-evidence" className="text-sm font-medium">
              Evidence URL (optional)
            </label>
            <Input
              id="submission-evidence"
              type="url"
              value={evidenceUrl}
              onChange={(e) => {
                setEvidenceUrl(e.target.value);
                setError(null);
              }}
              placeholder="https://... (link to deployed work, screenshot, document)"
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Link to a live URL, screenshot, or document showing completed work
            </p>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          {/* Success */}
          {success && (
            <p className="text-sm text-green-600" role="status">
              Work submitted successfully! Waiting for review.
            </p>
          )}

          {/* Submit Button */}
          <Button type="submit" disabled={isLoading} className="w-full">
            <Send className="mr-2 h-4 w-4" />
            {isLoading ? "Submitting..." : "Submit Work for Review"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
