# Feature Specification: BYOK API Key Setup

**Issue**: [#3](https://github.com/mavishay/mydashboard/issues/3)
**Requirements**: REQ-005, REQ-009
**Milestone**: Alpha
**PDR**: PDR-002

## Goal

Allow users to configure their own API keys for OpenAI, Anthropic, or liteLLM (with custom base URL) for AI-powered email triage.

## Success Criteria

1. Settings UI provides provider selection (OpenAI / Anthropic / liteLLM)
2. API key input field with show/hide toggle
3. For liteLLM: additional custom base URL input field
4. Keys stored encrypted in OS keychain via `electron.safeStorage`
5. Key validation on save: test API call to verify key works
6. Existing saved keys can be viewed (masked) and deleted
7. IPC channels properly allowlisted with Zod validation

## Data Model

### Database Table: `api_keys`

```sql
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK(provider IN ('openai', 'anthropic', 'litellm')),
  label TEXT NOT NULL,
  base_url TEXT,
  encrypted_key BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- `encrypted_key`: encrypted via `electron.safeStorage.encryptString()`
- `base_url`: only populated for litellm provider (e.g., `http://localhost:4000`)
- `label`: user-friendly name (e.g., "My OpenAI Key")

### Validation Schemas (Zod)

```typescript
// Save API key
const SaveApiKeySchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'litellm']),
  label: z.string().min(1).max(100),
  apiKey: z.string().min(1),
  baseUrl: z.string().url().optional(),
}).refine(
  (data) => data.provider !== 'litellm' || data.baseUrl,
  { message: 'Base URL is required for liteLLM provider' }
);

// Delete API key
const DeleteApiKeySchema = z.object({
  keyId: z.string().min(1),
});

// Validate API key
const ValidateApiKeySchema = z.object({
  keyId: z.string().min(1),
});
```

## IPC Channels

| Channel | Direction | Payload | Response |
|---------|-----------|---------|----------|
| `apikey:save` | renderer→main | `{ provider, label, apiKey, baseUrl? }` | `{ id, provider, label, baseUrl? }` |
| `apikey:list` | renderer→main | none | `ApiKeyMeta[]` |
| `apikey:delete` | renderer→main | `{ keyId }` | `void` |
| `apikey:validate` | renderer→main | `{ keyId }` | `{ valid: boolean, error?: string }` |

### `ApiKeyMeta` (returned without decrypted key)

```typescript
interface ApiKeyMeta {
  id: string;
  provider: 'openai' | 'anthropic' | 'litellm';
  label: string;
  baseUrl?: string;
  createdAt: string;
}
```

## Validation Logic

### OpenAI

- Test call: `GET https://api.openai.com/v1/models` with `Authorization: Bearer <key>`
- Success: 200 response with models list

### Anthropic

- Test call: `POST https://api.anthropic.com/v1/messages` with `x-api-key: <key>` and minimal payload
- Success: 200 or 400 (bad request means key is valid, auth error means invalid)

### liteLLM

- Test call: `GET <base_url>/v1/models` with `Authorization: Bearer <key>`
- Success: 200 response with models list

## UI Requirements

### Settings Page Layout

- Provider selector: dropdown (OpenAI / Anthropic / liteLLM)
- Label input: text field for user-friendly name
- API Key input: password field with show/hide toggle
- Base URL input: text field (shown only when liteLLM selected)
- Save button: triggers save + validation
- Saved keys list: shows masked keys with delete button

### Validation Feedback

- On save: show loading spinner during validation
- On success: green checkmark, key added to list
- On failure: red error message with details

## Acceptance Criteria

- [ ] User can select OpenAI, Anthropic, or liteLLM as provider
- [ ] User can enter API key with show/hide toggle
- [ ] liteLLM shows base URL input when selected
- [ ] Key is validated on save with test API call
- [ ] Encrypted key stored in OS keychain (never plain text in DB)
- [ ] Saved keys listed with masked display (last 4 chars visible)
- [ ] User can delete saved keys
- [ ] IPC channels allowlisted in preload script
- [ ] Zod validation on all IPC handlers
