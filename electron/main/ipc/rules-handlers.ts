import type { IpcMain } from 'electron';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import {
  getAllRules,
  createRule,
  updateRule,
  deleteRule,
  testRule,
  type Classification,
} from '../ai/rules-engine';
import type { RuleCondition } from '../ai/conditions';

const ConditionSchema = z.object({
  field: z.enum(['from', 'to', 'subject', 'body', 'domain', 'date']),
  operator: z.enum(['contains', 'equals', 'starts_with', 'ends_with', 'matches_regex']),
  value: z.string().min(1),
});

const CreateRuleSchema = z.object({
  name: z.string().min(1).max(100),
  enabled: z.boolean(),
  priority: z.number().int().min(0).max(1000),
  conditions: z.array(ConditionSchema).min(1),
  action: z.enum(['classify', 'skip_llm']),
  classification: z.enum(['urgent', 'action', 'fyi', 'noise']).nullable(),
});

const UpdateRuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
  enabled: z.boolean().optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  conditions: z.array(ConditionSchema).min(1).optional(),
  action: z.enum(['classify', 'skip_llm']).optional(),
  classification: z.enum(['urgent', 'action', 'fyi', 'noise']).nullable().optional(),
});

const DeleteRuleSchema = z.object({
  id: z.string().min(1),
});

const TestRuleSchema = z.object({
  conditions: z.array(ConditionSchema).min(1),
  email: z.object({
    from: z.string().nullable().optional(),
    to: z.string().nullable().optional(),
    subject: z.string().nullable().optional(),
    body: z.string().nullable().optional(),
    date: z.string().nullable().optional(),
  }),
});

type CreateRulePayload = z.infer<typeof CreateRuleSchema>;
type UpdateRulePayload = z.infer<typeof UpdateRuleSchema>;
type DeleteRulePayload = z.infer<typeof DeleteRuleSchema>;
type TestRulePayload = z.infer<typeof TestRuleSchema>;

export function registerRulesHandlers(
  ipcMain: IpcMain,
  db: Database.Database
): void {
  ipcMain.handle('rules:getAll', async () => {
    return getAllRules(db);
  });

  ipcMain.handle(
    'rules:create',
    async (_event, payload: CreateRulePayload) => {
      const parsed = CreateRuleSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(`Invalid payload: ${parsed.error.message}`);
      }

      if (parsed.data.action === 'skip_llm' && !parsed.data.classification) {
        throw new Error('Classification is required when action is skip_llm');
      }

      return createRule(db, {
        name: parsed.data.name,
        enabled: parsed.data.enabled,
        priority: parsed.data.priority,
        conditions: parsed.data.conditions as RuleCondition[],
        action: parsed.data.action as 'classify' | 'skip_llm',
        classification: parsed.data.classification as Classification | null,
      });
    }
  );

  ipcMain.handle(
    'rules:update',
    async (_event, payload: UpdateRulePayload) => {
      const parsed = UpdateRuleSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(`Invalid payload: ${parsed.error.message}`);
      }

      const { id, ...updates } = parsed.data;
      const result = updateRule(db, id, {
        ...updates,
        conditions: updates.conditions as RuleCondition[] | undefined,
        action: updates.action as 'classify' | 'skip_llm' | undefined,
        classification: updates.classification as Classification | null | undefined,
      });

      if (!result) {
        throw new Error('Rule not found');
      }

      return result;
    }
  );

  ipcMain.handle(
    'rules:delete',
    async (_event, payload: DeleteRulePayload) => {
      const parsed = DeleteRuleSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(`Invalid payload: ${parsed.error.message}`);
      }

      const deleted = deleteRule(db, parsed.data.id);
      if (!deleted) {
        throw new Error('Rule not found');
      }
    }
  );

  ipcMain.handle(
    'rules:test',
    async (_event, payload: TestRulePayload) => {
      const parsed = TestRuleSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(`Invalid payload: ${parsed.error.message}`);
      }

      const matched = testRule(
        parsed.data.conditions as RuleCondition[],
        {
          from: parsed.data.email.from ?? null,
          to: parsed.data.email.to ?? null,
          subject: parsed.data.email.subject ?? null,
          body: parsed.data.email.body ?? null,
          date: parsed.data.email.date ?? null,
        }
      );

      return { matched };
    }
  );
}
