import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateString: string | Date): string {
  if (!dateString) return ""
  const date = new Date(dateString)
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

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
 * Computes overdue status using properties matching the Task type
 */
export function getOverdueStatus(task: any): "overdue" | "due_soon" | "normal" {
  if (!task || !task.due_date) return "normal"
  
  const status = task.status?.toUpperCase()
  if (status === "COMPLETED" || status === "DONE") return "normal"
  
  const deadline = new Date(task.due_date)
  const now = new Date()
  
  if (deadline < now) return "overdue"
  
  // Checking if it's due within the next 24 hours
  const oneDayInMs = 24 * 60 * 60 * 1000
  if (deadline.getTime() - now.getTime() < oneDayInMs) return "due_soon"
  
  return "normal"
}

/**
 * Returns color string layouts mapped to status labels
 */
export function overdueColor(statusLabel: "overdue" | "due_soon" | "normal"): string {
  if (statusLabel === "overdue") {
    return "text-destructive bg-destructive/10 border-destructive/20"
  }
  if (statusLabel === "due_soon") {
    return "text-amber-600 bg-amber-50 border-amber-200"
  }
  return "text-muted-foreground bg-muted border-transparent"
}
