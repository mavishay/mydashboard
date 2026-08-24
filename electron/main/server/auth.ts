import { randomBytes, createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

const TOKEN_LENGTH = 6;
const TOKEN_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion
const MAX_ATTEMPTS_PER_MINUTE = 5;
const TOKEN_EXPIRY_DAYS = 3650;

export interface PairingToken {
  token: string;
  tokenHash: string;
  salt: string;
}

export interface AuthResult {
  success: boolean;
  sessionToken?: string;
  error?: string;
}

export function generateToken(): string {
  let token = '';
  const bytes = randomBytes(TOKEN_LENGTH);
  for (let i = 0; i < TOKEN_LENGTH; i++) {
    token += TOKEN_CHARSET[bytes[i] % TOKEN_CHARSET.length];
    if (i === 2) token += '-'; // format: XXX-XXX
  }
  return token;
}

export function hashToken(token: string, salt: string): string {
  return createHash('sha256').update(token + salt).digest('hex');
}

function generateSalt(): string {
  return randomBytes(16).toString('hex');
}

export function storeToken(
  db: Database.Database,
  token: string
): { tokenHash: string; salt: string } {
  const salt = generateSalt();
  const tokenHash = hashToken(token, salt);

  db.prepare(
    'INSERT INTO pairing_tokens (token_hash, salt, token_plaintext) VALUES (?, ?, ?)'
  ).run(tokenHash, salt, token);

  return { tokenHash, salt };
}

export function getTokenFromDb(db: Database.Database): { tokenHash: string; salt: string; tokenPlaintext: string } | null {
  const row = db.prepare(
    'SELECT token_hash, salt, token_plaintext FROM pairing_tokens ORDER BY id DESC LIMIT 1'
  ).get() as { token_hash: string; salt: string; token_plaintext: string } | undefined;
  if (!row) return null;
  return { tokenHash: row.token_hash, salt: row.salt, tokenPlaintext: row.token_plaintext };
}

export function validateToken(
  db: Database.Database,
  token: string,
  ipAddress: string
): AuthResult {
  // Rate limiting: check failed attempts in last minute
  const recentFailedAttempts = db.prepare(
    "SELECT COUNT(*) as count FROM token_attempts WHERE ip_address = ? AND attempted_at > datetime('now', '-1 minute')"
  ).get(ipAddress) as { count: number } | undefined;

  if (recentFailedAttempts && recentFailedAttempts.count >= MAX_ATTEMPTS_PER_MINUTE) {
    return { success: false, error: 'rate_limited' };
  }

  // Get the stored token hash
  const stored = getTokenFromDb(db);
  if (!stored) {
    return { success: false, error: 'no_token_configured' };
  }

  // Validate
  const hash = hashToken(token, stored.salt);
  if (hash !== stored.tokenHash) {
    // Record failed attempt for rate limiting
    db.prepare('INSERT INTO token_attempts (ip_address) VALUES (?)').run(ipAddress);
    return { success: false, error: 'invalid_token' };
  }

  // Update last_used_at
  db.prepare(
    "UPDATE pairing_tokens SET last_used_at = datetime('now') WHERE token_hash = ?"
  ).run(stored.tokenHash);

  // Create session
  const sessionToken = randomUUID();
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(
    'INSERT INTO lan_sessions (session_token, expires_at, ip_address) VALUES (?, ?, ?)'
  ).run(sessionToken, expiresAt, ipAddress);

  return { success: true, sessionToken };
}

export function validateSession(
  db: Database.Database,
  sessionToken: string
): boolean {
  const session = db.prepare(
    "SELECT id FROM lan_sessions WHERE session_token = ? AND expires_at > datetime('now')"
  ).get(sessionToken);

  return !!session;
}

export function regenerateToken(db: Database.Database): string {
  // Delete all existing tokens
  db.prepare('DELETE FROM pairing_tokens').run();
  // Delete all existing sessions (invalidate them)
  db.prepare('DELETE FROM lan_sessions').run();

  // Generate and store new token
  const token = generateToken();
  storeToken(db, token);

  return token;
}

export function ensureTokenExists(db: Database.Database): string {
  const existing = getTokenFromDb(db);
  if (existing) {
    // For existing tokens without plaintext (pre-migration), generate and store a new one
    if (!existing.tokenPlaintext) {
      const token = generateToken();
      db.prepare('UPDATE pairing_tokens SET token_plaintext = ? WHERE token_hash = ?')
        .run(token, existing.tokenHash);
      return token;
    }
    return existing.tokenPlaintext;
  }

  const token = generateToken();
  storeToken(db, token);
  return token;
}

export function getConnectedDeviceCount(db: Database.Database): number {
  const result = db.prepare(
    "SELECT COUNT(*) as count FROM lan_sessions WHERE expires_at > datetime('now')"
  ).get() as { count: number };

  return result.count;
}
