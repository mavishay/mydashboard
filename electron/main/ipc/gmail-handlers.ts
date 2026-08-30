import { shell } from 'electron';
import type Database from 'better-sqlite3';
import { google } from 'googleapis';
import { z } from 'zod';
import {
  generateState,
  validateState,
  storeTokens,
  retrieveTokens,
  createAccount,
  listAccounts,
  deleteAccount,
} from '../auth/gmail';
import {
  createAccount as createGoogleTasksAccount,
  listAccounts as listGoogleTasksAccounts,
  deleteAccount as deleteGoogleTasksAccount,
} from '../auth/google-tasks';
import { createOAuthServer, buildAuthUrl } from '../auth/oauth-server';
import { recordTelemetryEvent } from '../telemetry';
import { GmailSyncManager } from '../gmail/sync';
import { getEmailDetail } from '../gmail/fetcher';

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.labels',
  'https://www.googleapis.com/auth/tasks',
];

const DisconnectSchema = z.object({
  accountId: z.string().min(1),
});

const GetTokenSchema = z.object({
  accountId: z.string().min(1),
});

const SyncSchema = z.object({
  accountId: z.string().min(1),
  maxResults: z.number().int().min(1).max(100).optional(),
});

const GetEmailDetailSchema = z.object({
  emailId: z.string().min(1),
});

interface AccountResponse {
  id: string;
  email: string;
  displayName: string;
  color: string | null;
}

export function registerGmailHandlers(
  ipcMain: typeof import('electron').ipcMain,
  db: Database.Database,
  getWindow?: () => import('electron').BrowserWindow | null
): void {
  const syncManager = new GmailSyncManager(db, getWindow ?? (() => null));
  ipcMain.handle('gmail:connect', async (): Promise<AccountResponse> => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error(
        'Google OAuth credentials not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.'
      );
    }

    const oauthServer = await createOAuthServer();
    const state = generateState();
    const redirectUri = `http://127.0.0.1:${oauthServer.port}/callback`;

    const authUrl = buildAuthUrl({
      clientId,
      redirectUri,
      state,
      scopes: GOOGLE_SCOPES,
    });

    await shell.openExternal(authUrl);

    const callback = await oauthServer.waitForCallback();
    await oauthServer.close();

    if (!callback.code || !validateState(callback.state, state)) {
      throw new Error('Invalid OAuth callback');
    }

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    try {
      const { tokens } = await oauth2Client.getToken(callback.code);
      oauth2Client.setCredentials(tokens);

      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      const profile = await gmail.users.getProfile({ userId: 'me' });

      const email = profile.data.emailAddress ?? '';
      const displayName = profile.data.name ?? email;

      const gmailAccount = createAccount(db, email, displayName);
      const tasksAccount = createGoogleTasksAccount(db, email, displayName);

      const tokenData = {
        access_token: tokens.access_token ?? '',
        refresh_token: tokens.refresh_token ?? undefined,
        expiry_date: tokens.expiry_date ?? Date.now(),
        scope: tokens.scope ?? GOOGLE_SCOPES.join(' '),
      };

      storeTokens(db, gmailAccount.id, tokenData);
      storeTokens(db, tasksAccount.id, tokenData);

      recordTelemetryEvent(db, 'gmail_connect', {
        accountId: gmailAccount.id,
      });

      return {
        id: gmailAccount.id,
        email: gmailAccount.email,
        displayName: gmailAccount.display_name,
        color: gmailAccount.color ?? null,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to complete Google authorization: ${error.message}`, { cause: error });
      }
      throw new Error('Failed to complete Google authorization', { cause: error });
    }
  });

  ipcMain.handle(
    'gmail:disconnect',
    async (_event, rawAccountId: string): Promise<void> => {
      const parsed = DisconnectSchema.safeParse({ accountId: rawAccountId });
      if (!parsed.success) {
        throw new Error('Invalid account ID');
      }

      const gmailAccounts = listAccounts(db);
      const account = gmailAccounts.find((a) => a.id === parsed.data.accountId);
      if (account) {
        const tasksAccounts = listGoogleTasksAccounts(db);
        const tasksAccount = tasksAccounts.find((a) => a.email === account.email);
        if (tasksAccount) {
          deleteGoogleTasksAccount(db, tasksAccount.id);
        }
      }

      deleteAccount(db, parsed.data.accountId);
    }
  );

  ipcMain.handle('gmail:listAccounts', async (): Promise<AccountResponse[]> => {
    const accounts = listAccounts(db);
    return accounts.map((a) => ({
      id: a.id,
      email: a.email,
      displayName: a.display_name,
      color: a.color ?? null,
    }));
  });

  ipcMain.handle(
    'gmail:getToken',
    async (
      _event,
      rawAccountId: string
    ): Promise<{ accessToken: string } | null> => {
      const parsed = GetTokenSchema.safeParse({ accountId: rawAccountId });
      if (!parsed.success) {
        throw new Error('Invalid account ID');
      }
      const tokens = retrieveTokens(db, parsed.data.accountId);
      if (!tokens) return null;

      return { accessToken: tokens.access_token };
    }
  );

  ipcMain.handle(
    'gmail:sync',
    async (_event, rawPayload: { accountId: string; maxResults?: number }) => {
      console.log('[IPC] gmail:sync called with payload:', rawPayload);
      const parsed = SyncSchema.safeParse(rawPayload);
      if (!parsed.success) {
        throw new Error(`Invalid payload: ${parsed.error.message}`);
      }

      const status = await syncManager.syncAccount(
        parsed.data.accountId,
        parsed.data.maxResults
      );

      return {
        accountId: status.accountId,
        status: status.status,
        fetched: status.fetched,
        classified: status.classified,
        error: status.error ?? undefined,
      };
    }
  );

  ipcMain.handle('gmail:syncAll', async () => {
    console.log('[IPC] gmail:syncAll called');
    const statuses = await syncManager.syncAll();
    console.log('[IPC] gmail:syncAll completed with', statuses.length, 'accounts');
    return statuses.map((s) => ({
      accountId: s.accountId,
      status: s.status,
      fetched: s.fetched,
      classified: s.classified,
      error: s.error ?? undefined,
    }));
  });

  ipcMain.handle('gmail:syncStatus', async () => {
    return syncManager.getStatuses().map((s) => ({
      accountId: s.accountId,
      status: s.status,
      lastSyncAt: s.lastSyncAt,
      error: s.error,
    }));
  });

  ipcMain.handle(
    'gmail:getEmailDetail',
    async (_event, rawPayload: { emailId: string }) => {
      const parsed = GetEmailDetailSchema.safeParse(rawPayload);
      if (!parsed.success) {
        throw new Error('Invalid email ID');
      }

      const detail = await getEmailDetail(db, parsed.data.emailId);
      if (!detail) {
        throw new Error('Email not found');
      }

      return detail;
    }
  );
}
