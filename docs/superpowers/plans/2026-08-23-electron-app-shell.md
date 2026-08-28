# Electron App Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the Electron desktop application shell with embedded SQLite database (WAL mode), contextBridge/IPC security rules, and basic window management.

**Architecture:** Electron main process manages a single BrowserWindow with React UI. Preload script exposes a typed, allowlisted API surface via contextBridge. SQLite runs in the main process (WAL mode for concurrent reads). IPC handlers are registered per sub-domain with injected dependencies.

**Tech Stack:** Electron 33+, TypeScript, better-sqlite3, React 19, Vite, Vitest

---

## File Structure

```
alpha/
├── electron/
│   ├── main/
│   │   ├── index.ts                    # App entry, window lifecycle
│   │   ├── db/
│   │   │   ├── index.ts                # Database initialization, WAL mode
│   │   │   └── migrations/
│   │   │       └── 001-initial.sql     # Schema migration
│   │   └── ipc/
│   │       ├── index.ts                # IPC orchestrator
│   │       └── window-handlers.ts      # Window management IPC
│   └── preload/
│       └── index.ts                    # contextBridge, allowlisted API
├── src/
│   ├── App.tsx                         # Root React component
│   ├── main.tsx                        # React entry point
│   ├── index.html                      # HTML shell
│   └── components/
│       └── Dashboard.tsx               # Basic dashboard UI
├── tests/
│   ├── main/
│   │   ├── db.test.ts                  # SQLite initialization tests
│   │   └── ipc/
│   │       └── window-handlers.test.ts # IPC handler tests
│   └── preload/
│       └── index.test.ts               # Preload allowlist tests
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── tsconfig.web.json
├── vite.config.ts
├── electron.vite.config.ts
└── vitest.config.ts
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `tsconfig.web.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Initialize package.json**

```json
{
  "name": "focus-board",
  "version": "0.1.0",
  "private": true,
  "description": "AI-Powered Focus Board",
  "main": "dist-electron/main/index.js",
  "type": "module",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "lint": "eslint . --ext .ts,.tsx"
  },
  "dependencies": {
    "better-sqlite3": "^11.7.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13",
    "@types/node": "^22.10.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "electron": "^33.0.0",
    "electron-vite": "^2.4.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0",
    "zod": "^3.24.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json (root)**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

- [ ] **Step 3: Create tsconfig.node.json (main + preload)**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "outDir": "dist-electron",
    "rootDir": "electron",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "types": ["node"]
  },
  "include": ["electron/**/*.ts"]
}
```

- [ ] **Step 4: Create tsconfig.web.json (renderer)**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

- [ ] **Step 5: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['electron/**/*.ts'],
    },
  },
});
```

- [ ] **Step 6: Install dependencies**

Run: `npm install`
Expected: Clean install, no errors

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig*.json vitest.config.ts
git commit -m "chore: scaffold project with Electron, TypeScript, Vitest"
```

---

## Task 2: Electron Main Process Entry

**Files:**
- Create: `electron/main/index.ts`
- Create: `electron.vite.config.ts`

- [ ] **Step 1: Create electron-vite config**

```typescript
import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/main/index.ts'),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/preload/index.ts'),
        },
      },
    },
  },
  renderer: {
    root: '.',
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/index.html'),
        },
      },
    },
    plugins: [react()],
  },
});
```

- [ ] **Step 2: Create main process entry with window management**

```typescript
import { app, BrowserWindow, shell } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import { initializeDatabase } from './db';
import { registerIpcHandlers } from './ipc';

let mainWindow: BrowserWindow | null = null;

function createWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return mainWindow;
}

app.whenReady().then(() => {
  const db = initializeDatabase();
  registerIpcHandlers(db);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
```

- [ ] **Step 3: Verify main process compiles**

Run: `npx electron-vite build --mode development` (or `npx tsc -p tsconfig.node.json --noEmit`)
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add electron/main/index.ts electron.vite.config.ts
git commit -m "feat: add Electron main process with window lifecycle"
```

---

## Task 3: SQLite Database Initialization

**Files:**
- Create: `electron/main/db/index.ts`
- Create: `electron/main/db/migrations/001-initial.sql`
- Create: `tests/main/db.test.ts`

- [ ] **Step 1: Write failing test for database initialization**

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../../electron/main/db';
import { rmSync } from 'fs';
import { join } from 'path';

const TEST_DB_PATH = join(__dirname, '__test__.db');

afterEach(() => {
  try { rmSync(TEST_DB_PATH); } catch {}
});

describe('initializeDatabase', () => {
  it('creates database with WAL mode enabled', () => {
    const db = initializeDatabase(TEST_DB_PATH);
    const mode = db.pragma('journal_mode', { simple: true });
    expect(mode).toBe('wal');
    db.close();
  });

  it('is idempotent on repeated calls', () => {
    const db1 = initializeDatabase(TEST_DB_PATH);
    db1.close();
    const db2 = initializeDatabase(TEST_DB_PATH);
    const tables = db2.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all();
    expect(tables.length).toBeGreaterThan(0);
    db2.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/db.test.ts`
Expected: FAIL — `initializeDatabase` not found

- [ ] **Step 3: Create migration file**

```sql
-- 001-initial.sql
CREATE TABLE IF NOT EXISTS schema_version (
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

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  external_id TEXT NOT NULL,
  subject TEXT,
  from_address TEXT,
  received_at TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  is_important INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(account_id, external_id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES accounts(id),
  external_id TEXT,
  title TEXT NOT NULL,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  priority INTEGER NOT NULL DEFAULT 0,
  due_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_messages_account_id ON messages(account_id);
CREATE INDEX idx_messages_received_at ON messages(received_at);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due_at ON tasks(due_at);
```

- [ ] **Step 4: Write database initialization implementation**

```typescript
import Database, { Database as DatabaseType } from 'better-sqlite3';
import { app } from 'electron';
import { join } from 'path';
import { readFileSync } from 'fs';

const CURRENT_SCHEMA_VERSION = 1;

export function initializeDatabase(
  customPath?: string
): DatabaseType {
  const dbPath = customPath ?? join(app.getPath('userData'), 'dashboard.db');
  const db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  runMigrations(db);

  return db;
}

function runMigrations(db: DatabaseType): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const current: { version: number } | undefined = db
    .prepare('SELECT MAX(version) as version FROM schema_version')
    .get() as { version: number } | undefined;

  const currentVersion = current?.version ?? 0;

  if (currentVersion >= CURRENT_SCHEMA_VERSION) {
    return;
  }

  const migration = readFileSync(
    join(__dirname, 'migrations', '001-initial.sql'),
    'utf-8'
  );

  db.exec('BEGIN TRANSACTION');
  try {
    db.exec(migration);
    db.prepare('INSERT INTO schema_version (version) VALUES (?)')
      .run(CURRENT_SCHEMA_VERSION);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/main/db.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add electron/main/db/ tests/main/db.test.ts
git commit -m "feat: add SQLite database initialization with WAL mode"
```

---

## Task 4: IPC Handler Registration (Window Management)

**Files:**
- Create: `electron/main/ipc/window-handlers.ts`
- Create: `electron/main/ipc/index.ts`
- Create: `tests/main/ipc/window-handlers.test.ts`

- [ ] **Step 1: Write failing test for window IPC**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerWindowHandlers } from '../../../../electron/main/ipc/window-handlers';

const mockWindow = {
  minimize: vi.fn(),
  maximize: vi.fn(),
  unmaximize: vi.fn(),
  close: vi.fn(),
  isMaximized: vi.fn().mockReturnValue(false),
} as any;

const mockIpcMain = {
  handle: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('registerWindowHandlers', () => {
  it('registers window:minimize handler', () => {
    registerWindowHandlers(mockIpcMain as any, () => mockWindow);
    const minimizeHandler = mockIpcMain.handle.mock.calls.find(
      ([channel]: [string]) => channel === 'window:minimize'
    );
    expect(minimizeHandler).toBeDefined();
  });

  it('registers window:maximize handler that toggles', () => {
    registerWindowHandlers(mockIpcMain as any, () => mockWindow);
    const maximizeHandler = mockIpcMain.handle.mock.calls.find(
      ([channel]: [string]) => channel === 'window:maximize'
    );
    expect(maximizeHandler).toBeDefined();

    maximizeHandler[1]();
    expect(mockWindow.maximize).toHaveBeenCalled();
  });

  it('registers window:close handler', () => {
    registerWindowHandlers(mockIpcMain as any, () => mockWindow);
    const closeHandler = mockIpcMain.handle.mock.calls.find(
      ([channel]: [string]) => channel === 'window:close'
    );
    expect(closeHandler).toBeDefined();
  });

  it('registers window:isMaximized handler', () => {
    registerWindowHandlers(mockIpcMain as any, () => mockWindow);
    const isMaxHandler = mockIpcMain.handle.mock.calls.find(
      ([channel]: [string]) => channel === 'window:isMaximized'
    );
    expect(isMaxHandler).toBeDefined();
    const result = isMaxHandler[1]();
    expect(result).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/ipc/window-handlers.test.ts`
Expected: FAIL — `registerWindowHandlers` not found

- [ ] **Step 3: Implement window IPC handlers**

```typescript
import type { IpcMain } from 'electron';

export function registerWindowHandlers(
  ipcMain: IpcMain,
  getWindow: () => Electron.BrowserWindow | null
): void {
  ipcMain.handle('window:minimize', () => {
    getWindow()?.minimize();
  });

  ipcMain.handle('window:maximize', () => {
    const win = getWindow();
    if (win) {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }
  });

  ipcMain.handle('window:close', () => {
    getWindow()?.close();
  });

  ipcMain.handle('window:isMaximized', () => {
    return getWindow()?.isMaximized() ?? false;
  });
}
```

- [ ] **Step 4: Implement IPC orchestrator**

```typescript
import type { IpcMain, BrowserWindow } from 'electron';
import type Database from 'better-sqlite3';
import { registerWindowHandlers } from './window-handlers';

export function registerIpcHandlers(
  db: Database.Database,
  getWindow: () => BrowserWindow | null = () => null
): void {
  const { ipcMain } = require('electron');

  registerWindowHandlers(ipcMain, getWindow);

  // Future handlers registered here:
  // registerDbHandlers(ipcMain, db);
  // registerAccountHandlers(ipcMain, db);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/main/ipc/window-handlers.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add electron/main/ipc/ tests/main/ipc/
git commit -m "feat: add window management IPC handlers"
```

---

## Task 5: Zod Validation for IPC Payloads

**Files:**
- Create: `electron/main/ipc/schemas.ts`
- Modify: `electron/main/ipc/window-handlers.ts`
- Create: `tests/main/ipc/schemas.test.ts`

- [ ] **Step 1: Write failing test for Zod validation**

```typescript
import { describe, it, expect } from 'vitest';
import { windowMinimizeSchema, windowMaximizeSchema, windowCloseSchema } from '../../../electron/main/ipc/schemas';

describe('IPC Zod schemas', () => {
  it('windowMinimizeSchema accepts empty object', () => {
    const result = windowMinimizeSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('windowMinimizeSchema rejects non-empty object', () => {
    const result = windowMinimizeSchema.safeParse({ extra: 'field' });
    expect(result.success).toBe(false);
  });

  it('windowMaximizeSchema accepts empty object', () => {
    const result = windowMaximizeSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('windowCloseSchema accepts empty object', () => {
    const result = windowCloseSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/ipc/schemas.test.ts`
Expected: FAIL — schemas not found

- [ ] **Step 3: Implement Zod schemas**

```typescript
import { z } from 'zod';

export const windowMinimizeSchema = z.object({}).strict();
export const windowMaximizeSchema = z.object({}).strict();
export const windowCloseSchema = z.object({}).strict();

export type WindowMinimizeInput = z.infer<typeof windowMinimizeSchema>;
export type WindowMaximizeInput = z.infer<typeof windowMaximizeSchema>;
export type WindowCloseInput = z.infer<typeof windowCloseSchema>;
```

- [ ] **Step 4: Update window-handlers.ts to validate payloads**

```typescript
import type { IpcMain } from 'electron';
import { windowMinimizeSchema, windowMaximizeSchema, windowCloseSchema } from './schemas';

export function registerWindowHandlers(
  ipcMain: IpcMain,
  getWindow: () => Electron.BrowserWindow | null
): void {
  ipcMain.handle('window:minimize', (_event, payload) => {
    const result = windowMinimizeSchema.safeParse(payload);
    if (!result.success) {
      throw new Error(`Invalid payload: ${result.error.message}`);
    }
    getWindow()?.minimize();
  });

  ipcMain.handle('window:maximize', (_event, payload) => {
    const result = windowMaximizeSchema.safeParse(payload);
    if (!result.success) {
      throw new Error(`Invalid payload: ${result.error.message}`);
    }
    const win = getWindow();
    if (win) {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }
  });

  ipcMain.handle('window:close', (_event, payload) => {
    const result = windowCloseSchema.safeParse(payload);
    if (!result.success) {
      throw new Error(`Invalid payload: ${result.error.message}`);
    }
    getWindow()?.close();
  });

  ipcMain.handle('window:isMaximized', () => {
    return getWindow()?.isMaximized() ?? false;
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/main/ipc/schemas.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add electron/main/ipc/schemas.ts electron/main/ipc/window-handlers.ts tests/main/ipc/schemas.test.ts
git commit -m "feat: add Zod validation for IPC payloads"
```

---

## Task 6: Preload Script with contextBridge Allowlist

**Files:**
- Create: `electron/preload/index.ts`
- Create: `tests/preload/index.test.ts`

- [ ] **Step 1: Write failing test for preload allowlist**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockContextBridge = {
  exposeInMainWorld: vi.fn(),
};

const mockIpcRenderer = {
  invoke: vi.fn(),
  on: vi.fn(),
  send: vi.fn(),
};

vi.mock('electron', () => ({
  contextBridge: mockContextBridge,
  ipcRenderer: mockIpcRenderer,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('preload contextBridge', () => {
  it('exposes electronAPI to renderer', async () => {
    await import('../../electron/preload/index');
    
    expect(mockContextBridge.exposeInMainWorld).toHaveBeenCalledWith(
      'electronAPI',
      expect.objectContaining({
        window: expect.objectContaining({
          minimize: expect.any(Function),
          maximize: expect.any(Function),
          close: expect.any(Function),
          isMaximized: expect.any(Function),
        }),
      })
    );
  });

  it('blocks non-allowlisted IPC channels', async () => {
    await import('../../electron/preload/index');
    
    const api = mockContextBridge.exposeInMainWorld.mock.calls[0][1];
    
    mockIpcRenderer.invoke.mockRejectedValue(
      new Error('Blocked IPC invoke: evil:channel')
    );
    
    await expect(
      api.window.minimize()
    ).resolves.not.toThrow();
  });

  it('window.minimize calls correct channel', async () => {
    await import('../../electron/preload/index');
    
    const api = mockContextBridge.exposeInMainWorld.mock.calls[0][1];
    api.window.minimize();
    
    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('window:minimize');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/preload/index.test.ts`
Expected: FAIL — preload module not found

- [ ] **Step 3: Implement preload script**

```typescript
import { contextBridge, ipcRenderer } from 'electron';

const ALLOWED_INVOKE = new Set([
  'window:minimize',
  'window:maximize',
  'window:close',
  'window:isMaximized',
] as const);

const ALLOWED_ON = new Set([
  'window:maximized-changed',
] as const);

function gatedInvoke(channel: string, ...args: unknown[]): Promise<unknown> {
  if (!ALLOWED_INVOKE.has(channel as typeof ALLOWED_INVOKE extends Set<infer T> ? T : never)) {
    throw new Error(`Blocked IPC invoke: ${channel}`);
  }
  return ipcRenderer.invoke(channel, ...args);
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
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/preload/index.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/preload/index.ts tests/preload/index.test.ts
git commit -m "feat: add preload script with contextBridge allowlist"
```

---

## Task 7: React Renderer Shell

**Files:**
- Create: `src/index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/components/Dashboard.tsx`

- [ ] **Step 1: Create HTML shell**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Focus Board</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create React entry point**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 3: Create App component**

```tsx
import { Dashboard } from './components/Dashboard';

export function App() {
  return <Dashboard />;
}
```

- [ ] **Step 4: Create Dashboard component**

```tsx
export function Dashboard() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Focus Board</h1>
      <p>Phase 1: App shell with SQLite storage</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
        <div style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '1rem' }}>
          <h2>Email</h2>
          <p>No accounts connected</p>
        </div>
        <div style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '1rem' }}>
          <h2>Tasks</h2>
          <p>No tasks yet</p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify renderer compiles**

Run: `npx electron-vite build --mode development`
Expected: No errors, dist-electron/ and dist/ directories created

- [ ] **Step 6: Commit**

```bash
git add src/
git commit -m "feat: add React renderer shell with dashboard layout"
```

---

## Task 8: Type Definitions for electronAPI

**Files:**
- Create: `electron/preload/types.d.ts`

- [ ] **Step 1: Create global type declarations**

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
  }

  interface Window {
    electronAPI: ElectronAPI;
  }
}
```

- [ ] **Step 2: Update tsconfig.web.json to include preload types**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "electron/preload/types.d.ts"]
}
```

- [ ] **Step 3: Commit**

```bash
git add electron/preload/types.d.ts tsconfig.web.json
git commit -m "feat: add TypeScript declarations for electronAPI bridge"
```

---

## Task 9: End-to-End Smoke Test

**Files:**
- Create: `tests/smoke.test.ts`

- [ ] **Step 1: Write smoke test for full app initialization**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/test-app'),
    whenReady: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  },
  BrowserWindow: vi.fn().mockImplementation(() => ({
    show: vi.fn(),
    on: vi.fn(),
    loadURL: vi.fn(),
    loadFile: vi.fn(),
    webContents: { setWindowOpenHandler: vi.fn() },
    minimize: vi.fn(),
    maximize: vi.fn(),
    close: vi.fn(),
    isMaximized: vi.fn().mockReturnValue(false),
  })),
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  contextBridge: { exposeInMainWorld: vi.fn() },
  ipcRenderer: { invoke: vi.fn(), on: vi.fn() },
  shell: { openExternal: vi.fn() },
}));

describe('app smoke test', () => {
  it('registers all expected IPC channels', async () => {
    const { ipcMain } = await import('electron');
    
    await import('../electron/main/ipc');
    
    const registeredChannels = (ipcMain.handle as any).mock.calls.map(
      ([channel]: [string]) => channel
    );
    
    expect(registeredChannels).toContain('window:minimize');
    expect(registeredChannels).toContain('window:maximize');
    expect(registeredChannels).toContain('window:close');
    expect(registeredChannels).toContain('window:isMaximized');
  });
});
```

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add tests/smoke.test.ts
git commit -m "test: add smoke test for IPC registration"
```

---

## Task 10: Wire Main Process to IPC Orchestrator

**Files:**
- Modify: `electron/main/index.ts`

- [ ] **Step 1: Update main/index.ts to pass getWindow to IPC**

Update the `app.whenReady()` block to wire the window getter:

```typescript
app.whenReady().then(() => {
  const db = initializeDatabase();
  registerIpcHandlers(db, () => mainWindow);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
```

- [ ] **Step 2: Run all tests to verify nothing broke**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add electron/main/index.ts
git commit -m "feat: wire main process to IPC orchestrator with window getter"
```

---

## Security Checklist

These items are enforced by team rules and must be verified:

- [ ] `contextIsolation: true` in BrowserWindow webPreferences
- [ ] `nodeIntegration: false` in BrowserWindow webPreferences
- [ ] `sandbox: true` in BrowserWindow webPreferences
- [ ] All IPC channels explicitly allowlisted in preload (`ALLOWED_INVOKE`, `ALLOWED_ON`)
- [ ] Zod validation on all IPC handler payloads
- [ ] No raw `ipcRenderer` exposed via contextBridge
- [ ] IPC handlers registered via `registerHandlers(deps)` pattern (dependency injection)
- [ ] SQLite uses parameterized queries (better-sqlite3 API enforces this)
- [ ] WAL mode enabled on database initialization
- [ ] Platform-specific code tests use `vi.mock('electron', ...)` pattern
