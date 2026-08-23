-- 002-gmail-oauth.sql
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  encrypted_access_token BLOB NOT NULL,
  encrypted_refresh_token BLOB,
  expires_at TEXT NOT NULL,
  scope TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(account_id)
);

CREATE INDEX idx_oauth_tokens_account_id ON oauth_tokens(account_id);
