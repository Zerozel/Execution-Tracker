// ============================================================
// Execution Tracker — Empty State Component
// ============================================================

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Inbox } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  /** Icon to display (default: Inbox) */
  icon?: LucideIcon;
  /** Primary message */
  title: string;
  /** Secondary description */
  description?: string;
  /** Optional action button */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Minimum height of the card */
  minHeight?: string;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  minHeight = "200px",
}: EmptyStateProps) {
  return (
    <Card className="border-dashed">
      <CardContent
        className="flex items-center justify-center py-12"
        style={{ minHeight }}
      >
        <div className="max-w-sm text-center">
          <Icon className="mx-auto h-10 w-10 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium text-muted-foreground">
            {title}
          </p>
          {description && (
            <p className="mt-1 text-xs text-muted-foreground/70">
              {description}
            </p>
          )}
          {action && (
            <div className="mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
