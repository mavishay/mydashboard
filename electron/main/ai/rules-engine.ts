import type Database from 'better-sqlite3';
import {
  evaluateConditions,
  type EmailData,
  type RuleCondition,
} from './conditions';

export type Classification = 'urgent' | 'action' | 'fyi' | 'noise';
export type ClassificationSource = 'llm' | 'rule';

export interface ClassificationRule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  conditions: RuleCondition[];
  action: 'classify' | 'skip_llm';
  classification: Classification | null;
  createdAt: string;
  updatedAt: string;
}

export interface RuleEvaluationResult {
  classification: Classification;
  source: ClassificationSource;
  ruleId: string | null;
  skipLlm: boolean;
}

interface RuleRow {
  id: string;
  name: string;
  enabled: number;
  priority: number;
  conditions: string;
  action: string;
  classification: string | null;
  created_at: string;
  updated_at: string;
}

function rowToRule(row: RuleRow): ClassificationRule {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled === 1,
    priority: row.priority,
    conditions: JSON.parse(row.conditions) as RuleCondition[],
    action: row.action as 'classify' | 'skip_llm',
    classification: row.classification as Classification | null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getAllRules(db: Database.Database): ClassificationRule[] {
  const rows = db
    .prepare('SELECT * FROM classification_rules ORDER BY priority DESC, created_at DESC')
    .all() as RuleRow[];
  return rows.map(rowToRule);
}

export function getEnabledRules(db: Database.Database): ClassificationRule[] {
  const rows = db
    .prepare('SELECT * FROM classification_rules WHERE enabled = 1 ORDER BY priority DESC')
    .all() as RuleRow[];
  return rows.map(rowToRule);
}

export function createRule(
  db: Database.Database,
  rule: Omit<ClassificationRule, 'id' | 'createdAt' | 'updatedAt'>
): ClassificationRule {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO classification_rules (id, name, enabled, priority, conditions, action, classification, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    rule.name,
    rule.enabled ? 1 : 0,
    rule.priority,
    JSON.stringify(rule.conditions),
    rule.action,
    rule.classification,
    now,
    now
  );

  return {
    ...rule,
    id,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateRule(
  db: Database.Database,
  id: string,
  updates: Partial<Pick<ClassificationRule, 'name' | 'enabled' | 'priority' | 'conditions' | 'action' | 'classification'>>
): ClassificationRule | null {
  const existing = db
    .prepare('SELECT * FROM classification_rules WHERE id = ?')
    .get(id) as RuleRow | undefined;

  if (!existing) return null;

  const merged = {
    name: updates.name ?? existing.name,
    enabled: updates.enabled !== undefined ? (updates.enabled ? 1 : 0) : existing.enabled,
    priority: updates.priority ?? existing.priority,
    conditions: updates.conditions ? JSON.stringify(updates.conditions) : existing.conditions,
    action: updates.action ?? existing.action,
    classification: updates.classification !== undefined ? updates.classification : existing.classification,
    updated_at: new Date().toISOString(),
  };

  db.prepare(
    `UPDATE classification_rules SET name = ?, enabled = ?, priority = ?, conditions = ?, action = ?, classification = ?, updated_at = ? WHERE id = ?`
  ).run(merged.name, merged.enabled, merged.priority, merged.conditions, merged.action, merged.classification, merged.updated_at, id);

  return rowToRule({
    ...existing,
    ...merged,
    enabled: merged.enabled,
  } as RuleRow);
}

export function deleteRule(db: Database.Database, id: string): boolean {
  const result = db.prepare('DELETE FROM classification_rules WHERE id = ?').run(id);
  return result.changes > 0;
}

export function evaluateRules(
  db: Database.Database,
  email: EmailData
): RuleEvaluationResult | null {
  const rules = getEnabledRules(db);

  for (const rule of rules) {
    if (rule.conditions.length === 0) continue;
    
    if (evaluateConditions(email, rule.conditions)) {
      if (rule.action === 'skip_llm' && rule.classification) {
        return {
          classification: rule.classification,
          source: 'rule',
          ruleId: rule.id,
          skipLlm: true,
        };
      }
      if (rule.action === 'classify' && rule.classification) {
        return {
          classification: rule.classification,
          source: 'rule',
          ruleId: rule.id,
          skipLlm: false,
        };
      }
    }
  }

  return null;
}

export function testRule(
  conditions: RuleCondition[],
  email: EmailData
): boolean {
  return evaluateConditions(email, conditions);
}

export function testRuleMatch(
  conditions: RuleCondition[],
  email: EmailData
): { matched: boolean } {
  return { matched: evaluateConditions(email, conditions) };
}

export function seedDefaultRules(db: Database.Database): void {
  const existing = getAllRules(db);
  if (existing.length > 0) return;

  const defaults: Omit<ClassificationRule, 'id' | 'createdAt' | 'updatedAt'>[] = [
    {
      name: 'Newsletter Detection',
      enabled: true,
      priority: 10,
      conditions: [{ field: 'from', operator: 'contains', value: 'newsletter' }],
      action: 'skip_llm',
      classification: 'fyi',
    },
    {
      name: 'Spam Detection',
      enabled: true,
      priority: 20,
      conditions: [{ field: 'from', operator: 'contains', value: 'spam' }],
      action: 'skip_llm',
      classification: 'noise',
    },
  ];

  for (const rule of defaults) {
    createRule(db, rule);
  }
}
