// ============================================================
// Execution Tracker — User Actions Component (With Edit & Delete)
// ============================================================

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Archive,
  RefreshCw,
  Shield,
  ShieldOff,
  Pencil,
  Trash2,
  AlertTriangle,
} from "lucide-react";
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
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editNickname, setEditNickname] = useState(user.nickname);
  const [editDisplayName, setEditDisplayName] = useState(user.display_name);
  const [editRole, setEditRole] = useState<"admin" | "member">(user.role);
  const [editError, setEditError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/users/${user.id}/delete`, {
        method: "DELETE",
      });
      const result = await response.json();
      if (!response.ok) {
        onError(result.error || "Failed to delete user");
        setShowDeleteConfirm(false);
        return;
      }
      setShowDeleteConfirm(false);
      onComplete();
    } catch {
      onError("Network error. Please try again.");
      setShowDeleteConfirm(false);
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleSaveEdit() {
    setEditError(null);

    if (!editNickname.trim()) {
      setEditError("Nickname is required");
      return;
    }

    if (!editDisplayName.trim()) {
      setEditError("Display name is required");
      return;
    }

    setIsSaving(true);

    try {
      const body: Record<string, string> = {};

      if (editNickname.trim().toLowerCase() !== user.nickname) {
        body.nickname = editNickname.trim();
      }

      if (editDisplayName.trim() !== user.display_name) {
        body.display_name = editDisplayName.trim();
      }

      if (editRole !== user.role) {
        body.role = editRole;
      }

      // If nothing changed, just close
      if (Object.keys(body).length === 0) {
        setEditOpen(false);
        setIsSaving(false);
        return;
      }

      const response = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const result = await response.json();

      if (!response.ok) {
        setEditError(result.error || "Failed to update user");
        setIsSaving(false);
        return;
      }

      setEditOpen(false);
      onComplete();
    } catch {
      setEditError("Network error. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  function openEditDialog() {
    setEditNickname(user.nickname);
    setEditDisplayName(user.display_name);
    setEditRole(user.role);
    setEditError(null);
    setEditOpen(true);
  }

  const isBusy = isArchiving || isRestoring || isChangingRole || isDeleting;

  return (
    <>
      <div className="flex items-center gap-1">
        {/* Edit Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={openEditDialog}
          disabled={isBusy}
          title="Edit user"
        >
          <Pencil className="h-4 w-4" />
          <span className="sr-only">Edit</span>
        </Button>

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

        {/* Delete Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowDeleteConfirm(true)}
          disabled={isBusy}
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
          title="Delete user permanently"
        >
          <Trash2 className="h-4 w-4" />
          <span className="sr-only">Delete</span>
        </Button>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update {user.display_name}&apos;s information
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Nickname */}
            <div className="space-y-2">
              <label htmlFor="edit-nickname" className="text-sm font-medium">
                Nickname
              </label>
              <Input
                id="edit-nickname"
                value={editNickname}
                onChange={(e) => {
                  setEditNickname(e.target.value);
                  setEditError(null);
                }}
                placeholder="e.g., alice"
                disabled={isSaving}
              />
              <p className="text-xs text-muted-foreground">
                Used for login. Must be unique.
              </p>
            </div>

            {/* Display Name */}
            <div className="space-y-2">
              <label htmlFor="edit-display-name" className="text-sm font-medium">
                Display Name
              </label>
              <Input
                id="edit-display-name"
                value={editDisplayName}
                onChange={(e) => {
                  setEditDisplayName(e.target.value);
                  setEditError(null);
                }}
                placeholder="e.g., Alice Chen"
                disabled={isSaving}
              />
            </div>

            {/* Role */}
            <div className="space-y-2">
              <label htmlFor="edit-role" className="text-sm font-medium">
                Role
              </label>
              <select
                id="edit-role"
                value={editRole}
                onChange={(e) => setEditRole(e.target.value as "admin" | "member")}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                disabled={isSaving}
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            {/* Error */}
            {editError && (
              <p className="text-sm text-destructive" role="alert">
                {editError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <DialogTitle>Delete User</DialogTitle>
            </div>
            <DialogDescription>
              This will permanently delete{" "}
              <strong>{user.display_name}</strong> (@{user.nickname}).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-4">
              <p className="text-sm text-destructive font-medium">
                ⚠️ This action cannot be undone.
              </p>
              <ul className="mt-2 text-sm text-muted-foreground list-disc list-inside space-y-1">
                <li>The user will be permanently removed</li>
                <li>Their tasks will show as &quot;Unassigned&quot;</li>
                <li>Their submissions will show as &quot;Unknown&quot;</li>
                <li>All task and submission history is preserved</li>
              </ul>
            </div>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete this user? Consider archiving
              instead if you want to preserve their identity on existing tasks.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete Permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
