CREATE TABLE IF NOT EXISTS telemetry_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  opted_in INTEGER NOT NULL DEFAULT 0,
  consented_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS telemetry_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_telemetry_events_created_at ON telemetry_events(created_at);
