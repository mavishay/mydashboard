-- 003-lan-pairing.sql
-- Pairing token for LAN authentication (stored as salted SHA-256 hash)
CREATE TABLE IF NOT EXISTS pairing_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT
);

-- Active LAN sessions (30-day expiry)
CREATE TABLE IF NOT EXISTS lan_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  ip_address TEXT
);

CREATE INDEX idx_lan_sessions_expires_at ON lan_sessions(expires_at);
CREATE INDEX idx_lan_sessions_session_token ON lan_sessions(session_token);
