import { describe, it, expect, afterEach, vi } from 'vitest';
import { rmSync } from 'fs';
import { join } from 'path';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/test-app'),
  },
}));

const TEST_DB_PATH = join(__dirname, '__test__.db');

afterEach(() => {
  try { rmSync(TEST_DB_PATH); } catch {}
  try { rmSync(TEST_DB_PATH + '-wal'); } catch {}
  try { rmSync(TEST_DB_PATH + '-shm'); } catch {}
});

describe('initializeDatabase', () => {
  it('creates database with WAL mode enabled', async () => {
    const { initializeDatabase } = await import('../../electron/main/db');
    const db = initializeDatabase(TEST_DB_PATH);
    const mode = db.pragma('journal_mode', { simple: true });
    expect(mode).toBe('wal');
    db.close();
  });

  it('is idempotent on repeated calls', async () => {
    const { initializeDatabase } = await import('../../electron/main/db');
    const db1 = initializeDatabase(TEST_DB_PATH);
    db1.close();
    const db2 = initializeDatabase(TEST_DB_PATH);
    const tables = db2.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all();
    expect(tables.length).toBeGreaterThan(0);
    db2.close();
  });

  it('creates expected tables', async () => {
    const { initializeDatabase } = await import('../../electron/main/db');
    const db = initializeDatabase(TEST_DB_PATH);
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as { name: string }[];
    const names = tables.map(t => t.name);
    expect(names).toContain('accounts');
    expect(names).toContain('emails');
    expect(names).toContain('tasks');
    expect(names).toContain('oauth_tokens');
    expect(names).toContain('schema_migrations');
    db.close();
  });

  it('parameterized queries prevent SQL injection', async () => {
    const { initializeDatabase } = await import('../../electron/main/db');
    const db = initializeDatabase(TEST_DB_PATH);

    const maliciousInputs = [
      "' OR 1=1 --",
      "'; DROP TABLE accounts; --",
      "UNION SELECT * FROM passwords--",
      "' OR ''='",
    ];

    for (const payload of maliciousInputs) {
      const result = db.prepare(
        'SELECT * FROM accounts WHERE email = ?'
      ).all(payload);
      expect(result).toEqual([]);
    }

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as { name: string }[];
    const names = tables.map(t => t.name);
    expect(names).toContain('accounts');

    db.close();
  });
});
