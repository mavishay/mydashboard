import type Database from 'better-sqlite3';
import type { BrowserWindow } from 'electron';
import { fetchEmailsForAllAccounts } from '../gmail/fetcher';
import { classifyUnclassifiedEmails } from '../ai/classifier';
import { cleanupStaleReadEmails } from './cleanup';

export interface CronStatus {
  enabled: boolean;
  running: boolean;
  lastRunAt: string | null;
  lastMode: 'work_hours' | 'off_hours' | null;
  nextRunInMs: number | null;
  config: CronConfig;
}

export interface CronConfig {
  workStartHour: number;
  workStartMinute: number;
  workEndHour: number;
  workEndMinute: number;
  workIntervalSeconds: number;
  offHoursIntervalSeconds: number;
}

type CronState = {
  enabled: boolean;
  work_start_hour: number;
  work_start_minute: number;
  work_end_hour: number;
  work_end_minute: number;
  work_interval_seconds: number;
  off_hours_interval_seconds: number;
  last_run_at: string | null;
  last_mode: string | null;
};

const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_RESET_MS = 5 * 60 * 1000;

export class CronScheduler {
  private db: Database.Database;
  private getWindow: () => BrowserWindow | null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private nextRunAt = 0;

  constructor(
    db: Database.Database,
    getWindow: () => BrowserWindow | null
  ) {
    this.db = db;
    this.getWindow = getWindow;
  }

  start(): void {
    this.db
      .prepare('UPDATE cron_state SET enabled = 1, updated_at = datetime(\'now\') WHERE id = 1')
      .run();
    this.scheduleNext();
    this.sendStatusUpdate();
  }

  stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const state = this.getState();
    if (!state.enabled) return;
    this.db
      .prepare('UPDATE cron_state SET enabled = 0, updated_at = datetime(\'now\') WHERE id = 1')
      .run();
    this.sendStatusUpdate();
  }

  getStatus(): CronStatus {
    const state = this.getState();
    const now = Date.now();
    return {
      enabled: state.enabled,
      running: this.running,
      lastRunAt: state.last_run_at,
      lastMode: state.last_mode as 'work_hours' | 'off_hours' | null,
      nextRunInMs: this.nextRunAt > now ? this.nextRunAt - now : null,
      config: {
        workStartHour: state.work_start_hour,
        workStartMinute: state.work_start_minute,
        workEndHour: state.work_end_hour,
        workEndMinute: state.work_end_minute,
        workIntervalSeconds: state.work_interval_seconds,
        offHoursIntervalSeconds: state.off_hours_interval_seconds,
      },
    };
  }

  updateConfig(config: Partial<CronConfig>): void {
    const current = this.getState();
    this.db
      .prepare(
        `UPDATE cron_state SET
          work_start_hour = ?,
          work_start_minute = ?,
          work_end_hour = ?,
          work_end_minute = ?,
          work_interval_seconds = ?,
          off_hours_interval_seconds = ?,
          updated_at = datetime('now')
        WHERE id = 1`
      )
      .run(
        config.workStartHour ?? current.work_start_hour,
        config.workStartMinute ?? current.work_start_minute,
        config.workEndHour ?? current.work_end_hour,
        config.workEndMinute ?? current.work_end_minute,
        config.workIntervalSeconds ?? current.work_interval_seconds,
        config.offHoursIntervalSeconds ?? current.off_hours_interval_seconds
      );

    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (current.enabled) {
      this.scheduleNext();
    }
    this.sendStatusUpdate();
  }

  async runNow(): Promise<void> {
    if (this.running) return;
    await this.tick();
  }

  private sendStatusUpdate(): void {
    const status = this.getStatus();
    this.getWindow()?.webContents.send('cron:status-update', status);
  }

  private scheduleNext(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    const state = this.getState();
    const intervalMs = this.calculateNextInterval(state);
    this.nextRunAt = Date.now() + intervalMs;
    this.timer = setTimeout(() => {
      void this.tick();
    }, intervalMs);
  }

  private async tick(): Promise<void> {
    if (this.running) return;

    const state = this.getState();
    if (!state.enabled) return;

    this.running = true;
    const now = new Date();
    const mode = this.isWorkHours(now, state) ? 'work_hours' : 'off_hours';

    try {
      await fetchEmailsForAllAccounts(this.db);
      await this.classifyForAllAccounts();

      const { deleted } = cleanupStaleReadEmails(this.db);
      if (deleted > 0) {
        console.log(`[CronScheduler] Cleaned up ${deleted} stale read emails`);
      }

      this.db
        .prepare(
          `UPDATE cron_state SET
            last_run_at = datetime('now'),
            last_mode = ?,
            updated_at = datetime('now')
          WHERE id = 1`
        )
        .run(mode);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[CronScheduler] Tick failed:`, message);
    } finally {
      this.running = false;
      this.sendStatusUpdate();
      this.scheduleNext();
    }
  }

  private async classifyForAllAccounts(): Promise<void> {
    const accounts = this.db
      .prepare("SELECT id FROM accounts WHERE type = 'gmail'")
      .all() as { id: string }[];

    for (const account of accounts) {
      if (this.isAccountCircuitOpen(account.id)) continue;

      try {
        await classifyUnclassifiedEmails(this.db, account.id);
        this.resetCircuitBreaker(account.id);
      } catch {
        this.recordAccountFailure(account.id);
      }
    }
  }

  private calculateNextInterval(state: CronState): number {
    const now = new Date();
    const isWork = this.isWorkHours(now, state);

    if (isWork) {
      return state.work_interval_seconds * 1000;
    }
    return state.off_hours_interval_seconds * 1000;
  }

  private isWorkHours(now: Date, state: CronState): boolean {
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = state.work_start_hour * 60 + state.work_start_minute;
    const endMinutes = state.work_end_hour * 60 + state.work_end_minute;
    if (startMinutes < endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }

  private getState(): CronState {
    const row = this.db
      .prepare('SELECT * FROM cron_state WHERE id = 1')
      .get() as {
      enabled: number;
      work_start_hour: number;
      work_start_minute: number;
      work_end_hour: number;
      work_end_minute: number;
      work_interval_seconds: number;
      off_hours_interval_seconds: number;
      last_run_at: string | null;
      last_mode: string | null;
    };
    return {
      enabled: Boolean(row.enabled),
      work_start_hour: row.work_start_hour,
      work_start_minute: row.work_start_minute,
      work_end_hour: row.work_end_hour,
      work_end_minute: row.work_end_minute,
      work_interval_seconds: row.work_interval_seconds,
      off_hours_interval_seconds: row.off_hours_interval_seconds,
      last_run_at: row.last_run_at,
      last_mode: row.last_mode,
    };
  }

  private isAccountCircuitOpen(accountId: string): boolean {
    const row = this.db
      .prepare(
        'SELECT circuit_open_until FROM cron_account_circuit_breakers WHERE account_id = ?'
      )
      .get(accountId) as { circuit_open_until: string | null } | undefined;
    if (!row?.circuit_open_until) return false;
    return Date.now() < new Date(row.circuit_open_until).getTime();
  }

  private recordAccountFailure(accountId: string): void {
    const row = this.db
      .prepare(
        'SELECT consecutive_failures FROM cron_account_circuit_breakers WHERE account_id = ?'
      )
      .get(accountId) as { consecutive_failures: number } | undefined;

    const failures = (row?.consecutive_failures ?? 0) + 1;
    const openUntil =
      failures >= CIRCUIT_BREAKER_THRESHOLD
        ? new Date(Date.now() + CIRCUIT_BREAKER_RESET_MS).toISOString()
        : null;

    this.db
      .prepare(
        `INSERT INTO cron_account_circuit_breakers (account_id, consecutive_failures, circuit_open_until, updated_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(account_id) DO UPDATE SET
           consecutive_failures = ?,
           circuit_open_until = ?,
           updated_at = datetime('now')`
      )
      .run(accountId, failures, openUntil, failures, openUntil);
  }

  private resetCircuitBreaker(accountId: string): void {
    this.db
      .prepare(
        `UPDATE cron_account_circuit_breakers SET
          consecutive_failures = 0,
          circuit_open_until = NULL,
          updated_at = datetime('now')
         WHERE account_id = ?`
      )
      .run(accountId);
  }
}
