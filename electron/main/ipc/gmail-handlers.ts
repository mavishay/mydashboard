import { shell } from 'electron';
import type Database from 'better-sqlite3';
import { google } from 'googleapis';
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

interface ConnectGmailRequest {
  clientId: string;
  clientSecret: string;
}

interface AccountResponse {
  id: string;
  email: string;
  displayName: string;
}

export function registerGmailHandlers(
  ipcMain: typeof import('electron').ipcMain,
  db: Database.Database
): void {
  ipcMain.handle(
    'gmail:connect',
    async (_event, request: ConnectGmailRequest): Promise<AccountResponse> => {
      const { clientId, clientSecret } = request;

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
    }
  );

  ipcMain.handle(
    'gmail:disconnect',
    async (_event, accountId: string): Promise<void> => {
      deleteAccount(db, accountId);
    }
  );

  ipcMain.handle(
    'gmail:listAccounts',
    async (): Promise<AccountResponse[]> => {
      const accounts = listAccounts(db);
      return accounts.map((a) => ({
        id: a.id,
        email: a.email,
        displayName: a.display_name,
      }));
    }
  );

  ipcMain.handle(
    'gmail:getToken',
    async (_event, accountId: string): Promise<{ accessToken: string } | null> => {
      const tokens = retrieveTokens(db, accountId);
      if (!tokens) return null;

      return { accessToken: tokens.access_token };
    }
  );
}
