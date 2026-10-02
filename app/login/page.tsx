// ============================================================
// Execution Tracker — Login Page (Working)
// ============================================================
// The login form. On mount, clears any existing user_id cookie so a
// stale cookie cannot trigger a redirect loop with the middleware.
// Always shows the form; the middleware no longer auto-redirects
// away from /login.
// ============================================================

"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Clear any stale user_id cookie on mount. A cookie that points at
  // a deleted user would otherwise cause the middleware to trust it
  // while the page rejects it, which produces a redirect loop.
  useEffect(() => {
    async function clearStaleSession() {
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } catch {
        // Ignore — no cookie to clear, or the network is down.
      }
    }
    clearStaleSession();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmed = nickname.trim();
    if (!trimmed) {
      setError("Please enter your nickname");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: trimmed }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Login failed");
        setIsLoading(false);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Execution Tracker</CardTitle>
          <CardDescription>Enter your nickname to continue</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Input
                type="text"
                placeholder="Enter your nickname"
                value={nickname}
                onChange={(e) => {
                  setNickname(e.target.value);
                  setError(null);
                }}
                autoComplete="off"
                autoFocus
                disabled={isLoading}
              />
              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            No passwords. No email. Just your team nickname.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
