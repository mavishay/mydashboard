-- 004-token-attempts.sql
-- Track failed token validation attempts per IP for rate limiting
CREATE TABLE IF NOT EXISTS token_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_address TEXT NOT NULL,
  attempted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_token_attempts_ip_time ON token_attempts(ip_address, attempted_at);
