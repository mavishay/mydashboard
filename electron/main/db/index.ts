import Database, { Database as DatabaseType } from 'better-sqlite3';
import { app } from 'electron';
import { join } from 'path';

const CURRENT_SCHEMA_VERSION = 1;

import migration001 from './migrations/001-initial.sql?raw';

const MIGRATIONS: Record<number, string> = {
  1: migration001,
};

export function initializeDatabase(
  customPath?: string
): DatabaseType {
  const dbPath = customPath ?? join(app.getPath('userData'), 'dashboard.db');
  const db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  runMigrations(db);

  return db;
}

function runMigrations(db: DatabaseType): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const current: { version: number } | undefined = db
    .prepare('SELECT MAX(version) as version FROM schema_migrations')
    .get() as { version: number } | undefined;

  const currentVersion = current?.version ?? 0;

  if (currentVersion >= CURRENT_SCHEMA_VERSION) {
    return;
  }

  db.exec('BEGIN TRANSACTION');
  try {
    for (let v = currentVersion + 1; v <= CURRENT_SCHEMA_VERSION; v++) {
      const applied = db
        .prepare('SELECT 1 FROM schema_migrations WHERE version = ?')
        .get(v);
      if (applied) {
        continue;
      }
      const sql = MIGRATIONS[v];
      if (!sql) {
        throw new Error(`Missing migration for version ${v}`);
      }
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(v);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
