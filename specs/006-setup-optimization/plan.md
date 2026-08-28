# Implementation Plan: Setup Optimization (006-setup-optimization)

**Feature ID:** 006-setup-optimization
**Spec:** `specs/006-setup-optimization/spec.md`
**Created:** 2026-08-27
**Confidence:** HIGH

---

## Source Reference Analysis (CDR-2026-060)

### Files Analyzed

#### `electron/preload/index.ts` (202 lines)
- **Lines 3-57**: `ALLOWED_INVOKE` Set — typed `Set<string>` with 40+ channels. Pattern: declare all allowed channels upfront.
- **Lines 59-67**: `ALLOWED_ON` Set — same pattern for event listeners.
- **Lines 69-81**: `gatedInvoke()` and `gatedOn()` — gate functions that throw on unlisted channels.
- **Lines 83-202**: `contextBridge.exposeInMainWorld()` — typed API surface with `Promise<Return>` cast per method.
- **Pattern to adopt**: New wizard IPC channels must be added to `ALLOWED_INVOKE` Set and exposed via `contextBridge`.
- **Pattern to adopt**: Every method returns a typed Promise with explicit return type cast.

#### `electron/preload/types.d.ts` (176 lines)
- **Lines 77-171**: `ElectronAPI` interface — full typed API surface for the renderer.
- **Pattern to adopt**: Extend `ElectronAPI` interface with `onboarding` namespace for new wizard methods.

#### `electron/main/ipc/telemetry-handlers.ts` (55 lines)
- **Lines 11-17**: Zod schemas at module scope (`SetTelemetryOptInSchema`, `GetTelemetryEventsSchema`).
- **Lines 22-55**: `registerTelemetryHandlers(ipcMain, db)` — single exported function, DI pattern.
- **Lines 33-36**: `safeParse()` gate: `if (!parsed.success) throw new Error(...)`.
- **Pattern to adopt**: Same structure for `setup-handlers.ts` — Zod schemas at module scope, single `registerSetupHandlers(ipcMain, db)` export, safeParse gate.

#### `electron/main/ipc/n8n-handlers.ts` (62 lines)
- **Lines 10-22**: Response schemas defined at module scope (e.g., `N8nStatusResponseSchema`).
- **Lines 24-61**: `registerN8nHandlers(ipcMain, composeDir)` — DI via parameters.
- **Lines 25-31**: Handler uses try/catch returning Zod-parsed response on both success and error paths.
- **Pattern to adopt**: Same try/catch + parse pattern for wizard IPC handlers.

#### `electron/main/ipc/index.ts` (33 lines)
- **Lines 1-33**: `registerIpcHandlers()` orchestrator — imports and wires all handler modules.
- **Line 31**: `registerTelemetryHandlers(ipcMain, db)` — exemplifies the registration call.
- **Pattern to adopt**: Add `registerSetupHandlers(ipcMain, db)` call here.

#### `electron/main/telemetry/index.ts` (78 lines)
- **Lines 16-25**: `getTelemetrySettings(db)` — reads from SQLite with `db.prepare().get()`.
- **Lines 27-47**: `setTelemetryOptIn(db, optedIn)` — upsert pattern: check existing, update or insert.
- **Lines 49-63**: `recordTelemetryEvent(db, eventType, payload)` — inserts with JSON.stringify.
- **Pattern to adopt**: Same SQLite query patterns for `setup-tracker.ts` (prepare/get, insert).

#### `electron/main/db/index.ts` (87 lines)
- **Lines 5-17**: Migration imports — `.sql?raw` imports, versioned by number.
- **Lines 19-31**: `MIGRATIONS` Record<number, string> — maps version to SQL.
- **Lines 48-87**: `runMigrations(db)` — sequential migration runner with BEGIN/COMMIT/ROLLBACK.
- **Pattern to adopt**: Add migration 012 for `setup_tracking` and `setup_status` tables. Must increment `CURRENT_SCHEMA_VERSION` to 12.

#### `electron/main/index.ts` (248 lines)
- **Lines 155-171**: App startup sequence — `initializeDatabase()`, `registerIpcHandlers()`, `composeUp()`.
- **Lines 159-163**: `recordTelemetryEvent(db, 'app_start', ...)` — event recording on startup.
- **Pattern to adopt**: After DB init, call `recordSetupEvent(db, 'setup_started', ...)` to begin tracking.

#### `src/components/Onboarding.tsx` (140 lines)
- **Lines 7-23**: 2-step flow (welcome → telemetry). `useEffect` checks existing consent.
- **Lines 37-68**: Welcome step — inline styles, centered layout, `system-ui` font.
- **Lines 71-139**: Telemetry step — inline styles, action buttons.
- **Pattern to adopt**: Keep inline style pattern. Replace step routing with wizard step array.

#### `src/components/HealthCheckWizard.tsx` (274 lines)
- **Lines 10-16**: `Step` interface with `id`, `title`, `description`, `status`, `error`.
- **Lines 18-43**: `INITIAL_STEPS` array — sequential diagnostic steps.
- **Lines 45-57**: Status colors and error messages as constants.
- **Lines 59-155**: `runChecks()` — sequential step execution with early return on failure.
- **Pattern to adopt**: Step interface and status model can be reused for wizard steps.

#### `src/App.tsx` (47 lines)
- **Lines 5-6**: `AppPage` type = `'onboarding' | 'dashboard'`.
- **Lines 11-22**: `checkExistingConsent()` — checks telemetry settings to decide routing.
- **Pattern to adopt**: Extend routing check to also query setup status; skip wizard if setup complete.

#### `tests/main/telemetry/index.test.ts` (119 lines)
- **Lines 14-33**: `beforeEach` creates in-memory DB with table schemas.
- **Lines 35-37**: `afterEach` closes DB.
- **Pattern to adopt**: Same test structure for `setup-tracker.test.ts`.

#### `tests/main/ipc/n8n-handlers.test.ts` (92 lines)
- **Lines 3-30**: Mock setup: `mockIpcMain`, `vi.mock()` for electron and dependencies.
- **Lines 32-91**: Tests verify handler registration and handler return values.
- **Pattern to adopt**: Same mock + verify pattern for `setup-handlers.test.ts`.

### Patterns NOT to Adopt

1. **`HealthCheckWizard.tsx` auto-run on mount (lines 62-155)** — Wizard should NOT auto-run checks. Each step should be user-initiated (click "Check Docker", click "Check n8n") to allow recovery actions between steps.
2. **Telemetry event recording gate (line 54-57 in telemetry/index.ts)** — `recordTelemetryEvent` checks `optedIn` before recording. Setup tracking events should ALWAYS be recorded regardless of telemetry consent (setup tracking ≠ telemetry analytics).
3. **`compose.ts` COMPOSE_FILE hardcoding (line 7)** — Do not hardcode compose file path in setup handlers; pass `composeDir` via DI as n8n-handlers does.

---

## Implementation Phases

### Phase 1: Database Layer
**Depends on:** None

#### Task 1.1: Create migration 012 for setup tables
- **File:** `electron/main/db/migrations/012-setup-tracking.sql`
- **Changes:** Create `setup_tracking` and `setup_status` tables per spec §4.3
- **Verify:** `runMigrations()` applies cleanly; tables exist in test DB

#### Task 1.2: Register migration 012 in db/index.ts
- **File:** `electron/main/db/index.ts:5-31`
- **Changes:** Increment `CURRENT_SCHEMA_VERSION` to 12, add `import migration012`, add entry to `MIGRATIONS` Record
- **Verify:** `npm test` passes; DB test creates both new tables

#### Task 1.3: Create setup-tracker.ts
- **File:** `electron/main/onboarding/setup-tracker.ts`
- **Changes:** Implement `recordSetupEvent()`, `getSetupStatus()`, `markStepComplete()`, `isSetupComplete()` per spec §4.5
- **Verify:** Unit tests pass (Task 2.1)

---

### Phase 2: Backend Logic + IPC
**Depends on:** Phase 1

#### Task 2.1: Create setup-tracker tests
- **File:** `tests/main/onboarding/setup-tracker.test.ts`
- **Changes:** Unit tests for all setup-tracker functions (TIME-001/002/003/004, DB-002)
- **Verify:** All tests pass

#### Task 2.2: Create setup-handlers.ts (IPC)
- **File:** `electron/main/ipc/setup-handlers.ts`
- **Changes:**
  - Zod schemas at module scope for each handler payload
  - `registerSetupHandlers(ipcMain, db)` — single exported function
  - Channels: `onboarding:getStatus`, `onboarding:setStepComplete`, `onboarding:recordSetupEvent`, `onboarding:startTracking`
  - Reuse existing `n8n:docker-status` and `n8n:status` channels (already in ALLOWED_INVOKE)
  - Reuse existing `apikey:save` and `apikey:validate` channels (already in ALLOWED_INVOKE)
- **Verify:** Handler registration tests pass

#### Task 2.3: Create setup-handlers tests
- **File:** `tests/main/ipc/setup-handlers.test.ts`
- **Changes:** Verify Zod validation (SEC-003), handler registration, return values
- **Verify:** All tests pass

#### Task 2.4: Wire setup handlers into IPC orchestrator
- **File:** `electron/main/ipc/index.ts:32`
- **Changes:** Add `import { registerSetupHandlers }` and `registerSetupHandlers(ipcMain, db)` call
- **Verify:** Existing tests still pass

#### Task 2.5: Add setup tracking to app startup
- **File:** `electron/main/index.ts:159-163`
- **Changes:** After `recordTelemetryEvent(db, 'app_start', ...)`, add `recordSetupStarted(db)` call
- **Verify:** Existing startup tests still pass

---

### Phase 3: Preload + Type Declarations
**Depends on:** Phase 2

#### Task 3.1: Add new IPC channels to preload allowlist
- **File:** `electron/preload/index.ts:3-57`
- **Changes:** Add to `ALLOWED_INVOKE`: `'onboarding:getStatus'`, `'onboarding:setStepComplete'`, `'onboarding:recordSetupEvent'`, `'onboarding:startTracking'`
- **Note:** `n8n:docker-status`, `n8n:status`, `apikey:save`, `apikey:validate` already exist

#### Task 3.2: Expose onboarding API via contextBridge
- **File:** `electron/preload/index.ts:83-202`
- **Changes:** Add `onboarding` namespace to `contextBridge.exposeInMainWorld`:
  - `getStatus()`, `setStepComplete(stepId)`, `recordSetupEvent(eventType, stepId?)`, `startTracking()`

#### Task 3.3: Extend ElectronAPI type declarations
- **File:** `electron/preload/types.d.ts:77-171`
- **Changes:** Add `onboarding` namespace to `ElectronAPI` interface with typed methods and return types

#### Task 3.4: Update preload allowlist test
- **File:** `tests/preload/index.test.ts`
- **Changes:** Verify new channels are in ALLOWED_INVOKE
- **Verify:** Tests pass

---

### Phase 4: Renderer Components
**Depends on:** Phase 3

#### Task 4.1: Refactor Onboarding.tsx to wizard container
- **File:** `src/components/Onboarding.tsx`
- **Changes:**
  - Keep Welcome step and Telemetry step (REQ-005)
  - After telemetry consent, route to wizard steps instead of calling `onComplete()`
  - Add `StepIndicator` component for progress tracking (WIZ-005)
  - Wire to `window.electronAPI.onboarding.*` calls
  - Check `onboarding.getStatus()` on mount to resume at correct step (REQ-007)
  - Skip wizard if `isSetupComplete` returns true (REQ-006)

#### Task 4.2: Create DockerCheckStep
- **File:** `src/components/SetupWizard/DockerCheckStep.tsx`
- **Changes:**
  - Step 1: Calls `window.electronAPI.n8n.dockerStatus()` (existing channel)
  - Shows pass/fail with "Install Docker" link on failure (WIZ-001)
  - Recovery: "Retry" button on failure
  - On success: calls `onboarding.setStepComplete('docker-check')`

#### Task 4.3: Create N8nHealthStep
- **File:** `src/components/SetupWizard/N8nHealthStep.tsx`
- **Changes:**
  - Step 2: Reuses `HealthCheckWizard` logic (WIZ-002)
  - Shows container status with "Restart n8n" recovery action
  - Calls `n8n:status` (existing channel) and `n8n:start` (existing channel) for restart

#### Task 4.4: Create ApiKeyStep
- **File:** `src/components/SetupWizard/ApiKeyStep.tsx`
- **Changes:**
  - Step 3: Input fields for OpenAI or Anthropic key (WIZ-003)
  - Validates key format client-side
  - Stores via `window.electronAPI.apikey.save()` (existing channel)
  - SEC-001: Key stored via OS keychain (existing secureStorage flow)

#### Task 4.5: Create AccountConnectStep
- **File:** `src/components/SetupWizard/AccountConnectStep.tsx`
- **Changes:**
  - Step 4: Gmail OAuth2 flow (WIZ-004)
  - Calls `window.electronAPI.gmail.connect()` (existing channel)
  - On success: marks onboarding complete
  - Skip option for users without Gmail

#### Task 4.6: Create SetupCompleteStep
- **File:** `src/components/SetupWizard/SetupCompleteStep.tsx`
- **Changes:**
  - Completion confirmation with summary of completed steps
  - "Go to Dashboard" button
  - Calls `onboarding.setStepComplete('setup-complete')`

#### Task 4.7: Create StepIndicator component
- **File:** `src/components/SetupWizard/StepIndicator.tsx`
- **Changes:**
  - Visual progress bar showing current step and completion status (WIZ-005)
  - Step dots or numbered indicators with checkmarks for completed steps

---

### Phase 5: App Routing + Integration
**Depends on:** Phase 4

#### Task 5.1: Update App.tsx routing
- **File:** `src/App.tsx:11-22`
- **Changes:**
  - After telemetry consent check, also query `onboarding.getStatus()`
  - If `isSetupComplete`, skip wizard → dashboard
  - If partial, resume wizard at first incomplete step

#### Task 5.2: Wire setup completion tracking
- **Files:** `src/components/Onboarding.tsx`, each step component
- **Changes:** Each step calls `onboarding.setStepComplete(stepId)` on success
- **Verify:** `setup_status` table updated correctly

---

### Phase 6: Error Recovery
**Depends on:** Phase 4

#### Task 6.1: Add error states per spec §4.6
- **Files:** Each step component in `SetupWizard/`
- **Changes:** Implement error recovery matrix:
  - Docker Check: "Install Docker" link + retry
  - n8n Health: "Restart n8n" button + auto-retry after 5s
  - API Key: Re-focus input + retry validation
  - Account Connect: Retry OAuth button
- **Verify:** Each error state shows specific message and recovery action

---

### Phase 7: Tests
**Depends on:** Phases 1-6

#### Task 7.1: Unit tests for setup-tracker
- **File:** `tests/main/onboarding/setup-tracker.test.ts`
- **Changes:** Tests for recordSetupEvent, getSetupStatus, markStepComplete, isSetupComplete
- **Verify:** All pass

#### Task 7.2: Unit tests for setup-handlers
- **File:** `tests/main/ipc/setup-handlers.test.ts`
- **Changes:** Zod validation tests, handler registration, return values
- **Verify:** All pass

#### Task 7.3: Integration tests for wizard components
- **File:** `tests/components/setup-wizard.test.ts`
- **Changes:** Test component exports, step rendering, error states
- **Verify:** All pass

#### Task 7.4: Run full test suite
- **Command:** `npm test`
- **Verify:** No regressions; all new tests pass

#### Task 7.5: Lint and typecheck
- **Commands:** `npm run lint && npm run typecheck`
- **Verify:** Zero errors

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Migration 012 breaks existing DB | High | Use `CREATE TABLE IF NOT EXISTS`; idempotent migration; test with existing DB |
| New IPC channels not in allowlist | Medium | Add channels BEFORE testing renderer; preload test validates |
| `setup_tracking` events recorded without consent | Low | Design decision: setup tracking ≠ telemetry; events always recorded |
| Wizard breaks existing telemetry consent flow | Medium | REQ-005: consent step preserved; new steps appended after consent |
| Docker check false negative on CI | Low | Tests mock electron/Docker; manual test on real Docker |
| Wizard state lost on crash | Medium | REQ-007: partial completion resume via `setup_status` table |

---

## Testing Strategy

1. **Unit tests first** (Phase 2.1, 2.3): setup-tracker and setup-handlers with in-memory SQLite
2. **Integration tests** (Phase 7.3): Component rendering and export validation
3. **Regression** (Phase 7.4): Full test suite after each phase
4. **Platform mocks** (CDR: rule-testing-platform-mocked): All Electron tests mock `electron` module
5. **Zod validation** (Phase 7.2): Every schema validated with valid and invalid payloads

---

## Files Changed (Summary)

| File | Action | Phase |
|------|--------|-------|
| `electron/main/db/migrations/012-setup-tracking.sql` | CREATE | 1 |
| `electron/main/db/index.ts` | MODIFY | 1 |
| `electron/main/onboarding/setup-tracker.ts` | CREATE | 1 |
| `electron/main/ipc/setup-handlers.ts` | CREATE | 2 |
| `electron/main/ipc/index.ts` | MODIFY | 2 |
| `electron/main/index.ts` | MODIFY | 2 |
| `electron/preload/index.ts` | MODIFY | 3 |
| `electron/preload/types.d.ts` | MODIFY | 3 |
| `src/components/Onboarding.tsx` | MODIFY | 4 |
| `src/components/SetupWizard/SetupWizard.tsx` | CREATE | 4 |
| `src/components/SetupWizard/StepIndicator.tsx` | CREATE | 4 |
| `src/components/SetupWizard/DockerCheckStep.tsx` | CREATE | 4 |
| `src/components/SetupWizard/N8nHealthStep.tsx` | CREATE | 4 |
| `src/components/SetupWizard/ApiKeyStep.tsx` | CREATE | 4 |
| `src/components/SetupWizard/AccountConnectStep.tsx` | CREATE | 4 |
| `src/components/SetupWizard/SetupCompleteStep.tsx` | CREATE | 4 |
| `src/App.tsx` | MODIFY | 5 |
| `tests/main/onboarding/setup-tracker.test.ts` | CREATE | 7 |
| `tests/main/ipc/setup-handlers.test.ts` | CREATE | 7 |
| `tests/components/setup-wizard.test.ts` | CREATE | 7 |
