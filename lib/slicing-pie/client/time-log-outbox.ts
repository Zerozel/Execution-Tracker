// ============================================================
// Execution Tracker — Slicing Pie: Offline Time-Log Outbox
// ============================================================
// A tiny IndexedDB-backed queue that makes time logging work
// OFFLINE. Entries are written locally first, then flushed to the
// API when connectivity returns. Each entry carries a stable
// `client_uuid`, so the server upsert de-duplicates any log that
// gets synced more than once (at-least-once delivery → exactly-once
// effect).
//
// No external deps — raw IndexedDB wrapped in Promises. Safe to
// import in client components only (guards against SSR/no-window).
// ============================================================

import type { TimeLog, TimeLogInput } from "@/types/time-tracking";

const DB_NAME = "exec-tracker-timelogs";
const DB_VERSION = 1;
const STORE = "outbox";

/** A queued entry: the API payload plus routing/bookkeeping fields. */
export interface OutboxEntry extends TimeLogInput {
  pie_id: string;
  queued_at: number;
  attempts: number;
  last_error?: string;
}

// ------------------------------------------------------------
// Environment guards
// ------------------------------------------------------------
function hasIDB(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window;
}

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

/** RFC4122-ish v4 uuid, with a crypto fallback for older engines. */
export function newClientUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ------------------------------------------------------------
// IndexedDB plumbing
// ------------------------------------------------------------
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIDB()) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        // keyed by client_uuid → natural idempotency locally too.
        db.createObjectStore(STORE, { keyPath: "client_uuid" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(
  db: IDBDatabase,
  mode: IDBTransactionMode
): IDBObjectStore {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ------------------------------------------------------------
// Public API
// ------------------------------------------------------------

/** Add (or overwrite) an entry in the local outbox. */
export async function enqueue(
  pieId: string,
  input: Omit<TimeLogInput, "client_uuid"> & { client_uuid?: string }
): Promise<OutboxEntry> {
  const entry: OutboxEntry = {
    ...input,
    client_uuid: input.client_uuid || newClientUuid(),
    pie_id: pieId,
    queued_at: Date.now(),
    attempts: 0,
  };
  if (!hasIDB()) return entry; // best-effort: caller will POST directly
  const db = await openDB();
  await promisify(tx(db, "readwrite").put(entry));
  db.close();
  return entry;
}

/** All queued entries for a Pie (oldest first). */
export async function pending(pieId: string): Promise<OutboxEntry[]> {
  if (!hasIDB()) return [];
  const db = await openDB();
  const all = (await promisify(tx(db, "readonly").getAll())) as OutboxEntry[];
  db.close();
  return all
    .filter((e) => e.pie_id === pieId)
    .sort((a, b) => a.queued_at - b.queued_at);
}

export async function pendingCount(pieId: string): Promise<number> {
  return (await pending(pieId)).length;
}

async function remove(clientUuid: string): Promise<void> {
  if (!hasIDB()) return;
  const db = await openDB();
  await promisify(tx(db, "readwrite").delete(clientUuid));
  db.close();
}

async function markAttempt(entry: OutboxEntry, error?: string): Promise<void> {
  if (!hasIDB()) return;
  const db = await openDB();
  await promisify(
    tx(db, "readwrite").put({
      ...entry,
      attempts: entry.attempts + 1,
      last_error: error,
    })
  );
  db.close();
}

export interface FlushResult {
  synced: number;
  failed: number;
  remaining: number;
}

/**
 * Flush all queued entries for a Pie to the server in one batch.
 * Successfully-synced entries are removed from the outbox; failures
 * stay queued (with an incremented attempt count) for the next try.
 */
export async function flush(pieId: string): Promise<FlushResult> {
  const queued = await pending(pieId);
  if (queued.length === 0) {
    return { synced: 0, failed: 0, remaining: 0 };
  }
  if (!isOnline()) {
    return { synced: 0, failed: 0, remaining: queued.length };
  }

  const entries: TimeLogInput[] = queued.map((e) => ({
    client_uuid: e.client_uuid,
    work_date: e.work_date,
    hours: e.hours,
    notes: e.notes,
    project_tag: e.project_tag,
    participant_id: e.participant_id,
  }));

  let synced = 0;
  let failed = 0;

  try {
    const res = await fetch(`/api/pies/${pieId}/time-logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    });
    const json = await res.json();

    if (!res.ok) {
      // Whole batch rejected (e.g. frozen Pie). Keep entries queued.
      for (const e of queued) await markAttempt(e, json?.error ?? "batch failed");
      return { synced: 0, failed: queued.length, remaining: queued.length };
    }

    // Server returns the rows it accepted; treat their client_uuids as
    // synced. Anything with a per-entry error stays queued.
    const acceptedUuids = new Set<string>(
      ((json?.data?.inserted ?? []) as TimeLog[])
        .map((r) => r.client_uuid)
        .filter((u): u is string => Boolean(u))
    );
    const perEntryErrors = new Set<string>(
      ((json?.data?.errors ?? []) as { client_uuid?: string }[])
        .map((e) => e.client_uuid)
        .filter((u): u is string => Boolean(u))
    );

    for (const e of queued) {
      // ignoreDuplicates means an already-synced entry won't be echoed
      // back in `inserted`; if it isn't flagged as an error, it is safe
      // to consider done (idempotent on the server).
      if (acceptedUuids.has(e.client_uuid) || !perEntryErrors.has(e.client_uuid)) {
        await remove(e.client_uuid);
        synced += 1;
      } else {
        await markAttempt(e, "rejected by server");
        failed += 1;
      }
    }
  } catch (err) {
    // Network died mid-flush — keep everything queued.
    for (const e of queued) {
      await markAttempt(e, err instanceof Error ? err.message : "network error");
    }
    return { synced: 0, failed: queued.length, remaining: queued.length };
  }

  return { synced, failed, remaining: (await pending(pieId)).length };
}

/**
 * Register auto-flush on reconnect. Returns an unsubscribe function.
 * Call once from the time-log page; it flushes immediately if online.
 */
export function registerAutoFlush(
  pieId: string,
  onResult?: (r: FlushResult) => void
): () => void {
  if (typeof window === "undefined") return () => {};

  const run = () => {
    flush(pieId)
      .then((r) => onResult?.(r))
      .catch(() => {});
  };

  window.addEventListener("online", run);
  // Attempt an initial flush in case we loaded already-online with a
  // backlog from a previous offline session.
  if (isOnline()) run();

  return () => window.removeEventListener("online", run);
}
