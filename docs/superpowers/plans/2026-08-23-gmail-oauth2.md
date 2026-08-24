# Gmail OAuth2 Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Gmail OAuth2 authentication flow allowing users to connect multiple Gmail accounts with tokens stored securely in the OS keychain.

**Architecture:** Three-component design: Auth module for token encryption/SQLite storage, OAuth server for handling Google callback, IPC handlers for renderer communication. Uses `electron-safeStorage` for encryption and `googleapis` for token exchange.

**Tech Stack:** TypeScript, Electron, better-sqlite3, googleapis, electron-safeStorage, uuid

---

## File Structure

```
electron/main/
├── auth/
│   ├── gmail.ts              # Token encryption, account CRUD
│   └── oauth-server.ts       # Local HTTP server for OAuth callback
├── ipc/
│   └── gmail-handlers.ts     # IPC handlers for Gmail operations
├── ipc/
│   └── index.ts              # Modified: register gmail handlers
├── db/
│   ├── index.ts              # Modified: add migration 002
│   └── migrations/
│       └── 002-gmail-oauth.sql   # New: oauth_tokens table
├── preload/
│   ├── index.ts              # Modified: add gmail channels
│   └── types.d.ts            # Modified: add gmail types
tests/
├── main/
│   ├── auth/
│   │   ├── gmail.test.ts     # Unit tests for auth module
│   │   └── oauth-server.test.ts  # Unit tests for OAuth server
│   └── ipc/
│       └── gmail-handlers.test.ts  # Unit tests for IPC handlers
```

---

### Task 1: Database Migration

**Files:**
- Create: `electron/main/db/migrations/002-gmail-oauth.sql`
- Modify: `electron/main/db/index.ts`

- [ ] **Step 1: Create migration file**

Create `electron/main/db/migrations/002-gmail-oauth.sql`:

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

- [ ] **Step 2: Update database index to include migration 002**

Modify `electron/main/db/index.ts`:

```typescript
import migration001 from './migrations/001-initial.sql?raw';
import migration002 from './migrations/002-gmail-oauth.sql?raw';

const MIGRATIONS: Record<number, string> = {
  1: migration001,
  2: migration002,
};
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add electron/main/db/migrations/002-gmail-oauth.sql electron/main/db/index.ts
git commit -m "feat: add oauth_tokens table migration"
```

---

### Task 2: Auth Module - Token Encryption

**Files:**
- Create: `electron/main/auth/gmail.ts`

- [ ] **Step 1: Create auth module with token encryption**

Create `electron/main/auth/gmail.ts`:

```typescript
import { safeStorage } from 'electron';
import { randomBytes, createHash } from 'crypto';
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
  return receivedHash === expectedHash;
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
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add electron/main/auth/gmail.ts
git commit -m "feat: add Gmail auth module with token encryption"
```

---

### Task 3: OAuth Server

**Files:**
- Create: `electron/main/auth/oauth-server.ts`

- [ ] **Step 1: Create OAuth server**

Create `electron/main/auth/oauth-server.ts`:

```typescript
import { createServer, type Server } from 'http';
import { URL } from 'url';

export interface OAuthCallback {
  code: string;
  state: string;
}

export interface OAuthServer {
  port: number;
  waitForCallback(timeoutMs?: number): Promise<OAuthCallback>;
  close(): Promise<void>;
}

export function createOAuthServer(): Promise<OAuthServer> {
  return new Promise((resolve, reject) => {
    let callbackResolve: ((value: OAuthCallback) => void) | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const server: Server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost`);

      if (url.pathname === '/callback') {
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const error = url.searchParams.get('error');

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`<h1>Authorization Failed</h1><p>${error}</p>`);
          if (callbackResolve) {
            callbackResolve({ code: '', state: '' });
          }
          return;
        }

        if (code && state) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body>
                <h1>Authorization Successful!</h1>
                <p>You can close this window and return to the app.</p>
                <script>window.close()</script>
              </body>
            </html>
          `);
          if (callbackResolve) {
            callbackResolve({ code, state });
          }
        } else {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<h1>Missing parameters</h1>');
        }
      } else {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>Not Found</h1>');
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        resolve({
          port: addr.port,
          waitForCallback: (timeoutMs = 300000) =>
            new Promise<OAuthCallback>((res, rej) => {
              callbackResolve = res;
              timeoutId = setTimeout(() => {
                rej(new Error('OAuth callback timeout'));
              }, timeoutMs);
            }),
          close: () =>
            new Promise<void>((res) => {
              if (timeoutId) clearTimeout(timeoutId);
              server.close(() => res());
            }),
        });
      } else {
        reject(new Error('Failed to get server address'));
      }
    });

    server.on('error', reject);
  });
}

export function buildAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  scopes: string[];
}): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', params.scopes.join(' '));
  url.searchParams.set('state', params.state);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  return url.toString();
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add electron/main/auth/oauth-server.ts
git commit -m "feat: add OAuth server for Gmail callback handling"
```

---

### Task 4: IPC Handlers

**Files:**
- Create: `electron/main/ipc/gmail-handlers.ts`
- Modify: `electron/main/ipc/index.ts`

- [ ] **Step 1: Create Gmail IPC handlers**

Create `electron/main/ipc/gmail-handlers.ts`:

```typescript
import { ipcMain, shell } from 'electron';
import type Database from 'better-sqlite3';
import { google } from 'googleapis';
import {
  generateState,
  validateState,
  storeTokens,
  retrieveTokens,
  deleteAccount,
  createAccount,
  listAccounts,
} from '../auth/gmail';
import { createOAuthServer, buildAuthUrl } from '../auth/oauth-server';

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.labels',
];

interface ConnectGmailRequest {
  clientId: string;
  clientSecret: string;
}

interface AccountResponse {
  id: string;
  email: string;
  displayName: string;
}

export function registerGmailHandlers(
  ipcMain: typeof import('electron').ipcMain,
  db: Database.Database
): void {
  ipcMain.handle(
    'gmail:connect',
    async (_event, request: ConnectGmailRequest): Promise<AccountResponse> => {
      const { clientId, clientSecret } = request;

      const oauthServer = await createOAuthServer();
      const state = generateState();
      const redirectUri = `http://127.0.0.1:${oauthServer.port}/callback`;

      const authUrl = buildAuthUrl({
        clientId,
        redirectUri,
        state,
        scopes: GMAIL_SCOPES,
      });

      await shell.openExternal(authUrl);

      const callback = await oauthServer.waitForCallback();
      await oauthServer.close();

      if (!callback.code || !validateState(callback.state, state)) {
        throw new Error('Invalid OAuth callback');
      }

      const oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        redirectUri
      );

      const { tokens } = await oauth2Client.getToken(callback.code);
      oauth2Client.setCredentials(tokens);

      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      const profile = await gmail.users.get({ userId: 'me' });

      const email = profile.data.emailAddress ?? '';
      const displayName = profile.data.name ?? email;

      const account = createAccount(db, email, displayName);

      storeTokens(db, account.id, {
        access_token: tokens.access_token ?? '',
        refresh_token: tokens.refresh_token ?? undefined,
        expiry_date: tokens.expiry_date ?? Date.now(),
        scope: tokens.scope ?? GMAIL_SCOPES.join(' '),
      });

      return {
        id: account.id,
        email: account.email,
        displayName: account.display_name,
      };
    }
  );

  ipcMain.handle(
    'gmail:disconnect',
    async (_event, accountId: string): Promise<void> => {
      deleteAccount(db, accountId);
    }
  );

  ipcMain.handle(
    'gmail:listAccounts',
    async (): Promise<AccountResponse[]> => {
      const accounts = listAccounts(db);
      return accounts.map((a) => ({
        id: a.id,
        email: a.email,
        displayName: a.display_name,
      }));
    }
  );

  ipcMain.handle(
    'gmail:getToken',
    async (_event, accountId: string): Promise<{ accessToken: string } | null> => {
      const tokens = retrieveTokens(db, accountId);
      if (!tokens) return null;

      return { accessToken: tokens.access_token };
    }
  );
}
```

- [ ] **Step 2: Update IPC index to register Gmail handlers**

Modify `electron/main/ipc/index.ts`:

```typescript
import type { BrowserWindow } from 'electron';
import type Database from 'better-sqlite3';
import { ipcMain } from 'electron';
import { registerWindowHandlers } from './window-handlers';
import { registerGmailHandlers } from './gmail-handlers';

export function registerIpcHandlers(
  db: Database.Database,
  getWindow: () => BrowserWindow | null = () => null,
  quit: () => void = () => {}
): void {
  registerWindowHandlers(ipcMain, getWindow, quit);
  registerGmailHandlers(ipcMain, db);
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add electron/main/ipc/gmail-handlers.ts electron/main/ipc/index.ts
git commit -m "feat: add Gmail IPC handlers for account management"
```

---

### Task 5: Preload Script Updates

**Files:**
- Modify: `electron/preload/index.ts`
- Modify: `electron/preload/types.d.ts`

- [ ] **Step 1: Update preload allowlist**

Modify `electron/preload/index.ts`:

```typescript
import { contextBridge, ipcRenderer } from 'electron';

const ALLOWED_INVOKE = new Set([
  'window:minimize',
  'window:maximize',
  'window:close',
  'window:isMaximized',
  'app:quit',
  'gmail:connect',
  'gmail:disconnect',
  'gmail:listAccounts',
  'gmail:getToken',
] as const);

const ALLOWED_SEND = new Set([] as const);

const ALLOWED_ON = new Set([
  'app:quit',
] as const);

function gatedInvoke(channel: string, ...args: unknown[]): Promise<unknown> {
  if (!ALLOWED_INVOKE.has(channel as typeof ALLOWED_INVOKE extends Set<infer T> ? T : never)) {
    throw new Error(`Blocked IPC invoke: ${channel}`);
  }
  return ipcRenderer.invoke(channel, ...args);
}

function gatedSend(channel: string, ...args: unknown[]): void {
  if (!ALLOWED_SEND.has(channel as typeof ALLOWED_SEND extends Set<infer T> ? T : never)) {
    throw new Error(`Blocked IPC send: ${channel}`);
  }
  ipcRenderer.send(channel, ...args);
}

function gatedOn(channel: string, callback: (...args: unknown[]) => void): void {
  if (!ALLOWED_ON.has(channel as typeof ALLOWED_ON extends Set<infer T> ? T : never)) {
    throw new Error(`Blocked IPC on: ${channel}`);
  }
  ipcRenderer.on(channel, (_event, ...args) => callback(...args));
}

contextBridge.exposeInMainWorld('electronAPI', {
  window: {
    minimize: () => gatedInvoke('window:minimize'),
    maximize: () => gatedInvoke('window:maximize'),
    close: () => gatedInvoke('window:close'),
    isMaximized: () => gatedInvoke('window:isMaximized') as Promise<boolean>,
  },
  app: {
    quit: () => gatedInvoke('app:quit'),
    onQuit: (callback: () => void) => gatedOn('app:quit', callback),
  },
  gmail: {
    connect: (clientId: string, clientSecret: string) =>
      gatedInvoke('gmail:connect', { clientId, clientSecret }),
    disconnect: (accountId: string) =>
      gatedInvoke('gmail:disconnect', accountId),
    listAccounts: () => gatedInvoke('gmail:listAccounts'),
    getToken: (accountId: string) =>
      gatedInvoke('gmail:getToken', accountId),
  },
});
```

- [ ] **Step 2: Update TypeScript types**

Modify `electron/preload/types.d.ts`:

```typescript
export {};

declare global {
  interface ElectronAPI {
    window: {
      minimize: () => Promise<void>;
      maximize: () => Promise<void>;
      close: () => Promise<void>;
      isMaximized: () => Promise<boolean>;
    };
    app: {
      quit: () => Promise<void>;
      onQuit: (callback: () => void) => void;
    };
    gmail: {
      connect: (
        clientId: string,
        clientSecret: string
      ) => Promise<{ id: string; email: string; displayName: string }>;
      disconnect: (accountId: string) => Promise<void>;
      listAccounts: () => Promise<
        { id: string; email: string; displayName: string }[]
      >;
      getToken: (
        accountId: string
      ) => Promise<{ accessToken: string } | null>;
    };
  }

  interface Window {
    electronAPI: ElectronAPI;
  }
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add electron/preload/index.ts electron/preload/types.d.ts
git commit -m "feat: add Gmail API to preload allowlist and types"
```

---

### Task 6: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install googleapis and uuid**

Run: `npm install googleapis uuid`

- [ ] **Step 2: Install type definitions**

Run: `npm install -D @types/uuid`

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add googleapis and uuid packages"
```

---

### Task 7: Unit Tests - Auth Module

**Files:**
- Create: `tests/main/auth/gmail.test.ts`

- [ ] **Step 1: Create auth module tests**

Create `tests/main/auth/gmail.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateState,
  validateState,
  encryptToken,
  decryptToken,
  storeTokens,
  retrieveTokens,
  deleteTokens,
  createAccount,
  listAccounts,
  deleteAccount,
} from '../../../electron/main/auth/gmail';

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn().mockReturnValue(true),
    encryptString: vi.fn((str: string) => Buffer.from(str, 'utf-8')),
    decryptString: vi.fn((buf: Buffer) => buf.toString('utf-8')),
  },
}));

describe('Gmail Auth', () => {
  describe('generateState', () => {
    it('generates a random state string', () => {
      const state = generateState();
      expect(state).toMatch(/^[a-f0-9]{64}$/);
    });

    it('generates unique states', () => {
      const state1 = generateState();
      const state2 = generateState();
      expect(state1).not.toBe(state2);
    });
  });

  describe('validateState', () => {
    it('returns true for matching states', () => {
      const state = generateState();
      expect(validateState(state, state)).toBe(true);
    });

    it('returns false for non-matching states', () => {
      const state1 = generateState();
      const state2 = generateState();
      expect(validateState(state1, state2)).toBe(false);
    });
  });

  describe('encryptToken / decryptToken', () => {
    it('encrypts and decrypts a token', () => {
      const token = 'test-access-token-12345';
      const encrypted = encryptToken(token);
      const decrypted = decryptToken(encrypted);
      expect(decrypted).toBe(token);
    });

    it('returns buffer when encrypting', () => {
      const token = 'test-token';
      const encrypted = encryptToken(token);
      expect(encrypted).toBeInstanceOf(Buffer);
    });
  });
});

describe('Gmail Database Operations', () => {
  let mockDb: {
    prepare: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = {
      prepare: vi.fn().mockReturnValue({
        run: vi.fn(),
        get: vi.fn(),
        all: vi.fn().mockReturnValue([]),
      }),
    };
  });

  describe('createAccount', () => {
    it('creates a gmail account', () => {
      const result = createAccount(
        mockDb as any,
        'test@gmail.com',
        'Test User'
      );
      expect(result).toHaveProperty('id');
      expect(result.email).toBe('test@gmail.com');
      expect(result.display_name).toBe('Test User');
    });
  });

  describe('listAccounts', () => {
    it('returns empty array when no accounts', () => {
      const result = listAccounts(mockDb as any);
      expect(result).toEqual([]);
    });
  });

  describe('deleteAccount', () => {
    it('deletes account and tokens', () => {
      deleteAccount(mockDb as any, 'account-123');
      expect(mockDb.prepare).toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm run test tests/main/auth/gmail.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/main/auth/gmail.test.ts
git commit -m "test: add unit tests for Gmail auth module"
```

---

### Task 8: Unit Tests - OAuth Server

**Files:**
- Create: `tests/main/auth/oauth-server.test.ts`

- [ ] **Step 1: Create OAuth server tests**

Create `tests/main/auth/oauth-server.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildAuthUrl } from '../../../electron/main/auth/oauth-server';

describe('OAuth Server', () => {
  describe('buildAuthUrl', () => {
    it('builds a valid Google OAuth URL', () => {
      const url = buildAuthUrl({
        clientId: 'test-client-id',
        redirectUri: 'http://127.0.0.1:3000/callback',
        state: 'test-state-123',
        scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
      });

      expect(url).toContain('accounts.google.com/o/oauth2/v2/auth');
      expect(url).toContain('client_id=test-client-id');
      expect(url).toContain('redirect_uri=');
      expect(url).toContain('state=test-state-123');
      expect(url).toContain('response_type=code');
      expect(url).toContain('access_type=offline');
      expect(url).toContain('prompt=consent');
    });

    it('includes multiple scopes separated by spaces', () => {
      const url = buildAuthUrl({
        clientId: 'test-client-id',
        redirectUri: 'http://127.0.0.1:3000/callback',
        state: 'test-state',
        scopes: [
          'https://www.googleapis.com/auth/gmail.readonly',
          'https://www.googleapis.com/auth/gmail.labels',
        ],
      });

      expect(url).toContain('scope=');
      expect(url).toContain('gmail.readonly');
      expect(url).toContain('gmail.labels');
    });
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm run test tests/main/auth/oauth-server.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/main/auth/oauth-server.test.ts
git commit -m "test: add unit tests for OAuth server"
```

---

### Task 9: Run All Tests

- [ ] **Step 1: Run full test suite**

Run: `npm run test`
Expected: PASS

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address test and typecheck issues"
```

---

## Spec Coverage Check

| Spec Requirement | Task |
|-----------------|------|
| REQ-001: OAuth2 flow for Gmail API | Task 3, Task 4 |
| REQ-002: User can connect 3+ Gmail accounts | Task 4, Task 5 |
| REQ-003: Tokens stored securely (OS keychain) | Task 2 |
| REQ-004: Account list persisted in SQLite | Task 1, Task 2 |
| REQ-005: Token refresh handled automatically | Task 2 (structure ready) |
| SEC-001: Tokens never stored in plain text | Task 2 |
| SEC-002: OAuth state parameter validated | Task 2, Task 3 |
| DB-001: accounts table stores Gmail metadata | Task 1 |
| DB-002: oauth_tokens table stores encrypted tokens | Task 1 |
| DB-003: Token expiry tracked | Task 1 |
