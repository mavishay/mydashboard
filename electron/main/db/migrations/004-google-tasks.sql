-- 004-google-tasks.sql
-- Google Tasks integration tables for bidirectional sync

-- Google Tasks task lists (one per connected Google account)
CREATE TABLE IF NOT EXISTS google_task_lists (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Individual Google Tasks linked to a task list
CREATE TABLE IF NOT EXISTS google_tasks (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL REFERENCES google_task_lists(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL CHECK (status IN ('needsAction', 'completed')),
  due TEXT,
  position TEXT NOT NULL,
  parent_id TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_deleted INTEGER NOT NULL DEFAULT 0
);

-- Sync state per task list for incremental sync via Google Tasks sync token
CREATE TABLE IF NOT EXISTS google_tasks_sync_state (
  list_id TEXT PRIMARY KEY REFERENCES google_task_lists(id) ON DELETE CASCADE,
  sync_token TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for common query patterns
CREATE INDEX idx_google_tasks_list_id ON google_tasks(list_id);
CREATE INDEX idx_google_tasks_status ON google_tasks(status);
