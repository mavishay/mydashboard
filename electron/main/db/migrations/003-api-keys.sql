CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK(provider IN ('openai', 'anthropic', 'litellm')),
  label TEXT NOT NULL,
  base_url TEXT,
  encrypted_key BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
