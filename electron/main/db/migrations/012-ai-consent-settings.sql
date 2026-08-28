CREATE TABLE IF NOT EXISTS ai_consent_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  consented INTEGER NOT NULL DEFAULT 0,
  policy_version TEXT NOT NULL DEFAULT '1.0',
  consented_at TEXT,
  revoked_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);