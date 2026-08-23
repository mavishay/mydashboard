-- 001-initial.sql
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('gmail', 'm365')),
  email TEXT NOT NULL,
  display_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS emails (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  subject TEXT,
  snippet TEXT,
  from_address TEXT,
  to_addresses TEXT,
  received_at TEXT,
  classification TEXT CHECK (classification IN ('urgent', 'action', 'fyi', 'noise')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(account_id, external_id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES accounts(id),
  external_id TEXT,
  title TEXT NOT NULL,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  priority INTEGER NOT NULL DEFAULT 0,
  due_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_emails_account_id ON emails(account_id);
CREATE INDEX idx_emails_classification ON emails(classification);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due_at ON tasks(due_at);
