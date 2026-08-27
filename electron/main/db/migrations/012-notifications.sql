CREATE TABLE IF NOT EXISTS notification_feedback (
  id TEXT PRIMARY KEY,
  notification_id TEXT NOT NULL,
  email_id TEXT NOT NULL,
  classification TEXT NOT NULL,
  feedback TEXT NOT NULL CHECK (feedback IN ('thumbs_up', 'thumbs_down')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notification_feedback_notification_id ON notification_feedback(notification_id);
CREATE INDEX IF NOT EXISTS idx_notification_feedback_email_id ON notification_feedback(email_id);
CREATE INDEX IF NOT EXISTS idx_notification_feedback_classification ON notification_feedback(classification);

CREATE TABLE IF NOT EXISTS notification_preferences (
  id INTEGER PRIMARY KEY DEFAULT 1,
  quiet_hours_enabled INTEGER NOT NULL DEFAULT 0,
  quiet_hours_start_hour INTEGER NOT NULL DEFAULT 22,
  quiet_hours_start_minute INTEGER NOT NULL DEFAULT 0,
  quiet_hours_end_hour INTEGER NOT NULL DEFAULT 7,
  quiet_hours_end_minute INTEGER NOT NULL DEFAULT 0,
  dnd_enabled INTEGER NOT NULL DEFAULT 0,
  notification_timeout_ms INTEGER NOT NULL DEFAULT 5000,
  max_concurrent INTEGER NOT NULL DEFAULT 3,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT single_row CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS notification_log (
  id TEXT PRIMARY KEY,
  email_id TEXT NOT NULL,
  subject TEXT,
  sender TEXT,
  classification TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'suppressed_dnd', 'suppressed_quiet_hours', 'queued', 'dropped')),
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  quiet_hours_suppressed INTEGER NOT NULL DEFAULT 0,
  dnd_suppressed INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_notification_log_email_id ON notification_log(email_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_sent_at ON notification_log(sent_at);
