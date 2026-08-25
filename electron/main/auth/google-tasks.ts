import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import {
  createOAuthServer,
  buildAuthUrl,
} from './oauth-server';
import {
  storeTokens,
  retrieveTokens,
} from './gmail';

const GOOGLE_TASKS_SCOPES = ['https://www.googleapis.com/auth/tasks.readonly'];
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

export interface GoogleTasksTokenSet {
  access_token: string;
  refresh_token?: string;
  expiry_date: number;
  scope: string;
}

export interface GoogleTasksAccount {
  id: string;
  email: string;
  display_name: string;
}

export function getGoogleTasksClientId(): string {
  const clientId = process.env.GOOGLE_TASKS_CLIENT_ID;
  if (!clientId) {
    throw new Error('GOOGLE_TASKS_CLIENT_ID environment variable is required');
  }
  return clientId;
}

export function createAccount(
  db: Database.Database,
  email: string,
  displayName: string
): GoogleTasksAccount {
  const id = uuidv4();
  db.prepare(
    `INSERT INTO accounts (id, type, email, display_name)
     VALUES (?, 'google_tasks', ?, ?)`
  ).run(id, email, displayName);
  return { id, email, display_name: displayName };
}

export function listAccounts(db: Database.Database): GoogleTasksAccount[] {
  return db
    .prepare(
      `SELECT id, email, display_name FROM accounts WHERE type = 'google_tasks'`
    )
    .all() as GoogleTasksAccount[];
}

export function deleteAccount(db: Database.Database, accountId: string): void {
  db.prepare('DELETE FROM oauth_tokens WHERE account_id = ?').run(accountId);
  db.prepare('DELETE FROM accounts WHERE id = ?').run(accountId);
}

export interface GoogleUserInfo {
  email: string;
  displayName: string;
}

export async function fetchGoogleUserInfo(
  accessToken: string
): Promise<GoogleUserInfo> {
  const response = await fetch(
    'https://www.googleapis.com/oauth2/v2/userinfo',
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch user info from Google');
  }

  const data = (await response.json()) as {
    email: string;
    name: string;
  };

  return {
    email: data.email,
    displayName: data.name,
  };
}

export async function startAuthFlow(): Promise<{
  userInfo: GoogleUserInfo;
  tokens: GoogleTasksTokenSet;
}> {
  const clientId = getGoogleTasksClientId();
  const server = await createOAuthServer();
  const redirectUri = `http://127.0.0.1:${server.port}/callback`;
  const state = uuidv4();

  const authUrl = buildAuthUrl({
    clientId,
    redirectUri,
    state,
    scopes: GOOGLE_TASKS_SCOPES,
  });

  // Open auth URL in default browser
  const { shell } = await import('electron');
  shell.openExternal(authUrl);

  try {
    const callback = await server.waitForCallback();
    await server.close();

    if (!callback.code) {
      throw new Error('Authorization failed - no code received');
    }

    const tokens = await exchangeCode(callback.code, redirectUri);
    const userInfo = await fetchGoogleUserInfo(tokens.access_token);
    return { userInfo, tokens };
  } catch (err) {
    await server.close();
    throw err;
  }
}

async function exchangeCode(
  code: string,
  redirectUri: string
): Promise<GoogleTasksTokenSet> {
  const clientId = getGoogleTasksClientId();

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expiry_date: Date.now() + data.expires_in * 1000,
    scope: data.scope,
  };
}

export async function refreshAccessToken(
  refreshToken: string
): Promise<GoogleTasksTokenSet> {
  const clientId = getGoogleTasksClientId();

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
    scope: string;
  };

  return {
    access_token: data.access_token,
    refresh_token: refreshToken,
    expiry_date: Date.now() + data.expires_in * 1000,
    scope: data.scope,
  };
}

export function isTokenExpired(tokens: GoogleTasksTokenSet): boolean {
  return Date.now() >= tokens.expiry_date - TOKEN_REFRESH_BUFFER_MS;
}

export async function getValidAccessToken(
  db: Database.Database,
  accountId: string
): Promise<string> {
  const tokens = retrieveTokens(db, accountId);
  if (!tokens) {
    throw new Error('No tokens found for account');
  }

  if (!isTokenExpired(tokens)) {
    return tokens.access_token;
  }

  if (!tokens.refresh_token) {
    throw new Error('No refresh token available - re-authentication required');
  }

  const refreshed = await refreshAccessToken(tokens.refresh_token);
  storeTokens(db, accountId, refreshed);
  return refreshed.access_token;
}

export function storeGoogleTasksTokens(
  db: Database.Database,
  accountId: string,
  tokens: GoogleTasksTokenSet
): void {
  storeTokens(db, accountId, tokens);
}

export function getGoogleTasksTokens(
  db: Database.Database,
  accountId: string
): GoogleTasksTokenSet | null {
  return retrieveTokens(db, accountId);
}
