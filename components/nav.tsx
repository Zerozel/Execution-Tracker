// ============================================================
// Execution Tracker — Navigation Bar (Working)
// ============================================================

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AuthUser } from "@/types";

interface NavProps {
  user: AuthUser | null;
}

export function Nav({ user }: NavProps) {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch {
      setIsLoggingOut(false);
    }
  }

  return (
    <header className="sticky top-0 z-50 border-b bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        {/* Logo / Brand */}
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="text-lg font-bold tracking-tight">
            Execution Tracker
          </span>
        </Link>

        {/* Navigation Links */}
        <nav className="flex items-center gap-4">
          {user && (
            <>
              <Link
                href="/dashboard"
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Dashboard
              </Link>

              {user.role === "admin" && (
                <Link
                  href="/tasks"
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  All Tasks
                </Link>
              )}
            </>
          )}

          {/* User Info or Login */}
          {user ? (
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="text-xs capitalize">
                {user.role}
              </Badge>
              <span className="text-sm font-medium">{user.display_name}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                disabled={isLoggingOut}
              >
                {isLoggingOut ? "..." : "Logout"}
              </Button>
            </div>
          ) : (
            <Link href="/login">
              <Button variant="outline" size="sm">
                Sign In
              </Button>
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
