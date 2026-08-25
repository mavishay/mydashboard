// electron/main/ipc/ticktick-handlers.ts

import type { IpcMain } from 'electron';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import {
  listAccounts,
  deleteAccount,
  createAccount,
  validateToken,
  getAccessToken,
} from '../auth/ticktick';
import { TickTickSync } from '../sync/ticktick-sync';
import { TickTickAdapter } from '../sync/ticktick-adapter';

// -- Zod Schemas -----------------------------------------------------------

const ConnectSchema = z.object({
  token: z.string().min(1),
  email: z.string().email(),
  displayName: z.string().min(1),
});

const DisconnectSchema = z.object({
  accountId: z.string().min(1),
});

const TaskActionSchema = z.object({
  accountId: z.string().min(1),
  projectId: z.string().min(1),
  taskId: z.string().min(1),
});

const CreateTaskSchema = z.object({
  accountId: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string().min(1),
  content: z.string().optional(),
  dueDate: z.string().optional(),
});

const UpdateTaskSchema = z.object({
  accountId: z.string().min(1),
  projectId: z.string().min(1),
  taskId: z.string().min(1),
  title: z.string().min(1).optional(),
  content: z.string().optional(),
  dueDate: z.string().optional(),
  status: z.enum(['0', '1']).optional(),
  sortOrder: z.number().optional(),
});

const ListTasksSchema = z
  .object({ accountId: z.string().optional() })
  .optional();

const ListTasksResponseSchema = z.array(
  z.object({
    id: z.string(),
    title: z.string(),
    content: z.string().nullable(),
    status: z.enum(['0', '1']),
    dueDate: z.string().nullable(),
    completedAt: z.string().nullable(),
    updatedAt: z.string(),
    projectId: z.string(),
    projectTitle: z.string().nullable(),
    source: z.string(),
  })
);

const StatusResponseSchema = z.object({
  status: z.enum(['idle', 'syncing', 'error']),
  lastSyncAt: z.string().nullable(),
  error: z.string().nullable(),
  accountCount: z.number(),
});

// -- Types -----------------------------------------------------------------

type AccountResponse = { id: string; email: string; displayName: string };

// -- Helpers ---------------------------------------------------------------

function listTickTickAccounts(db: Database.Database): AccountResponse[] {
  return listAccounts(db).map((a) => ({
    id: a.id,
    email: a.email,
    displayName: a.display_name,
  }));
}

function getTasksWithSource(
  db: Database.Database,
  accountId?: string
): z.infer<typeof ListTasksResponseSchema> {
  const sql = accountId
    ? `SELECT tt.id, tt.title, tt.content, tt.status, tt.due_date,
              tt.updated_at, tt.project_id, tp.name as project_name
       FROM ticktick_tasks tt
       JOIN ticktick_projects tp ON tt.project_id = tp.id
       WHERE tp.account_id = ? AND tt.is_deleted = 0
       ORDER BY tt.updated_at DESC`
    : `SELECT tt.id, tt.title, tt.content, tt.status, tt.due_date,
              tt.updated_at, tt.project_id, tp.name as project_name
       FROM ticktick_tasks tt
       JOIN ticktick_projects tp ON tt.project_id = tp.id
       WHERE tt.is_deleted = 0
       ORDER BY tt.updated_at DESC`;

  const rows = accountId
    ? (db.prepare(sql).all(accountId) as Array<{
        id: string;
        title: string;
        content: string | null;
        status: number;
        due_date: string | null;
        updated_at: string;
        project_id: string;
        project_name: string | null;
      }>)
    : (db.prepare(sql).all() as Array<{
        id: string;
        title: string;
        content: string | null;
        status: number;
        due_date: string | null;
        updated_at: string;
        project_id: string;
        project_name: string | null;
      }>);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    content: r.content,
    status: String(r.status) as '0' | '1',
    dueDate: r.due_date,
    completedAt: r.status === 1 ? r.updated_at : null,
    updatedAt: r.updated_at,
    projectId: r.project_id,
    projectTitle: r.project_name,
    source: 'TickTick',
  }));
}

// -- Handler registration --------------------------------------------------

export function registerTickTickHandlers(
  ipcMain: IpcMain,
  db: Database.Database
): void {
  ipcMain.handle(
    'ticktick:connect',
    async (_event, rawPayload: unknown) => {
      const parsed = ConnectSchema.safeParse(rawPayload);
      if (!parsed.success) {
        throw new Error(`Invalid payload: ${parsed.error.message}`);
      }

      const { token, email, displayName } = parsed.data;

      const valid = await validateToken(token);
      if (!valid) {
        throw new Error('Invalid TickTick access token');
      }

      const account = createAccount(db, email, displayName, token);
      return { id: account.id, email: account.email, displayName: account.display_name };
    }
  );

  ipcMain.handle(
    'ticktick:disconnect',
    async (_event, rawPayload: unknown) => {
      const parsed = DisconnectSchema.safeParse(rawPayload);
      if (!parsed.success) {
        throw new Error(`Invalid payload: ${parsed.error.message}`);
      }
      deleteAccount(db, parsed.data.accountId);
    }
  );

  ipcMain.handle(
    'ticktick:listAccounts',
    async (): Promise<AccountResponse[]> => {
      return listTickTickAccounts(db);
    }
  );

  ipcMain.handle(
    'ticktick:sync',
    async (
      _event,
      rawPayload: unknown
    ): Promise<{ success: boolean; error?: string }> => {
      const parsed = DisconnectSchema.safeParse(rawPayload);
      if (!parsed.success) {
        throw new Error(`Invalid payload: ${parsed.error.message}`);
      }
      const accountId = parsed.data.accountId;
      try {
        const accessToken = getAccessToken(db, accountId);
        const adapter = new TickTickAdapter(accessToken);
        const sync = new TickTickSync(db, accountId, adapter);
        await sync.runOnce();
        return { success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { success: false, error: message };
      }
    }
  );

  ipcMain.handle(
    'ticktick:status',
    async (): Promise<z.infer<typeof StatusResponseSchema>> => {
      const accounts = listTickTickAccounts(db);
      const lastSyncRow = db
        .prepare(`SELECT MAX(synced_at) as last_sync FROM ticktick_projects`)
        .get() as { last_sync: string | null } | undefined;

      return StatusResponseSchema.parse({
        status: 'idle',
        lastSyncAt: lastSyncRow?.last_sync ?? null,
        error: null,
        accountCount: accounts.length,
      });
    }
  );

  ipcMain.handle(
    'ticktick:listTasks',
    async (
      _event,
      rawPayload?: unknown
    ): Promise<z.infer<typeof ListTasksResponseSchema>> => {
      const parsed = ListTasksSchema.safeParse(rawPayload);
      const accountId = parsed.success ? parsed.data?.accountId : undefined;
      return ListTasksResponseSchema.parse(getTasksWithSource(db, accountId));
    }
  );

  ipcMain.handle(
    'ticktick:createTask',
    async (
      _event,
      rawPayload: unknown
    ): Promise<z.infer<typeof ListTasksResponseSchema>[number]> => {
      const parsed = CreateTaskSchema.safeParse(rawPayload);
      if (!parsed.success) {
        throw new Error(`Invalid payload: ${parsed.error.message}`);
      }
      const { accountId, projectId, title, content, dueDate } = parsed.data;
      const accessToken = getAccessToken(db, accountId);
      const adapter = new TickTickAdapter(accessToken);
      const remote = await adapter.createTask(projectId, {
        title,
        content,
        dueDate,
      });

      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO ticktick_tasks
           (id, project_id, title, content, due_date, status, sort_order,
            created_at, updated_at, synced_at, is_deleted)
         VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?, 0)`
      ).run(remote.id, projectId, title, content ?? null, dueDate ?? null, now, now, now);

      const projectRow = db
        .prepare(`SELECT name FROM ticktick_projects WHERE id = ?`)
        .get(projectId) as { name: string } | undefined;

      return ListTasksResponseSchema.parse([
        {
          id: remote.id,
          title: remote.title,
          content: remote.content,
          status: '0',
          dueDate: remote.dueDate,
          completedAt: null,
          updatedAt: now,
          projectId,
          projectTitle: projectRow?.name ?? null,
          source: 'TickTick',
        },
      ])[0];
    }
  );

  ipcMain.handle(
    'ticktick:updateTask',
    async (
      _event,
      rawPayload: unknown
    ): Promise<{ success: boolean }> => {
      const parsed = UpdateTaskSchema.safeParse(rawPayload);
      if (!parsed.success) {
        throw new Error(`Invalid payload: ${parsed.error.message}`);
      }
      const { accountId, taskId, title, content, dueDate, status, sortOrder } =
        parsed.data;
      const accessToken = getAccessToken(db, accountId);
      const adapter = new TickTickAdapter(accessToken);

      const updates: {
        title?: string;
        content?: string;
        dueDate?: string;
        status?: 0 | 1;
        sortOrder?: number;
      } = {};
      if (title !== undefined) updates.title = title;
      if (content !== undefined) updates.content = content;
      if (dueDate !== undefined) updates.dueDate = dueDate;
      if (status !== undefined) updates.status = Number(status) as 0 | 1;
      if (sortOrder !== undefined) updates.sortOrder = sortOrder;

      await adapter.updateTask(taskId, updates);

      const now = new Date().toISOString();
      db.prepare(
        `UPDATE ticktick_tasks
         SET title = COALESCE(?, title),
             content = COALESCE(?, content),
             due_date = COALESCE(?, due_date),
             status = COALESCE(?, status),
             sort_order = COALESCE(?, sort_order),
             updated_at = ?,
             synced_at = ?
         WHERE id = ?`
      ).run(
        title ?? null,
        content ?? null,
        dueDate ?? null,
        status !== undefined ? Number(status) : null,
        sortOrder ?? null,
        now,
        now,
        taskId
      );

      return { success: true };
    }
  );

  ipcMain.handle(
    'ticktick:deleteTask',
    async (
      _event,
      rawPayload: unknown
    ): Promise<{ success: boolean }> => {
      const parsed = TaskActionSchema.safeParse(rawPayload);
      if (!parsed.success) {
        throw new Error(`Invalid payload: ${parsed.error.message}`);
      }
      const { accountId, taskId } = parsed.data;
      const accessToken = getAccessToken(db, accountId);
      const adapter = new TickTickAdapter(accessToken);

      await adapter.deleteTask(taskId);

      db.prepare(`DELETE FROM ticktick_tasks WHERE id = ?`).run(taskId);

      return { success: true };
    }
  );
}
