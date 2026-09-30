// ============================================================
// Execution Tracker — Slicing Pie: Pie Create Form
// ============================================================
// Creates a new Pie via POST /api/pies. On success, navigates to the
// new Pie's dashboard so the admin can start configuring it.
// ============================================================

"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlusCircle } from "lucide-react";

export function PieCreateForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  // Naira is the house default (DEFAULT_PIE_SETTINGS.currency). CONFIG-007
  // means this can never be FX-converted later, so it is pre-filled rather
  // than left empty for someone to get wrong.
  const [currency, setCurrency] = useState("NGN");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Pie name is required");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/pies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          currency: currency.trim() || "NGN",
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Failed to create pie");
        setIsLoading(false);
        return;
      }

      // Navigate to the new Pie's dashboard.
      router.push(`/pies/${result.data.id}`);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setIsLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Create New Pie</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="pie-name" className="text-sm font-medium">
              Pie Name *
            </label>
            <Input
              id="pie-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              placeholder="e.g., Acme Inc. Founders"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="pie-currency" className="text-sm font-medium">
              Currency
            </label>
            <Input
              id="pie-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              placeholder="NGN"
              maxLength={3}
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              ISO 4217 code. A single currency is used throughout — no FX
              conversion is performed.
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" disabled={isLoading} className="w-full">
            <PlusCircle className="mr-2 h-4 w-4" />
            {isLoading ? "Creating..." : "Create Pie"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
