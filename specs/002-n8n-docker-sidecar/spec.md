# Feature Specification: n8n Docker Sidecar

**Feature ID:** 002-n8n-docker-sidecar
**Status:** Draft
**Created:** 2026-08-23
**Milestone:** Alpha (Phase 1)
**PRD References:** PDR-003 (n8n Automation Engine), REQ-020 (n8n Sidecar), REQ-023 (Health Check)

---

## 1. Overview

Add n8n as a hidden Docker sidecar to the Electron productivity dashboard. n8n runs containerized, managed via docker-compose, with no exposed editor UI. The Electron main process monitors n8n health and reports status via IPC.

**Demo Sentence:** User can start the app, n8n container runs in the background, health status is visible in the app, and the container auto-restarts on failure.

---

## 2. Requirements

### 2.1 Core Requirements

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| REQ-001 | docker-compose.yml defines n8n service | Must | Valid docker-compose.yml with n8n service, correct image, volumes, environment |
| REQ-002 | n8n editor not exposed to host | Must | No port mapping for n8n editor (5678) to host; only internal Docker network |
| REQ-003 | Health-check endpoint monitored by app | Must | Electron main process polls n8n health endpoint, reports status via IPC |
| REQ-004 | Auto-restart on failure | Must | Docker Compose `restart: unless-stopped` policy; container restarts on crash |
| REQ-005 | n8n data persisted across restarts | Must | Named volume for n8n data directory mounted in container |
| REQ-006 | Docker Compose started/stopped with app | Must | Main process starts Docker Compose on app launch, stops on quit |

### 2.2 Integration Requirements

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| INT-001 | IPC channel for n8n status | Must | `n8n:status` channel returns container health state |
| INT-002 | IPC channel for n8n start/stop | Should | `n8n:start`, `n8n:stop` channels control container lifecycle |
| INT-003 | Preload allowlist updated | Must | New IPC channels added to ALLOWED_INVOKE set |

### 2.3 Security Requirements

| ID | Requirement | Source | Acceptance Criteria |
|----|-------------|--------|---------------------|
| SEC-001 | n8n not accessible from LAN | PDR-001 | No port mapping to 0.0.0.0; bound to Docker internal network only |
| SEC-002 | Docker socket not exposed | Security by Default | No `-v /var/run/docker.sock` unless strictly required for health checks |
| SEC-003 | n8n credentials not logged | Security by Default | No API keys or credentials in docker-compose.yml logs |

---

## 3. Constraints

### 3.1 Technical Constraints

| Constraint | Rationale |
|------------|-----------|
| Docker must be installed on host | PDR-003: n8n runs as Docker sidecar |
| docker-compose.yml at project root | Standard Docker Compose convention |
| n8n official Docker image | Stability and security updates |
| Electron main process manages lifecycle | Single process manages Docker via CLI |

### 3.2 Non-Goals (This Feature)

| Excluded | Rationale |
|----------|-----------|
| n8n editor UI in Electron | Users interact via app, not n8n editor |
| n8n workflow creation UI | Automation configured via app, not n8n editor |
| Docker Desktop integration | User provides Docker runtime |
| Kubernetes/Swarm deployment | Desktop app scope |
| n8n webhook endpoints | Phase 2+ feature |

---

## 4. Technical Design

### 4.1 docker-compose.yml

```yaml
version: '3.8'

services:
  n8n:
    image: n8nio/n8n:latest
    container_name: productivity-dashboard-n8n
    restart: unless-stopped
    environment:
      - N8N_HOST=0.0.0.0
      - N8N_PORT=5678
      - N8N_PROTOCOL=http
      - WEBHOOK_URL=http://localhost:5678/
      - GENERIC_TIMEZONE=UTC
      - N8N_DIAGNOSTICS_ENABLED=false
      - N8N_PERSONALIZATION_ENABLED=false
      - N8N_HIRING_BANNER_ENABLED=false
    volumes:
      - n8n_data:/home/node/.n8n
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:5678/healthz || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
    networks:
      - n8n_internal

volumes:
  n8n_data:
    driver: local

networks:
  n8n_internal:
    driver: bridge
    internal: true
```

### 4.2 Project Structure

```
alpha/
├── docker-compose.yml                    # NEW: n8n service definition
├── electron/
│   └── main/
│       ├── index.ts                      # MODIFIED: add Docker lifecycle
│       ├── docker/
│       │   ├── index.ts                  # NEW: Docker Compose manager
│       │   ├── compose.ts                # NEW: docker-compose CLI wrapper
│       │   └── health.ts                 # NEW: Health check poller
│       └── ipc/
│           ├── index.ts                  # MODIFIED: register n8n handlers
│           └── n8n-handlers.ts           # NEW: n8n IPC handlers
├── src/
│   └── ...                               # Preload updated with n8n channels
└── specs/
    └── 002-n8n-docker-sidecar/
        └── spec.md                       # THIS FILE
```

### 4.3 Docker Compose Manager

```typescript
// electron/main/docker/compose.ts
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const COMPOSE_FILE = 'docker-compose.yml';
const SERVICE_NAME = 'n8n';

export async function composeUp(composeDir: string): Promise<void> {
  await execFileAsync('docker-compose', ['-f', COMPOSE_FILE, 'up', '-d', SERVICE_NAME], {
    cwd: composeDir,
  });
}

export async function composeDown(composeDir: string): Promise<void> {
  await execFileAsync('docker-compose', ['-f', COMPOSE_FILE, 'down'], {
    cwd: composeDir,
  });
}

export async function composeStatus(composeDir: string): Promise<string> {
  const { stdout } = await execFileAsync('docker-compose', ['-f', COMPOSE_FILE, 'ps', SERVICE_NAME], {
    cwd: composeDir,
  });
  return stdout;
}
```

### 4.4 Health Check Poller

```typescript
// electron/main/docker/health.ts
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export type HealthStatus = 'healthy' | 'unhealthy' | 'starting' | 'unknown';

const CONTAINER_NAME = 'productivity-dashboard-n8n';

export async function checkHealth(): Promise<HealthStatus> {
  try {
    const { stdout } = await execFileAsync('docker', [
      'inspect',
      '--format',
      '{{.State.Health.Status}}',
      CONTAINER_NAME,
    ]);
    return stdout.trim() as HealthStatus;
  } catch {
    return 'unknown';
  }
}

export function startHealthPoller(
  onStatusChange: (status: HealthStatus) => void,
  intervalMs: number = 30000
): NodeJS.Timeout {
  return setInterval(async () => {
    const status = await checkHealth();
    onStatusChange(status);
  }, intervalMs);
}
```

### 4.5 IPC Handlers

```typescript
// electron/main/ipc/n8n-handlers.ts
import type { IpcMain } from 'electron';
import { z } from 'zod';
import { checkHealth } from '../docker/health';
import { composeUp, composeDown } from '../docker/compose';

const N8nStatusResponseSchema = z.object({
  status: z.enum(['healthy', 'unhealthy', 'starting', 'unknown']),
});

const N8nActionResponseSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});

export function registerN8nHandlers(ipcMain: IpcMain, composeDir: string): void {
  ipcMain.handle('n8n:status', async () => {
    const status = await checkHealth();
    return { status };
  });

  ipcMain.handle('n8n:start', async () => {
    await composeUp(composeDir);
    return { success: true };
  });

  ipcMain.handle('n8n:stop', async () => {
    await composeDown(composeDir);
    return { success: true };
  });
}
```

### 4.6 Modified Main Process

```typescript
// electron/main/index.ts (additions)
import { registerN8nHandlers } from './ipc/n8n-handlers';
import { startHealthPoller } from './docker/health';
import { composeUp, composeDown } from './docker/compose';

// In app.whenReady():
const composeDir = join(__dirname, '../../..'); // project root
await composeUp(composeDir);
startHealthPoller((status) => {
  mainWindow?.webContents.send('n8n:health', status);
});
registerN8nHandlers(ipcMain, composeDir);

// In app.on('will-quit'):
await composeDown(composeDir);
```

---

## 5. Success Criteria

### 5.1 Functional Criteria

| ID | Criterion | Measurement |
|----|-----------|-------------|
| SC-001 | docker-compose.yml is valid | `docker-compose config` passes |
| SC-002 | n8n container starts | `docker ps` shows running container |
| SC-003 | n8n health check works | `docker inspect` shows healthy status |
| SC-004 | n8n editor not accessible from host | `curl localhost:5678` fails |
| SC-005 | Container auto-restarts | Kill container, verify restart |
| SC-006 | IPC returns health status | App receives n8n:health updates |

### 5.2 Security Criteria

| ID | Criterion | Measurement |
|----|-----------|-------------|
| SEC-SC-001 | No host port mapping | Code review: docker-compose.yml |
| SEC-SC-002 | Internal network only | Code review: network config |
| SEC-SC-003 | No credentials in logs | Code review: compose file |

---

## 6. Test Plan

### 6.1 Unit Tests

| Test | File | Validates |
|------|------|-----------|
| composeUp runs docker-compose | docker/compose.test.ts | REQ-001 |
| composeDown stops container | docker/compose.test.ts | REQ-006 |
| checkHealth returns status | docker/health.test.ts | REQ-003 |
| IPC handler returns status | ipc/n8n-handlers.test.ts | INT-001 |

### 6.2 Integration Tests

| Test | File | Validates |
|------|------|-----------|
| Container starts with compose | docker/integration.test.ts | REQ-001, REQ-004 |
| Health check poller updates | docker/health.test.ts | REQ-003 |
| IPC channel in allowlist | preload/index.test.ts | INT-003 |

---

## 7. Dependencies

| Dependency | Purpose | Version Constraint |
|------------|---------|-------------------|
| docker | Container runtime | User-provided |
| docker-compose | Container orchestration | User-provided |
| n8nio/n8n | Workflow automation | latest |

---

## 8. Open Questions

| ID | Question | Resolution |
|----|----------|------------|
| OQ-001 | Should we pin n8n version? | Recommend pinning to specific version for stability |
| OQ-002 | Docker vs docker-compose binary? | Use `docker compose` (v2 plugin) if available, fallback to `docker-compose` |
| OQ-003 | Health check interval? | 30s default, configurable via environment variable |

---

## 9. PDR Traceability

| PDR | Decision | Impact on This Feature |
|-----|----------|----------------------|
| PDR-003 | n8n as Docker sidecar | Defines the container approach |
| PDR-001 | Electron + LAN | n8n must not be exposed to LAN |
| PDR-006 | <15 min setup | Docker compose must be simple |

---

## 10. Definition of Done

- [ ] docker-compose.yml exists with valid n8n service
- [ ] n8n container starts and shows healthy
- [ ] n8n editor not accessible from host
- [ ] Container auto-restarts on failure
- [ ] Health status available via IPC
- [ ] Preload allowlist includes n8n channels
- [ ] Unit tests pass for Docker modules
- [ ] `npm run lint` and `npm run typecheck` pass
