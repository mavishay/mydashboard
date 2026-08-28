import type { IpcMain } from 'electron';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import {
  getSetupStatus,
  markStepComplete,
  recordSetupEvent,
  hasSetupStarted,
  type SetupEventType,
} from '../onboarding/setup-tracker';

export const GetStatusSchema = z.object({});

export const SetStepCompleteSchema = z.object({
  stepId: z.string(),
});

export const RecordSetupEventSchema = z.object({
  eventType: z.enum(['setup_started', 'setup_step_completed', 'setup_completed', 'setup_resumed']),
  stepId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const StartTrackingSchema = z.object({});

export function registerSetupHandlers(
  ipcMain: IpcMain,
  db: Database.Database
): void {
  ipcMain.handle('onboarding:getStatus', async () => {
    return getSetupStatus(db);
  });

  ipcMain.handle(
    'onboarding:setStepComplete',
    async (_event, payload) => {
      const parsed = SetStepCompleteSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(`Invalid payload: ${parsed.error.message}`);
      }
      markStepComplete(db, parsed.data.stepId);
    }
  );

  ipcMain.handle(
    'onboarding:recordSetupEvent',
    async (_event, payload) => {
      const parsed = RecordSetupEventSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(`Invalid payload: ${parsed.error.message}`);
      }
      recordSetupEvent(db, {
        eventType: parsed.data.eventType as SetupEventType,
        stepId: parsed.data.stepId,
        metadata: parsed.data.metadata,
      });
    }
  );

  ipcMain.handle('onboarding:startTracking', async () => {
    const existing = getSetupStatus(db);
    if (!hasSetupStarted(db)) {
      recordSetupEvent(db, { eventType: 'setup_started' });
    }
    return existing;
  });
}
