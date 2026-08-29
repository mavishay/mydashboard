import type { IpcMain } from 'electron';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { getValidAccessToken } from '../auth/google-tasks';
import { listTaskLists, insertTask } from '../sync/google-tasks-api';
import { getAccessToken } from '../auth/ticktick';
import { TickTickAdapter } from '../sync/ticktick-adapter';

// Zod schemas
const CreateFromEmailSchema = z.object({
  listType: z.enum(['google-tasks', 'ticktick']),
  accountId: z.string().min(1),
  listId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
});

const ListListsSchema = z.object({
  accountId: z.string().min(1),
});

const ListProjectsSchema = z.object({
  accountId: z.string().min(1),
});

export function registerTasksHandlers(
  ipcMain: IpcMain,
  db: Database.Database
): void {
  // google-tasks:listLists
  ipcMain.handle(
    'google-tasks:listLists',
    async (
      _event,
      rawPayload: unknown
    ): Promise<Array<{ id: string; title: string }>> => {
      const parsed = ListListsSchema.safeParse(rawPayload);
      if (!parsed.success) {
        throw new Error(`Invalid payload: ${parsed.error.message}`);
      }
      const { accountId } = parsed.data;
      const accessToken = await getValidAccessToken(db, accountId);
      const lists = await listTaskLists(accessToken);
      return lists.map((l) => ({ id: l.id, title: l.title }));
    }
  );

  // ticktick:listProjects
  ipcMain.handle(
    'ticktick:listProjects',
    async (
      _event,
      rawPayload: unknown
    ): Promise<Array<{ id: string; name: string; kind: string }>> => {
      const parsed = ListProjectsSchema.safeParse(rawPayload);
      if (!parsed.success) {
        throw new Error(`Invalid payload: ${parsed.error.message}`);
      }
      const { accountId } = parsed.data;
      const accessToken = getAccessToken(db, accountId);
      const adapter = new TickTickAdapter(accessToken);
      return adapter.listProjects();
    }
  );

  // tasks:createFromEmail — delegates to same API calls as google-tasks:createTask / ticktick:createTask
  ipcMain.handle(
    'tasks:createFromEmail',
    async (
      _event,
      rawPayload: unknown
    ): Promise<{ success: boolean; taskId?: string; error?: string }> => {
      const parsed = CreateFromEmailSchema.safeParse(rawPayload);
      if (!parsed.success) {
        throw new Error(`Invalid payload: ${parsed.error.message}`);
      }
      const { listType, accountId, listId, title, description } = parsed.data;
      try {
        if (listType === 'google-tasks') {
          const accessToken = await getValidAccessToken(db, accountId);
          const remote = await insertTask(accessToken, listId, title, description);
          const now = new Date().toISOString();
          db.prepare(
            `INSERT INTO google_tasks
               (id, list_id, title, notes, status, position, parent_id, completed_at, updated_at, synced_at, is_deleted)
             VALUES (?, ?, ?, ?, 'needsAction', '0', NULL, NULL, ?, ?, 0)`
          ).run(remote.id, listId, title, description ?? null, now, now);
          return { success: true, taskId: remote.id };
        } else if (listType === 'ticktick') {
          const accessToken = getAccessToken(db, accountId);
          const adapter = new TickTickAdapter(accessToken);
          const remote = await adapter.createTask(listId, {
            title,
            content: description,
          });
          const now = new Date().toISOString();
          db.prepare(
            `INSERT INTO ticktick_tasks
               (id, project_id, title, content, due_date, status, sort_order,
                created_at, updated_at, synced_at, is_deleted)
             VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?, 0)`
          ).run(remote.id, listId, title, description ?? null, null, now, now, now);
          return { success: true, taskId: remote.id };
        } else {
          throw new Error('Invalid listType');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { success: false, error: message };
      }
    }
  );
}