// ============================================================
// Execution Tracker — Terms Acceptance Flow (Client)
// ============================================================
// The three-step confirmation. Each step is a fresh page render
// (the router refreshes after each POST), so the checkbox starts
// unchecked and the button label shows which step is next. Only
// after the third confirmation does the server record acceptance
// and the user is redirected to the dashboard.
// ============================================================

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, AlertCircle } from "lucide-react";

interface Props {
  currentStepsCompleted: number;
  stepsRequired: number;
}

export function TermsAcceptance({
  currentStepsCompleted,
  stepsRequired,
}: Props) {
  const router = useRouter();
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextStep = currentStepsCompleted + 1;
  const isFinal = nextStep === stepsRequired;

  async function handleAccept() {
    if (!acknowledged) {
      setError("Tick the box to confirm you have read the terms");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/terms/accept-step", {
        method: "POST",
      });
      const json = await response.json();

      if (!response.ok) {
        setError(json.error || "Failed to record confirmation");
        return;
      }

      if (json.data?.completed) {
        // Acceptance recorded. Redirect to dashboard.
        router.push("/dashboard");
        router.refresh();
        return;
      }

      // Advance to the next step. Refresh the page so the server
      // re-renders with the new step count and a fresh checkbox.
      setAcknowledged(false);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-indigo-200 bg-indigo-50/50">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2 text-indigo-900">
          <AlertCircle className="h-4 w-4" />
          Step {nextStep} of {stepsRequired}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-indigo-900">
          {isFinal ? (
            <>
              This is the final confirmation. Clicking accept will record your
              acceptance of these terms.
            </>
          ) : (
            <>
              You are asked to confirm three times. Each confirmation requires
              a fresh tick of the box below — this ensures you have actually
              read the terms, not merely clicked through.
            </>
          )}
        </p>

        {/* Progress dots */}
        <div className="flex items-center gap-2">
          {Array.from({ length: stepsRequired }, (_, i) => {
            const step = i + 1;
            const done = step <= currentStepsCompleted;
            return (
              <div
                key={step}
                className={`h-2 flex-1 rounded-full ${
                  done ? "bg-indigo-600" : "bg-indigo-200"
                }`}
              />
            );
          })}
        </div>

        {/* Confirmation checkbox */}
        <label className="flex items-start gap-3 rounded-md border border-indigo-200 bg-white p-3 cursor-pointer">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => {
              setAcknowledged(e.target.checked);
              setError(null);
            }}
            disabled={busy}
            className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-sm text-foreground">
            I have read and understood the C-Transit Team Contribution &
            Accountability Agreement above. I understand it has not been
            reviewed by a lawyer, that I will sign a physical copy, and that
            the terms may change and be presented again.
          </span>
        </label>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <div className="flex items-center gap-2">
          <Button
            onClick={handleAccept}
            disabled={busy || !acknowledged}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            {busy
              ? "Recording…"
              : isFinal
              ? "Accept — final confirmation"
              : `Accept — step ${nextStep} of ${stepsRequired}`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
