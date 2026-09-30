// ============================================================
// Execution Tracker — Slicing Pie: Time Tracking Types
// ============================================================
// Shared shapes for self-service hourly logging and the month-end
// payday conversion. Kept separate from the core slicing-pie types
// so the engine stays dependency-free.
// ============================================================

export type TimeLogStatus = "pending" | "converted" | "void";

/** A raw, member-entered record of hours worked (pre-slice). */
export interface TimeLog {
  id: string;
  pie_id: string;
  participant_id: string;
  user_id: string | null;
  work_date: string; // YYYY-MM-DD
  hours: number;
  notes: string | null;
  project_tag: string | null;
  status: TimeLogStatus;
  contribution_id: string | null;
  payday_run_id: string | null;
  client_uuid: string | null;
  created_by: string | null;
  created_at: string;
}

/** Payload a client sends to log time (offline-queue friendly). */
export interface TimeLogInput {
  client_uuid: string;
  work_date: string;
  hours: number;
  notes?: string;
  project_tag?: string;
  participant_id?: string; // admin-only: log on behalf of someone
}

/** One participant's projected payday result. */
export interface PaydayPreviewRow {
  participant_id: string;
  display_name: string;
  has_salary: boolean;
  log_count: number;
  total_hours: number;
  projected_slices: number;
  note?: string;
}

/** The full month-end projection returned before committing. */
export interface PaydayPreview {
  pie_id: string;
  period_start: string;
  period_end: string;
  rows: PaydayPreviewRow[];
  total_logs: number;
  total_hours: number;
  total_slices: number;
  skipped_no_salary: number;
}

/** A committed payday batch. */
export interface PaydayRun {
  id: string;
  pie_id: string;
  period_start: string;
  period_end: string;
  logs_converted: number;
  participants_count: number;
  total_hours: number;
  total_slices: number;
  note: string | null;
  created_by: string | null;
  created_at: string;
}
