-- 002-gmail-oauth.sql
-- Stores encrypted OAuth tokens for connected Gmail accounts
-- Tokens are encrypted via electron.safeStorage before storage
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  encrypted_access_token BLOB NOT NULL,  -- encrypted via electron.safeStorage
  encrypted_refresh_token BLOB,          -- encrypted via electron.safeStorage, nullable for offline access
  expires_at TEXT NOT NULL,              -- ISO 8601 format
  scope TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(account_id)
);

CREATE INDEX idx_oauth_tokens_account_id ON oauth_tokens(account_id);
