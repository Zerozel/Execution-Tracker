// ============================================================
// Execution Tracker — User Actions Component
// ============================================================

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Archive, RefreshCw, Shield, ShieldOff } from "lucide-react";
import type { User } from "@/types";

interface UserActionsProps {
  user: User;
  onComplete: () => void;
  onError: (message: string) => void;
}

export function UserActions({ user, onComplete, onError }: UserActionsProps) {
  const [isArchiving, setIsArchiving] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isChangingRole, setIsChangingRole] = useState(false);

  async function handleArchive() {
    setIsArchiving(true);
    try {
      const response = await fetch(`/api/users/${user.id}/archive`, {
        method: "PATCH",
      });

      const result = await response.json();

      if (!response.ok) {
        onError(result.error || "Failed to archive user");
        return;
      }

      onComplete();
    } catch {
      onError("Network error. Please try again.");
    } finally {
      setIsArchiving(false);
    }
  }

  async function handleRestore() {
    setIsRestoring(true);
    try {
      const response = await fetch(`/api/users/${user.id}/restore`, {
        method: "PATCH",
      });

      const result = await response.json();

      if (!response.ok) {
        onError(result.error || "Failed to restore user");
        return;
      }

      onComplete();
    } catch {
      onError("Network error. Please try again.");
    } finally {
      setIsRestoring(false);
    }
  }

  async function handleRoleChange(newRole: "admin" | "member") {
    setIsChangingRole(true);
    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });

      const result = await response.json();

      if (!response.ok) {
        onError(result.error || "Failed to change role");
        return;
      }

      onComplete();
    } catch {
      onError("Network error. Please try again.");
    } finally {
      setIsChangingRole(false);
    }
  }

  const isBusy = isArchiving || isRestoring || isChangingRole;

  return (
    <div className="flex items-center gap-1">
      {/* Archive / Restore Button */}
      {user.is_archived ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRestore}
          disabled={isBusy}
          title="Restore user"
        >
          <RefreshCw className="h-4 w-4" />
          <span className="sr-only">Restore</span>
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleArchive}
          disabled={isBusy}
          title="Archive user"
        >
          <Archive className="h-4 w-4" />
          <span className="sr-only">Archive</span>
        </Button>
      )}

      {/* Role Change Button (only for active users) */}
      {!user.is_archived && (
        <div className="relative">
          {user.role === "admin" ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleRoleChange("member")}
              disabled={isBusy}
              title="Demote to member"
            >
              <ShieldOff className="h-4 w-4" />
              <span className="sr-only">Demote to member</span>
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleRoleChange("admin")}
              disabled={isBusy}
              title="Promote to admin"
            >
              <Shield className="h-4 w-4" />
              <span className="sr-only">Promote to admin</span>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
