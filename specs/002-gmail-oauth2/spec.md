# Feature Specification: Gmail OAuth2 Connector

**Feature ID:** 002-gmail-oauth2
**Status:** Draft
**Created:** 2026-08-23
**Milestone:** Alpha (Phase 1)
**PRD References:** PDR-007 (Gmail-first phasing), REQ-001 (Gmail API OAuth2)

---

## 1. Overview

Implement Gmail OAuth2 authentication flow allowing users to connect multiple Gmail accounts. Tokens are stored securely in the OS keychain using electron-safeStorage, and account metadata is persisted in SQLite.

**Demo Sentence:** User can connect 3+ Gmail accounts via OAuth2, see them listed in the dashboard, and tokens are stored securely in the OS keychain.

---

## 2. Requirements

### 2.1 Core Requirements

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| REQ-001 | OAuth2 flow for Gmail API | Must | User can authenticate via Google OAuth2 consent screen |
| REQ-002 | User can connect 3+ Gmail accounts | Must | Multiple accounts stored and displayed in UI |
| REQ-003 | Tokens stored securely (OS keychain) | Must | Access/refresh tokens encrypted via electron-safeStorage |
| REQ-004 | Account list persisted in SQLite | Must | Accounts table updated with connected accounts |
| REQ-005 | Token refresh handled automatically | Must | Expired tokens refreshed before API calls |

### 2.2 Security Requirements

| ID | Requirement | Source | Acceptance Criteria |
|----|-------------|--------|---------------------|
| SEC-001 | Tokens never stored in plain text | PDR-002, Constitution | electron-safeStorage encrypts all tokens |
| SEC-002 | OAuth state parameter validated | OAuth2 spec | CSRF prevention via random state |
| SEC-003 | Tokens cleared on account removal | Security best practice | Keychain entry deleted when account removed |

### 2.3 Database Requirements

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| DB-001 | accounts table stores Gmail metadata | Must | id, type='gmail', email, display_name |
| DB-002 | oauth_tokens table stores encrypted tokens | Must | account_id FK, encrypted_access_token, encrypted_refresh_token |
| DB-003 | Token expiry tracked | Must | expires_at timestamp stored for refresh logic |

---

## 3. Constraints

### 3.1 Technical Constraints

| Constraint | Rationale |
|------------|-----------|
| electron-safeStorage for token encryption | PDR-002: BYOK security model |
| Gmail API OAuth2 (not API keys) | Gmail requires OAuth2 for read access |
| No hardcoded client secrets | Constitution: Security by Default |

### 3.2 Non-Goals (This Feature)

| Excluded | Rationale |
|----------|-----------|
| M365 Graph connector | Phase 2 feature |
| Email fetching/sync | Separate feature (003-email-sync) |
| AI classification | Separate feature (004-ai-triage) |
| UI for account management | Minimal UI, focus on backend |

---

## 4. Technical Design

### 4.1 OAuth2 Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     Electron App                            │
│                                                             │
│  1. User clicks "Connect Gmail"                             │
│  2. Generate random state, store in memory                  │
│  3. Open external browser with Google OAuth2 URL            │
│     - client_id (from env or settings)                      │
│     - redirect_uri: http://localhost:${PORT}/callback        │
│     - scope: gmail.readonly gmail.labels                    │
│     - state: random_string                                  │
│     - access_type: offline (for refresh token)              │
│                                                             │
│  4. Local HTTP server listens on callback                   │
│  5. Google redirects with code + state                      │
│  6. Validate state matches (CSRF prevention)                │
│  7. Exchange code for tokens via Google token endpoint      │
│  8. Fetch user email profile from Gmail API                 │
│  9. Encrypt tokens with electron-safeStorage                │
│ 10. Store account + tokens in SQLite                        │
│ 11. Close browser window, update UI                         │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Database Schema (Migration 002)

```sql
-- 002-gmail-oauth.sql
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

CREATE INDEX idx_oauth_tokens_account_id ON oauth_tokens(account_id);
```

### 4.3 IPC Channel Design

**New Allowed Channels:**

```typescript
// electron/preload/types.ts
export const ALLOWED_INVOKE = new Set([
  // Existing
  'db:initialize',
  'db:execute',
  'db:query',
  'app:getVersion',
  'app:getPath',
  // New for Gmail OAuth
  'gmail:connect',
  'gmail:disconnect',
  'gmail:listAccounts',
  'gmail:getToken',
] as const);
```

### 4.4 Token Storage

```typescript
// electron/main/auth/gmail.ts
import { safeStorage } from 'electron';

export function encryptToken(token: string): Buffer {
  return safeStorage.encryptString(token);
}

export function decryptToken(encrypted: Buffer): string {
  return safeStorage.decryptString(encrypted);
}
```

### 4.5 Project Structure

```
electron/
├── main/
│   ├── index.ts
│   ├── db/
│   │   ├── index.ts
│   │   └── migrations/
│   │       ├── 001-initial.sql
│   │       └── 002-gmail-oauth.sql    # NEW
│   ├── ipc/
│   │   ├── index.ts
│   │   ├── window-handlers.ts
│   │   └── gmail-handlers.ts          # NEW
│   └── auth/
│       ├── gmail.ts                   # NEW
│       └── oauth-server.ts            # NEW
```

---

## 5. Success Criteria

### 5.1 Functional Criteria

| ID | Criterion | Measurement |
|----|-----------|-------------|
| SC-001 | User can initiate Gmail OAuth2 flow | Manual: click "Connect Gmail", Google consent screen appears |
| SC-002 | OAuth2 callback handled correctly | Manual: tokens received, account created |
| SC-003 | Multiple accounts can be connected | Manual: connect 3+ accounts, all listed |
| SC-004 | Tokens stored encrypted | Manual: verify keychain contains encrypted entries |
| SC-005 | Account removal clears tokens | Manual: remove account, keychain entry deleted |

### 5.2 Security Criteria

| ID | Criterion | Measurement |
|----|-----------|-------------|
| SEC-SC-001 | No tokens in plain text | Code review: safeStorage used for all tokens |
| SEC-SC-002 | State parameter validated | Code review: state check before token exchange |
| SEC-SC-003 | Client secret not hardcoded | Code review: loaded from env/settings |

---

## 6. Test Plan

### 6.1 Unit Tests

| Test | File | Validates |
|------|------|-----------|
| Token encryption/decryption roundtrip | auth/gmail.test.ts | SEC-001 |
| State parameter generation and validation | auth/gmail.test.ts | SEC-002 |
| OAuth token storage and retrieval | ipc/gmail-handlers.test.ts | DB-002 |
| Account listing returns all accounts | ipc/gmail-handlers.test.ts | REQ-002 |

### 6.2 Integration Tests

| Test | File | Validates |
|------|------|-----------|
| Full OAuth2 flow with mock Google API | auth/gmail.integration.test.ts | SC-001, SC-002 |
| Multiple account connection | ipc/gmail-handlers.integration.test.ts | SC-003 |

---

## 7. Dependencies

| Dependency | Purpose | Version Constraint |
|------------|---------|-------------------|
| electron-safeStorage | Token encryption | Built-in to Electron |
| googleapis | Gmail API client | ^140.0.0 |
| express | Local OAuth callback server | ^4.18.0 |

---

## 8. Open Questions

| ID | Question | Resolution |
|----|----------|------------|
| OQ-001 | Where does client_id/client_secret come from? | User provides via settings UI or env vars |
| OQ-002 | Port for local OAuth callback server | Random available port, not hardcoded |
| OQ-003 | Should we use PKCE for public client? | Yes, recommended for desktop apps |

---

## 9. PDR Traceability

| PDR | Decision | Impact on This Feature |
|-----|----------|----------------------|
| PDR-001 | Electron + LAN | Desktop OAuth flow, no web redirect |
| PDR-002 | BYOK cloud-first | User provides their own Google OAuth credentials |
| PDR-005 | Multi-hat consultant | Multiple account support required |
| PDR-006 | V1 success metrics | <15 min setup applies to first account connection |
| PDR-007 | Gmail-first phasing | This is the first connector implemented |

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
