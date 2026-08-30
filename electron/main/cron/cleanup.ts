import type Database from 'better-sqlite3';

export function getRetentionDays(db: Database.Database): number {
  const row = db
    .prepare("SELECT value FROM app_settings WHERE key = 'email_retention_days'")
    .get() as { value: string } | undefined;
  const parsed = row ? parseInt(row.value, 10) : NaN;
  return Number.isFinite(parsed) ? Math.max(1, Math.min(30, parsed)) : 3;
}

export function setRetentionDays(db: Database.Database, days: number): void {
  const clamped = Math.max(1, Math.min(30, days));
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES ('email_retention_days', ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).run(String(clamped));
}

export function countStaleReadEmails(db: Database.Database): number {
  const days = getRetentionDays(db);
  const row = db
    .prepare(
      `SELECT COUNT(*) as count FROM emails
       WHERE is_read = 1 AND last_synced_at < datetime('now', '-' || ? || ' days')`
    )
    .get(days) as { count: number };
  return row.count;
}

export function cleanupStaleReadEmails(
  db: Database.Database
): { deleted: number } {
  const days = getRetentionDays(db);
  const result = db
    .prepare(
      `DELETE FROM emails
       WHERE is_read = 1 AND last_synced_at < datetime('now', '-' || ? || ' days')`
    )
    .run(days);
  return { deleted: result.changes };
}
