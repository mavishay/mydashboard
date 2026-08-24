# Implementation Plan: BYOK API Key Setup

## Source Reference Analysis

### Files to Adopt Patterns From

| File | Lines | Pattern | Notes |
|------|-------|---------|-------|
| `electron/main/auth/gmail.ts` | 31-43 | `encryptToken`/`decryptToken` using `safeStorage` | Reuse directly for API key encryption |
| `electron/main/ipc/gmail-handlers.ts` | 35-44 | IPC handler registration with `ipcMain.handle` | Follow same pattern for API key handlers |
| `electron/main/ipc/window-handlers.ts` | 4-8 | Zod schema exports | Export schemas for test reuse |
| `electron/main/db/index.ts` | 1-13 | Migration import pattern | Add migration003 import |
| `electron/preload/index.ts` | 3-16 | `ALLOWED_INVOKE` set | Add new channels to allowlist |
| `tests/main/ipc/schemas.test.ts` | 1-40 | Schema test pattern | Write similar tests for API key schemas |

### Patterns NOT to Adopt

- Do NOT store API keys in SQLite (encrypted or not) — use OS keychain only
- Do NOT create new utility functions for safeStorage — reuse `encryptToken`/`decryptToken` from `gmail.ts`

## Task List

### Task 1: Database Migration

**File**: `electron/main/db/migrations/003-api-keys.sql`
**Action**: Create
**Verification**: Migration runs without error on `initializeDatabase()`

```sql
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK(provider IN ('openai', 'anthropic', 'litellm')),
  label TEXT NOT NULL,
  base_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Update `electron/main/db/index.ts`:
- Import `migration003`
- Add to `MIGRATIONS` record
- Bump `CURRENT_SCHEMA_VERSION` to 3

### Task 2: API Key Auth Module

**File**: `electron/main/auth/api-keys.ts`
**Action**: Create
**Verification**: Unit tests for CRUD operations

Functions:
- `saveApiKey(db, provider, label, encryptedKey, baseUrl?)` → `ApiKeyMeta`
- `listApiKeys(db)` → `ApiKeyMeta[]`
- `deleteApiKey(db, keyId)` → `void`
- `getEncryptedKey(db, keyId)` → `Buffer | null`

Note: encryption/decryption handled by reusing `encryptToken`/`decryptToken` from `gmail.ts`.

### Task 3: API Key IPC Handlers

**File**: `electron/main/ipc/api-key-handlers.ts`
**Action**: Create
**Verification**: Integration test for handler registration

Handlers:
- `apikey:save` — validate with Zod, encrypt key, store in DB, return meta
- `apikey:list` — return all keys (without decrypted key)
- `apikey:delete` — validate keyId, delete from DB
- `apikey:validate` — retrieve key, make test API call, return validity

Validation logic per provider:
- OpenAI: `GET https://api.openai.com/v1/models`
- Anthropic: `POST https://api.anthropic.com/v1/messages` (minimal payload)
- liteLLM: `GET <baseUrl>/v1/models`

Update `electron/main/ipc/index.ts`:
- Import and register `registerApiKeyHandlers`

### Task 4: Preload Script Update

**File**: `electron/preload/index.ts`
**Action**: Edit
**Verification**: Channels appear in `ALLOWED_INVOKE`

Add to `ALLOWED_INVOKE`:
- `apikey:save`
- `apikey:list`
- `apikey:delete`
- `apikey:validate`

Add to `electronAPI`:
```typescript
apikey: {
  save: (data) => gatedInvoke('apikey:save', data),
  list: () => gatedInvoke('apikey:list') as Promise<ApiKeyMeta[]>,
  delete: (keyId) => gatedInvoke('apikey:delete', { keyId }),
  validate: (keyId) => gatedInvoke('apikey:validate', { keyId }) as Promise<{ valid: boolean; error?: string }>,
}
```

Update `electron/preload/types.d.ts`:
- Add `ApiKeyMeta` interface
- Add `apikey` section to `ElectronAPI`

### Task 5: Settings UI Component

**File**: `src/components/Settings.tsx`
**Action**: Create
**Verification**: Component renders, form submits

Components:
- `Settings` — main settings page
- `ApiKeyForm` — provider select, label, key input, base URL, save button
- `ApiKeyList` — table of saved keys with delete buttons

Features:
- Provider dropdown (OpenAI / Anthropic / liteLLM)
- Label text input
- API key password input with show/hide toggle
- Base URL input (conditionally shown for liteLLM)
- Save button with loading state
- Saved keys table with masked display (last 4 chars)

### Task 6: Navigation Integration

**File**: `src/components/Dashboard.tsx`
**Action**: Edit
**Verification**: Settings link visible on dashboard

Add a "Settings" navigation link/button to the dashboard.

### Task 7: Tests

**File**: `tests/main/auth/api-keys.test.ts`
**Action**: Create
**Verification**: All tests pass

Tests:
- `saveApiKey` stores and retrieves key metadata
- `listApiKeys` returns all keys
- `deleteApiKey` removes key from DB
- `getEncryptedKey` returns encrypted buffer

**File**: `tests/main/ipc/api-key-schemas.test.ts`
**Action**: Create
**Verification**: All tests pass

Tests:
- `SaveApiKeySchema` validation (valid/invalid inputs)
- `DeleteApiKeySchema` validation
- `ValidateApiKeySchema` validation
- LiteLLM requires baseUrl

### Task 8: Lint & Typecheck

**Action**: Run
**Verification**: No errors

```bash
npm run typecheck
npm run lint
```
