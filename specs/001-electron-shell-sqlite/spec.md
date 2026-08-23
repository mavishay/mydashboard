# Feature Specification: Electron Shell + SQLite Foundation

**Feature ID:** 001-electron-shell-sqlite
**Status:** Draft
**Created:** 2026-08-23
**Milestone:** Alpha (Phase 1)
**PRD References:** PDR-001 (Electron + LAN), REQ-018 (contextBridge/IPC), REQ-019 (SQLite)

---

## 1. Overview

Set up the Electron desktop application shell with an embedded SQLite database, enforcing contextBridge/IPC security rules and basic window management. This is the foundational infrastructure for the AI-Powered Unified Productivity Dashboard.

**Demo Sentence:** User can launch the Electron app, see a dashboard UI, and the SQLite database is initialized on first run with WAL mode enabled.

---

## 2. Requirements

### 2.1 Core Requirements

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| REQ-001 | Electron app launches and displays a dashboard UI | Must | App window opens, renders a React-based dashboard, and remains responsive |
| REQ-002 | SQLite database initializes on first run with WAL mode | Must | Database file created at first launch, `PRAGMA journal_mode=WAL` executed, schema migrations run |
| REQ-003 | contextBridge and IPC handler security rules enforced | Must | All IPC channels explicitly allowlisted in preload, no `nodeIntegration` in renderer, Zod validation on all IPC payloads |
| REQ-004 | Basic window management (minimize, maximize, close) works | Must | Window controls function correctly on macOS, Windows, Linux |
| REQ-005 | Main process and renderer process are separated | Must | No direct Node.js access from renderer, communication only via IPC |

### 2.2 Security Requirements

| ID | Requirement | Source | Acceptance Criteria |
|----|-------------|--------|---------------------|
| SEC-001 | No `nodeIntegration` in renderer process | Electron security best practices | `nodeIntegration: false` in BrowserWindow webPreferences |
| SEC-002 | `contextIsolation` enabled | Electron security best practices | `contextIsolation: true` in BrowserWindow webPreferences |
| SEC-003 | IPC channels explicitly allowlisted | CDR: rule-electron-contextbridge-allowlist | Typed `Set<string>` constants for invoke/send/on channels, every call gated |
| SEC-004 | IPC handlers registered via dependency injection | CDR: rule-electron-ipc-registration | Each IPC sub-domain exports single `registerHandlers(deps)` function |
| SEC-005 | Zod schema validation on all IPC payloads | CDR: rule-ts-zod-validation | `Schema.safeParse()` before any business logic in every handler |
| SEC-006 | No hard-coded secrets or API keys | Constitution: Security by Default | Keys stored in OS keychain (electron-safeStorage) or environment variables |

### 2.3 Database Requirements

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| DB-001 | SQLite embedded, no external database server | Must | Database file stored in app data directory |
| DB-002 | WAL mode enabled on initialization | Must | `PRAGMA journal_mode=WAL` executes successfully |
| DB-003 | Schema migration system | Must | Versioned migrations run on startup, idempotent |
| DB-004 | Parameterized queries only | Must | No string interpolation in SQL, all queries use `?` or `$N` placeholders |

### 2.4 Window Management Requirements

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| WIN-001 | Standard window controls (minimize, maximize, close) | Must | All three work on macOS, Windows, Linux |
| WIN-002 | Window state persistence | Should | Window size/position restored on next launch |
| WIN-003 | Single instance lock | Should | Only one app instance runs at a time |

---

## 3. Constraints

### 3.1 Technical Constraints

| Constraint | Rationale |
|------------|-----------|
| Electron + Node.js stack | PDR-001: Form factor decision |
| SQLite with WAL mode | PDR-001: Embedded local storage |
| contextBridge + IPC security | Team security directives; Electron best practices |
| No nodeIntegration in renderer | Constitution: Security by Default; Electron security |
| TypeScript throughout | CDR: Zod validation rules require typed schemas |

### 3.2 Non-Goals (This Feature)

| Excluded | Rationale |
|----------|-----------|
| Email connectors (Gmail/M365) | Phase 2+ features |
| AI triage engine | Phase 1 scope excludes AI |
| n8n Docker sidecar | Phase 1 scope excludes Docker |
| LAN dashboard server | Phase 2 feature |
| Window frame customization | Out of scope for foundation |

---

## 4. Technical Design

### 4.1 Project Structure

```
alpha/
├── electron/
│   ├── main/
│   │   ├── index.ts                 # Main process entry
│   │   ├── window.ts                # BrowserWindow creation/management
│   │   ├── ipc/
│   │   │   ├── index.ts             # IPC orchestrator (wires handlers)
│   │   │   └── database-handlers.ts # Database IPC handlers
│   │   └── database/
│   │       ├── connection.ts        # SQLite connection manager
│   │       ├── migrations.ts        # Schema migration runner
│   │       └── schema.sql           # Initial schema
│   └── preload/
│       ├── index.ts                 # Preload script (contextBridge)
│       └── types.ts                 # Allowed IPC channel types
├── renderer/
│   ├── index.html                   # Entry HTML
│   ├── main.tsx                     # React entry point
│   └── App.tsx                      # Dashboard UI shell
├── package.json
├── tsconfig.json
├── electron-builder.yml
└── vitest.config.ts
```

### 4.2 IPC Channel Design

**Allowed Channels (Phase 1):**

```typescript
// electron/preload/types.ts
export const ALLOWED_INVOKE = new Set([
  'db:initialize',
  'db:execute',
  'db:query',
  'app:getVersion',
  'app:getPath',
] as const);

export const ALLOWED_SEND = new Set([
  'app:ready',
] as const);

export const ALLOWED_ON = new Set([
  'app:quit',
] as const);
```

### 4.3 Database Schema (Initial)

```sql
-- electron/main/database/schema.sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('gmail', 'm365')),
  email TEXT NOT NULL,
  display_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS emails (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  subject TEXT,
  snippet TEXT,
  from_address TEXT,
  to_addresses TEXT,
  received_at TEXT,
  classification TEXT CHECK (classification IN ('urgent', 'action', 'fyi', 'noise')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_emails_account_id ON emails(account_id);
CREATE INDEX IF NOT EXISTS idx_emails_classification ON emails(classification);
```

### 4.4 Security Architecture

```
┌─────────────────────────────────────────────────┐
│                  Renderer Process               │
│                  (React App)                     │
│                                                 │
│  No Node.js access. Cannot import 'electron'.   │
│  Communicates via window.electronAPI.*          │
└────────────────────┬────────────────────────────┘
                     │ IPC (invoke/send/on)
                     ▼
┌─────────────────────────────────────────────────┐
│              Preload Script (contextBridge)      │
│                                                 │
│  ALLOWED_INVOKE, ALLOWED_SEND, ALLOWED_ON sets  │
│  Every call gated: if (!set.has(channel)) throw │
│  Zod validation on all payloads                 │
└────────────────────┬────────────────────────────┘
                     │ ipcMain.handle / ipcMain.on
                     ▼
┌─────────────────────────────────────────────────┐
│                  Main Process                   │
│                                                 │
│  registerHandlers(deps) pattern                 │
│  Database operations with parameterized queries │
│  WAL mode SQLite                                │
└─────────────────────────────────────────────────┘
```

---

## 5. Success Criteria

### 5.1 Functional Criteria

| ID | Criterion | Measurement |
|----|-----------|-------------|
| SC-001 | App launches and displays dashboard UI | Manual: app opens, UI renders |
| SC-002 | SQLite database created on first run | Manual: check app data directory for .db file |
| SC-003 | WAL mode enabled | Query: `PRAGMA journal_mode` returns `wal` |
| SC-004 | Schema migrations run successfully | Query: `schema_migrations` table exists and populated |
| SC-005 | Window minimize/maximize/close work | Manual: test all three controls |
| SC-006 | IPC security enforced | Test: renderer cannot access Node.js APIs directly |

### 5.2 Security Criteria

| ID | Criterion | Measurement |
|----|-----------|-------------|
| SEC-SC-001 | `nodeIntegration: false` | Code review: BrowserWindow config |
| SEC-SC-002 | `contextIsolation: true` | Code review: BrowserWindow config |
| SEC-SC-003 | All IPC channels allowlisted | Code review: preload/types.ts |
| SEC-SC-004 | Zod validation on all IPC payloads | Code review: every handler uses safeParse |
| SEC-SC-005 | No raw SQL concatenation | Code review: all queries parameterized |

### 5.3 Quality Criteria

| ID | Criterion | Measurement |
|----|-----------|-------------|
| QC-001 | TypeScript strict mode enabled | tsconfig.json: `strict: true` |
| QC-002 | All IPC handlers have unit tests | Test coverage: 100% for ipc/ directory |
| QC-003 | Electron tests mock native modules | CDR: rule-testing-platform-mocked |
| QC-004 | No lint errors | `npm run lint` passes |

---

## 6. Test Plan

### 6.1 Unit Tests

| Test | File | Validates |
|------|------|-----------|
| IPC allowlist blocks unknown channels | preload/index.test.ts | SEC-003 |
| IPC allowlist allows known channels | preload/index.test.ts | SEC-003 |
| Database initializes with WAL mode | database/connection.test.ts | DB-002 |
| Schema migrations are idempotent | database/migrations.test.ts | DB-003 |
| Zod validation rejects invalid payloads | ipc/database-handlers.test.ts | SEC-005 |
| Parameterized queries prevent SQL injection | database/connection.test.ts | DB-004 |

### 6.2 Integration Tests

| Test | File | Validates |
|------|------|-----------|
| App launches and window appears | main/index.test.ts | SC-001 |
| Window controls function correctly | main/window.test.ts | SC-005 |
| IPC roundtrip: renderer -> preload -> main -> response | ipc/index.test.ts | SC-006 |

### 6.3 Platform-Mocked Tests

Per CDR: rule-testing-platform-mocked, all Electron tests must mock native modules:

```typescript
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  app: { getPath: vi.fn(), whenReady: vi.fn() },
  BrowserWindow: vi.fn(),
}));
```

---

## 7. Dependencies

| Dependency | Purpose | Version Constraint |
|------------|---------|-------------------|
| electron | Desktop shell | ^32.0.0 |
| better-sqlite3 | SQLite driver | ^11.0.0 |
| zod | IPC payload validation | ^3.23.0 |
| react | Renderer UI | ^19.0.0 |
| typescript | Type safety | ^5.5.0 |
| vitest | Testing | ^2.0.0 |
| electron-builder | Packaging | ^25.0.0 |

---

## 8. Open Questions

| ID | Question | Resolution |
|----|----------|------------|
| OQ-001 | Should we use `better-sqlite3` (sync) or `node:sqlite` (async)? | Recommend `better-sqlite3` for simplicity; async adds complexity for Phase 1 |
| OQ-002 | Window state persistence: use `electron-store` or manual? | Recommend manual with `electron-store` for simplicity |
| OQ-003 | Should the dashboard UI be a placeholder or functional? | Placeholder with account list (empty state) and settings panel |

---

## 9. PDR Traceability

| PDR | Decision | Impact on This Feature |
|-----|----------|----------------------|
| PDR-001 | Electron + LAN | Defines form factor, IPC security requirements |
| PDR-002 | BYOK cloud-first | API key storage requirements (OS keychain) |
| PDR-005 | Multi-hat consultant | Dashboard UI targets this persona |
| PDR-006 | V1 success metrics | <15 min setup time applies to initial launch |
| PDR-007 | Gmail-first phasing | Database schema prepares for email entities |

---

## 10. Definition of Done

- [ ] Electron app launches on macOS, Windows, Linux
- [ ] Dashboard UI renders with placeholder content
- [ ] SQLite database created with WAL mode on first run
- [ ] Schema migrations run idempotently
- [ ] All IPC channels explicitly allowlisted in preload
- [ ] Zod validation on every IPC handler
- [ ] Window minimize/maximize/close work
- [ ] Unit tests pass for all IPC and database modules
- [ ] No `nodeIntegration` in renderer (code review verified)
- [ ] TypeScript strict mode, no lint errors
- [ ] `npm run lint` and `npm run typecheck` pass
