# Feature Specification: Setup Optimization

**Feature ID:** 006-setup-optimization
**Status:** Draft
**Created:** 2026-08-27
**Milestone:** v1.0 Release (Phase 3)
**PRD References:** PDR-006 (V1 Success Metrics), REQ-007 (User Story: <15 min setup), REQ-023 (Health-check wizard), Section 8.4 (Usability NFRs), Section 11.4 (Milestone 3)

---

## 1. Overview

Optimize the onboarding flow so a new user completes full setup — Docker check, n8n health, API key configuration, and first account connection — in under 15 minutes with a single `docker compose up` command, guided wizard, time tracking, and clear error recovery at each step.

**Demo Sentence:** User runs `docker compose up -d`, launches the app, and a guided onboarding wizard walks them through Docker verification, n8n health check, API key setup, and first Gmail connection — completing setup in under 15 minutes with tracked duration.

---

## 2. Requirements

### 2.1 Core Requirements

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| REQ-001 | Single-command Docker compose start launches the full stack | Must | `docker compose up -d` starts n8n sidecar; app detects running container on launch |
| REQ-002 | Guided onboarding wizard replaces the minimal 2-step flow | Must | Wizard presents sequential steps: Docker check → n8n health → API key setup → first account connection |
| REQ-003 | Each wizard step has a clear error state with recovery action | Must | Every step shows specific error message and actionable recovery button/link |
| REQ-004 | Setup duration is tracked from first launch to first triaged email | Must | Telemetry event `setup.duration` recorded with start/end timestamps and step-level breakdown |
| REQ-005 | Existing telemetry consent flow is preserved (extended, not replaced) | Must | Telemetry consent step remains in wizard; new steps are appended after consent |
| REQ-006 | Onboarding wizard is skippable for returning users | Must | If all steps previously completed, wizard skips to dashboard |
| REQ-007 | Wizard steps are resilient — partial completion is resume-able | Must | On relaunch, wizard resumes at the first incomplete step |

### 2.2 Wizard Step Requirements

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| WIZ-001 | Step 1: Docker daemon check | Must | Detects Docker availability via existing `dockerStatus()` IPC; shows pass/fail with "Install Docker" link on failure |
| WIZ-002 | Step 2: n8n container health check | Must | Reuses existing `HealthCheckWizard` logic; shows container status with "Restart n8n" recovery action |
| WIZ-003 | Step 3: API key setup (BYOK) | Must | Input fields for OpenAI or Anthropic key; validates key format; stores via existing `electron-safeStorage` |
| WIZ-004 | Step 4: First account connection | Must | Gmail OAuth2 flow triggered; success marks onboarding complete |
| WIZ-005 | Step progress indicator | Must | Visual progress bar or step indicator showing current step and completion status |

### 2.3 Time Tracking Requirements

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| TIME-001 | Record `setup_started` event on first app launch | Must | Telemetry event with timestamp stored in `setup_tracking` table |
| TIME-002 | Record `setup_step_completed` event per wizard step | Must | Event includes step ID and elapsed time since setup start |
| TIME-003 | Record `setup_completed` event on first triaged email | Must | Event includes total duration and step-by-step breakdown |
| TIME-004 | Store setup tracking data in SQLite | Must | `setup_tracking` table persists across app restarts |

### 2.4 Security Requirements

| ID | Requirement | Source | Acceptance Criteria |
|----|-------------|--------|---------------------|
| SEC-001 | API keys stored in OS keychain only | CDR: rule-ts-zod-validation, PDR-002 | `electron-safeStorage` used; no plain text in DB or config |
| SEC-002 | Wizard IPC channels explicitly allowlisted | CDR: rule-electron-contextbridge-allowlist | New channels added to `ALLOWED_INVOKE` set in preload |
| SEC-003 | Zod validation on wizard IPC payloads | CDR: rule-ts-zod-validation | Every wizard handler uses `Schema.safeParse()` |
| SEC-004 | No modification to telemetry consent flow | Non-goal constraint | Telemetry opt-in UI unchanged; wizard extends around it |

### 2.5 Database Requirements

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| DB-001 | `setup_tracking` table created via migration | Must | Table stores setup events with timestamps and step data |
| DB-002 | `setup_status` table tracks wizard completion state | Must | Single row per install tracking which steps are complete |
| DB-003 | Schema migration is idempotent | Must | Re-running migration does not duplicate data |

---

## 3. Constraints

### 3.1 Technical Constraints

| Constraint | Rationale |
|------------|-----------|
| Electron 33 + React 19 + TypeScript 5.7 stack | Existing project stack (PDR-001) |
| Existing docker-compose.yml for n8n sidecar | Non-goal: do not modify Docker compose service definition |
| Zod validation on all IPC payloads | CDR: rule-ts-zod-validation |
| contextBridge allowlist security model | CDR: rule-electron-contextbridge-allowlist |
| Inline styles only (no CSS framework) | Existing project convention (see Onboarding.tsx, HealthCheckWizard.tsx) |
| Vitest 3 for testing | Existing test framework |
| No new third-party UI dependencies | Non-goal constraint |

### 3.2 Non-Goals (This Feature)

| Excluded | Rationale |
|----------|-----------|
| Changing docker-compose.yml service definition | n8n config is stable; modifying risks breaking existing users |
| Adding new third-party wizard UI libraries | Keep bundle small; inline styles match existing pattern |
| Modifying telemetry consent flow | Extend, don't replace; consent UI stays as-is |
| Email/task connector implementations | Separate issues (Gmail OAuth2 connector exists, task connectors deferred) |
| Web-based onboarding | Desktop-only Electron app (PDR-001) |
| Mobile onboarding | LAN dashboard is post-setup (PDR-001) |

---

## 4. Technical Design

### 4.1 Project Structure Changes

```
alpha/
├── electron/
│   ├── main/
│   │   ├── onboarding/
│   │   │   ├── setup-tracker.ts        # Setup time tracking logic
│   │   │   ├── setup-handlers.ts       # IPC handlers for wizard state
│   │   │   └── wizard-steps.ts         # Step definitions and validation
│   │   ├── docker/
│   │   │   ├── compose.ts              # (existing, unchanged)
│   │   │   └── health.ts              # (existing, unchanged)
│   │   └── telemetry/
│   │       └── index.ts               # (existing, extended with setup events)
│   └── preload/
│       └── types.ts                    # Extended with new IPC channels
├── renderer/
│   ├── components/
│   │   ├── Onboarding.tsx              # Refactored to multi-step wizard
│   │   ├── SetupWizard/
│   │   │   ├── SetupWizard.tsx         # Wizard container with step routing
│   │   │   ├── StepIndicator.tsx       # Progress bar component
│   │   │   ├── DockerCheckStep.tsx     # Step 1: Docker verification
│   │   │   ├── N8nHealthStep.tsx       # Step 2: n8n health check
│   │   │   ├── ApiKeyStep.tsx          # Step 3: BYOK API key setup
│   │   │   ├── AccountConnectStep.tsx  # Step 4: First account connection
│   │   │   └── SetupCompleteStep.tsx   # Completion confirmation
│   │   └── HealthCheckWizard.tsx       # (existing, reused in Step 2)
│   └── App.tsx                         # Updated routing for wizard
└── specs/
    └── 006-setup-optimization/
        └── spec.md                     # This file
```

### 4.2 IPC Channel Design

**New Allowed Channels:**

```typescript
// electron/preload/types.ts (additions)
export const ALLOWED_INVOKE = new Set([
  // ... existing channels ...
  'onboarding:getStatus',
  'onboarding:setStepComplete',
  'onboarding:getSetupTracking',
  'onboarding:recordSetupEvent',
  'onboarding:startTracking',
  'docker:checkStatus',
  'n8n:getHealth',
  'n8n:restart',
  'settings:getApiKey',
  'settings:setApiKey',
] as const);
```

### 4.3 Database Schema

```sql
-- New migration: setup tracking
CREATE TABLE IF NOT EXISTS setup_tracking (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL CHECK (event_type IN ('setup_started', 'setup_step_completed', 'setup_completed')),
  step_id TEXT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  elapsed_ms INTEGER,
  metadata TEXT, -- JSON blob for step-specific data
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS setup_status (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  docker_check_complete INTEGER NOT NULL DEFAULT 0,
  n8n_health_complete INTEGER NOT NULL DEFAULT 0,
  api_key_complete INTEGER NOT NULL DEFAULT 0,
  account_connected INTEGER NOT NULL DEFAULT 0,
  setup_completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_setup_tracking_event ON setup_tracking(event_type);
```

### 4.4 Wizard Flow

```
┌─────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Welcome   │───>│   Telemetry  │───>│ Docker Check │───>│  n8n Health  │───>│  API Key     │
│   (existing)│    │   (existing) │    │   (new)      │    │  (reused)    │    │  (new)       │
└─────────────┘    └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
                                                                                        │
                                                                                        v
                                                                                ┌──────────────┐    ┌──────────────┐
                                                                                │Account Connect│───>│  Complete    │
                                                                                │  (new)        │    │  (new)       │
                                                                                └──────────────┘    └──────────────┘
```

### 4.5 Setup Tracker Design

```typescript
// electron/main/onboarding/setup-tracker.ts
export interface SetupEvent {
  eventType: 'setup_started' | 'setup_step_completed' | 'setup_completed';
  stepId?: string;
  elapsedMs?: number;
  metadata?: Record<string, unknown>;
}

export function recordSetupEvent(db: Database.Database, event: SetupEvent): void {
  // Insert into setup_tracking table
}

export function getSetupStatus(db: Database.Database): SetupStatus {
  // Read from setup_status table
}

export function markStepComplete(db: Database.Database, stepId: string): void {
  // Update setup_status, record step completion event
}

export function isSetupComplete(db: Database.Database): boolean {
  // Check if all required steps are complete
}
```

### 4.6 Error Recovery Matrix

| Step | Error Condition | Error Message | Recovery Action |
|------|----------------|---------------|-----------------|
| Docker Check | Docker not installed | "Docker is not installed. Please install Docker Desktop." | Link to Docker install page |
| Docker Check | Docker daemon not running | "Docker is not running. Please start Docker Desktop." | Button to retry check |
| n8n Health | Container not found | "n8n container not found. Run `docker compose up -d` to start it." | Button to retry after compose up |
| n8n Health | Container unhealthy | "n8n is starting up. Please wait a moment." | Auto-retry after 5s |
| n8n Health | Container not responding | "n8n is not responding. Try restarting." | "Restart n8n" button |
| API Key | Invalid key format | "Invalid API key format. Please check your key." | Re-focus input field |
| API Key | Key validation failed | "Could not validate API key. Please check your credentials." | Button to retry validation |
| Account Connect | OAuth flow failed | "Google sign-in failed. Please try again." | Button to retry OAuth |
| Account Connect | Network error | "Network error. Check your connection and try again." | Button to retry |

---

## 5. Success Criteria

### 5.1 Functional Criteria

| ID | Criterion | Measurement |
|----|-----------|-------------|
| SC-001 | User can start full stack with `docker compose up -d` | Manual: single command starts n8n |
| SC-002 | Guided wizard walks through all 4 setup steps | Manual: wizard completes end-to-end |
| SC-003 | Setup duration tracked from launch to first triaged email | Query: `setup_tracking` table has events |
| SC-004 | Each step has clear error message and recovery | Manual: trigger each error condition |
| SC-005 | Total setup time under 15 minutes | Measure: `setup_completed` event elapsed_ms < 900000 |
| SC-006 | Existing tests continue to pass | `npm test` passes with no regressions |

### 5.2 Quality Criteria

| ID | Criterion | Measurement |
|----|-----------|-------------|
| QC-001 | Wizard steps are unit tested | Test coverage for `onboarding/` directory |
| QC-002 | Setup tracker is unit tested | Test coverage for `setup-tracker.ts` |
| QC-003 | IPC handlers use Zod validation | Code review: every handler uses safeParse |
| QC-004 | No new lint or type errors | `npm run lint && npm run typecheck` pass |
| QC-005 | Electron tests mock native modules | CDR: rule-testing-platform-mocked |

---

## 6. Test Plan

### 6.1 Unit Tests

| Test | File | Validates |
|------|------|-----------|
| Setup tracker records start event | setup-tracker.test.ts | TIME-001 |
| Setup tracker records step completion | setup-tracker.test.ts | TIME-002 |
| Setup tracker records completion event | setup-tracker.test.ts | TIME-003 |
| Setup status tracks step completion | setup-tracker.test.ts | DB-002 |
| Wizard resumes at incomplete step | setup-handlers.test.ts | REQ-007 |
| Zod validation rejects invalid wizard payloads | setup-handlers.test.ts | SEC-003 |

### 6.2 Integration Tests

| Test | File | Validates |
|------|------|-----------|
| Wizard renders correct step sequence | SetupWizard.test.tsx | REQ-002 |
| Docker check step shows error when Docker unavailable | DockerCheckStep.test.tsx | WIZ-001 |
| API key step validates key format | ApiKeyStep.test.tsx | WIZ-003 |
| Telemetry consent step is preserved | Onboarding.test.tsx | REQ-005 |

### 6.3 Platform-Mocked Tests

Per CDR: rule-testing-platform-mocked, all Electron tests must mock native modules:

```typescript
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  app: { getPath: vi.fn(), whenReady: vi.fn() },
  safeStorage: { encryptString: vi.fn(), decryptString: vi.fn() },
}));
```

---

## 7. Dependencies

| Dependency | Purpose | Version Constraint |
|------------|---------|-------------------|
| electron | Desktop shell | ^33.0.0 |
| better-sqlite3 | SQLite driver | ^11.0.0 |
| zod | IPC payload validation | ^3.23.0 |
| react | Renderer UI | ^19.0.0 |
| typescript | Type safety | ^5.7.0 |
| vitest | Testing | ^3.0.0 |

---

## 8. Open Questions

| ID | Question | Resolution |
|----|----------|------------|
| OQ-001 | Should the wizard auto-advance on success or require user click? | Recommend auto-advance with 1s delay for visual feedback |
| OQ-002 | How should we handle users who already completed partial setup pre-wizard? | Check `setup_status` table; if all steps complete, skip wizard |
| OQ-003 | Should API key validation make a real API call or just format check? | Recommend format check only at onboarding; real validation on first use |
| OQ-004 | What if Docker compose was started manually (not via wizard)? | Wizard detects running container and auto-completes Docker check step |

---

## 9. PDR Traceability

| PDR | Decision | Impact on This Feature |
|-----|----------|----------------------|
| PDR-001 | Electron + LAN | Defines form factor; wizard is desktop-only |
| PDR-002 | BYOK cloud-first | API key setup step requires secure storage |
| PDR-003 | n8n sidecar | Docker check and n8n health steps |
| PDR-006 | V1 success metrics | <15 min setup time is the primary success metric |
| PDR-007 | Gmail-first phasing | First account connection step targets Gmail |

---

## 10. Definition of Done

- [ ] `docker compose up -d` starts the full stack successfully
- [ ] Guided onboarding wizard presents 4 setup steps after telemetry consent
- [ ] Each step has specific error messages and recovery actions
- [ ] Setup duration is tracked and stored in SQLite
- [ ] Returning users skip the wizard if setup is complete
- [ ] Partial setup is resume-able on app relaunch
- [ ] Existing tests pass with no regressions
- [ ] New wizard components have unit tests
- [ ] Setup tracker has unit tests
- [ ] All IPC channels explicitly allowlisted
- [ ] Zod validation on every new IPC handler
- [ ] TypeScript strict mode, no lint errors
- [ ] `npm run lint` and `npm run typecheck` pass
- [ ] Total setup time demonstrably under 15 minutes
