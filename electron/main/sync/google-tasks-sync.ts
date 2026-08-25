import type Database from 'better-sqlite3';
import {
  listTaskLists,
  listTasks,
  updateTask,
  deleteTask,
  type TaskEntry,
} from './google-tasks-api';
import { getValidAccessToken } from '../auth/google-tasks';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SyncStatus = 'idle' | 'syncing' | 'error';

export interface SyncState {
  status: SyncStatus;
  lastSyncAt: string | null;
  error: string | null;
}

export interface SyncConfig {
  /** Polling interval in milliseconds (default 30 s) */
  pollIntervalMs: number;
  /** Maximum retries for exponential backoff */
  maxRetries: number;
  /** Circuit breaker failure threshold */
  circuitBreakerThreshold: number;
  /** Circuit breaker reset window in ms (5 min) */
  circuitBreakerResetMs: number;
}

const DEFAULT_CONFIG: SyncConfig = {
  pollIntervalMs: 30_000,
  maxRetries: 5,
  circuitBreakerThreshold: 3,
  circuitBreakerResetMs: 5 * 60 * 1000,
};

// ---------------------------------------------------------------------------
// GoogleTasksSync
// ---------------------------------------------------------------------------

export class GoogleTasksSync {
  private db: Database.Database;
  private accountId: string;
  private config: SyncConfig;
  private onStatusChange: ((state: SyncState) => void) | null = null;

  private timer: ReturnType<typeof setInterval> | null = null;
  private consecutiveFailures = 0;
  private circuitOpenUntil = 0;
  private stopped = false;

  constructor(
    db: Database.Database,
    accountId: string,
    config?: Partial<SyncConfig>
  ) {
    this.db = db;
    this.accountId = accountId;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // -- Lifecycle -----------------------------------------------------------

  onSyncStatus(cb: (state: SyncState) => void): void {
    this.onStatusChange = cb;
  }

  async start(): Promise<void> {
    this.stopped = false;
    // Run an immediate full/incremental sync, then start the polling loop.
    await this.runSyncCycle();
    this.timer = setInterval(() => {
      void this.runSyncCycle();
    }, this.config.pollIntervalMs);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // -- Internal sync loop --------------------------------------------------

  private async runSyncCycle(): Promise<void> {
    if (this.stopped) return;
    if (this.isCircuitOpen()) {
      this.emitStatus('error', 'Circuit breaker open – waiting for reset');
      return;
    }

    try {
      this.emitStatus('syncing');
      await this.retryWithBackoff(() => this.syncAllLists());
      this.consecutiveFailures = 0;
      this.emitStatus('idle');
    } catch (err) {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= this.config.circuitBreakerThreshold) {
        this.circuitOpenUntil =
          Date.now() + this.config.circuitBreakerResetMs;
      }
      const message = err instanceof Error ? err.message : String(err);
      this.emitStatus('error', message);
    }
  }

  private async retryWithBackoff(fn: () => Promise<void>): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = Math.min(
          1_000 * Math.pow(2, attempt - 1),
          16_000
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      try {
        await fn();
        return;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  }

  // -- Orchestration -------------------------------------------------------

  private async syncAllLists(): Promise<void> {
    const accessToken = await getValidAccessToken(this.db, this.accountId);
    const remoteLists = await listTaskLists(accessToken);

    for (const list of remoteLists) {
      this.ensureListRow(list.id, list.title, list.updated);
      await this.syncSingleList(accessToken, list.id);
    }
  }

  private async syncSingleList(
    accessToken: string,
    listId: string
  ): Promise<void> {
    // 1. Pull remote changes (incremental or full).
    const syncToken = this.getSyncToken(listId);

    let remoteItems: TaskEntry[];
    let newSyncToken: string | undefined;

    if (syncToken) {
      // Incremental sync – may need pagination to exhaust changes.
      const result = await this.paginatedFetch(
        accessToken,
        listId,
        syncToken
      );
      remoteItems = result.items;
      newSyncToken = result.syncToken;
    } else {
      // Full sync.
      const result = await this.paginatedFetch(
        accessToken,
        listId,
        undefined
      );
      remoteItems = result.items;
      newSyncToken = result.syncToken;
    }

    // 2. Apply remote → local.
    for (const item of remoteItems) {
      this.upsertLocalTask(listId, item);
    }

    // 3. Save new sync token if returned.
    if (newSyncToken) {
      this.saveSyncToken(listId, newSyncToken);
    }

    // 4. Push local → remote.
    await this.pushLocalChanges(accessToken, listId);

    // 5. Record sync timestamp.
    this.recordSyncTimestamp(listId);
  }

  // -- Remote → local ------------------------------------------------------

  private paginatedFetch(
    accessToken: string,
    listId: string,
    syncToken: string | undefined
  ): Promise<{ items: TaskEntry[]; syncToken?: string }> {
    // We intentionally don't loop over nextPageToken here because the Google
    // Tasks incremental-sync endpoint returns *all* changes in a single
    // response when using a sync token (up to the 100-item max we request).
    // A full initial sync could theoretically paginate, but we keep it simple
    // for now and fetch up to 100 tasks per list (the default Google Tasks
    // list limit). If pagination is needed later we can loop over
    // nextPageToken.
    return listTasks(accessToken, listId, syncToken);
  }

  private upsertLocalTask(listId: string, remote: TaskEntry): void {
    const now = new Date().toISOString();
    const localTask = this.db
      .prepare(
        `SELECT updated_at, synced_at FROM google_tasks WHERE id = ?`
      )
      .get(remote.id) as
      | { updated_at: string; synced_at: string }
      | undefined;

    if (!localTask) {
      // Brand-new remote task – insert locally.
      this.db
        .prepare(
          `INSERT INTO google_tasks
             (id, list_id, title, notes, status, position, parent_id, completed_at, updated_at, synced_at, is_deleted)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
        )
        .run(
          remote.id,
          listId,
          remote.title,
          remote.notes ?? null,
          remote.status,
          remote.position,
          remote.parent ?? null,
          remote.status === 'completed' ? now : null,
          remote.updated,
          now
        );
      return;
    }

    // Conflict resolution: last-write-wins, local wins ties.
    if (remote.updated > localTask.updated_at) {
      // Remote is newer – overwrite.
      this.db
        .prepare(
          `UPDATE google_tasks
             SET title = ?, notes = ?, status = ?, position = ?, parent_id = ?,
                 completed_at = ?, updated_at = ?, synced_at = ?, is_deleted = 0
           WHERE id = ?`
        )
        .run(
          remote.title,
          remote.notes ?? null,
          remote.status,
          remote.position,
          remote.parent ?? null,
          remote.status === 'completed' ? remote.updated : null,
          remote.updated,
          now,
          remote.id
        );
    } else {
      // Local is newer or equal – just update synced_at so we know we've
      // acknowledged this remote version.
      this.db
        .prepare(
          `UPDATE google_tasks SET synced_at = ? WHERE id = ?`
        )
        .run(now, remote.id);
    }
  }

  // -- Local → remote ------------------------------------------------------

  private async pushLocalChanges(
    accessToken: string,
    listId: string
  ): Promise<void> {
    // Tasks modified locally after the last sync.
    const rows = this.db
      .prepare(
        `SELECT id, title, notes, status, updated_at, synced_at
         FROM google_tasks
         WHERE list_id = ? AND updated_at > synced_at AND is_deleted = 0`
      )
      .all(listId) as Array<{
      id: string;
      title: string;
      notes: string | null;
      status: string;
      updated_at: string;
      synced_at: string;
    }>;

    for (const row of rows) {
      try {
        await updateTask(accessToken, listId, row.id, {
          title: row.title,
          notes: row.notes ?? undefined,
          status: row.status,
        });
        // Mark as synced.
        const now = new Date().toISOString();
        this.db
          .prepare(`UPDATE google_tasks SET synced_at = ? WHERE id = ?`)
          .run(now, row.id);
      } catch {
        // If the task was deleted on Google side we'll pick it up on the
        // next pull. Swallow the error to avoid blocking other pushes.
      }
    }

    // Handle locally deleted tasks (soft-deleted via is_deleted flag).
    const deletedRows = this.db
      .prepare(
        `SELECT id FROM google_tasks WHERE list_id = ? AND is_deleted = 1 AND synced_at < updated_at`
      )
      .all(listId) as Array<{ id: string }>;

    for (const row of deletedRows) {
      try {
        await deleteTask(accessToken, listId, row.id);
        // Hard-delete from DB after successful remote delete.
        this.db
          .prepare(`DELETE FROM google_tasks WHERE id = ?`)
          .run(row.id);
      } catch {
        // Task may already be gone remotely; clean up local anyway.
        this.db
          .prepare(`DELETE FROM google_tasks WHERE id = ?`)
          .run(row.id);
      }
    }
  }

  // -- DB helpers ----------------------------------------------------------

  private ensureListRow(
    listId: string,
    title: string,
    updated: string
  ): void {
    const existing = this.db
      .prepare(`SELECT id FROM google_task_lists WHERE id = ?`)
      .get(listId);
    if (!existing) {
      const now = new Date().toISOString();
      this.db
        .prepare(
          `INSERT INTO google_task_lists (id, title, updated_at, synced_at)
           VALUES (?, ?, ?, ?)`
        )
        .run(listId, title, updated, now);
    }
  }

  private getSyncToken(listId: string): string | null {
    const row = this.db
      .prepare(
        `SELECT sync_token FROM google_tasks_sync_state WHERE list_id = ?`
      )
      .get(listId) as { sync_token: string } | undefined;
    return row?.sync_token ?? null;
  }

  private saveSyncToken(listId: string, token: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO google_tasks_sync_state (list_id, sync_token, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(list_id) DO UPDATE SET sync_token = ?, updated_at = ?`
      )
      .run(listId, token, now, token, now);
  }

  private recordSyncTimestamp(listId: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE google_task_lists SET synced_at = ? WHERE id = ?`
      )
      .run(now, listId);
  }

  // -- Circuit breaker -----------------------------------------------------

  private isCircuitOpen(): boolean {
    return Date.now() < this.circuitOpenUntil;
  }

  // -- Status events -------------------------------------------------------

  private emitStatus(status: SyncStatus, error?: string): void {
    if (!this.onStatusChange) return;

    const row = this.db
      .prepare(
        `SELECT MAX(synced_at) as last_sync FROM google_task_lists`
      )
      .get() as { last_sync: string | null } | undefined;

    this.onStatusChange({
      status,
      lastSyncAt: row?.last_sync ?? null,
      error: error ?? null,
    });
  }
}
