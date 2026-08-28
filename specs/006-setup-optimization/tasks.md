# Task List: Setup Optimization (006-setup-optimization)

**Plan:** `specs/006-setup-optimization/plan.md`
**Spec:** `specs/006-setup-optimization/spec.md`
**Created:** 2026-08-27

---

## Phase 1: Database Layer

### T001 — Create migration 012 for setup tables
- **File:** `electron/main/db/migrations/012-setup-tracking.sql` (CREATE)
- **Changes:** Create `setup_tracking` and `setup_status` tables per spec §4.3. Use `CREATE TABLE IF NOT EXISTS` for idempotency (DB-003). Add index `idx_setup_tracking_event`.
- **Verify:** Migration file exists and SQL is syntactically valid
- **Dependencies:** None
- **Complexity:** S

### T002 — Register migration 012 in db/index.ts
- **File:** `electron/main/db/index.ts` (MODIFY lines 5, 7-17, 19-31)
- **Changes:** (a) Increment `CURRENT_SCHEMA_VERSION` from 11 to 12 on line 5. (b) Add `import migration012 from './migrations/012-setup-tracking.sql?raw';` after line 17. (c) Add entry `12: migration012` to `MIGRATIONS` Record after line 30.
- **Verify:** `npm test` passes; existing DB tests still create tables correctly
- **Dependencies:** T001
- **Complexity:** S

### T003 — Create setup-tracker.ts
- **File:** `electron/main/onboarding/setup-tracker.ts` (CREATE)
- **Changes:** Implement four functions following the SQLite patterns in `electron/main/telemetry/index.ts`:
  - `recordSetupEvent(db, event: SetupEvent)` — insert into `setup_tracking` (always records, regardless of telemetry consent per plan §Patterns NOT to Adopt #2)
  - `getSetupStatus(db: Database.Database): SetupStatus` — read from `setup_status`, return default row if none exists
  - `markStepComplete(db, stepId: string)` — update `setup_status` boolean column + call `recordSetupEvent` with `setup_step_completed`
  - `isSetupComplete(db): boolean` — check all four boolean columns are 1 in `setup_status`
  - Export `SetupEvent` and `SetupStatus` interfaces
- **Verify:** Unit tests pass (T006)
- **Dependencies:** T001
- **Complexity:** M

---

## Phase 2: Backend Logic + IPC

### T004 — Create setup-handlers.ts (IPC)
- **File:** `electron/main/ipc/setup-handlers.ts` (CREATE)
- **Changes:** Follow the exact pattern of `electron/main/ipc/telemetry-handlers.ts`:
  - Import Zod, `setup-tracker` functions, and `Database` type
  - Define Zod schemas at module scope: `GetStatusSchema`, `SetStepCompleteSchema` (with `stepId: z.string()`), `RecordSetupEventSchema` (with `eventType`, optional `stepId`, optional `metadata`), `StartTrackingSchema`
  - Export `registerSetupHandlers(ipcMain: IpcMain, db: Database.Database): void`
  - Register four IPC handlers: `onboarding:getStatus`, `onboarding:setStepComplete`, `onboarding:recordSetupEvent`, `onboarding:startTracking`
  - Each handler uses `safeParse()` gate per SEC-003; throw on invalid payload
  - `onboarding:startTracking` calls `recordSetupEvent(db, { eventType: 'setup_started' })` if no existing start event
- **Verify:** Handler registration tests pass (T007)
- **Dependencies:** T003
- **Complexity:** M

### T005 — Wire setup handlers into IPC orchestrator
- **File:** `electron/main/ipc/index.ts` (MODIFY line 12-13, add after line 31)
- **Changes:** (a) Add `import { registerSetupHandlers } from './setup-handlers';` after line 12. (b) Add `registerSetupHandlers(ipcMain, db);` call after the `registerTelemetryHandlers` line (after line 31).
- **Verify:** Existing IPC handler tests still pass
- **Dependencies:** T004
- **Complexity:** S

### T006 — Add setup tracking to app startup
- **File:** `electron/main/index.ts` (MODIFY lines 19, 159-163)
- **Changes:** (a) Add `import { recordSetupEvent } from './onboarding/setup-tracker';` after line 19. (b) After the `recordTelemetryEvent(db, 'app_start', ...)` block (after line 163), add: `recordSetupEvent(db, { eventType: 'setup_started' });`
- **Verify:** Existing startup tests still pass; `setup_tracking` table gets a `setup_started` row on app launch
- **Dependencies:** T004
- **Complexity:** S

---

## Phase 3: Preload + Type Declarations

### T007 — Add new IPC channels to preload allowlist
- **File:** `electron/preload/index.ts` (MODIFY lines 3-57)
- **Changes:** Add to the `ALLOWED_INVOKE` Set (after line 51, before `'classification:classify'`):
  - `'onboarding:getStatus'`
  - `'onboarding:setStepComplete'`
  - `'onboarding:recordSetupEvent'`
  - `'onboarding:startTracking'`
  Note: `n8n:docker-status`, `n8n:status`, `n8n:start`, `apikey:save`, `apikey:validate` already exist.
- **Verify:** `tests/preload/index.test.ts` passes
- **Dependencies:** T004
- **Complexity:** S

### T008 — Expose onboarding API via contextBridge
- **File:** `electron/preload/index.ts` (MODIFY after line 201, inside `exposeInMainWorld` object)
- **Changes:** Add `onboarding` namespace to the `contextBridge.exposeInMainWorld` API object (after the `classification` namespace, before the closing `});`):
  ```
  onboarding: {
    getStatus: () => gatedInvoke('onboarding:getStatus') as Promise<{ ... }>,
    setStepComplete: (stepId: string) => gatedInvoke('onboarding:setStepComplete', { stepId }),
    recordSetupEvent: (eventType: string, stepId?: string, metadata?: Record<string, unknown>) =>
      gatedInvoke('onboarding:recordSetupEvent', { eventType, stepId, metadata }),
    startTracking: () => gatedInvoke('onboarding:startTracking'),
  }
  ```
- **Verify:** `tests/preload/index.test.ts` passes
- **Dependencies:** T007
- **Complexity:** S

### T009 — Extend ElectronAPI type declarations
- **File:** `electron/preload/types.d.ts` (MODIFY after line 170, inside `ElectronAPI` interface)
- **Changes:** Add `onboarding` namespace to `ElectronAPI` interface (before the closing `}` on line 171):
  ```
  onboarding: {
    getStatus: () => Promise<{ dockerCheckComplete: boolean; n8nHealthComplete: boolean; apiKeyComplete: boolean; accountConnected: boolean; setupCompletedAt: string | null }>;
    setStepComplete: (stepId: string) => Promise<void>;
    recordSetupEvent: (eventType: string, stepId?: string, metadata?: Record<string, unknown>) => Promise<void>;
    startTracking: () => Promise<void>;
  };
  ```
- **Verify:** TypeScript compiles without errors
- **Dependencies:** T008
- **Complexity:** S

---

## Phase 4: Renderer Components

### T010 — Create StepIndicator component
- **File:** `src/components/SetupWizard/StepIndicator.tsx` (CREATE)
- **Changes:** Functional component with inline styles. Props: `steps: Array<{ id: string; title: string; status: 'pending' | 'active' | 'completed' | 'failed' }>` and `currentStepIndex: number`. Render numbered step dots/indicators with checkmarks for completed steps. Use inline styles matching the existing project convention (see `HealthCheckWizard.tsx` line 45-50 for status colors).
- **Verify:** Component exports correctly; renders without errors
- **Dependencies:** None
- **Complexity:** S

### T011 — Create DockerCheckStep
- **File:** `src/components/SetupWizard/DockerCheckStep.tsx` (CREATE)
- **Changes:**
  - Props: `{ onComplete: () => void; onError: (msg: string) => void }`
  - On mount: calls `window.electronAPI.n8n.dockerStatus()` (existing channel, already in ALLOWED_INVOKE)
  - Shows pass/fail with "Install Docker" link on failure (WIZ-001)
  - Recovery: "Retry" button on failure that re-calls `dockerStatus()`
  - On success: calls `window.electronAPI.onboarding.setStepComplete('docker-check')` then `onComplete()`
  - Inline styles only, match `HealthCheckWizard.tsx` card style (lines 175-185)
- **Verify:** Component renders; tests pass (T019)
- **Dependencies:** T010
- **Complexity:** M

### T012 — Create N8nHealthStep
- **File:** `src/components/SetupWizard/N8nHealthStep.tsx` (CREATE)
- **Changes:**
  - Props: `{ onComplete: () => void; onError: (msg: string) => void }`
  - Reuses `HealthCheckWizard` logic from `src/components/HealthCheckWizard.tsx` (WIZ-002)
  - Calls `window.electronAPI.n8n.status()` and `window.electronAPI.n8n.dockerStatus()` (existing channels)
  - Shows container status with "Restart n8n" recovery action via `window.electronAPI.n8n.start()` (existing channel)
  - On healthy: calls `setStepComplete('n8n-health')` then `onComplete()`
  - If container is starting, auto-retry after 5s (per error matrix spec §4.6)
  - Inline styles only
- **Verify:** Component renders; tests pass (T019)
- **Dependencies:** T010
- **Complexity:** M

### T013 — Create ApiKeyStep
- **File:** `src/components/SetupWizard/ApiKeyStep.tsx` (CREATE)
- **Changes:**
  - Props: `{ onComplete: () => void; onError: (msg: string) => void }`
  - Step 3: Input fields for OpenAI or Anthropic key (WIZ-003)
  - Client-side format validation (e.g., `sk-` prefix for OpenAI, `sk-ant-` for Anthropic)
  - Stores via `window.electronAPI.apikey.save()` (existing channel, SEC-001: uses OS keychain)
  - On save success: calls `setStepComplete('api-key')` then `onComplete()`
  - Error recovery: re-focus input + retry button (per error matrix)
  - Inline styles only
- **Verify:** Component renders; tests pass (T019)
- **Dependencies:** T010
- **Complexity:** M

### T014 — Create AccountConnectStep
- **File:** `src/components/SetupWizard/AccountConnectStep.tsx` (CREATE)
- **Changes:**
  - Props: `{ onComplete: () => void; onError: (msg: string) => void }`
  - Step 4: Gmail OAuth2 flow (WIZ-004)
  - Calls `window.electronAPI.gmail.connect()` (existing channel)
  - On success: calls `setStepComplete('account-connect')` then `onComplete()`
  - Skip option for users without Gmail (button to skip)
  - Error recovery: retry OAuth button (per error matrix)
  - Inline styles only
- **Verify:** Component renders; tests pass (T019)
- **Dependencies:** T010
- **Complexity:** M

### T015 — Create SetupCompleteStep
- **File:** `src/components/SetupWizard/SetupCompleteStep.tsx` (CREATE)
- **Changes:**
  - Props: `{ onComplete: () => void }`
  - Completion confirmation with summary of completed steps (checkmarks for each)
  - "Go to Dashboard" button that calls `onComplete()`
  - Calls `window.electronAPI.onboarding.setStepComplete('setup-complete')` on mount
  - Inline styles only
- **Verify:** Component renders; tests pass (T019)
- **Dependencies:** T010
- **Complexity:** S

### T016 — Create SetupWizard container component
- **File:** `src/components/SetupWizard/SetupWizard.tsx` (CREATE)
- **Changes:**
  - Props: `{ onComplete: () => void }`
  - Manages wizard state: current step index, step statuses array
  - Steps array: `['docker-check', 'n8n-health', 'api-key', 'account-connect', 'setup-complete']`
  - Renders `StepIndicator` + current step component
  - On mount: calls `window.electronAPI.onboarding.getStatus()` to check existing progress; resumes at first incomplete step (REQ-007)
  - Each step receives `onComplete` that advances to next step + calls `setStepComplete`
  - Telemetry consent step is NOT included here — it stays in `Onboarding.tsx` (REQ-005)
  - Inline styles only
- **Verify:** Component renders correctly; step navigation works; tests pass (T019)
- **Dependencies:** T010, T011, T012, T013, T014, T015
- **Complexity:** L

---

## Phase 5: Refactor Onboarding + App Routing

### T017 — Refactor Onboarding.tsx to wizard container
- **File:** `src/components/Onboarding.tsx` (MODIFY lines 7-23, 25-35)
- **Changes:**
  - Keep Welcome step (lines 37-68) and Telemetry step (lines 71-139) unchanged (REQ-005)
  - After telemetry consent (in `handleTelemetryChoice`), instead of calling `onComplete()`, route to wizard steps
  - Add `import { SetupWizard } from './SetupWizard/SetupWizard';`
  - Add wizard step to the step state: `step: 'welcome' | 'telemetry' | 'wizard'`
  - After `setOptIn` succeeds, `setStep('wizard')` instead of `onComplete()`
  - Render `<SetupWizard onComplete={onComplete} />` when `step === 'wizard'`
  - On mount: check `onboarding.getStatus()` — if `isSetupComplete`, skip directly to `onComplete()` (REQ-006)
- **Verify:** Existing onboarding flow preserved; new wizard renders after telemetry consent
- **Dependencies:** T009, T016
- **Complexity:** M

### T018 — Update App.tsx routing
- **File:** `src/App.tsx` (MODIFY lines 11-22)
- **Changes:**
  - After telemetry consent check (line 13-15), also query `window.electronAPI.onboarding.getStatus()`
  - If `isSetupComplete` (all four booleans true), skip wizard → dashboard
  - If partial setup (some steps complete), resume wizard at first incomplete step
  - Import logic stays in `checkExistingConsent` callback
- **Verify:** Returning users skip wizard; new users see wizard
- **Dependencies:** T017
- **Complexity:** S

---

## Phase 6: Error Recovery

### T019 — Add error states per spec §4.6
- **Files:** `src/components/SetupWizard/DockerCheckStep.tsx`, `N8nHealthStep.tsx`, `ApiKeyStep.tsx`, `AccountConnectStep.tsx`
- **Changes:** Verify each step implements the error recovery matrix from spec §4.6:
  - Docker Check: "Docker is not installed" → link to Docker install; "Docker daemon not running" → retry button
  - n8n Health: "Container not found" → retry; "Container unhealthy" → auto-retry after 5s; "Not responding" → restart button
  - API Key: "Invalid format" → re-focus input; "Validation failed" → retry button
  - Account Connect: "OAuth failed" → retry button; "Network error" → retry button
  - Ensure each error state has specific message text and recovery action
- **Verify:** Each step shows correct error message and recovery action for each error condition
- **Dependencies:** T011, T012, T013, T014
- **Complexity:** M

---

## Phase 7: Tests

### T020 — Unit tests for setup-tracker
- **File:** `tests/main/onboarding/setup-tracker.test.ts` (CREATE)
- **Changes:** Follow the pattern in `tests/main/telemetry/index.test.ts`:
  - `beforeEach`: create in-memory DB with `setup_tracking` and `setup_status` table schemas
  - Tests: `recordSetupEvent` inserts correct row (TIME-001/002/003), `getSetupStatus` returns defaults, `markStepComplete` updates correct boolean column, `isSetupComplete` returns true only when all four columns are 1
  - `afterEach`: close DB
- **Verify:** All tests pass
- **Dependencies:** T003
- **Complexity:** M

### T021 — Unit tests for setup-handlers
- **File:** `tests/main/ipc/setup-handlers.test.ts` (CREATE)
- **Changes:** Follow the pattern in `tests/main/ipc/n8n-handlers.test.ts`:
  - Mock `ipcMain` with `vi.fn()` handle
  - Mock `electron` module with `vi.mock()`
  - Tests: handler registration for all four channels, Zod validation rejects invalid payloads (SEC-003), handler return values match expected shapes
- **Verify:** All tests pass
- **Dependencies:** T004
- **Complexity:** M

### T022 — Integration tests for wizard components
- **File:** `tests/components/setup-wizard.test.ts` (CREATE)
- **Changes:**
  - Mock `window.electronAPI` with `vi.fn()` methods
  - Test: `StepIndicator` renders correct number of steps
  - Test: `DockerCheckStep` calls `n8n.dockerStatus()` on mount
  - Test: `ApiKeyStep` validates key format before calling `apikey.save()`
  - Test: `SetupWizard` resumes at correct step based on `getStatus()` response
  - Test: `Onboarding` preserves telemetry consent flow (REQ-005)
  - Test: `SetupCompleteStep` renders completion message
- **Verify:** All tests pass
- **Dependencies:** T016, T017
- **Complexity:** M

### T023 — Run full test suite
- **Command:** `npm test`
- **Verify:** No regressions; all new tests pass
- **Dependencies:** T020, T021, T022
- **Complexity:** S

### T024 — Lint and typecheck
- **Commands:** `npm run lint && npm run typecheck`
- **Verify:** Zero errors
- **Dependencies:** T023
- **Complexity:** S

---

## Dependency Graph

```
T001 → T002
T001 → T003 → T004 → T005
                T004 → T006
                T004 → T007 → T008 → T009
T010 → T011, T012, T013, T014, T015 → T016
T009 + T016 → T017 → T018
T011, T012, T013, T014 → T019
T003 → T020
T004 → T021
T016, T017 → T022
T020, T021, T022 → T023 → T024
```

---

## Summary

| Phase | Tasks | Estimated Effort |
|-------|-------|-----------------|
| Phase 1: Database | T001-T003 | ~2h |
| Phase 2: Backend + IPC | T004-T006 | ~2h |
| Phase 3: Preload + Types | T007-T009 | ~1h |
| Phase 4: Renderer Components | T010-T016 | ~4h |
| Phase 5: Refactor + Routing | T017-T018 | ~1.5h |
| Phase 6: Error Recovery | T019 | ~1h |
| Phase 7: Tests | T020-T024 | ~2h |
| **Total** | **24 tasks** | **~13.5h** |
