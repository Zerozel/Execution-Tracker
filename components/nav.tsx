// ============================================================
// Execution Tracker — Navigation Bar (Hydration Safe v2)
// ============================================================

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import type { AuthUser } from "@/types";

interface NavProps {
  user: AuthUser | null;
}

export function Nav({ user }: NavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // CRITICAL: Prevent hydration mismatch by only enabling
  // interactive features after client-side hydration completes
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

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

  function linkClasses(href: string) {
    // During SSR, always return the default (non-active) class
    // to ensure server/client HTML match
    if (!mounted) return "text-sm font-medium text-muted-foreground transition-colors hover:text-foreground";
    
    const isActive = pathname === href || pathname.startsWith(href + "/");
    return `text-sm font-medium transition-colors hover:text-foreground ${
      isActive ? "text-foreground" : "text-muted-foreground"
    }`;
  }

  // Both server and client render this exact same structure initially
  return (
    <header className="sticky top-0 z-50 border-b bg-white">
      <div className="mx-auto max-w-6xl px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link
            href="/dashboard"
            className="flex items-center gap-2 shrink-0"
          >
            <span className="text-base sm:text-lg font-bold tracking-tight truncate">
              Execution Tracker
            </span>
          </Link>

          {/* Desktop Navigation — always rendered, hidden on mobile via CSS */}
          <nav className="hidden md:flex items-center gap-4">
            {user && (
              <>
                <Link href="/dashboard" className={linkClasses("/dashboard")}>
                  Dashboard
                </Link>
                {user.role === "admin" && (
                  <>
                    <Link href="/users" className={linkClasses("/users")}>
                      Users
                    </Link>
                    <Link href="/tasks" className={linkClasses("/tasks")}>
                      All Tasks
                    </Link>
                  </>
                )}
              </>
            )}
          </nav>

          {/* Desktop User Info — always rendered, hidden on mobile via CSS */}
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <>
                <Badge variant="outline" className="text-xs capitalize shrink-0">
                  {user.role}
                </Badge>
                <span className="text-sm font-medium truncate max-w-[120px]">
                  {user.display_name}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="shrink-0"
                >
                  {isLoggingOut ? "..." : "Logout"}
                </Button>
              </>
            ) : (
              <Link href="/login">
                <Button variant="outline" size="sm">Sign In</Button>
              </Link>
            )}
          </div>

          {/* Mobile: Role badge + Hamburger — always rendered */}
          <div className="flex items-center gap-2 md:hidden">
            {user && (
              <Badge variant="outline" className="text-xs capitalize shrink-0">
                {user.role}
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {/* Always show Menu icon during SSR; client swaps after mount */}
              {mounted && mobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>

        {/* Mobile dropdown — only rendered after client mount */}
        {mounted && mobileMenuOpen && (
          <div className="md:hidden mt-4 pt-4 border-t space-y-2">
            {user && (
              <>
                <div className="px-3 py-2">
                  <p className="text-sm font-medium">{user.display_name}</p>
                </div>
                <Link
                  href="/dashboard"
                  className="block px-3 py-2 rounded-md text-base font-medium bg-accent text-accent-foreground"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Dashboard
                </Link>
                {user.role === "admin" && (
                  <>
                    <Link
                      href="/users"
                      className="block px-3 py-2 rounded-md text-base font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Users
                    </Link>
                    <Link
                      href="/tasks"
                      className="block px-3 py-2 rounded-md text-base font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      All Tasks
                    </Link>
                  </>
                )}
                <div className="px-3 pt-2 border-t">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      handleLogout();
                    }}
                    disabled={isLoggingOut}
                    className="w-full justify-start text-muted-foreground hover:text-foreground"
                  >
                    {isLoggingOut ? "Signing out..." : "Logout"}
                  </Button>
                </div>
              </>
            )}
            {!user && (
              <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
                <Button variant="outline" size="sm" className="w-full">
                  Sign In
                </Button>
              </Link>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
