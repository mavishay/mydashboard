CREATE TABLE IF NOT EXISTS classification_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 0,
  conditions TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('classify', 'skip_llm')),
  classification TEXT CHECK (classification IN ('urgent', 'action', 'fyi', 'noise')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_classification_rules_enabled ON classification_rules(enabled);
CREATE INDEX idx_classification_rules_priority ON classification_rules(priority DESC);

ALTER TABLE emails ADD COLUMN classification_source TEXT DEFAULT 'llm';
ALTER TABLE emails ADD COLUMN classification_rule_id TEXT;
