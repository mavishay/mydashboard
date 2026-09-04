import { describe, it, expect } from 'vitest';
import { evaluateConditions, matchesCondition } from '../../../electron/main/ai/conditions';
import type { RuleCondition } from '../../../electron/main/ai/rules-engine';

describe('conditions', () => {
  describe('matchesCondition', () => {
    it('matches contains operator', () => {
      const cond: RuleCondition = { field: 'from', operator: 'contains', value: 'spam' };
      expect(matchesCondition({ from: 'spam@junk.com' }, cond)).toBe(true);
      expect(matchesCondition({ from: 'legit@company.com' }, cond)).toBe(false);
    });

    it('matches contains case-insensitive', () => {
      const cond: RuleCondition = { field: 'subject', operator: 'contains', value: 'URGENT' };
      expect(matchesCondition({ subject: 'urgent message' }, cond)).toBe(true);
    });

    it('matches not_contains operator', () => {
      const cond: RuleCondition = { field: 'from', operator: 'not_contains', value: 'spam' };
      expect(matchesCondition({ from: 'legit@company.com' }, cond)).toBe(true);
      expect(matchesCondition({ from: 'spam@junk.com' }, cond)).toBe(false);
    });

    it('matches equals operator', () => {
      const cond: RuleCondition = { field: 'from', operator: 'equals', value: 'boss@company.com' };
      expect(matchesCondition({ from: 'boss@company.com' }, cond)).toBe(true);
      expect(matchesCondition({ from: 'BOSS@company.com' }, cond)).toBe(true);
      expect(matchesCondition({ from: 'other@company.com' }, cond)).toBe(false);
    });

    it('matches starts_with operator', () => {
      const cond: RuleCondition = { field: 'from', operator: 'starts_with', value: 'noreply' };
      expect(matchesCondition({ from: 'noreply@company.com' }, cond)).toBe(true);
      expect(matchesCondition({ from: 'reply@company.com' }, cond)).toBe(false);
    });

    it('matches ends_with operator', () => {
      const cond: RuleCondition = { field: 'from', operator: 'ends_with', value: '@company.com' };
      expect(matchesCondition({ from: 'boss@company.com' }, cond)).toBe(true);
      expect(matchesCondition({ from: 'boss@gmail.com' }, cond)).toBe(false);
    });

    it('matches regex operator (case-insensitive)', () => {
      const cond: RuleCondition = { field: 'from', operator: 'matches_regex', value: '^[a-z]+@' };
      expect(matchesCondition({ from: 'john@example.com' }, cond)).toBe(true);
      expect(matchesCondition({ from: 'JOHN@example.com' }, cond)).toBe(true);
    });

    it('matches domain field with regex', () => {
      const cond: RuleCondition = { field: 'domain', operator: 'matches_regex', value: '\\.ru$' };
      expect(matchesCondition({ domain: 'mail.ru' }, cond)).toBe(true);
      expect(matchesCondition({ domain: 'mail.com' }, cond)).toBe(false);
    });

    it('returns false for unknown field', () => {
      const cond: RuleCondition = { field: 'from', operator: 'contains', value: 'x' };
      expect(matchesCondition({}, cond)).toBe(false);
    });

    it('returns false for unknown operator', () => {
      const cond: RuleCondition = { field: 'from', operator: 'unknown_op' as any, value: 'x' };
      expect(matchesCondition({ from: 'x' }, cond)).toBe(false);
    });

    it('treats null field as empty string', () => {
      const cond: RuleCondition = { field: 'body', operator: 'contains', value: 'test' };
      expect(matchesCondition({ body: null }, cond)).toBe(false);
    });
  });

  describe('evaluateConditions', () => {
    it('returns true for empty conditions array', () => {
      expect(evaluateConditions({ from: 'a@b.com' }, [])).toBe(true);
    });

    it('returns true when all conditions match (AND logic)', () => {
      const conds: RuleCondition[] = [
        { field: 'from', operator: 'contains', value: 'spam' },
        { field: 'subject', operator: 'contains', value: 'buy' },
      ];
      expect(evaluateConditions({ from: 'spam@junk.com', subject: 'buy now' }, conds)).toBe(true);
    });

    it('returns false when any condition fails', () => {
      const conds: RuleCondition[] = [
        { field: 'from', operator: 'contains', value: 'spam' },
        { field: 'subject', operator: 'contains', value: 'buy' },
      ];
      expect(evaluateConditions({ from: 'spam@junk.com', subject: 'hello' }, conds)).toBe(false);
    });
  });
});
