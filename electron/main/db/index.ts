import Database, { Database as DatabaseType } from 'better-sqlite3';
import { app } from 'electron';
import { join } from 'path';

const CURRENT_SCHEMA_VERSION = 13;

import migration001 from './migrations/001-initial.sql?raw';
import migration002 from './migrations/002-gmail-oauth.sql?raw';
import migration003 from './migrations/003-api-keys.sql?raw';
import migration004 from './migrations/004-lan-pairing.sql?raw';
import migration005 from './migrations/005-token-attempts.sql?raw';
import migration006 from './migrations/006-add-token-plaintext.sql?raw';
import migration007 from './migrations/007-remove-token-plaintext.sql?raw';
import migration008 from './migrations/008-google-tasks.sql?raw';
import migration009 from './migrations/009-google-tasks-account-type.sql?raw';
import migration010 from './migrations/010-telemetry-settings.sql?raw';
import migration011 from './migrations/011-ticktick.sql?raw';
import migration012 from './migrations/012-notifications.sql?raw';
import migration013 from './migrations/013-ai-consent-settings.sql?raw';

const MIGRATIONS: Record<number, string> = {
  1: migration001,
  2: migration002,
  3: migration003,
  4: migration004,
  5: migration005,
  6: migration006,
  7: migration007,
  8: migration008,
  9: migration009,
  10: migration010,
  11: migration011,
  12: migration012,
  13: migration013,
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
