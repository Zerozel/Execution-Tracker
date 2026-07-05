import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formats a date string nicely (e.g., "Jan 5, 2026")
 */
export function formatDate(dateString: string | Date): string {
  if (!dateString) return ""
  const date = new Date(dateString)
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

/**
 * Formats a date and time string nicely (e.g., "Jan 5, 2026, 2:30 PM")
 */
export function formatDateTime(dateString: string | Date): string {
  if (!dateString) return "N/A"
  const date = new Date(dateString)
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

/**
 * Checks if a task is past its due date and not completed
 */
export function getOverdueStatus(deadlineStr: string | Date, status: string): boolean {
  const normalizedStatus = status?.toUpperCase()
  if (normalizedStatus === "COMPLETED" || normalizedStatus === "DONE") return false
  if (!deadlineStr) return false
  
  const deadline = new Date(deadlineStr)
  const now = new Date()
  return deadline < now
}

/**
 * Returns Tailwind css classes for background and text colors based on overdue status
 */
export function overdueColor(deadlineStr: string | Date, status: string): string {
  const isOverdue = getOverdueStatus(deadlineStr, status)
  if (isOverdue) {
    return "text-destructive bg-destructive/10 border-destructive/20"
  }
  return "text-muted-foreground bg-muted border-transparent"
}
