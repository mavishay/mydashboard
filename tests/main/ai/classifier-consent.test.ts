import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { classifyEmail } from '../../../electron/main/ai/classifier';

describe('classifyEmail consent guard', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    // Create ai_consent_settings table (migration 012)
    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_consent_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        consented INTEGER NOT NULL DEFAULT 0,
        policy_version TEXT NOT NULL DEFAULT '1.0',
        consented_at TEXT,
        revoked_at TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    // Insert default consent row (not consented)
    db.exec("INSERT INTO ai_consent_settings (id, consented) VALUES (1, 0)");
    // Create emails table (simplified)
    db.exec(`
      CREATE TABLE IF NOT EXISTS emails (
        id TEXT PRIMARY KEY,
        subject TEXT,
        snippet TEXT,
        from_address TEXT,
        to_addresses TEXT,
        received_at TEXT
      )
    `);
    // Create classification_rules table (needed by evaluateRules)
    db.exec(`
      CREATE TABLE IF NOT EXISTS classification_rules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        priority INTEGER NOT NULL DEFAULT 0,
        conditions TEXT NOT NULL DEFAULT '[]',
        action TEXT NOT NULL DEFAULT 'classify',
        classification TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    // Insert a dummy email
    db.exec("INSERT INTO emails (id, subject, snippet, from_address) VALUES ('test-1', 'Test Subject', 'Test snippet', 'test@example.com')");
  });

  afterEach(() => {
    db.close();
  });

  it('throws error when AI consent is not granted', async () => {
    await expect(classifyEmail(db, 'test-1')).rejects.toThrow('AI consent required. Enable AI features in Settings.');
  });

  it('does not throw when AI consent is granted', async () => {
    // Grant consent
    db.exec("UPDATE ai_consent_settings SET consented = 1 WHERE id = 1");
    // Create api_keys table (simplified)
    db.exec(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        label TEXT NOT NULL,
        encrypted_key BLOB NOT NULL,
        base_url TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    // The function will proceed and likely fail due to missing API key, but should not throw consent error.
    // We expect it to throw about missing API key, not consent.
    await expect(classifyEmail(db, 'test-1')).rejects.toThrow('No API key configured. Add an OpenAI or Anthropic key in Settings.');
  });
});