# Feature Specification: TickTick Integration with Bidirectional Task Sync (REQ-014)

## Source Reference Analysis (MANDATORY)

### Existing Reference Implementation: Google Tasks Connector

**Source Location**: `electron/main/`

**Files Analyzed**:
- `auth/google-tasks.ts` (239 lines) – OAuth2 flow, token management, account CRUD
- `sync/google-tasks-api.ts` (110 lines) – API wrapper (listTaskLists, listTasks, insertTask, updateTask, deleteTask)
- `sync/google-tasks-sync.ts` (411 lines) – Bidirectional sync engine with polling, conflict resolution, circuit breaker
- `ipc/google-tasks-handlers.ts` (364 lines) – IPC handler registration, Zod validation, request/response schemas
- `preload/index.ts` (126 lines) – IPC channel allowlist, gated invoke/on
- `preload/types.d.ts` (124 lines) – TypeScript interfaces for renderer
- `db/migrations/004-google-tasks.sql` (37 lines) – SQLite schema for task lists, tasks, sync state
- `ipc/index.ts` (27 lines) – Handler registration orchestrator
- `main/index.ts` (185 lines) – App initialization, sync lifecycle

**Key Patterns to Adopt**:
1. **Adapter Interface Pattern**: Abstract adapter interface for easy swap (Google Tasks API is stable; TickTick API is unofficial)
2. **Authentication Module**: Personal access token (no OAuth server needed) stored encrypted via OS keychain
3. **API Wrapper Module**: Thin wrapper around REST endpoints with typed request/response interfaces
4. **Sync Engine**: Bidirectional polling with conflict resolution (last-write-wins), circuit breaker, retry with exponential backoff
5. **IPC Handlers**: Zod schema validation at module boundary, `register*Handlers(deps)` pattern
6. **Preload Allowlist**: Explicit `ALLOWED_INVOKE` / `ALLOWED_ON` sets, gated functions
7. **Database Migration**: Incremental migration files with version numbers, indexes for query patterns
8. **Testing**: Mock Electron native modules via `vi.mock('electron', ...)`, platform-specific mocks

**Patterns NOT to Adopt** (not needed for TickTick):
- **OAuth2 Flow**: TickTick uses personal access token (no server-side token exchange)
- **Sync Token**: TickTick API does not provide incremental sync tokens; poll full task list each interval
- **Refresh Token**: Personal access tokens do not expire; no refresh logic needed
- **Account Email**: TickTick account identification via token, not email

### Risk-Adjusted API Assumptions
- TickTick API is unofficial/undocumented; adapter interface isolates from breaking changes
- API endpoints may change without notice; contract tests pinned to observed behavior
- Rate limits unknown; implement adaptive polling with backoff

---

## 1. Overview and Goals

**Feature ID**: REQ-014  
**Priority**: Must (Phase 3)  
**Status**: Draft  

### Goal
Connect TickTick via personal access token and sync tasks bidirectionally with the consolidated task view, following existing Google Tasks connector patterns.

### Success Criteria
1. TickTick account can be connected via API token (stored encrypted)
2. Tasks appear in consolidated task view with TickTick source badge
3. Bidirectional sync (create/complete/delete) works
4. Adapter interface exists for easy swap if TickTick API changes
5. IPC handlers follow existing allowlist + Zod validation patterns
6. Tests pass with mocked TickTick API responses

### Non-Goals
- Not implementing TickTick OAuth flow (TickTick uses access_token directly)
- Not modifying UI to show TickTick tasks separately (UI consolidation is separate task)
- Not implementing M365/Outlook integration (out of scope)

---

## 2. API Adapter Interface

Define an abstract adapter interface that isolates the sync engine from TickTick-specific API details. This enables swapping implementations if the API changes or migrating to a different task provider.

```typescript
// electron/main/sync/task-adapter.ts

export interface TaskAdapter {
  readonly provider: string;
  
  // Project (list) operations
  listProjects(): Promise<Project[]>;
  
  // Task operations
  listTasks(projectId: string): Promise<Task[]>;
  getTask(taskId: string): Promise<Task | null>;
  createTask(projectId: string, task: CreateTaskPayload): Promise<Task>;
  updateTask(taskId: string, updates: UpdateTaskPayload): Promise<Task>;
  deleteTask(taskId: string): Promise<void>;
  
  // Batch operations (if supported)
  batchCreateTasks?(tasks: CreateTaskPayload[]): Promise<Task[]>;
  batchUpdateTasks?(updates: Array<{ taskId: string } & UpdateTaskPayload>): Promise<Task[]>;
}

export interface Project {
  id: string;
  name: string;
  kind: string; // 'TASK' | 'NOTE' | etc.
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  content: string | null;
  dueDate: string | null; // ISO-8601
  status: 0 | 1; // 0 = open, 1 = completed
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskPayload {
  title: string;
  content?: string;
  dueDate?: string;
  sortOrder?: number;
}

export interface UpdateTaskPayload {
  title?: string;
  content?: string;
  dueDate?: string;
  status?: 0 | 1;
  sortOrder?: number;
}
```

### TickTick Adapter Implementation

```typescript
// electron/main/sync/ticktick-adapter.ts

export class TickTickAdapter implements TaskAdapter {
  readonly provider = 'ticktick';
  
  constructor(private accessToken: string) {}
  
  async listProjects(): Promise<Project[]> {
    // GET https://api.ticktick.com/open/v1/project
    // Returns array of project objects
  }
  
  async listTasks(projectId: string): Promise<Task[]> {
    // GET https://api.ticktick.com/open/v1/project/{projectId}/data
    // Returns tasks within project
  }
  
  // ... other methods
}
```

---

## 3. Authentication

### Personal Access Token Flow
1. User provides TickTick API token (generated from TickTick web settings)
2. Token stored encrypted in OS keychain via `electron.safeStorage`
3. Token validated by making a test API call (GET `/open/v1/project`)
4. Account created in `accounts` table with type `ticktick`

### Token Storage
- Use existing `storeTokens` / `retrieveTokens` pattern from Gmail OAuth
- Store token encrypted in `oauth_tokens` table (reuse existing table)
- Account type: `ticktick`

### Account Management
```typescript
// electron/main/auth/ticktick.ts

export interface TickTickAccount {
  id: string;
  email: string; // TickTick username/email
  display_name: string;
}

export function createAccount(
  db: Database.Database,
  email: string,
  displayName: string,
  accessToken: string
): TickTickAccount {
  const id = uuidv4();
  db.prepare(
    `INSERT INTO accounts (id, type, email, display_name)
     VALUES (?, 'ticktick', ?, ?)`
  ).run(id, email, displayName);
  storeTokens(db, id, { access_token: accessToken });
  return { id, email, display_name: displayName };
}

export async function validateToken(accessToken: string): Promise<boolean> {
  // Make test API call to verify token validity
  const response = await fetch('https://api.ticktick.com/open/v1/project', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return response.ok;
}
```

---

## 4. Database Schema

### New Tables (Migration `010-ticktick.sql`)

```sql
-- 010-ticktick.sql
-- TickTick integration tables for bidirectional sync

-- TickTick project lists (one per connected TickTick account)
CREATE TABLE IF NOT EXISTS ticktick_projects (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Individual TickTick tasks linked to a project
CREATE TABLE IF NOT EXISTS ticktick_tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES ticktick_projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  due_date TEXT,
  status INTEGER NOT NULL CHECK (status IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_deleted INTEGER NOT NULL DEFAULT 0
);

-- Sync state per project for polling interval tracking
CREATE TABLE IF NOT EXISTS ticktick_sync_state (
  project_id TEXT PRIMARY KEY REFERENCES ticktick_projects(id) ON DELETE CASCADE,
  last_poll_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for common query patterns
CREATE INDEX idx_ticktick_tasks_project_id ON ticktick_tasks(project_id);
CREATE INDEX idx_ticktick_tasks_status ON ticktick_tasks(status);
CREATE INDEX idx_ticktick_tasks_updated_at ON ticktick_tasks(updated_at);
```

### Reuse Existing Tables
- `accounts` – store TickTick accounts (type = 'ticktick')
- `oauth_tokens` – store encrypted access tokens

---

## 5. IPC Handlers

### Channel Names
Follow existing `ticktick:` namespace pattern:

| Channel | Direction | Description |
|---------|-----------|-------------|
| `ticktick:connect` | invoke | Connect TickTick account via token |
| `ticktick:disconnect` | invoke | Disconnect TickTick account |
| `ticktick:listAccounts` | invoke | List connected TickTick accounts |
| `ticktick:sync` | invoke | Start/stop sync for account |
| `ticktick:status` | invoke | Get sync status |
| `ticktick:listTasks` | invoke | List tasks (consolidated view) |
| `ticktick:createTask` | invoke | Create new task |
| `ticktick:updateTask` | invoke | Update task (title, status, etc.) |
| `ticktick:deleteTask` | invoke | Delete task |
| `ticktick:sync-health` | on | Sync status updates (push) |

### Zod Schemas

```typescript
// electron/main/ipc/ticktick-handlers.ts

const ConnectSchema = z.object({
  token: z.string().min(1),
  email: z.string().email(),
  displayName: z.string().min(1),
});

const DisconnectSchema = z.object({
  accountId: z.string().min(1),
});

const TaskActionSchema = z.object({
  accountId: z.string().min(1),
  projectId: z.string().min(1),
  taskId: z.string().min(1),
});

const CreateTaskSchema = z.object({
  accountId: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string().min(1),
  content: z.string().optional(),
  dueDate: z.string().datetime().optional(),
});

const UpdateTaskSchema = z.object({
  accountId: z.string().min(1),
  projectId: z.string().min(1),
  taskId: z.string().min(1),
  title: z.string().min(1).optional(),
  content: z.string().optional(),
  dueDate: z.string().datetime().optional(),
  status: z.enum(['0', '1']).optional(),
});

const ListTasksResponseSchema = z.array(
  z.object({
    id: z.string(),
    title: z.string(),
    content: z.string().nullable(),
    status: z.enum(['0', '1']),
    dueDate: z.string().nullable(),
    completedAt: z.string().nullable(),
    updatedAt: z.string(),
    projectId: z.string(),
    projectTitle: z.string().nullable(),
    source: z.string(),
  })
);

const StatusResponseSchema = z.object({
  status: z.enum(['idle', 'syncing', 'error']),
  lastSyncAt: z.string().nullable(),
  error: z.string().nullable(),
  accountCount: z.number(),
});
```

### Handler Registration

```typescript
export function registerTickTickHandlers(
  ipcMain: IpcMain,
  db: Database.Database
): void {
  ipcMain.handle('ticktick:connect', async (_event, rawPayload: unknown) => {
    const parsed = ConnectSchema.safeParse(rawPayload);
    if (!parsed.success) {
      throw new Error(`Invalid payload: ${parsed.error.message}`);
    }
    // Validate token, create account, store token
    // ...
  });

  // ... other handlers following same pattern
}
```

---

## 6. Sync Engine

### Architecture
Follow `GoogleTasksSync` pattern with modifications for TickTick API:

1. **Polling-based sync** (no incremental sync tokens)
2. **Full task list fetch** each poll interval
3. **Conflict resolution**: Last-write-wins (local wins ties)
4. **Bidirectional**: Pull remote → local, push local → remote

### Sync Config
```typescript
const DEFAULT_CONFIG: SyncConfig = {
  pollIntervalMs: 30_000, // 30 seconds
  maxRetries: 5,
  circuitBreakerThreshold: 3,
  circuitBreakerResetMs: 5 * 60 * 1000, // 5 minutes
};
```

### Sync Flow
```
1. Get valid access token from DB
2. Fetch remote projects (lists)
3. For each project:
   a. Upsert project row locally
   b. Fetch remote tasks
   c. Upsert tasks locally (remote → local)
   d. Push local changes (local → remote)
   e. Record sync timestamp
4. Emit sync status
```

### Conflict Resolution
- **Remote newer**: Overwrite local
- **Local newer**: Push to remote
- **Equal timestamps**: Local wins (deterministic)
- **Deleted tasks**: Soft-delete locally, hard-delete remotely on next sync

### Error Handling
- **Network errors**: Retry with exponential backoff
- **Rate limits**: Adaptive polling interval (increase on 429)
- **Invalid token**: Stop sync, emit error status, require re-authentication
- **Circuit breaker**: Open after 3 consecutive failures, reset after 5 minutes

---

## 7. Preload Additions

### Allowlist Updates

```typescript
// electron/preload/index.ts

const ALLOWED_INVOKE = new Set([
  // ... existing channels
  'ticktick:connect',
  'ticktick:disconnect',
  'ticktick:listAccounts',
  'ticktick:sync',
  'ticktick:status',
  'ticktick:listTasks',
  'ticktick:createTask',
  'ticktick:updateTask',
  'ticktick:deleteTask',
] as const);

const ALLOWED_ON = new Set([
  // ... existing channels
  'ticktick:sync-health',
] as const);
```

### API Methods

```typescript
contextBridge.exposeInMainWorld('electronAPI', {
  // ... existing APIs
  ticktick: {
    connect: (data: { token: string; email: string; displayName: string }) =>
      gatedInvoke('ticktick:connect', data) as Promise<TickTickAccount>,
    disconnect: (accountId: string) =>
      gatedInvoke('ticktick:disconnect', { accountId }),
    listAccounts: () =>
      gatedInvoke('ticktick:listAccounts') as Promise<TickTickAccount[]>,
    sync: (accountId: string) =>
      gatedInvoke('ticktick:sync', { accountId }) as Promise<{ success: boolean; error?: string }>,
    status: () =>
      gatedInvoke('ticktick:status') as Promise<TickTickSyncStatus>,
    listTasks: (accountId?: string) =>
      gatedInvoke('ticktick:listTasks', accountId ? { accountId } : undefined) as Promise<TickTickTask[]>,
    createTask: (data: { accountId: string; projectId: string; title: string; content?: string; dueDate?: string }) =>
      gatedInvoke('ticktick:createTask', data) as Promise<TickTickTask>,
    updateTask: (data: { accountId: string; projectId: string; taskId: string; title?: string; content?: string; dueDate?: string; status?: '0' | '1' }) =>
      gatedInvoke('ticktick:updateTask', data) as Promise<{ success: boolean }>,
    deleteTask: (data: { accountId: string; projectId: string; taskId: string }) =>
      gatedInvoke('ticktick:deleteTask', data) as Promise<{ success: boolean }>,
    onSyncHealth: (callback: (state: { status: string; lastSyncAt: string | null; error: string | null }) => void) =>
      gatedOn('ticktick:sync-health', callback),
  },
});
```

### Type Definitions

```typescript
// electron/preload/types.d.ts

interface TickTickTask {
  id: string;
  title: string;
  content: string | null;
  status: '0' | '1';
  dueDate: string | null;
  source: string;
  completedAt: string | null;
  updatedAt: string;
  projectId: string;
  projectTitle: string | null;
}

interface TickTickAccount {
  id: string;
  email: string;
  displayName: string;
}

interface TickTickSyncStatus {
  status: 'idle' | 'syncing' | 'error';
  lastSyncAt: string | null;
  error: string | null;
  accountCount: number;
}
```

---

## 8. Error Handling Patterns

### IPC Error Responses
Follow existing pattern: throw `Error` with descriptive message for validation failures; return `{ success: false, error: string }` for operational failures.

### Sync Error Handling
```typescript
// Circuit breaker pattern (copy from GoogleTasksSync)
private isCircuitOpen(): boolean {
  return Date.now() < this.circuitOpenUntil;
}

// Retry with exponential backoff
private async retryWithBackoff(fn: () => Promise<void>): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(1_000 * Math.pow(2, attempt - 1), 16_000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    try {
      await fn();
      return;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
```

### API Error Mapping
| HTTP Status | Handling |
|-------------|----------|
| 401 | Stop sync, emit error, require re-authentication |
| 429 | Increase polling interval, retry after `Retry-After` header |
| 500 | Retry with backoff, circuit breaker after 3 failures |
| Network error | Retry with backoff, circuit breaker after 3 failures |

---

## 9. Testing Approach

### Mock Strategy
Follow `rule-testing-platform-mocked` directive:

```typescript
// electron/main/sync/__tests__/ticktick-adapter.test.ts

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  app: { getPath: vi.fn(), whenReady: vi.fn() },
  safeStorage: { encryptString: vi.fn(), decryptString: vi.fn() },
}));

// Mock fetch for API calls
vi.mock('node-fetch', () => ({
  default: vi.fn(),
}));
```

### Test Categories
1. **Unit Tests** (Vitest):
   - Adapter interface contract tests
   - Zod schema validation tests
   - Conflict resolution logic tests
   - Circuit breaker state machine tests

2. **Integration Tests**:
   - IPC handler registration tests
   - Database migration tests
   - Sync engine lifecycle tests

3. **Contract Tests**:
   - Mock TickTick API responses
   - Verify adapter implements interface correctly
   - Pin observed API behavior (endpoints, response shapes)

### Test Files
```
electron/main/sync/__tests__/
  ticktick-adapter.test.ts
  ticktick-sync.test.ts
electron/main/ipc/__tests__/
  ticktick-handlers.test.ts
electron/main/auth/__tests__/
  ticktick.test.ts
```

### Success Criteria Mapping
| Success Criterion | Test Coverage |
|-------------------|---------------|
| TickTick account can be connected via API token | `ticktick.test.ts` - token validation, account creation |
| Tasks appear in consolidated task view with TickTick source badge | `ticktick-handlers.test.ts` - listTasks response includes source |
| Bidirectional sync works | `ticktick-sync.test.ts` - full sync cycle, conflict resolution |
| Adapter interface exists | `ticktick-adapter.test.ts` - interface contract tests |
| IPC handlers follow allowlist + Zod patterns | `ticktick-handlers.test.ts` - schema validation, channel registration |
| Tests pass with mocked TickTick API | All test files use mocked fetch |

---

## 10. Implementation Tasks

| Task | Source Reference | Dependencies |
|------|------------------|--------------|
| T001: Create migration `010-ticktick.sql` | `db/migrations/004-google-tasks.sql` | None |
| T002: Implement `TickTickAdapter` class | `sync/google-tasks-api.ts` | T001 |
| T003: Implement `ticktick-auth.ts` module | `auth/google-tasks.ts` | T001 |
| T004: Implement `TickTickSync` class | `sync/google-tasks-sync.ts` | T002, T003 |
| T005: Implement IPC handlers | `ipc/google-tasks-handlers.ts` | T004 |
| T006: Update preload allowlist | `preload/index.ts` | T005 |
| T007: Add TypeScript types | `preload/types.d.ts` | T006 |
| T008: Register handlers in orchestrator | `ipc/index.ts` | T005 |
| T009: Start sync on app initialization | `main/index.ts` | T004, T008 |
| T010: Write unit tests | `testing/platform-mocked-tests.md` | T002-T005 |
| T011: Write integration tests | - | T005-T008 |
| T012: Verify success criteria | - | All |

---

## 11. Open Questions

1. **TickTick API rate limits**: Unknown; implement adaptive polling
2. **Task content field**: TickTick uses `content` (HTML?) vs Google Tasks `notes` (plain text)
3. **Due date format**: TickTick uses ISO-8601; confirm timezone handling
4. **Task sorting**: TickTick has `sortOrder`; how to surface in consolidated view?
5. **Project types**: TickTick projects can be TASK, NOTE, or other kinds; filter for tasks only?

---

## 12. References

- [TickTick API Documentation](https://developer.ticktick.com/api-docs) (unofficial)
- [Existing Google Tasks Implementation](electron/main/sync/google-tasks-sync.ts)
- [Team Constitution Principle 14: Source Reference Analysis](context_modules/rules/architecture/source_reference_analysis.md)
- [CDR-2026-060: Source Reference Analysis Before Planning](context_modules/rules/architecture/source_reference_analysis.md)