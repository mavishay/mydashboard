# Implementation Plan: Health-Check Wizard

**Feature:** 005-health-check-wizard
**Issue:** #10
**Date:** 2026-08-25

---

## Source Reference Analysis

### Existing Patterns to Adopt

| File | Lines | Pattern | Notes |
|------|-------|---------|-------|
| `electron/main/ipc/n8n-handlers.ts` | 1-44 | IPC handler registration with Zod validation | Follow exact same pattern for new `n8n:docker-status` handler |
| `electron/preload/index.ts` | 3-48, 59-71 | Allowlist enforcement with `gatedInvoke`/`gatedOn` | Add new channel to `ALLOWED_INVOKE` set |
| `electron/preload/types.d.ts` | 98-103 | Type definitions for n8n namespace | Add `dockerStatus` method type |
| `src/components/Dashboard.tsx` | 19-64 | Inline style pattern, page routing via state | Add StatusBar to header, wizard as modal overlay |
| `src/components/Settings.tsx` | 1-306 | Modal/panel pattern with inline styles | Reference for wizard modal layout |
| `tests/main/ipc/n8n-handlers.test.ts` | (exists) | Test pattern for IPC handlers | Add docker-status handler tests |

### Patterns NOT to Adopt

| Pattern | Rationale |
|---------|-----------|
| CSS modules or Tailwind | Project uses inline styles exclusively |
| New npm packages | Reuse existing React + Zod + Electron |
| Modifying health poller | 30s interval is sufficient; no changes needed |
| New IPC push channels | Existing `n8n:health` push is sufficient |

---

## Task List

### Task 1: Add n8n:docker-status IPC handler

**File:** `electron/main/ipc/n8n-handlers.ts`
**Action:** MODIFY

Add a new handler that checks if the Docker daemon is reachable:

```typescript
// Add after existing handlers (line 44):
ipcMain.handle('n8n:docker-status', async () => {
  try {
    await execFileAsync('docker', ['info', '--format', '{{.ServerVersion}}']);
    return N8nDockerStatusSchema.parse({ available: true });
  } catch {
    return N8nDockerStatusSchema.parse({ available: false, error: 'Docker daemon is not running' });
  }
});
```

Add Zod schema:
```typescript
const N8nDockerStatusSchema = z.object({
  available: z.boolean(),
  error: z.string().optional(),
});
```

Add import for `execFile`/`promisify` (currently not imported in this file — health.ts has it).

**Verification:** `npm run typecheck` passes, handler registered on `n8n:docker-status` channel.

---

### Task 2: Update preload allowlist and API

**File:** `electron/preload/index.ts`
**Action:** MODIFY

1. Add `'n8n:docker-status'` to `ALLOWED_INVOKE` set (after line 15 `'n8n:stop'`)
2. Add `dockerStatus` method to `n8n` namespace (after line 95):

```typescript
dockerStatus: () => gatedInvoke('n8n:docker-status') as Promise<{ available: boolean; error?: string }>,
```

**Verification:** `npm run typecheck` passes, channel appears in allowlist.

---

### Task 3: Update TypeScript types

**File:** `electron/preload/types.d.ts`
**Action:** MODIFY

Add to `ElectronAPI.n8n` interface (after line 102):

```typescript
dockerStatus: () => Promise<{ available: boolean; error?: string }>;
```

**Verification:** `npm run typecheck` passes.

---

### Task 4: Create StatusBar component

**File:** `src/components/StatusBar.tsx`
**Action:** CREATE

Props: `{ status: string; onClick: () => void }`

Renders a small inline-styled div with:
- Color-coded dot (green/red/amber/gray based on status)
- Text label ("n8n: Running", "n8n: Unhealthy", etc.)
- Click handler to open wizard

Follow existing inline style patterns from Dashboard.tsx.

**Verification:** Component renders, colors match status values, click triggers callback.

---

### Task 5: Create HealthCheckWizard component

**File:** `src/components/HealthCheckWizard.tsx`
**Action:** CREATE

Props: `{ status: string; onClose: () => void; onRestart: () => void; restarting: boolean }`

Renders a modal overlay with:
1. Header: "n8n Health Check"
2. Step list: Docker Daemon, Container Exists, Container Healthy, n8n Responding
3. Each step runs async checks on mount (calls `n8n:docker-status`, `n8n:status`)
4. Footer: "Restart n8n" button (visible when unhealthy) + "Close" button

Step logic:
- Step 1 (Docker Daemon): Call `window.electronAPI.n8n.dockerStatus()`
- Step 2 (Container Exists): Call `window.electronAPI.n8n.status()` — if status is not 'unknown', container exists
- Step 3 (Container Healthy): Check if status is 'healthy'
- Step 4 (n8n Responding): If healthy, n8n is responding (implicit)

**Verification:** Wizard opens, steps run sequentially, error messages display.

---

### Task 6: Integrate StatusBar and Wizard into Dashboard

**File:** `src/components/Dashboard.tsx`
**Action:** MODIFY

1. Import `StatusBar` and `HealthCheckWizard`
2. Add state: `n8nStatus`, `showWizard`, `restarting`
3. On mount: fetch initial status via `n8n:status`, subscribe to `n8n:health` push
4. Render `StatusBar` in the header row (between title and buttons)
5. Render `HealthCheckWizard` as conditional modal overlay

**Verification:** Status bar visible, wizard opens on click, updates reflect health changes.

---

### Task 7: Write tests for new IPC handler

**File:** `tests/main/ipc/n8n-handlers.test.ts`
**Action:** MODIFY

Add tests for `n8n:docker-status`:
- Test: returns `{ available: true }` when Docker is running
- Test: returns `{ available: false, error: '...' }` when Docker is not running

Follow existing test patterns (mock `execFile`, extract handler from mock calls).

**Verification:** `npm run test` passes.

---

### Task 8: Write tests for StatusBar component

**File:** `tests/components/StatusBar.test.tsx`
**Action:** CREATE

Tests:
- Renders green dot for 'healthy'
- Renders red dot for 'unhealthy'
- Renders amber dot for 'starting'
- Renders gray dot for 'unknown'
- Calls onClick when clicked

**Verification:** `npm run test` passes.

---

### Task 9: Write tests for HealthCheckWizard component

**File:** `tests/components/HealthCheckWizard.test.tsx`
**Action:** CREATE

Tests:
- Renders modal with step list
- Shows restart button when status is unhealthy
- Hides restart button when status is healthy
- Calls onClose when close button clicked
- Calls onRestart when restart button clicked

**Verification:** `npm run test` passes.

---

### Task 10: Update preload allowlist test

**File:** `tests/preload/index.test.ts`
**Action:** MODIFY

Add assertion that `n8n:docker-status` is in the `ALLOWED_INVOKE` set.

**Verification:** `npm run test` passes.

---

### Task 11: Run lint and typecheck

**Command:** `npm run lint && npm run typecheck && npm run test`

**Verification:** All pass with no errors.

---

## Execution Order

| Order | Task | Depends On | Parallelizable |
|-------|------|------------|----------------|
| 1 | Task 1: IPC handler | None | No |
| 2 | Task 2: Preload allowlist | Task 1 | No |
| 3 | Task 3: TypeScript types | Task 2 | No |
| 4 | Task 4: StatusBar component | None | Yes (with 1-3) |
| 5 | Task 5: HealthCheckWizard component | None | Yes (with 1-4) |
| 6 | Task 6: Dashboard integration | Tasks 3, 4, 5 | No |
| 7 | Task 7: IPC handler tests | Task 1 | Yes (with 4-6) |
| 8 | Task 8: StatusBar tests | Task 4 | Yes (with 7) |
| 9 | Task 9: Wizard tests | Task 5 | Yes (with 8) |
| 10 | Task 10: Preload test | Task 2 | Yes (with 7-9) |
| 11 | Task 11: Lint + typecheck + test | All | No |

## Summary

- **Files Created:** 3 (StatusBar.tsx, HealthCheckWizard.tsx, 2 test files)
- **Files Modified:** 5 (n8n-handlers.ts, preload/index.ts, types.d.ts, Dashboard.tsx, n8n-handlers.test.ts, preload test)
- **New IPC Channels:** 1 (`n8n:docker-status`)
- **New Components:** 2 (StatusBar, HealthCheckWizard)
