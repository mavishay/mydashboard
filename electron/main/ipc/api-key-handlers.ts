import type { IpcMain } from 'electron';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import {
  saveApiKey,
  listApiKeys,
  deleteApiKey,
  getDecryptedKey,
  getApiKeyMeta,
  type LlmProvider,
} from '../auth/api-keys';

export const SaveApiKeySchema = z
  .object({
    provider: z.enum(['openai', 'anthropic', 'litellm']),
    label: z.string().min(1).max(100),
    apiKey: z.string().min(1),
    baseUrl: z.string().url().optional(),
  })
  .refine((data) => data.provider !== 'litellm' || data.baseUrl, {
    message: 'Base URL is required for liteLLM provider',
  });

export const DeleteApiKeySchema = z.object({
  keyId: z.string().min(1),
});

export const ValidateApiKeySchema = z.object({
  keyId: z.string().min(1),
});

type SaveApiKeyPayload = z.infer<typeof SaveApiKeySchema>;
type DeleteApiKeyPayload = z.infer<typeof DeleteApiKeySchema>;
type ValidateApiKeyPayload = z.infer<typeof ValidateApiKeySchema>;

async function validateKey(
  provider: LlmProvider,
  apiKey: string,
  baseUrl?: string
): Promise<{ valid: boolean; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    if (provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      });
      if (response.ok) return { valid: true };
      if (response.status === 401) return { valid: false, error: 'Invalid API key' };
      return { valid: false, error: `Validation failed: HTTP ${response.status}` };
    }

    if (provider === 'anthropic') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        }),
        signal: controller.signal,
      });
      if (response.ok) return { valid: true };
      if (response.status === 401) return { valid: false, error: 'Invalid API key' };
      if (response.status === 400) return { valid: true };
      return { valid: false, error: `Validation failed: HTTP ${response.status}` };
    }

    if (provider === 'litellm') {
      if (!baseUrl) return { valid: false, error: 'Base URL required for liteLLM' };
      const modelsUrl = `${baseUrl.replace(/\/$/, '')}/v1/models`;
      const response = await fetch(modelsUrl, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      });
      if (response.ok) return { valid: true };
      if (response.status === 401) return { valid: false, error: 'Invalid API key' };
      return { valid: false, error: `Validation failed: HTTP ${response.status}` };
    }

    return { valid: false, error: 'Unknown provider' };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { valid: false, error: 'Validation timed out' };
    }
    const message = err instanceof Error ? err.message : 'Network error';
    return { valid: false, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

export function registerApiKeyHandlers(
  ipcMain: IpcMain,
  db: Database.Database
): void {
  ipcMain.handle(
    'apikey:save',
    async (_event, payload: SaveApiKeyPayload) => {
      const parsed = SaveApiKeySchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(`Invalid payload: ${parsed.error.message}`);
      }

      const { provider, label, apiKey, baseUrl } = parsed.data;
      const result = await validateKey(provider, apiKey, baseUrl);
      if (!result.valid) {
        throw new Error(`API key validation failed: ${result.error}`);
      }

      return saveApiKey(db, provider, label, apiKey, baseUrl);
    }
  );

  ipcMain.handle('apikey:list', async () => {
    return listApiKeys(db);
  });

  ipcMain.handle(
    'apikey:delete',
    async (_event, payload: DeleteApiKeyPayload) => {
      const parsed = DeleteApiKeySchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(`Invalid payload: ${parsed.error.message}`);
      }
      deleteApiKey(db, parsed.data.keyId);
    }
  );

  ipcMain.handle(
    'apikey:validate',
    async (_event, payload: ValidateApiKeyPayload) => {
      const parsed = ValidateApiKeySchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(`Invalid payload: ${parsed.error.message}`);
      }

      const meta = getApiKeyMeta(db, parsed.data.keyId);
      if (!meta) {
        throw new Error('API key not found');
      }

      const key = getDecryptedKey(db, parsed.data.keyId);
      if (!key) {
        throw new Error('Failed to retrieve API key');
      }

      return validateKey(meta.provider, key, meta.baseUrl);
    }
  );
}
