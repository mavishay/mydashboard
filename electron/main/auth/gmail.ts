import { safeStorage } from 'electron';
import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

export interface GmailTokenSet {
  access_token: string;
  refresh_token?: string;
  expiry_date: number;
  scope: string;
}

export interface GmailAccount {
  id: string;
  email: string;
  display_name: string;
}

export function generateState(): string {
  return randomBytes(32).toString('hex');
}

export function validateState(received: string, expected: string): boolean {
  const receivedHash = createHash('sha256').update(received).digest('hex');
  const expectedHash = createHash('sha256').update(expected).digest('hex');
  const receivedBuf = Buffer.from(receivedHash, 'hex');
  const expectedBuf = Buffer.from(expectedHash, 'hex');
  return timingSafeEqual(receivedBuf, expectedBuf);
}

export function encryptToken(token: string): Buffer {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Safe storage encryption is not available');
  }
  return safeStorage.encryptString(token);
}

export function decryptToken(encrypted: Buffer): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Safe storage encryption is not available');
  }
  return safeStorage.decryptString(encrypted);
}

export function storeTokens(
  db: Database.Database,
  accountId: string,
  tokens: GmailTokenSet
): void {
  const id = uuidv4();
  const encryptedAccessToken = encryptToken(tokens.access_token);
  const encryptedRefreshToken = tokens.refresh_token
    ? encryptToken(tokens.refresh_token)
    : null;
  const expiresAt = new Date(tokens.expiry_date).toISOString();

  db.prepare(
    `INSERT INTO oauth_tokens (id, account_id, encrypted_access_token, encrypted_refresh_token, expires_at, scope)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(account_id) DO UPDATE SET
       encrypted_access_token = excluded.encrypted_access_token,
       encrypted_refresh_token = excluded.encrypted_refresh_token,
       expires_at = excluded.expires_at,
       scope = excluded.scope,
       updated_at = datetime('now')`
  ).run(id, accountId, encryptedAccessToken, encryptedRefreshToken, expiresAt, tokens.scope);
}

export function retrieveTokens(
  db: Database.Database,
  accountId: string
): GmailTokenSet | null {
  const row = db
    .prepare(
      `SELECT encrypted_access_token, encrypted_refresh_token, expires_at, scope
       FROM oauth_tokens WHERE account_id = ?`
    )
    .get(accountId) as {
    encrypted_access_token: Buffer;
    encrypted_refresh_token: Buffer | null;
    expires_at: string;
    scope: string;
  } | undefined;

  if (!row) return null;

  return {
    access_token: decryptToken(row.encrypted_access_token),
    refresh_token: row.encrypted_refresh_token
      ? decryptToken(row.encrypted_refresh_token)
      : undefined,
    expiry_date: new Date(row.expires_at).getTime(),
    scope: row.scope,
  };
}

export function deleteTokens(db: Database.Database, accountId: string): void {
  db.prepare('DELETE FROM oauth_tokens WHERE account_id = ?').run(accountId);
}

export function createAccount(
  db: Database.Database,
  email: string,
  displayName: string
): GmailAccount {
  const id = uuidv4();
  db.prepare(
    `INSERT INTO accounts (id, type, email, display_name)
     VALUES (?, 'gmail', ?, ?)`
  ).run(id, email, displayName);
  return { id, email, display_name: displayName };
}

export function listAccounts(db: Database.Database): GmailAccount[] {
  return db
    .prepare(
      `SELECT id, email, display_name FROM accounts WHERE type = 'gmail'`
    )
    .all() as GmailAccount[];
}

export function deleteAccount(db: Database.Database, accountId: string): void {
  deleteTokens(db, accountId);
  db.prepare('DELETE FROM accounts WHERE id = ?').run(accountId);
}
