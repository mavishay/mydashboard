# Feature Specification: Replace n8n Docker Sidecar with In-App Services

**Feature ID:** 036-in-app-services
**Status:** Draft
**Created:** 2026-08-31
**Milestone:** Alpha (Phase 1)
**Issue:** #36
**PRD References:** PDR-003 (Automation Engine — superseded by in-app cron), REQ-020 (n8n Sidecar — replaced), REQ-023 (Health Check — replaced)

---

## 1. Overview

Replace the n8n Docker sidecar with an in-app service registry and status monitoring system. The existing `CronScheduler` already handles email fetch/classify/cleanup without Docker. `GoogleTasksSync` and `TickTickSync` already run in-app. This feature formalizes those services into a unified registry, removes Docker as a hard prerequisite, and replaces the Docker-specific health check UI with a service status dashboard.

**Demo Sentence:** User launches the app with zero prerequisites (no Docker), sees all background services running in the status bar, and cron schedules persist across restarts.

---

## 2. Requirements

### 2.1 Core Requirements

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| REQ-001 | Service registry tracks all background services | Must | A `ServiceRegistry` class manages service lifecycle (start/stop/status) for cron, Google Tasks sync, TickTick sync |
| REQ-002 | Service status exposed via IPC | Must | `services:status` channel returns array of `{ id, name, status, lastError, startedAt }` |
| REQ-003 | Service status visible in UI status bar | Must | StatusBar shows service count and aggregate health instead of Docker/n8n status |
| REQ-004 | Docker is no longer a hard prerequisite | Must | App starts and runs all services without Docker installed |
| REQ-005 | Cron schedules persist across restarts | Must | CronScheduler already persists in `cron_state` table; verified on restart |
| REQ-006 | Remove Docker-sidecar-specific code | Must | `electron/main/docker/` directory removed; `n8n-handlers.ts` removed; `docker-compose.yml` removed or deprecated |
| REQ-007 | Remove Docker/n8n from onboarding flow | Must | Onboarding wizard no longer has Docker Check or n8n Health steps |
| REQ-008 | Existing tests continue to pass | Must | All non-Docker tests pass; Docker-specific tests removed or migrated |

### 2.2 Integration Requirements

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| INT-001 | IPC channel for service status | Must | `services:status` in ALLOWED_INVOKE; returns typed array |
| INT-002 | IPC channel for service start/stop | Should | `services:start`, `services:stop` in ALLOWED_INVOKE |
| INT-003 | Preload allowlist updated | Must | n8n channels removed, service channels added |
| INT-004 | Onboarding step IDs updated | Must | `docker-check` and `n8n-health` steps removed from STEP_IDS; onboarding status schema updated |

### 2.3 Migration Requirements

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| MIG-001 | Existing n8n Docker users get graceful migration | Must | If `docker-compose.yml` exists, log info message; no crash; Docker processes not spawned |
| MIG-002 | Onboarding state migrated | Must | Users who completed Docker/n8n steps are treated as having completed equivalent service-check steps |
| MIG-003 | No Docker processes spawned after migration | Must | `composeUp` never called; `docker` CLI never invoked |

---

## 3. Constraints

### 3.1 Technical Constraints

| Constraint | Rationale |
|------------|-----------|
| Electron 33 + React 19 + TypeScript 5.7 | Existing stack |
| CronScheduler already works without Docker | Email fetch/classify runs in-app |
| GoogleTasksSync and TickTickSync already in-app | No Docker dependency for task sync |
| SQLite schema version 19 | Schema migrations required for any new tables |
| Vitest 3 for testing | Existing test framework |
| Zod validation on IPC payloads | Team convention |

### 3.2 Non-Goals (This Feature)

| Excluded | Rationale |
|----------|-----------|
| New background services beyond formalizing existing | Scope control |
| Cron scheduling logic changes | CronScheduler works; don't break it |
| Task sync algorithm changes | GoogleTasksSync and TickTickSync are stable |
| n8n workflow capabilities | n8n is being removed, not replaced feature-for-feature |
| Docker as optional dependency | Docker is fully removed as prerequisite |

---

## 4. Technical Design

### 4.1 Service Registry

```typescript
// electron/main/services/service-registry.ts
import type Database from 'better-sqlite3';
import type { CronScheduler } from '../cron/cron-scheduler';

export type ServiceStatus = 'running' | 'stopped' | 'error' | 'starting';

export interface ServiceInfo {
  id: string;
  name: string;
  status: ServiceStatus;
  lastError: string | null;
  startedAt: string | null;
}

export interface ManagedService {
  id: string;
  name: string;
  start(): Promise<void>;
  stop(): void;
  getStatus(): ServiceStatus;
  getLastError(): string | null;
}

export class ServiceRegistry {
  private services = new Map<string, ManagedService>();

  register(service: ManagedService): void {
    this.services.set(service.id, service);
  }

  async startAll(): Promise<void> {
    for (const service of this.services.values()) {
      try {
        await service.start();
      } catch (err) {
        console.error(`[ServiceRegistry] Failed to start ${service.id}:`, err);
      }
    }
  }

  stopAll(): void {
    for (const service of this.services.values()) {
      service.stop();
    }
  }

  getStatus(): ServiceInfo[] {
    return Array.from(this.services.values()).map((s) => ({
      id: s.id,
      name: s.name,
      status: s.getStatus(),
      lastError: s.getLastError(),
      startedAt: null, // tracked by individual services
    }));
  }
}
```

### 4.2 Service Wrappers

Each existing service gets a thin `ManagedService` adapter:

```typescript
// electron/main/services/cron-service.ts
import type { CronScheduler } from '../cron/cron-scheduler';
import type { ManagedService, ServiceStatus } from './service-registry';

export class CronService implements ManagedService {
  id = 'cron';
  name = 'Email Auto-Fetch';
  private status: ServiceStatus = 'stopped';
  private lastError: string | null = null;

  constructor(private scheduler: CronScheduler) {}

  async start(): Promise<void> {
    this.status = 'starting';
    try {
      this.scheduler.start();
      this.status = 'running';
    } catch (err) {
      this.status = 'error';
      this.lastError = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  stop(): void {
    this.scheduler.stop();
    this.status = 'stopped';
  }

  getStatus(): ServiceStatus { return this.status; }
  getLastError(): string | null { return this.lastError; }
}
```

Similar wrappers for `GoogleTasksSyncService` and `TickTickSyncService`.

### 4.3 Updated IPC Handlers

```typescript
// electron/main/ipc/service-handlers.ts
import type { IpcMain } from 'electron';
import { z } from 'zod';
import type { ServiceRegistry } from '../services/service-registry';

const ServiceInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(['running', 'stopped', 'error', 'starting']),
  lastError: z.string().nullable(),
  startedAt: z.string().nullable(),
});

const ServiceStatusResponseSchema = z.object({
  services: z.array(ServiceInfoSchema),
});

export function registerServiceHandlers(
  ipcMain: IpcMain,
  registry: ServiceRegistry,
): void {
  ipcMain.handle('services:status', async () => {
    return ServiceStatusResponseSchema.parse({
      services: registry.getStatus(),
    });
  });

  ipcMain.handle('services:start', async () => {
    await registry.startAll();
    return ServiceStatusResponseSchema.parse({
      services: registry.getStatus(),
    });
  });

  ipcMain.handle('services:stop', async () => {
    registry.stopAll();
    return ServiceStatusResponseSchema.parse({
      services: registry.getStatus(),
    });
  });
}
```

### 4.4 Updated Preload Allowlist

```typescript
// electron/preload/index.ts changes
const ALLOWED_INVOKE = new Set([
  // ... existing channels minus n8n ones ...
  'services:status',
  'services:start',
  'services:stop',
  // n8n:status, n8n:start, n8n:stop, n8n:docker-status REMOVED
] as const);

const ALLOWED_ON = new Set([
  // ... existing channels minus n8n ones ...
  'services:status-update',
  // n8n:health REMOVED
] as const);
```

### 4.5 Updated Main Process

```typescript
// electron/main/index.ts changes
// REMOVE:
// - import { composeUp, composeDown } from './docker/compose';
// - import { startHealthPoller } from './docker/health';
// - composeUp(composeDir) call
// - startHealthPoller call
// - composeDown(composeDir) call
// - healthPoller variable

// ADD:
import { ServiceRegistry } from './services/service-registry';
import { CronService } from './services/cron-service';
import { registerServiceHandlers } from './ipc/service-handlers';

const serviceRegistry = new ServiceRegistry();

// In app.whenReady():
const cronService = new CronService(cronScheduler);
serviceRegistry.register(cronService);
// Register sync services similarly
await serviceRegistry.startAll();
registerServiceHandlers(ipcMain, serviceRegistry);

// In app.on('will-quit'):
serviceRegistry.stopAll();
// No composeDown call
```

### 4.6 Removed Files

| File | Action | Rationale |
|------|--------|-----------|
| `electron/main/docker/compose.ts` | DELETE | Docker compose wrapper no longer needed |
| `electron/main/docker/health.ts` | DELETE | Docker health check no longer needed |
| `electron/main/docker/utils.ts` | DELETE | `which` utility for Docker binary no longer needed |
| `electron/main/docker/index.ts` | DELETE | Barrel export for removed modules |
| `electron/main/ipc/n8n-handlers.ts` | DELETE | n8n IPC handlers replaced by service handlers |
| `docker-compose.yml` | DELETE or MOVE to `docs/migration/` | No longer required; kept for reference |
| `tests/main/ipc/n8n-handlers.test.ts` | DELETE | Tests for removed handlers |
| `src/components/SetupWizard/DockerCheckStep.tsx` | DELETE | Docker check removed from onboarding |
| `src/components/SetupWizard/N8nHealthStep.tsx` | DELETE | n8n health removed from onboarding |

### 4.7 Updated UI Components

#### StatusBar (simplified)

```typescript
// src/components/StatusBar.tsx
interface StatusBarProps {
  services: Array<{ id: string; name: string; status: string }>;
  onClick: () => void;
  dndEnabled: boolean;
  cronStatus?: { enabled: boolean; lastMode: string; config: { workIntervalSeconds: number; offHoursIntervalSeconds: number } } | null;
}

// Replace Docker/n8n status indicator with service count
const runningCount = services.filter(s => s.status === 'running').length;
const hasErrors = services.some(s => s.status === 'error');
const statusColor = hasErrors ? '#ef4444' : runningCount > 0 ? '#22c55e' : '#9ca3af';
const statusLabel = `${runningCount}/${services.length} services`;
```

#### SetupWizard (simplified)

Remove Docker Check and n8n Health steps:

```typescript
// src/components/SetupWizard/SetupWizard.tsx
const STEP_IDS = ['api-key', 'account-connect', 'setup-complete'];
// Previously: ['docker-check', 'n8n-health', 'api-key', 'account-connect', 'setup-complete']
```

#### HealthCheckWizard (replaced)

Replace Docker-specific health checks with service status display:

```typescript
// src/components/ServiceStatusPanel.tsx
// Shows list of services with their status, errors, and restart buttons
// Replaces the Docker-specific HealthCheckWizard modal
```

#### Dashboard (updated)

Replace n8n-specific state management with service registry:

```typescript
// src/components/Dashboard.tsx
// REMOVE: n8nStatus state, handleRestart for n8n
// ADD: services state from services:status IPC
```

### 4.8 Updated Onboarding Status

```typescript
// electron/main/onboarding/setup-tracker.ts
// The onboarding status type changes:
interface SetupStatus {
  // dockerCheckComplete: boolean;  // REMOVED
  // n8nHealthComplete: boolean;    // REMOVED
  servicesReady: boolean;           // NEW: replaces both Docker/n8n steps
  apiKeyComplete: boolean;
  accountConnected: boolean;
  setupCompletedAt: string | null;
}
```

### 4.9 Project Structure (After)

```
alpha/
├── electron/
│   └── main/
│       ├── index.ts                      # MODIFIED: remove Docker lifecycle, add ServiceRegistry
│       ├── services/
│       │   ├── service-registry.ts       # NEW: unified service management
│       │   ├── cron-service.ts           # NEW: ManagedService adapter for CronScheduler
│       │   ├── google-tasks-service.ts   # NEW: ManagedService adapter for GoogleTasksSync
│       │   ├── ticktick-service.ts       # NEW: ManagedService adapter for TickTickSync
│       │   ├── notification-service.ts   # EXISTING: unchanged
│       │   ├── feedback-service.ts       # EXISTING: unchanged
│       │   └── quiet-hours-service.ts    # EXISTING: unchanged
│       ├── cron/                         # EXISTING: unchanged
│       ├── ipc/
│       │   ├── index.ts                  # MODIFIED: remove registerN8nHandlers, add registerServiceHandlers
│       │   ├── service-handlers.ts       # NEW: replaces n8n-handlers.ts
│       │   └── ...                       # other handlers unchanged
│       ├── sync/                         # EXISTING: unchanged
│       └── docker/                       # DELETED
├── src/
│   └── components/
│       ├── StatusBar.tsx                 # MODIFIED: service count instead of n8n status
│       ├── Dashboard.tsx                 # MODIFIED: service registry state
│       ├── ServiceStatusPanel.tsx        # NEW: replaces HealthCheckWizard
│       └── SetupWizard/
│           ├── SetupWizard.tsx           # MODIFIED: remove Docker/n8n steps
│           └── ...                       # DockerCheckStep.tsx, N8nHealthStep.tsx DELETED
├── docker-compose.yml                    # DELETED (or moved to docs/migration/)
└── specs/
    └── 036-in-app-services/
        └── spec.md                       # THIS FILE
```

---

## 5. Success Criteria

### 5.1 Functional Criteria

| ID | Criterion | Measurement |
|----|-----------|-------------|
| SC-001 | App starts without Docker | Launch app with Docker uninstalled; all services start |
| SC-002 | Cron schedules persist across restarts | Start cron, restart app, verify cron resumes |
| SC-003 | Service status visible in UI | StatusBar shows "X/Y services" with color indicator |
| SC-004 | No Docker processes spawned | Monitor system processes during app lifecycle |
| SC-005 | All existing tests pass | `npm run test` passes (minus removed Docker tests) |
| SC-006 | Existing n8n users get info message | If docker-compose.yml exists, app logs migration notice |

### 5.2 Quality Criteria

| ID | Criterion | Measurement |
|----|-----------|-------------|
| QC-001 | No lint errors | `npm run lint` passes |
| QC-002 | TypeScript compiles | `npm run typecheck` passes |
| QC-003 | Service registry has unit tests | 100% coverage for service-registry.ts |
| QC-004 | IPC handlers have unit tests | Tests for service-handlers.ts |
| QC-005 | Zod validation on IPC payloads | Code review: all handlers use safeParse |

---

## 6. Test Plan

### 6.1 Unit Tests

| Test | File | Validates |
|------|------|-----------|
| ServiceRegistry registers services | services/service-registry.test.ts | REQ-001 |
| ServiceRegistry startAll starts all services | services/service-registry.test.ts | REQ-001 |
| ServiceRegistry stopAll stops all services | services/service-registry.test.ts | REQ-001 |
| ServiceRegistry getStatus returns all services | services/service-registry.test.ts | REQ-002 |
| CronService wraps CronScheduler | services/cron-service.test.ts | REQ-001 |
| IPC handler returns service status | ipc/service-handlers.test.ts | INT-001 |
| Preload allowlist blocks n8n channels | preload/index.test.ts | INT-003 |
| Preload allowlist allows service channels | preload/index.test.ts | INT-003 |

### 6.2 Integration Tests

| Test | File | Validates |
|------|------|-----------|
| App starts without Docker | main/index.test.ts | SC-001 |
| Onboarding skips Docker/n8n steps | components/setup-wizard.test.ts | REQ-007 |
| StatusBar shows service count | components/status-bar.test.ts | REQ-003 |

### 6.3 Removed Tests

| Test | File | Reason |
|------|------|--------|
| n8n:status handler | ipc/n8n-handlers.test.ts | Handler removed |
| n8n:start handler | ipc/n8n-handlers.test.ts | Handler removed |
| n8n:stop handler | ipc/n8n-handlers.test.ts | Handler removed |
| n8n:docker-status handler | ipc/n8n-handlers.test.ts | Handler removed |
| Docker composeUp | docker/compose.test.ts | Module removed |
| Docker composeDown | docker/compose.test.ts | Module removed |
| Docker checkHealth | docker/health.test.ts | Module removed |

---

## 7. Dependencies

| Dependency | Purpose | Version Constraint |
|------------|---------|-------------------|
| electron | Desktop shell | ^33.0.0 |
| better-sqlite3 | SQLite driver (cron_state persistence) | ^11.0.0 |
| zod | IPC payload validation | ^3.23.0 |
| react | Renderer UI | ^19.0.0 |
| typescript | Type safety | ^5.7.0 |
| vitest | Testing | ^3.0.0 |

---

## 8. Migration Guide

### 8.1 For Existing n8n Docker Users

1. **Automatic**: App detects `docker-compose.yml` and logs: "Docker sidecar is no longer required. Background services now run in-app."
2. **Manual cleanup** (optional): Users can remove `docker-compose.yml` and stop any running n8n containers:
   ```bash
   docker compose down --remove-orphans
   docker volume rm alpha_n8n_data
   ```
3. **No data loss**: Email data is in SQLite, not n8n. Task sync data is in SQLite. Cron state persists.

### 8.2 For New Users

No Docker installation required. App works out of the box.

---

## 9. Open Questions

| ID | Question | Resolution |
|----|----------|------------|
| OQ-001 | Should we keep docker-compose.yml in docs/migration/ for reference? | Yes, move to docs/migration/ with deprecation notice |
| OQ-002 | What happens to the n8n:health event listener in Dashboard? | Replace with services:status-update event |
| OQ-003 | Should ServiceStatusPanel be a modal or inline panel? | Modal (matches current HealthCheckWizard pattern) |
| OQ-004 | Do we need a database migration for onboarding status schema change? | No — onboarding status is computed from setup_events table, not a fixed schema |

---

## 10. PDR Traceability

| PDR | Decision | Impact on This Feature |
|-----|----------|----------------------|
| PDR-003 | n8n as Docker sidecar | SUPERSEDED: Automation now runs in-app via CronScheduler |
| PDR-001 | Electron + LAN | Unchanged: app is still Electron desktop |
| PDR-006 | <15 min setup | IMPROVED: No Docker prerequisite reduces setup friction |

---

## 11. Definition of Done

- [ ] `electron/main/docker/` directory deleted
- [ ] `docker-compose.yml` deleted or moved to docs/migration/
- [ ] `n8n-handlers.ts` deleted and replaced by `service-handlers.ts`
- [ ] `ServiceRegistry` class implemented with unit tests
- [ ] `CronService`, `GoogleTasksSyncService`, `TickTickSyncService` adapters implemented
- [ ] Preload allowlist updated (n8n channels removed, service channels added)
- [ ] StatusBar updated to show service count
- [ ] SetupWizard updated (Docker/n8n steps removed)
- [ ] HealthCheckWizard replaced by ServiceStatusPanel
- [ ] Dashboard updated to use service registry
- [ ] Onboarding status schema updated
- [ ] All existing tests pass (minus removed Docker tests)
- [ ] New service tests pass
- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] App starts without Docker installed
- [ ] No Docker processes spawned during app lifecycle
