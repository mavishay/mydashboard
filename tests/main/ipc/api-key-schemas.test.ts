import { describe, it, expect } from 'vitest';
import {
  SaveApiKeySchema,
  DeleteApiKeySchema,
  ValidateApiKeySchema,
} from '../../../electron/main/ipc/api-key-handlers';

describe('API Key IPC Zod schemas', () => {
  describe('SaveApiKeySchema', () => {
    it('accepts valid OpenAI key', () => {
      const result = SaveApiKeySchema.safeParse({
        provider: 'openai',
        label: 'My OpenAI Key',
        apiKey: 'sk-test123',
      });
      expect(result.success).toBe(true);
    });

    it('accepts valid Anthropic key', () => {
      const result = SaveApiKeySchema.safeParse({
        provider: 'anthropic',
        label: 'My Anthropic Key',
        apiKey: 'sk-ant-test123',
      });
      expect(result.success).toBe(true);
    });

    it('accepts valid liteLLM key with baseUrl', () => {
      const result = SaveApiKeySchema.safeParse({
        provider: 'litellm',
        label: 'My LiteLLM Key',
        apiKey: 'sk-test123',
        baseUrl: 'http://localhost:4000',
      });
      expect(result.success).toBe(true);
    });

    it('rejects liteLLM without baseUrl', () => {
      const result = SaveApiKeySchema.safeParse({
        provider: 'litellm',
        label: 'My LiteLLM Key',
        apiKey: 'sk-test123',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty provider', () => {
      const result = SaveApiKeySchema.safeParse({
        provider: '',
        label: 'Test',
        apiKey: 'sk-test',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty label', () => {
      const result = SaveApiKeySchema.safeParse({
        provider: 'openai',
        label: '',
        apiKey: 'sk-test',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty apiKey', () => {
      const result = SaveApiKeySchema.safeParse({
        provider: 'openai',
        label: 'Test',
        apiKey: '',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid baseUrl', () => {
      const result = SaveApiKeySchema.safeParse({
        provider: 'litellm',
        label: 'Test',
        apiKey: 'sk-test',
        baseUrl: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('DeleteApiKeySchema', () => {
    it('accepts valid keyId', () => {
      const result = DeleteApiKeySchema.safeParse({ keyId: 'abc-123' });
      expect(result.success).toBe(true);
    });

    it('rejects empty keyId', () => {
      const result = DeleteApiKeySchema.safeParse({ keyId: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('ValidateApiKeySchema', () => {
    it('accepts valid keyId', () => {
      const result = ValidateApiKeySchema.safeParse({ keyId: 'abc-123' });
      expect(result.success).toBe(true);
    });

    it('rejects empty keyId', () => {
      const result = ValidateApiKeySchema.safeParse({ keyId: '' });
      expect(result.success).toBe(false);
    });
  });
});
