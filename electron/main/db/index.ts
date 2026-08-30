import Database, { Database as DatabaseType } from 'better-sqlite3';
import { app } from 'electron';
import { join } from 'path';

const CURRENT_SCHEMA_VERSION = 18;

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
import migration013 from './migrations/013-setup-tracking.sql?raw';
import migration014 from './migrations/014-ai-consent-settings.sql?raw';
import migration015 from './migrations/015-cron-scheduler.sql?raw';
import migration016 from './migrations/016-account-colors.sql?raw';
import migration017 from './migrations/017-classification-rules.sql?raw';
import migration018 from './migrations/018-email-cleanup.sql?raw';

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
  14: migration014,
  15: migration015,
  16: migration016,
  17: migration017,
  18: migration018,
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
  assignDefaultColors(db);

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

const PRESET_COLORS = [
  '#1976d2', // Blue
  '#388e3c', // Green
  '#f57c00', // Orange
  '#7b1fa2', // Purple
  '#c62828', // Red
  '#00838f', // Teal
  '#455a64', // Blue Grey
  '#ad1457', // Pink
  '#558b2f', // Light Green
  '#ef6c00', // Amber
];

function assignDefaultColors(db: DatabaseType): void {
  const accounts = db
    .prepare('SELECT id FROM accounts WHERE color IS NULL ORDER BY created_at')
    .all() as { id: string }[];

  if (accounts.length === 0) return;

  const update = db.prepare('UPDATE accounts SET color = ? WHERE id = ?');
  db.exec('BEGIN TRANSACTION');
  try {
    for (let i = 0; i < accounts.length; i++) {
      update.run(PRESET_COLORS[i % PRESET_COLORS.length], accounts[i].id);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
