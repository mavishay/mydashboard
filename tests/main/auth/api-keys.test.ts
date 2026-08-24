import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync } from 'fs';
import {
  saveApiKey,
  listApiKeys,
  deleteApiKey,
  getEncryptedKey,
  getDecryptedKey,
  getApiKeyMeta,
} from '../../../electron/main/auth/api-keys';
import migration001 from '../../../electron/main/db/migrations/001-initial.sql?raw';
import migration002 from '../../../electron/main/db/migrations/002-gmail-oauth.sql?raw';
import migration003 from '../../../electron/main/db/migrations/003-api-keys.sql?raw';

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn().mockReturnValue(true),
    encryptString: vi.fn((str: string) => Buffer.from(str, 'utf-8')),
    decryptString: vi.fn((buf: Buffer) => buf.toString('utf-8')),
  },
}));

function createTestDb(): Database.Database {
  const dir = join(tmpdir(), `test-api-keys-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  const db = new Database(join(dir, 'test.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(migration001);
  db.exec(migration002);
  db.exec(migration003);
  return db;
}

describe('API Key auth module', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it('saveApiKey stores and retrieves key metadata', () => {
    const meta = saveApiKey(db, 'openai', 'Test Key', 'sk-test123');

    expect(meta.id).toBeDefined();
    expect(meta.provider).toBe('openai');
    expect(meta.label).toBe('Test Key');
    expect(meta.baseUrl).toBeUndefined();

    const retrieved = getApiKeyMeta(db, meta.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.provider).toBe('openai');
    expect(retrieved?.label).toBe('Test Key');
  });

  it('saveApiKey with liteLLM stores baseUrl', () => {
    const meta = saveApiKey(db, 'litellm', 'LiteLLM Key', 'sk-test', 'http://localhost:4000');

    expect(meta.provider).toBe('litellm');
    expect(meta.baseUrl).toBe('http://localhost:4000');

    const retrieved = getApiKeyMeta(db, meta.id);
    expect(retrieved?.baseUrl).toBe('http://localhost:4000');
  });

  it('listApiKeys returns all keys', () => {
    saveApiKey(db, 'openai', 'Key 1', 'sk-1');
    saveApiKey(db, 'anthropic', 'Key 2', 'sk-2');

    const keys = listApiKeys(db);
    expect(keys).toHaveLength(2);
  });

  it('deleteApiKey removes key', () => {
    const meta = saveApiKey(db, 'openai', 'To Delete', 'sk-delete');

    deleteApiKey(db, meta.id);

    const retrieved = getApiKeyMeta(db, meta.id);
    expect(retrieved).toBeNull();
  });

  it('getEncryptedKey returns encrypted buffer', () => {
    const meta = saveApiKey(db, 'openai', 'Encrypted', 'sk-encrypted');

    const encrypted = getEncryptedKey(db, meta.id);
    expect(encrypted).toBeInstanceOf(Buffer);
    expect(encrypted?.length).toBeGreaterThan(0);
  });

  it('getDecryptedKey returns original key', () => {
    const originalKey = 'sk-my-secret-key-12345';
    const meta = saveApiKey(db, 'openai', 'Decrypt Test', originalKey);

    const decrypted = getDecryptedKey(db, meta.id);
    expect(decrypted).toBe(originalKey);
  });

  it('getApiKeyMeta returns null for nonexistent key', () => {
    const result = getApiKeyMeta(db, 'nonexistent-id');
    expect(result).toBeNull();
  });

  it('getDecryptedKey returns null for nonexistent key', () => {
    const result = getDecryptedKey(db, 'nonexistent-id');
    expect(result).toBeNull();
  });
});
