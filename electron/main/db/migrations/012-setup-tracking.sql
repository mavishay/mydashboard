CREATE TABLE IF NOT EXISTS setup_tracking (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'setup_started',
    'setup_step_completed',
    'setup_completed',
    'setup_resumed'
  )),
  step_id TEXT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  elapsed_ms INTEGER,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_setup_tracking_event ON setup_tracking (event_type);

CREATE TABLE IF NOT EXISTS setup_status (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  docker_check_complete INTEGER NOT NULL DEFAULT 0,
  n8n_health_complete INTEGER NOT NULL DEFAULT 0,
  api_key_complete INTEGER NOT NULL DEFAULT 0,
  account_connected INTEGER NOT NULL DEFAULT 0,
  setup_completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
