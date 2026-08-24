# Design: Gmail OAuth2 Connector

**Date:** 2026-08-23
**Issue:** #2
**Milestone:** Alpha (Phase 1)
**PRD References:** PDR-007 (Gmail-first phasing), REQ-001 (Gmail API OAuth2)

---

## 1. Architecture Overview

The Gmail OAuth2 connector consists of three components:

- **Auth Module** (`electron/main/auth/gmail.ts`): Handles token encryption/decryption using `electron-safeStorage`, token storage/retrieval from SQLite, and account CRUD operations
- **OAuth Server** (`electron/main/auth/oauth-server.ts`): Local HTTP server that listens for the Google OAuth callback, validates the state parameter, and exchanges the authorization code for tokens
- **IPC Handlers** (`electron/main/ipc/gmail-handlers.ts`): Exposes Gmail connection functionality to the renderer via secure IPC channels

---

## 2. OAuth2 Flow

```
User clicks "Connect Gmail"
    ↓
Main process generates random state, starts local HTTP server on random port
    ↓
Opens external browser with Google OAuth URL:
  - client_id from GOOGLE_CLIENT_ID env var
  - redirect_uri = http://127.0.0.1:{port}/callback
  - scope = gmail.readonly + gmail.labels
  - access_type = offline (to get refresh_token)
    ↓
Google consent screen → user authorizes
    ↓
Google redirects to http://127.0.0.1:{port}/callback?code=...&state=...
    ↓
Local server validates state (CSRF prevention), exchanges code for tokens via googleapis
    ↓
Fetches user email profile from Gmail API
    ↓
Encrypts tokens with electron-safeStorage, stores in SQLite
    ↓
Returns account info to renderer, closes browser window
```

---

## 3. Database Schema

New migration `002-gmail-oauth.sql` adds an `oauth_tokens` table:

```sql
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  encrypted_access_token BLOB NOT NULL,
  encrypted_refresh_token BLOB,
  expires_at TEXT NOT NULL,
  scope TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(account_id)
);
```

The existing `accounts` table (from migration 001) already has the right structure with `type='gmail'` check constraint.

---

## 4. IPC Channels

New channels added to the preload allowlist:

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `gmail:connect` | invoke | Initiate OAuth flow, returns account info |
| `gmail:disconnect` | invoke | Remove account and tokens |
| `gmail:listAccounts` | invoke | List all connected Gmail accounts |
| `gmail:getToken` | invoke | Get access token for API calls |

The renderer accesses these via `window.electronAPI.gmail.*` methods.

---

## 5. Security Considerations

- **Token encryption**: All tokens encrypted with `electron-safeStorage` before SQLite storage
- **State validation**: Random 32-byte hex state parameter prevents CSRF
- **No plaintext**: Tokens never stored in plain text in memory or database
- **Localhost only**: OAuth callback server binds to `127.0.0.1` (not exposed to network)
- **Env vars**: Client credentials loaded from environment, not hardcoded

---

## 6. File Structure

New files to create:

```
electron/main/
├── auth/
│   ├── gmail.ts              # Token encryption, account CRUD
│   └── oauth-server.ts       # Local HTTP server for OAuth callback
├── ipc/
│   └── gmail-handlers.ts     # IPC handlers for Gmail operations
└── db/migrations/
    └── 002-gmail-oauth.sql   # OAuth tokens table
```

Modified files:

- `electron/preload/index.ts` — Add gmail channels to allowlist, expose `gmail` API
- `electron/preload/types.d.ts` — Add TypeScript types for gmail API
- `electron/main/ipc/index.ts` — Register gmail handlers
- `electron/main/db/index.ts` — Add migration 002

---

## 7. Testing Strategy

- **Unit tests**: Token encryption/decryption roundtrip, state validation, account CRUD operations
- **Integration tests**: OAuth flow with mocked Google API, multiple account connection
- **Mock strategy**: Mock `electron-safeStorage`, mock `googleapis`, mock `better-sqlite3`

---

## 8. Dependencies

New npm packages required:

| Package | Purpose | Version |
|---------|---------|---------|
| `googleapis` | Gmail API client, token exchange | `^140.0.0` |
| `uuid` | Generate unique IDs for accounts/tokens | `^11.0.0` |

---

## 9. Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_CLIENT_ID` | Yes | Google Cloud OAuth2 client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google Cloud OAuth2 client secret |

---

## 10. Definition of Done

- [ ] Gmail OAuth2 flow completes successfully
- [ ] Tokens encrypted with electron-safeStorage
- [ ] Account metadata stored in SQLite
- [ ] Multiple accounts can be connected (3+)
- [ ] Account removal clears keychain entries
- [ ] Unit tests pass for auth and IPC handlers
- [ ] No plaintext tokens in memory or storage
- [ ] TypeScript strict mode, no lint errors
- [ ] `npm run lint` and `npm run typecheck` pass
