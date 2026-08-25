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
import { createOAuthServer, buildAuthUrl } from '../auth/oauth-server';

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.labels',
];

const DisconnectSchema = z.object({
  accountId: z.string().min(1),
});

const GetTokenSchema = z.object({
  accountId: z.string().min(1),
});

interface AccountResponse {
  id: string;
  email: string;
  displayName: string;
}

export function registerGmailHandlers(
  ipcMain: typeof import('electron').ipcMain,
  db: Database.Database
): void {
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
      scopes: GMAIL_SCOPES,
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
      const profile = await gmail.users.get({ userId: 'me' });

      const email = profile.data.emailAddress ?? '';
      const displayName = profile.data.name ?? email;

      const account = createAccount(db, email, displayName);

      storeTokens(db, account.id, {
        access_token: tokens.access_token ?? '',
        refresh_token: tokens.refresh_token ?? undefined,
        expiry_date: tokens.expiry_date ?? Date.now(),
        scope: tokens.scope ?? GMAIL_SCOPES.join(' '),
      });

      return {
        id: account.id,
        email: account.email,
        displayName: account.display_name,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to complete Gmail authorization: ${error.message}`, { cause: error });
      }
      throw new Error('Failed to complete Gmail authorization', { cause: error });
    }
  });

  ipcMain.handle(
    'gmail:disconnect',
    async (_event, rawAccountId: string): Promise<void> => {
      const parsed = DisconnectSchema.safeParse({ accountId: rawAccountId });
      if (!parsed.success) {
        throw new Error('Invalid account ID');
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
}
