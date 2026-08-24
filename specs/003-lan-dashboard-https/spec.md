# Feature Specification: LAN Dashboard with Pairing + HTTPS

**Feature ID:** 003-lan-dashboard-https
**Status:** Draft
**Created:** 2026-08-24
**Milestone:** Beta (Phase 2)
**PRD References:** PDR-001 (Electron + LAN), REQ-021 (HTTP server + pairing), REQ-022 (Self-signed HTTPS)

---

## 1. Overview

Add an HTTP(S) server to the Electron main process that serves the dashboard UI to LAN devices (phones, tablets, other computers). The server enforces pairing token authentication on first connection and uses self-signed TLS certificates for encrypted LAN traffic. The server starts automatically when the app launches and shuts down immediately (socket.destroy) when the app quits.

**Demo Sentence:** User can open `https://<desktop-ip>:8443` on their phone browser, enter a pairing token displayed in the desktop app, and see a read-only copy of the dashboard. The connection is encrypted via self-signed HTTPS.

---

## 2. Requirements

### 2.1 Core Requirements

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| REQ-021 | HTTP server exposes dashboard to LAN devices with pairing token | Must | Server listens on configurable port, serves static dashboard assets, requires pairing token for first connection |
| REQ-022 | Self-signed HTTPS enabled on LAN server for encrypted LAN traffic | Must | TLS certificates generated on first run, server serves over HTTPS, browsers accept certificate after user confirmation |
| LAN-001 | Server starts automatically on app launch | Must | HTTP server is listening after `app.whenReady()` completes |
| LAN-002 | Server shuts down immediately on app quit | Must | All sockets destroyed (not ended) on `will-quit`, server.close() called |
| LAN-003 | Pairing token displayed in desktop app | Must | Token shown in settings/connection panel, user copies to phone |
| LAN-004 | First connection requires token, subsequent sessions remembered | Must | Token validated on first HTTP request; successful auth sets a session cookie |
| LAN-005 | Dashboard served to LAN devices is responsive | Must | React app renders correctly on phone/tablet viewport widths |
| LAN-006 | Server binds to all network interfaces (0.0.0.0) | Must | Accessible from any device on the LAN |
| LAN-007 | Configurable port | Should | Default 8443, overridable via app settings |

### 2.2 Security Requirements

| ID | Requirement | Source | Acceptance Criteria |
|----|-------------|--------|---------------------|
| SEC-LAN-001 | Pairing token required for first connection | REQ-021 acceptance criteria | Server rejects unauthenticated requests with 401; token validated against stored hash |
| SEC-LAN-002 | Self-signed TLS certificates generated on first run | REQ-022 acceptance criteria | Certs stored in app data directory; RSA 2048-bit, valid for 10 years |
| SEC-LAN-003 | Token stored as salted hash, not plaintext | Constitution: Security by Default | SHA-256 hash with random salt, stored in SQLite |
| SEC-LAN-004 | Session cookie with secure flags | Electron security | HttpOnly, Secure, SameSite=Strict cookies |
| SEC-LAN-005 | No sensitive data in LAN dashboard | Constitution: Security by Default | Dashboard shows read-only view; no API keys, no credentials |
| SEC-LAN-006 | Rate limiting on auth endpoint | Constitution: Security by Default | Max 5 token attempts per minute per IP |
| SEC-LAN-007 | TLS 1.2+ only | Constitution: Security by Default | Server rejects TLS 1.0/1.1 connections |

### 2.3 Server Requirements

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| SRV-001 | Serves static files from renderer build output | Must | HTML, JS, CSS assets served from `dist/renderer/` |
| SRV-002 | SPA fallback (all routes return index.html) | Must | Client-side routing works on LAN dashboard |
| SRV-003 | Health check endpoint | Should | `GET /api/health` returns `{ status: "ok" }` |
| SRV-004 | Graceful shutdown on app quit | Must | CDR-2026-061: socket.destroy() for immediate close |
| SRV-005 | Error handling for port conflicts | Must | Clear error message if port is in use, app continues without LAN |

### 2.4 Pairing Flow Requirements

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| PAIR-001 | Token generated on first app launch | Must | 6-character alphanumeric token (e.g., `A3K9-X2`) generated once, stored as hash |
| PAIR-002 | Token displayed in desktop app settings | Must | User can view and copy token from connection settings panel |
| PAIR-003 | Token validated on HTTP request | Must | `Authorization: Bearer <token>` or query param `?token=<token>` |
| PAIR-004 | Successful auth sets session cookie | Must | Cookie persists for 30 days, no re-auth required |
| PAIR-005 | Token can be regenerated | Should | User can regenerate token, invalidating all existing sessions |
| PAIR-006 | Visual indicator of connected LAN devices | Should | Desktop app shows count of active LAN sessions |

---

## 3. Constraints

### 3.1 Technical Constraints

| Constraint | Rationale |
|------------|-----------|
| Node.js `https` module (no Express dependency) | Minimize dependencies; Node.js stdlib sufficient for static file serving + TLS |
| Self-signed certificates only | PDR-001: LAN access; no external CA needed for local network |
| Same Electron main process | No separate daemon; server lifecycle tied to app lifecycle |
| Static file serving only (no SSR) | React SPA served as-is; server is auth + TLS layer only |
| Existing IPC patterns for server control | CDR: rule-electron-contextbridge-allowlist, rule-electron-ipc-registration |

### 3.2 Non-Goals (This Feature)

| Excluded | Rationale |
|----------|-----------|
| Mobile native apps (iOS/Android) | PRD: Out of scope; LAN dashboard only |
| Multi-user / team features | PRD: Solo consultant focus |
| External SSL certificates | PRD: Self-signed only |
| Real-time WebSocket push | Dashboard uses polling; WebSocket is a future optimization |
| Streaming/incremental TLS | Static file serving is sufficient |

---

## 4. Technical Design

### 4.1 Project Structure (New Files)

```
electron/
├── main/
│   ├── server/
│   │   ├── index.ts              # LAN server orchestrator
│   │   ├── http-server.ts        # HTTP/HTTPS server creation
│   │   ├── tls.ts                # Self-signed cert generation/loading
│   │   ├── auth.ts               # Pairing token generation/validation
│   │   ├── static-files.ts       # Static file serving + SPA fallback
│   │   └── session.ts            # Session cookie management
│   ├── ipc/
│   │   ├── lan-handlers.ts       # IPC handlers for LAN server control
│   │   └── index.ts              # Updated: register lan-handlers
│   └── index.ts                  # Updated: start/stop LAN server
├── preload/
│   ├── index.ts                  # Updated: add lan: channels to allowlist
│   └── types.d.ts                # Updated: add LAN API types
└── tests/
    └── server/
        ├── http-server.test.ts
        ├── tls.test.ts
        ├── auth.test.ts
        ├── static-files.test.ts
        ├── session.test.ts
        └── lan-handlers.test.ts
```

### 4.2 TLS Certificate Generation

```
electron/main/server/tls.ts
```

- On first app launch, generate self-signed RSA 2048-bit certificate + private key
- Store in `<userData>/certs/server.{crt,key}`
- Certificate valid for 10 years, SAN includes `localhost` and `*` (wildcard for LAN IPs)
- On subsequent launches, load existing certs if present
- Regenerate if certs are missing or corrupted

```typescript
// Pseudocode
interface CertPair {
  cert: string;  // PEM-encoded certificate
  key: string;   // PEM-encoded private key
}

async function getOrCreateCerts(userDataPath: string): Promise<CertPair> {
  const certsDir = join(userDataPath, 'certs');
  const certPath = join(certsDir, 'server.crt');
  const keyPath = join(certsDir, 'server.key');

  if (existsSync(certPath) && existsSync(keyPath)) {
    return { cert: readFileSync(certPath, 'utf8'), key: readFileSync(keyPath, 'utf8') };
  }

  const { cert, key } = await generateSelfSignedCert();
  mkdirSync(certsDir, { recursive: true });
  writeFileSync(certPath, cert);
  writeFileSync(keyPath, key);
  return { cert, key };
}
```

**Dependency**: Use `node-forge` or `selfsigned` npm package for cert generation (check existing deps first; if not available, implement with `node:crypto` + ASN.1).

### 4.3 Pairing Token Auth

```
electron/main/server/auth.ts
```

- Generate 6-char alphanumeric token on first launch (e.g., `A3K9-X2`)
- Store SHA-256 hash + salt in SQLite `pairing_tokens` table
- Validate incoming token against stored hash
- On success, issue session cookie (30-day expiry)

**Database Schema Addition:**

```sql
CREATE TABLE IF NOT EXISTS pairing_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT
);

CREATE TABLE IF NOT EXISTS lan_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  ip_address TEXT
);
```

**Auth Flow:**

```
Phone Browser                    Electron Main Process
     |                                  |
     |--- GET /dashboard ------------->|
     |                                  |
     |<-- 401 Unauthorized ------------|
     |    { error: "token_required" }  |
     |                                  |
     |--- POST /api/auth/pair -------->|
     |    { token: "A3K9-X2" }        |
     |                                  |
     |<-- 200 OK ---------------------|
     |    Set-Cookie: lan_session=...  |
     |                                  |
     |--- GET /dashboard ------------->|
     |    Cookie: lan_session=...      |
     |                                  |
     |<-- 200 OK (dashboard HTML) ----|
```

### 4.4 HTTP/HTTPS Server

```
electron/main/server/http-server.ts
```

- Use Node.js `https.createServer()` with TLS certs
- Bind to `0.0.0.0` on configurable port (default 8443)
- Routes:
  - `GET /api/health` → `{ status: "ok" }`
  - `POST /api/auth/pair` → validate token, set cookie
  - `GET /api/auth/check` → check if session is valid
  - `GET /*` → serve static files (SPA fallback)

**Shutdown Pattern (CDR-2026-061):**

```typescript
async function stop(): Promise<void> {
  // Immediate close - destroy all client sockets
  for (const socket of this.sockets) {
    socket.destroy();
  }
  this.sockets.clear();

  return new Promise<void>((resolve) => {
    if (!this.server) {
      resolve();
      return;
    }
    this.server.close(() => resolve());
    this.server = null;
  });
}
```

### 4.5 IPC Channel Design

**New Channels (added to preload allowlist):**

```typescript
// electron/preload/index.ts additions
const ALLOWED_INVOKE = new Set([
  // ... existing channels
  'lan:start',
  'lan:stop',
  'lan:status',
  'lan:getToken',
  'lan:regenerateToken',
  'lan:getConnectedDevices',
] as const);

const ALLOWED_ON = new Set([
  // ... existing channels
  'lan:deviceConnected',
  'lan:deviceDisconnected',
] as const);
```

**IPC Handler Registration:**

```typescript
// electron/main/ipc/lan-handlers.ts
export function registerLanHandlers(
  ipcMain: IpcMain,
  lanServer: LanServer,
  getToken: () => string,
  regenerateToken: () => string,
): void {
  ipcMain.handle('lan:start', async () => { ... });
  ipcMain.handle('lan:stop', async () => { ... });
  ipcMain.handle('lan:status', async () => { ... });
  ipcMain.handle('lan:getToken', async () => { ... });
  ipcMain.handle('lan:regenerateToken', async () => { ... });
  ipcMain.handle('lan:getConnectedDevices', async () => { ... });
}
```

### 4.6 Main Process Integration

**Updated `electron/main/index.ts`:**

```typescript
import { startLanServer, stopLanServer } from './server';

let lanServer: LanServer | null = null;

app.whenReady().then(async () => {
  // ... existing initialization ...

  // Start LAN server
  try {
    lanServer = await startLanServer(db, join(__dirname, '../renderer'), app.getPath('userData'));
  } catch (err) {
    console.error('Failed to start LAN server:', err);
  }

  createWindow();
});

app.on('will-quit', (e) => {
  if (!isQuitting) {
    e.preventDefault();
    return;
  }

  // ... existing cleanup ...

  // Stop LAN server immediately (CDR-2026-061)
  if (lanServer) {
    lanServer.stop(); // socket.destroy() - no await needed
    lanServer = null;
  }
});
```

### 4.7 Desktop App UI Integration

**Settings Panel Addition:**

- New section in settings: "LAN Access"
- Shows:
  - Connection status (Running / Stopped)
  - Server URL (e.g., `https://192.168.1.42:8443`)
  - Pairing token (copyable, with copy button)
  - Number of connected devices
  - Start/Stop toggle
  - Regenerate Token button (with confirmation dialog)

**IPC API (Renderer → Main):**

```typescript
// Renderer code
const status = await window.electronAPI.lan.status();
const token = await window.electronAPI.lan.getToken();
await window.electronAPI.lan.start();
await window.electronAPI.lan.stop();
const devices = await window.electronAPI.lan.getConnectedDevices();
```

---

## 5. Success Criteria

### 5.1 Functional Criteria

| ID | Criterion | Measurement |
|----|-----------|-------------|
| SC-001 | LAN server starts on app launch | Test: server listening on port 8443 after startup |
| SC-002 | Dashboard accessible from phone browser | Manual: open `https://<ip>:8443` on phone |
| SC-003 | Pairing token required for first connection | Test: unauthenticated GET returns 401 |
| SC-004 | Token validation works | Test: valid token returns 200 + cookie |
| SC-005 | Self-signed HTTPS works | Manual: browser shows cert warning, user accepts, page loads |
| SC-006 | Session persists after cookie set | Manual: refresh page after auth, no re-auth needed |
| SC-007 | Server shuts down immediately on quit | Test: all sockets destroyed, server.close() called |

### 5.2 Security Criteria

| ID | Criterion | Measurement |
|----|-----------|-------------|
| SEC-SC-L001 | Token stored as hash, not plaintext | Code review: SQLite stores SHA-256 + salt |
| SEC-SC-L002 | TLS 1.2+ enforced | Test: TLS 1.0/1.1 connection rejected |
| SEC-SC-L003 | No sensitive data in LAN response | Code review: no API keys, credentials in responses |
| SEC-SC-L004 | Rate limiting on auth endpoint | Test: 6th attempt within 1 minute returns 429 |
| SEC-SC-L005 | Cookie has secure flags | Code review: HttpOnly, Secure, SameSite=Strict |
| SEC-SC-L006 | Ports bound only on LAN interface | Code review: 0.0.0.0 binding, not exposed externally |

### 5.3 Quality Criteria

| ID | Criterion | Measurement |
|----|-----------|-------------|
| QC-001 | All server modules have unit tests | Test coverage: 100% for server/ directory |
| QC-002 | Electron tests mock native modules | CDR: rule-testing-platform-mocked |
| QC-003 | No new lint errors | `npm run lint` passes |
| QC-004 | TypeScript strict mode | `npm run typecheck` passes |

---

## 6. Test Plan

### 6.1 Unit Tests

| Test | File | Validates |
|------|------|-----------|
| TLS cert generation creates valid cert | tls.test.ts | SEC-LAN-002 |
| TLS cert loading from disk works | tls.test.ts | SEC-LAN-002 |
| Token generation produces 6-char token | auth.test.ts | PAIR-001 |
| Token validation with correct token succeeds | auth.test.ts | SEC-LAN-001 |
| Token validation with incorrect token fails | auth.test.ts | SEC-LAN-001 |
| Rate limiting blocks after 5 attempts | auth.test.ts | SEC-LAN-006 |
| Session cookie creation and validation | session.test.ts | PAIR-004 |
| Session expiry after 30 days | session.test.ts | PAIR-004 |
| Static file serving returns correct content-type | static-files.test.ts | SRV-001 |
| SPA fallback returns index.html for unknown routes | static-files.test.ts | SRV-002 |
| Health check endpoint returns ok | http-server.test.ts | SRV-003 |
| Server startup on configurable port | http-server.test.ts | LAN-007 |
| Server shutdown destroys all sockets | http-server.test.ts | LAN-002 |
| Port conflict returns clear error | http-server.test.ts | SRV-005 |

### 6.2 Integration Tests

| Test | File | Validates |
|------|------|-----------|
| Full pairing flow: request → token → auth → dashboard | lan-handlers.test.ts | SC-001, SC-003, SC-004 |
| IPC handlers register correctly | lan-handlers.test.ts | CDR: rule-electron-ipc-registration |
| LAN server starts and stops with app lifecycle | lan-handlers.test.ts | LAN-001, LAN-002 |

### 6.3 Platform-Mocked Tests

Per CDR: rule-testing-platform-mocked, all Electron tests must mock native modules:

```typescript
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  app: { getPath: vi.fn(), whenReady: vi.fn() },
  BrowserWindow: vi.fn(),
}));

vi.mock('node:https', () => ({
  createServer: vi.fn(() => ({
    listen: vi.fn(),
    close: vi.fn(),
    on: vi.fn(),
  })),
}));
```

---

## 7. Dependencies

| Dependency | Purpose | Version Constraint | Notes |
|------------|---------|-------------------|-------|
| node-forge | Self-signed cert generation | ^1.3.0 | Alternative: selfsigned; check bundle size |
| better-sqlite3 | Token/session storage | ^11.7.0 | Already in project |
| zod | IPC payload validation | ^3.24.0 | Already in project |

**No new major dependencies required.** TLS cert generation is the only addition; prefer `node-forge` if available, otherwise implement with Node.js `node:crypto` + `node:tls` primitives.

---

## 8. Open Questions

| ID | Question | Resolution |
|----|----------|------------|
| OQ-001 | Which npm package for self-signed cert generation? | Evaluate `node-forge`, `selfsigned`, or raw `node:crypto`. Choose based on bundle size and API simplicity. |
| OQ-002 | Should the LAN dashboard be a stripped-down UI or full clone? | Recommend stripped-down: read-only inbox view, no settings, no API key visibility. |
| OQ-003 | How to handle cert trust on mobile browsers? | User must manually accept self-signed cert on first visit (standard HTTPS self-signed UX). Document in README. |
| OQ-004 | Should the server port be mDNS-broadcasted? | Future optimization; not required for v1. User manually enters URL. |

---

## 9. PDR Traceability

| PDR | Decision | Impact on This Feature |
|-----|----------|----------------------|
| PDR-001 | Electron + LAN | Defines the LAN access requirement; server runs in Electron main process |
| PDR-005 | Multi-hat consultant | LAN dashboard enables phone/tablet viewing for this persona |
| PDR-006 | V1 success metrics | <15 min setup includes LAN pairing flow |

---

## 10. CDR Traceability

| CDR | Rule | Impact on This Feature |
|-----|------|----------------------|
| CDR-2026-061 | Immediate Close on Shutdown | Server shutdown uses socket.destroy() for immediate cleanup |
| rule-electron-contextbridge-allowlist | IPC channel allowlist | New `lan:*` channels added to preload allowlist |
| rule-electron-ipc-registration | IPC handler registration | `registerLanHandlers(deps)` function exported from lan-handlers.ts |
| rule-testing-platform-mocked | Platform-mocked tests | All server tests mock Node.js modules for CI compatibility |
| CDR-2026-060 | Source Reference Analysis | Spec includes existing codebase patterns as source references |

---

## 11. Definition of Done

- [ ] Self-signed TLS certs generated on first launch, loaded on subsequent launches
- [ ] Pairing token generated and stored as salted hash in SQLite
- [ ] HTTP server serves dashboard on `0.0.0.0:8443` over HTTPS
- [ ] Unauthenticated requests return 401
- [ ] Token validation sets HttpOnly session cookie
- [ ] Dashboard renders correctly on phone/tablet browsers
- [ ] Server shuts down immediately on app quit (socket.destroy)
- [ ] IPC channels `lan:*` added to preload allowlist
- [ ] `registerLanHandlers(deps)` follows IPC registration pattern
- [ ] Unit tests pass for all server modules
- [ ] Integration tests pass for full pairing flow
- [ ] `npm run lint` and `npm run typecheck` pass
- [ ] Manual test: phone connects via `https://<ip>:8443`, enters token, sees dashboard

---

## 12. Source Reference Analysis

### Existing Patterns to Adopt

| File | Line(s) | Pattern | Application |
|------|---------|---------|-------------|
| `electron/main/index.ts` | 80-104 | App lifecycle management (before-quit, will-quit) | Integrate LAN server start/stop into same lifecycle |
| `electron/main/ipc/index.ts` | 8-17 | `registerIpcHandlers(deps)` orchestrator pattern | Add `registerLanHandlers` call to orchestrator |
| `electron/main/ipc/window-handlers.ts` | 10-61 | `registerHandlers(ipcMain, deps)` function signature | Follow same pattern for LAN handlers |
| `electron/preload/index.ts` | 3-16 | `ALLOWED_INVOKE` / `ALLOWED_ON` sets | Add `lan:*` channels to both sets |
| `electron/preload/types.d.ts` | 4-36 | `ElectronAPI` interface typing | Add `lan` namespace to interface |
| `electron/main/db/index.ts` | 15-28 | Database initialization with migrations | Add pairing_tokens + lan_sessions tables via migration |

### Patterns NOT to Adopt

| Pattern | Rationale |
|---------|-----------|
| `socket.end()` for shutdown | CDR-2026-061: use `socket.destroy()` for immediate close |
| Express/Fastify dependency | Constitution: Simplicity First; Node.js stdlib sufficient |
| Global state imports | CDR: rule-electron-ipc-registration; use dependency injection |
| Hardcoded ports | Should be configurable via settings |

---

*This specification follows the team constitution (Simplicity First, Security by Default, Tests Drive Confidence) and team directives (immediate close on shutdown, platform-mocked tests, IPC allowlist, handler registration).*
