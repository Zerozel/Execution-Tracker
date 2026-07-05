// ============================================================
// Execution Tracker — Accept Task Button
// ============================================================

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";

interface AcceptTaskButtonProps {
  taskId: string;
}

export function AcceptTaskButton({ taskId }: AcceptTaskButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/tasks/${taskId}/accept`, {
        method: "POST",
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Failed to accept task");
        setIsLoading(false);
        return;
      }

      // Refresh the page to show updated status
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        onClick={handleAccept}
        disabled={isLoading}
        size="lg"
        className="w-full sm:w-auto"
      >
        <CheckCircle className="mr-2 h-4 w-4" />
        {isLoading ? "Accepting..." : "Accept Task"}
      </Button>
      {error && (
        <p className="text-center text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <p className="text-center text-xs text-muted-foreground">
        By accepting, you confirm responsibility for completing this task.
      </p>
    </div>
  );
}
