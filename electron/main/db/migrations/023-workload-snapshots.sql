CREATE TABLE IF NOT EXISTS workload_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  score INTEGER NOT NULL,
  color TEXT NOT NULL,
  urgent_emails INTEGER NOT NULL DEFAULT 0,
  action_emails INTEGER NOT NULL DEFAULT 0,
  overdue_tasks INTEGER NOT NULL DEFAULT 0,
  today_tasks INTEGER NOT NULL DEFAULT 0,
  today_events INTEGER NOT NULL DEFAULT 0,
  calculated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_workload_snapshots_calculated_at ON workload_snapshots(calculated_at);
