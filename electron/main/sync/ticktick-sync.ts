// electron/main/sync/ticktick-sync.ts

import type Database from 'better-sqlite3';
import type { TickTickAdapter } from './ticktick-adapter';
import type { Project, Task } from './task-adapter';


export type SyncStatus = 'idle' | 'syncing' | 'error';

export interface SyncState {
  status: SyncStatus;
  lastSyncAt: string | null;
  error: string | null;
}

export interface SyncConfig {
  pollIntervalMs: number;
  maxRetries: number;
  circuitBreakerThreshold: number;
  circuitBreakerResetMs: number;
}

const DEFAULT_CONFIG: SyncConfig = {
  pollIntervalMs: 30_000,
  maxRetries: 5,
  circuitBreakerThreshold: 3,
  circuitBreakerResetMs: 5 * 60 * 1000,
};

export class TickTickSync {
  private db: Database.Database;
  private accountId: string;
  private adapter: TickTickAdapter;
  private config: SyncConfig;
  private onStatusChange: ((state: SyncState) => void) | null = null;

  private timer: ReturnType<typeof setInterval> | null = null;
  private consecutiveFailures = 0;
  private circuitOpenUntil = 0;
  private stopped = false;

  constructor(
    db: Database.Database,
    accountId: string,
    adapter: TickTickAdapter,
    config?: Partial<SyncConfig>
  ) {
    this.db = db;
    this.accountId = accountId;
    this.adapter = adapter;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  onSyncStatus(cb: (state: SyncState) => void): void {
    this.onStatusChange = cb;
  }

  async start(): Promise<void> {
    this.stopped = false;
    await this.runSyncCycle();
    this.timer = setInterval(() => {
      void this.runSyncCycle();
    }, this.config.pollIntervalMs);
  }

  async runOnce(): Promise<void> {
    await this.runSyncCycle();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async runSyncCycle(): Promise<void> {
    if (this.stopped) return;
    if (this.isCircuitOpen()) {
      this.emitStatus('error', 'Circuit breaker open – waiting for reset');
      return;
    }

    try {
      this.emitStatus('syncing');
      await this.retryWithBackoff(() => this.syncAllProjects());
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
        const delay = Math.min(1_000 * Math.pow(2, attempt - 1), 16_000);
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

  private async syncAllProjects(): Promise<void> {
    const remoteProjects = await this.adapter.listProjects();

    for (const project of remoteProjects) {
      this.ensureProjectRow(project);
      await this.syncSingleProject(project.id);
    }
  }

  private async syncSingleProject(projectId: string): Promise<void> {
    // 1. Pull remote tasks
    const remoteTasks = await this.adapter.listTasks(projectId);
    for (const task of remoteTasks) {
      this.upsertLocalTask(projectId, task);
    }

    // 2. Push local changes
    await this.pushLocalChanges(projectId);

    // 3. Record sync timestamp
    this.recordSyncTimestamp(projectId);
  }

  private upsertLocalTask(projectId: string, remote: Task): void {
    const now = new Date().toISOString();
    const localTask = this.db
      .prepare(
        `SELECT updated_at, synced_at FROM ticktick_tasks WHERE id = ?`
      )
      .get(remote.id) as
      | { updated_at: string; synced_at: string }
      | undefined;

    if (!localTask) {
      this.db
        .prepare(
          `INSERT INTO ticktick_tasks
             (id, project_id, title, content, due_date, status, sort_order,
              created_at, updated_at, synced_at, is_deleted)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
        )
        .run(
          remote.id,
          projectId,
          remote.title,
          remote.content,
          remote.dueDate,
          remote.status,
          remote.sortOrder,
          remote.createdAt,
          remote.updatedAt,
          now
        );
      return;
    }

    // Conflict resolution: last-write-wins, local wins ties
    if (remote.updatedAt > localTask.updated_at) {
      this.db
        .prepare(
          `UPDATE ticktick_tasks
             SET title = ?, content = ?, due_date = ?, status = ?,
                 sort_order = ?, updated_at = ?, synced_at = ?, is_deleted = 0
           WHERE id = ?`
        )
        .run(
          remote.title,
          remote.content,
          remote.dueDate,
          remote.status,
          remote.sortOrder,
          remote.updatedAt,
          now,
          remote.id
        );
    } else {
      this.db
        .prepare(
          `UPDATE ticktick_tasks SET synced_at = ? WHERE id = ?`
        )
        .run(now, remote.id);
    }
  }

  private async pushLocalChanges(projectId: string): Promise<void> {
    // Modified tasks: updated_at > synced_at and not deleted
    const rows = this.db
      .prepare(
        `SELECT id, title, content, due_date, status, sort_order, updated_at, synced_at
         FROM ticktick_tasks
         WHERE project_id = ? AND updated_at > synced_at AND is_deleted = 0`
      )
      .all(projectId) as Array<{
      id: string;
      title: string;
      content: string | null;
      due_date: string | null;
      status: number;
      sort_order: number;
      updated_at: string;
      synced_at: string;
    }>;

    for (const row of rows) {
      try {
        await this.adapter.updateTask(row.id, {
          title: row.title,
          content: row.content ?? undefined,
          dueDate: row.due_date ?? undefined,
          status: row.status as 0 | 1,
          sortOrder: row.sort_order,
        });
        const now = new Date().toISOString();
        this.db
          .prepare(`UPDATE ticktick_tasks SET synced_at = ? WHERE id = ?`)
          .run(now, row.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[TickTickSync] Failed to push task ${row.id}: ${message}`);
        // Task may have been deleted remotely; will be picked up on next pull
      }
    }

    // Handle locally deleted tasks
    const deletedRows = this.db
      .prepare(
        `SELECT id FROM ticktick_tasks WHERE project_id = ? AND is_deleted = 1 AND synced_at < updated_at`
      )
      .all(projectId) as Array<{ id: string }>;

    for (const row of deletedRows) {
      try {
        await this.adapter.deleteTask(row.id);
        this.db
          .prepare(`DELETE FROM ticktick_tasks WHERE id = ?`)
          .run(row.id);
      } catch {
        this.db
          .prepare(`DELETE FROM ticktick_tasks WHERE id = ?`)
          .run(row.id);
      }
    }
  }

  // -- DB helpers ----------------------------------------------------------

  private ensureProjectRow(project: Project): void {
    const existing = this.db
      .prepare(`SELECT id FROM ticktick_projects WHERE id = ?`)
      .get(project.id);
    if (!existing) {
      const now = new Date().toISOString();
      this.db
        .prepare(
          `INSERT INTO ticktick_projects (id, account_id, name, kind, updated_at, synced_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(project.id, this.accountId, project.name, project.kind, now, now);
    }
  }

  private recordSyncTimestamp(projectId: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO ticktick_sync_state (project_id, last_poll_at, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(project_id) DO UPDATE SET last_poll_at = ?, updated_at = ?`
      )
      .run(projectId, now, now, now, now);
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
        `SELECT MAX(synced_at) as last_sync FROM ticktick_projects`
      )
      .get() as { last_sync: string | null } | undefined;

    this.onStatusChange({
      status,
      lastSyncAt: row?.last_sync ?? null,
      error: error ?? null,
    });
  }
}
