-- 010-ticktick.sql
-- TickTick integration tables for bidirectional sync

-- TickTick project lists (one per connected TickTick account)
CREATE TABLE IF NOT EXISTS ticktick_projects (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Individual TickTick tasks linked to a project
CREATE TABLE IF NOT EXISTS ticktick_tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES ticktick_projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  due_date TEXT,
  status INTEGER NOT NULL CHECK (status IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_deleted INTEGER NOT NULL DEFAULT 0
);

-- Sync state per project for polling interval tracking
CREATE TABLE IF NOT EXISTS ticktick_sync_state (
  project_id TEXT PRIMARY KEY REFERENCES ticktick_projects(id) ON DELETE CASCADE,
  last_poll_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for common query patterns
CREATE INDEX idx_ticktick_tasks_project_id ON ticktick_tasks(project_id);
CREATE INDEX idx_ticktick_tasks_status ON ticktick_tasks(status);
CREATE INDEX idx_ticktick_tasks_updated_at ON ticktick_tasks(updated_at);
