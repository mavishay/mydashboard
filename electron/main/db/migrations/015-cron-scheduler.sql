CREATE TABLE IF NOT EXISTS cron_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  enabled INTEGER NOT NULL DEFAULT 0,
  work_start_hour INTEGER NOT NULL DEFAULT 9,
  work_start_minute INTEGER NOT NULL DEFAULT 0,
  work_end_hour INTEGER NOT NULL DEFAULT 17,
  work_end_minute INTEGER NOT NULL DEFAULT 30,
  work_interval_seconds INTEGER NOT NULL DEFAULT 300,
  off_hours_interval_seconds INTEGER NOT NULL DEFAULT 3600,
  last_run_at TEXT,
  last_mode TEXT CHECK (last_mode IN ('work_hours', 'off_hours') OR last_mode IS NULL),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO cron_state (id) VALUES (1);

CREATE TABLE IF NOT EXISTS cron_account_circuit_breakers (
  account_id TEXT PRIMARY KEY,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  circuit_open_until TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
