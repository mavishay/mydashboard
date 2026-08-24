import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { encryptToken, decryptToken } from './gmail';

export type LlmProvider = 'openai' | 'anthropic' | 'litellm';

export interface ApiKeyMeta {
  id: string;
  provider: LlmProvider;
  label: string;
  baseUrl?: string;
  createdAt: string;
}

interface ApiKeyRow {
  id: string;
  provider: LlmProvider;
  label: string;
  base_url: string | null;
  created_at: string;
}

function rowToMeta(row: ApiKeyRow): ApiKeyMeta {
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    baseUrl: row.base_url ?? undefined,
    createdAt: row.created_at,
  };
}

export function saveApiKey(
  db: Database.Database,
  provider: LlmProvider,
  label: string,
  apiKey: string,
  baseUrl?: string
): ApiKeyMeta {
  const id = uuidv4();
  const encryptedKey = encryptToken(apiKey);

  db.prepare(
    `INSERT INTO api_keys (id, provider, label, base_url, encrypted_key, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
  ).run(id, provider, label, baseUrl ?? null, encryptedKey);

  return {
    id,
    provider,
    label,
    baseUrl,
    createdAt: new Date().toISOString(),
  };
}

export function listApiKeys(db: Database.Database): ApiKeyMeta[] {
  const rows = db
    .prepare('SELECT id, provider, label, base_url, created_at FROM api_keys ORDER BY created_at DESC')
    .all() as ApiKeyRow[];
  return rows.map(rowToMeta);
}

export function deleteApiKey(db: Database.Database, keyId: string): void {
  db.prepare('DELETE FROM api_keys WHERE id = ?').run(keyId);
}

export function getEncryptedKey(db: Database.Database, keyId: string): Buffer | null {
  const row = db
    .prepare('SELECT encrypted_key FROM api_keys WHERE id = ?')
    .get(keyId) as { encrypted_key: Buffer } | undefined;

  return row?.encrypted_key ?? null;
}

export function getDecryptedKey(db: Database.Database, keyId: string): string | null {
  const encrypted = getEncryptedKey(db, keyId);
  if (!encrypted) return null;
  return decryptToken(encrypted);
}

export function getApiKeyMeta(db: Database.Database, keyId: string): ApiKeyMeta | null {
  const row = db
    .prepare('SELECT id, provider, label, base_url, created_at FROM api_keys WHERE id = ?')
    .get(keyId) as ApiKeyRow | undefined;

  return row ? rowToMeta(row) : null;
}
