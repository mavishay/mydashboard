import type Database from 'better-sqlite3';
import { z } from 'zod';
import { CalendarSync, type CalendarSyncStatus } from '../calendar/calendar-sync';

const SyncSchema = z.object({
  accountId: z.string().min(1),
});

const DateRangeSchema = z.object({
  startDate: z.string().min(1),
  endDate: z.string().min(1),
});

export interface CalendarEventResponse {
  id: string;
  accountId: string;
  title: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  location: string | null;
  description: string | null;
  htmlLink: string | null;
  calendarName: string | null;
  accountEmail: string;
  accountColor: string | null;
}

export function registerCalendarHandlers(
  ipcMain: typeof import('electron').ipcMain,
  db: Database.Database
): { calendarSync: CalendarSync } {
  const calendarSync = new CalendarSync(db);

  ipcMain.handle(
    'calendar:sync',
    async (_event, rawPayload: { accountId: string }) => {
      const parsed = SyncSchema.safeParse(rawPayload);
      if (!parsed.success) {
        throw new Error(`Invalid payload: ${parsed.error.message}`);
      }

      const status = await calendarSync.syncAccount(parsed.data.accountId);
      return {
        accountId: status.accountId,
        status: status.status,
        lastSyncAt: status.lastSyncAt,
        error: status.error ?? undefined,
        fetched: status.fetched,
      };
    }
  );

  ipcMain.handle('calendar:syncAll', async () => {
    const statuses = await calendarSync.syncAll();
    return statuses.map((s) => ({
      accountId: s.accountId,
      status: s.status,
      lastSyncAt: s.lastSyncAt,
      error: s.error ?? undefined,
      fetched: s.fetched,
    }));
  });

  ipcMain.handle('calendar:getTodayEvents', async (): Promise<CalendarEventResponse[]> => {
    return calendarSync.getTodayEvents();
  });

  ipcMain.handle(
    'calendar:getFilteredEvents',
    async (_, rawPayload: { startDate: string; endDate: string }): Promise<CalendarEventResponse[]> => {
      const parsed = DateRangeSchema.safeParse(rawPayload);
      if (!parsed.success) {
        throw new Error(`Invalid payload: ${parsed.error.message}`);
      }

      return calendarSync.getEventsForDateRange(parsed.data.startDate, parsed.data.endDate);
    }
  );

  ipcMain.handle('calendar:status', async (): Promise<CalendarSyncStatus[]> => {
    const accounts = db
      .prepare("SELECT id FROM accounts WHERE type IN ('gmail', 'google_tasks')")
      .all() as { id: string }[];
    
    return accounts.map((account) => ({
      accountId: account.id,
      status: 'idle' as const,
      lastSyncAt: null,
      error: null,
      fetched: 0,
    }));
  });

  return { calendarSync };
}