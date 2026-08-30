ALTER TABLE emails ADD COLUMN label_ids TEXT;
ALTER TABLE emails ADD COLUMN is_read INTEGER NOT NULL DEFAULT 0;
ALTER TABLE emails ADD COLUMN last_synced_at TEXT;

CREATE INDEX IF NOT EXISTS idx_emails_is_read ON emails(is_read);
CREATE INDEX IF NOT EXISTS idx_emails_cleanup ON emails(is_read, last_synced_at);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO app_settings (key, value) VALUES ('email_retention_days', '3');
