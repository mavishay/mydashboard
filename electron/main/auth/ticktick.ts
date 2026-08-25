// electron/main/auth/ticktick.ts

import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import {
  storeTokens,
  retrieveTokens,
} from './gmail';

export interface TickTickAccount {
  id: string;
  email: string;
  display_name: string;
}

export function createAccount(
  db: Database.Database,
  email: string,
  displayName: string,
  accessToken: string
): TickTickAccount {
  const id = uuidv4();
  db.prepare(
    `INSERT INTO accounts (id, type, email, display_name)
     VALUES (?, 'ticktick', ?, ?)`
  ).run(id, email, displayName);
  storeTokens(db, id, {
    access_token: accessToken,
    refresh_token: undefined,
    expiry_date: Date.now() + 100 * 365 * 24 * 60 * 60 * 1000, // effectively never
    scope: 'ticktick',
  });
  return { id, email, display_name: displayName };
}

export function listAccounts(db: Database.Database): TickTickAccount[] {
  return db
    .prepare(
      `SELECT id, email, display_name FROM accounts WHERE type = 'ticktick'`
    )
    .all() as TickTickAccount[];
}

export function deleteAccount(db: Database.Database, accountId: string): void {
  db.prepare('DELETE FROM oauth_tokens WHERE account_id = ?').run(accountId);
  db.prepare('DELETE FROM accounts WHERE id = ?').run(accountId);
}

export async function validateToken(
  accessToken: string
): Promise<boolean> {
  const response = await fetch('https://api.ticktick.com/open/v1/project', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return response.ok;
}

export function getAccessToken(
  db: Database.Database,
  accountId: string
): string {
  const tokens = retrieveTokens(db, accountId);
  if (!tokens) {
    throw new Error('No tokens found for TickTick account');
  }
  return tokens.access_token;
}
