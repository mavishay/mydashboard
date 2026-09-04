import type { IpcMain } from 'electron';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import {
  listAccounts,
  deleteAccount,
  createAccount,
  storeGoogleTasksTokens,
  startAuthFlow,
} from '../auth/google-tasks';
import { GoogleTasksSync } from '../sync/google-tasks-sync';

const ConnectResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
});

type AccountResponse = { id: string; email: string; displayName: string };

const ListTasksResponseSchema = z.array(
  z.object({
    id: z.string(),
    title: z.string(),
    notes: z.string().nullable(),
    status: z.enum(['needsAction', 'completed']),
    due: z.string().nullable(),
    completedAt: z.string().nullable(),
    updatedAt: z.string(),
    listId: z.string(),
    listTitle: z.string().nullable(),
    source: z.string(),
    accountId: z.string(),
  })
);

const StatusResponseSchema = z.object({
  status: z.enum(['idle', 'syncing', 'error']),
  lastSyncAt: z.string().nullable(),
  error: z.string().nullable(),
  accountCount: z.number(),
});

const DisconnectSchema = z.object({
  accountId: z.string().min(1),
});

const TaskActionSchema = z.object({
  accountId: z.string().min(1),
  taskListId: z.string().min(1),
  taskId: z.string().min(1),
});

const CreateTaskSchema = z.object({
  accountId: z.string().min(1),
  taskListId: z.string().min(1),
  title: z.string().min(1),
  notes: z.string().optional(),
});

const UpdateTaskSchema = z.object({
  accountId: z.string().min(1),
  taskListId: z.string().min(1),
  taskId: z.string().min(1),
  title: z.string().min(1).optional(),
  notes: z.string().optional(),
  status: z.enum(['needsAction', 'completed']).optional(),
});

type ConnectResponse = z.infer<typeof ConnectResponseSchema>;
type TaskRow = z.infer<typeof ListTasksResponseSchema>[number];

// Track active sync instances per account
const activeSyncs = new Map<string, GoogleTasksSync>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function listGoogleTasksAccounts(
  db: Database.Database
): AccountResponse[] {
  return listAccounts(db).map((a) => ({
    id: a.id,
    email: a.email,
    displayName: a.display_name,
  }));
}

function getTasksWithSource(
  db: Database.Database,
  accountId?: string
): TaskRow[] {
  const sql = accountId
    ? `SELECT gt.id, gt.title, gt.notes, gt.status, gt.due, gt.completed_at,
              gt.updated_at, gt.list_id, gtl.title as list_title,
              gtl.account_id as account_id
       FROM google_tasks gt
       JOIN google_task_lists gtl ON gt.list_id = gtl.id
       WHERE gtl.account_id = ? AND gt.is_deleted = 0
       ORDER BY gt.updated_at DESC`
    : `SELECT gt.id, gt.title, gt.notes, gt.status, gt.due, gt.completed_at,
              gt.updated_at, gt.list_id, gtl.title as list_title,
              gtl.account_id as account_id
       FROM google_tasks gt
       JOIN google_task_lists gtl ON gt.list_id = gtl.id
       WHERE gt.is_deleted = 0
       ORDER BY gt.updated_at DESC`;

  const rows = accountId
    ? (db.prepare(sql).all(accountId) as Array<{
        id: string;
        title: string;
        notes: string | null;
        status: string;
        due: string | null;
        completed_at: string | null;
        updated_at: string;
        list_id: string;
        list_title: string | null;
      }>)
    : (db.prepare(sql).all() as Array<{
        id: string;
        title: string;
        notes: string | null;
        status: string;
        due: string | null;
        completed_at: string | null;
        updated_at: string;
        list_id: string;
        list_title: string | null;
      }>);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    notes: r.notes,
    status: r.status as 'needsAction' | 'completed',
    due: r.due,
    completedAt: r.completed_at,
    updatedAt: r.updated_at,
    listId: r.list_id,
    listTitle: r.list_title,
    source: 'Google Tasks',
    accountId: r.account_id ?? '',
  }));
}

// ---------------------------------------------------------------------------
// Handler registration
// ---------------------------------------------------------------------------

export function registerGoogleTasksHandlers(
  ipcMain: IpcMain,
  db: Database.Database
): void {
  ipcMain.handle('google-tasks:connect', async (): Promise<ConnectResponse> => {
    const { userInfo, tokens } = await startAuthFlow();
    const account = createAccount(db, userInfo.email, userInfo.displayName);
    storeGoogleTasksTokens(db, account.id, tokens);
    return ConnectResponseSchema.parse({
      id: account.id,
      email: account.email,
      displayName: account.display_name,
    });
  });

  ipcMain.handle(
    'google-tasks:disconnect',
    async (_event, rawPayload: unknown): Promise<void> => {
      const parsed = DisconnectSchema.safeParse(rawPayload);
      if (!parsed.success) {
        throw new Error(`Invalid payload: ${parsed.error.message}`);
      }
      // Stop active sync if running
      const sync = activeSyncs.get(parsed.data.accountId);
      if (sync) {
        sync.stop();
        activeSyncs.delete(parsed.data.accountId);
      }
      deleteAccount(db, parsed.data.accountId);
    }
  );

  ipcMain.handle(
    'google-tasks:listAccounts',
    async (): Promise<AccountResponse[]> => {
      return listGoogleTasksAccounts(db);
    }
  );

  ipcMain.handle(
    'google-tasks:sync',
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
        const existing = activeSyncs.get(accountId);
        if (existing) {
          existing.stop();
        }
        const sync = new GoogleTasksSync(db, accountId);
        activeSyncs.set(accountId, sync);
        await sync.start();
        return { success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { success: false, error: message };
      }
    }
  );

  ipcMain.handle(
    'google-tasks:status',
    async (): Promise<z.infer<typeof StatusResponseSchema>> => {
      const accounts = listGoogleTasksAccounts(db);
      const hasSyncing = accounts.some((a) => activeSyncs.has(a.id));

      // Get the most recent sync timestamp across all lists
      const lastSyncRow = db
        .prepare(`SELECT MAX(synced_at) as last_sync FROM google_task_lists`)
        .get() as { last_sync: string | null } | undefined;

      return StatusResponseSchema.parse({
        status: hasSyncing ? 'syncing' : 'idle',
        lastSyncAt: lastSyncRow?.last_sync ?? null,
        error: null,
        accountCount: accounts.length,
      });
    }
  );

  ipcMain.handle(
    'google-tasks:listTasks',
    async (
      _event,
      rawPayload?: unknown
    ): Promise<z.infer<typeof ListTasksResponseSchema>> => {
      const accountId =
        rawPayload && typeof rawPayload === 'object' && 'accountId' in rawPayload
          ? (rawPayload as { accountId: string }).accountId
          : undefined;
      return ListTasksResponseSchema.parse(getTasksWithSource(db, accountId));
    }
  );

  ipcMain.handle(
    'google-tasks:createTask',
    async (
      _event,
      rawPayload: unknown
    ): Promise<z.infer<typeof ListTasksResponseSchema>[number]> => {
      const parsed = CreateTaskSchema.safeParse(rawPayload);
      if (!parsed.success) {
        throw new Error(`Invalid payload: ${parsed.error.message}`);
      }
      const { accountId, taskListId, title, notes } = parsed.data;
      const { getValidAccessToken } = await import('../auth/google-tasks');
      const { insertTask } = await import('../sync/google-tasks-api');
      const accessToken = await getValidAccessToken(db, accountId);
      const remote = await insertTask(accessToken, taskListId, title, notes);

      // Insert locally
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO google_tasks
           (id, list_id, title, notes, status, position, parent_id, completed_at, updated_at, synced_at, is_deleted)
         VALUES (?, ?, ?, ?, 'needsAction', '0', NULL, NULL, ?, ?, 0)`
      ).run(remote.id, taskListId, title, notes ?? null, now, now);

      // Get list title
      const listRow = db
        .prepare(`SELECT title FROM google_task_lists WHERE id = ?`)
        .get(taskListId) as { title: string } | undefined;

      return ListTasksResponseSchema.parse([
        {
          id: remote.id,
          title: remote.title,
          notes: remote.notes ?? null,
          status: remote.status as 'needsAction' | 'completed',
          due: null,
          completedAt: null,
          updatedAt: now,
          listId: taskListId,
          listTitle: listRow?.title ?? null,
          source: 'Google Tasks',
          accountId,
        },
      ])[0];
    }
  );

  ipcMain.handle(
    'google-tasks:updateTask',
    async (
      _event,
      rawPayload: unknown
    ): Promise<{ success: boolean }> => {
      const parsed = UpdateTaskSchema.safeParse(rawPayload);
      if (!parsed.success) {
        throw new Error(`Invalid payload: ${parsed.error.message}`);
      }
      const { accountId, taskListId, taskId, title, notes, status } =
        parsed.data;
      const { getValidAccessToken } = await import('../auth/google-tasks');
      const { updateTask } = await import('../sync/google-tasks-api');
      const accessToken = await getValidAccessToken(db, accountId);

      const updates: { title?: string; notes?: string; status?: string } = {};
      if (title !== undefined) updates.title = title;
      if (notes !== undefined) updates.notes = notes;
      if (status !== undefined) updates.status = status;

      await updateTask(accessToken, taskListId, taskId, updates);

      // Update locally with fixed parameterized query
      const now = new Date().toISOString();
      const completedAt = status === 'completed' ? now : null;

      db.prepare(
        `UPDATE google_tasks
         SET title = COALESCE(?, title),
             notes = COALESCE(?, notes),
             status = COALESCE(?, status),
             completed_at = COALESCE(?, completed_at),
             updated_at = ?,
             synced_at = ?
         WHERE id = ?`
      ).run(title ?? null, notes ?? null, status ?? null, completedAt, now, now, taskId);

      return { success: true };
    }
  );

  ipcMain.handle(
    'google-tasks:deleteTask',
    async (
      _event,
      rawPayload: unknown
    ): Promise<{ success: boolean }> => {
      const parsed = TaskActionSchema.safeParse(rawPayload);
      if (!parsed.success) {
        throw new Error(`Invalid payload: ${parsed.error.message}`);
      }
      const { accountId, taskListId, taskId } = parsed.data;
      const { getValidAccessToken } = await import('../auth/google-tasks');
      const { deleteTask } = await import('../sync/google-tasks-api');
      const accessToken = await getValidAccessToken(db, accountId);

      try {
        await deleteTask(accessToken, taskListId, taskId);
      } catch (err: unknown) {
        // 404 = task or list already gone on Google's side — still clean up locally
        const status = (err as { code?: number; status?: number }).code ?? (err as { status?: number }).status;
        if (status !== 404) throw err;
      }

      // Hard-delete locally
      db.prepare(`DELETE FROM google_tasks WHERE id = ?`).run(taskId);

      return { success: true };
    }
  );
}
