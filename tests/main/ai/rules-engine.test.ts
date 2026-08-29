import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rmSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/test-app'),
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn().mockReturnValue(true),
    encryptString: vi.fn().mockReturnValue(Buffer.from('encrypted')),
    decryptString: vi.fn().mockReturnValue('decrypted-key'),
  },
}));

function testDbPath(): string {
  return join(__dirname, `__test_rules_${randomBytes(4).toString('hex')}.db`);
}

function cleanupDb(path: string): void {
  try { rmSync(path); } catch {}
  try { rmSync(path + '-wal'); } catch {}
  try { rmSync(path + '-shm'); } catch {}
}

describe('rules-engine', () => {
  let dbPath: string;
  let db: any;

  beforeEach(async () => {
    dbPath = testDbPath();
    const { initializeDatabase } = await import('../../../electron/main/db');
    db = initializeDatabase(dbPath);
  });

  describe('CRUD', () => {
    it('creates and retrieves rules', async () => {
      const { createRule, getAllRules } = await import('../../../electron/main/ai/rules-engine');

      const rule = createRule(db, {
        name: 'Test Rule',
        enabled: true,
        priority: 10,
        conditions: [{ field: 'from', operator: 'contains', value: 'spam' }],
        action: 'skip_llm',
        classification: 'noise',
      });

      expect(rule.id).toBeDefined();
      expect(rule.name).toBe('Test Rule');

      const rules = getAllRules(db);
      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe(rule.id);
    });

    it('updates rules', async () => {
      const { createRule, updateRule, getAllRules } = await import('../../../electron/main/ai/rules-engine');

      const rule = createRule(db, {
        name: 'Original',
        enabled: true,
        priority: 0,
        conditions: [{ field: 'from', operator: 'contains', value: 'x' }],
        action: 'classify',
        classification: 'urgent',
      });

      updateRule(db, rule.id, {
        name: 'Updated',
        enabled: false,
        priority: 100,
        classification: 'fyi',
      });

      const rules = getAllRules(db);
      expect(rules[0].name).toBe('Updated');
      expect(rules[0].enabled).toBe(false);
      expect(rules[0].priority).toBe(100);
      expect(rules[0].classification).toBe('fyi');
    });

    it('deletes rules', async () => {
      const { createRule, deleteRule, getAllRules } = await import('../../../electron/main/ai/rules-engine');

      const rule = createRule(db, {
        name: 'Delete Me',
        enabled: true,
        priority: 0,
        conditions: [{ field: 'from', operator: 'contains', value: 'x' }],
        action: 'classify',
        classification: 'urgent',
      });

      deleteRule(db, rule.id);
      expect(getAllRules(db)).toHaveLength(0);
    });

    it('seeds default rules without duplicates', async () => {
      const { seedDefaultRules, getAllRules } = await import('../../../electron/main/ai/rules-engine');

      seedDefaultRules(db);
      const count1 = getAllRules(db).length;

      seedDefaultRules(db);
      const count2 = getAllRules(db).length;

      expect(count2).toBe(count1);
    });
  });

  describe('evaluateRules', () => {
    it('returns null when no rules match', async () => {
      const { createRule, evaluateRules } = await import('../../../electron/main/ai/rules-engine');

      createRule(db, {
        name: 'Newsletter',
        enabled: true,
        priority: 0,
        conditions: [{ field: 'from', operator: 'contains', value: 'newsletter' }],
        action: 'skip_llm',
        classification: 'fyi',
      });

      const result = evaluateRules(db, { from: 'boss@company.com' });
      expect(result).toBeNull();
    });

    it('returns skip_llm result for matching rule', async () => {
      const { createRule, evaluateRules } = await import('../../../electron/main/ai/rules-engine');

      const rule = createRule(db, {
        name: 'Newsletter',
        enabled: true,
        priority: 0,
        conditions: [{ field: 'from', operator: 'contains', value: 'newsletter' }],
        action: 'skip_llm',
        classification: 'fyi',
      });

      const result = evaluateRules(db, { from: 'newsletter@company.com' });
      expect(result).not.toBeNull();
      expect(result?.classification).toBe('fyi');
      expect(result?.source).toBe('rule');
      expect(result?.ruleId).toBe(rule.id);
      expect(result?.skipLlm).toBe(true);
    });

    it('returns classify result without skipLlm flag', async () => {
      const { createRule, evaluateRules } = await import('../../../electron/main/ai/rules-engine');

      const rule = createRule(db, {
        name: 'Boss Override',
        enabled: true,
        priority: 10,
        conditions: [{ field: 'from', operator: 'contains', value: 'boss' }],
        action: 'classify',
        classification: 'urgent',
      });

      const result = evaluateRules(db, { from: 'boss@company.com' });
      expect(result).not.toBeNull();
      expect(result?.classification).toBe('urgent');
      expect(result?.skipLlm).toBe(false);
      expect(result?.ruleId).toBe(rule.id);
    });

    it('ignores disabled rules', async () => {
      const { createRule, updateRule, evaluateRules } = await import('../../../electron/main/ai/rules-engine');

      const rule = createRule(db, {
        name: 'Disabled',
        enabled: true,
        priority: 0,
        conditions: [{ field: 'from', operator: 'contains', value: 'spam' }],
        action: 'skip_llm',
        classification: 'noise',
      });

      updateRule(db, rule.id, { enabled: false });

      const result = evaluateRules(db, { from: 'spam@junk.com' });
      expect(result).toBeNull();
    });

    it('uses priority order', async () => {
      const { createRule, evaluateRules } = await import('../../../electron/main/ai/rules-engine');

      createRule(db, {
        name: 'Low Priority',
        enabled: true,
        priority: 0,
        conditions: [{ field: 'from', operator: 'contains', value: 'spam' }],
        action: 'skip_llm',
        classification: 'noise',
      });

      createRule(db, {
        name: 'High Priority',
        enabled: true,
        priority: 100,
        conditions: [{ field: 'from', operator: 'contains', value: 'spam' }],
        action: 'skip_llm',
        classification: 'urgent',
      });

      const result = evaluateRules(db, { from: 'spam@junk.com' });
      expect(result?.classification).toBe('urgent');
    });

    it('handles multiple conditions with AND logic', async () => {
      const { createRule, evaluateRules } = await import('../../../electron/main/ai/rules-engine');

      createRule(db, {
        name: 'Spam Newsletter',
        enabled: true,
        priority: 0,
        conditions: [
          { field: 'from', operator: 'contains', value: 'spam' },
          { field: 'subject', operator: 'contains', value: 'buy' },
        ],
        action: 'skip_llm',
        classification: 'noise',
      });

      expect(evaluateRules(db, { from: 'spam@junk.com', subject: 'buy now' })).not.toBeNull();
      expect(evaluateRules(db, { from: 'spam@junk.com', subject: 'hello' })).toBeNull();
    });

    it('skips rules with empty conditions', async () => {
      const { createRule, evaluateRules } = await import('../../../electron/main/ai/rules-engine');

      createRule(db, {
        name: 'Empty',
        enabled: true,
        priority: 0,
        conditions: [],
        action: 'skip_llm',
        classification: 'noise',
      });

      const result = evaluateRules(db, { from: 'any@any.com' });
      expect(result).toBeNull();
    });
  });

  describe('testRuleMatch', () => {
    it('returns true when test email matches conditions', async () => {
      const { testRuleMatch } = await import('../../../electron/main/ai/rules-engine');

      const result = testRuleMatch(
        [{ field: 'from', operator: 'contains', value: 'spam' }],
        { from: 'spam@junk.com', to: null, subject: null, body: null }
      );

      expect(result.matched).toBe(true);
    });

    it('returns false when test email does not match', async () => {
      const { testRuleMatch } = await import('../../../electron/main/ai/rules-engine');

      const result = testRuleMatch(
        [{ field: 'from', operator: 'contains', value: 'spam' }],
        { from: 'legit@company.com', to: null, subject: null, body: null }
      );

      expect(result.matched).toBe(false);
    });
  });

  db?.close();
  cleanupDb(dbPath);
});
