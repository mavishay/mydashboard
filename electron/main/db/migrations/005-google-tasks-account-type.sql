-- 005-google-tasks-account-type.sql
-- Add 'google_tasks' to the accounts type CHECK constraint

-- SQLite doesn't support ALTER CHECK, so we recreate the table
-- This is safe because we're in a transaction and the table is small

CREATE TABLE IF NOT EXISTS accounts_new (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('gmail', 'm365', 'google_tasks')),
  email TEXT NOT NULL,
  display_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO accounts_new (id, type, email, display_name, created_at, updated_at)
SELECT id, type, email, display_name, created_at, updated_at
FROM accounts;

DROP TABLE accounts;

ALTER TABLE accounts_new RENAME TO accounts;

CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(type);
