// ============================================================
// Execution Tracker — User List Component
// ============================================================

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserActions } from "@/components/user-actions";
import { formatDate } from "@/lib/utils";
import type { User } from "@/types";

interface UserListProps {
  users: User[];
  isArchived?: boolean;
}

export function UserList({ users, isArchived = false }: UserListProps) {
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);

  if (users.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex min-h-[100px] items-center justify-center py-8">
          <p className="text-sm text-muted-foreground">
            {isArchived ? "No archived users" : "No active users"}
          </p>
        </CardContent>
      </Card>
    );
  }

  function handleActionComplete() {
    setActionError(null);
    router.refresh();
  }

  function handleActionError(message: string) {
    setActionError(message);
  }

  return (
    <div className="space-y-2">
      {actionError && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="py-3">
            <p className="text-sm text-destructive">{actionError}</p>
          </CardContent>
        </Card>
      )}

      {users.map((user) => (
        <Card key={user.id}>
          <CardContent className="flex items-center justify-between py-4">
            {/* User Info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium truncate">{user.display_name}</p>
                <Badge
                  variant={user.role === "admin" ? "default" : "secondary"}
                  className="text-xs capitalize"
                >
                  {user.role}
                </Badge>
                {user.is_archived && (
                  <Badge variant="outline" className="text-xs">
                    Archived
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                @{user.nickname}
              </p>
              <p className="text-xs text-muted-foreground">
                Joined {formatDate(user.created_at)}
              </p>
            </div>

            {/* Actions */}
            <UserActions
              user={user}
              onComplete={handleActionComplete}
              onError={handleActionError}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
