// ============================================================
// Execution Tracker — Shared Types
// Mirrors the locked database schema v2.1
// ============================================================

// --- Enums (match PostgreSQL enums exactly) ---

export type UserRole = "admin" | "member";

export type TaskStatus = "assigned" | "accepted" | "submitted" | "completed";

export type SubmissionStatus = "pending" | "approved" | "rejected";

// --- Database Entities ---

export interface User {
  id: string;
  nickname: string;
  display_name: string;
  role: UserRole;
  is_archived: boolean;
  created_at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  creator_id: string | null;
  owner_id: string | null;
  status: TaskStatus;
  due_date: string | null;
  accepted_at: string | null;
  is_archived: boolean;
  created_at: string;
}

export interface Submission {
  id: string;
  task_id: string;
  user_id: string | null;
  description: string | null;
  evidence_url: string | null;
  status: SubmissionStatus;
  reviewer_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

// --- UI Helpers ---

export type OverdueStatus = "on_track" | "due_soon" | "overdue";

// --- Auth ---

export interface AuthUser {
  id: string;
  nickname: string;
  display_name: string;
  role: UserRole;
}

// --- API Responses ---

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

// ============================================================
// Execution Tracker — Shared Types (Session 4 Amendment)
// ============================================================
// Append these types to the existing types/index.ts file.
// All Session 1-3 types remain unchanged.

// ... existing types remain above ...

// --- Submission with Relations (for history display) ---

export interface SubmissionWithRelations extends Submission {
  submitter: {
    id: string;
    nickname: string;
    display_name: string;
  } | null;
  reviewer: {
    id: string;
    nickname: string;
    display_name: string;
  } | null;
}
