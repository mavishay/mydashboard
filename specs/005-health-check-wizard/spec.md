# Feature Specification: Health-Check Wizard

**Feature ID:** 005-health-check-wizard
**Status:** Draft
**Created:** 2026-08-25
**Milestone:** Beta (Phase 2)
**PRD References:** PDR-003 (n8n Automation Engine), REQ-023 (Health Check Wizard)
**Issue:** #10

---

## 1. Overview

Display n8n sidecar health status in the app UI with a persistent status bar indicator, a step-by-step Docker health-check wizard, clear error messages when n8n is down, and an auto-restart suggestion. The existing health poller and IPC infrastructure are reused; this feature adds the renderer-side UI.

**Demo Sentence:** User sees n8n health status in the dashboard header, can open a health-check wizard that guides them through Docker verification, receives clear error messages when n8n is unhealthy, and can restart n8n with one click.

---

## 2. Requirements

### 2.1 Core Requirements

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| REQ-001 | StatusBar component shows n8n heartbeat | Must | Color-coded indicator (green=healthy, yellow=starting, red=unhealthy, gray=unknown) visible in dashboard header at all times |
| REQ-002 | HealthCheckWizard guides Docker verification | Must | Modal/panel with step-by-step checks: Docker running, container exists, container healthy, n8n responding |
| REQ-003 | Clear error messages when n8n is down | Must | User-facing message explains what's wrong and what to do (e.g., "Docker is not running. Please start Docker Desktop.") |
| REQ-004 | Auto-restart suggestion | Must | When n8n is unhealthy, show "Restart n8n" button that calls `n8n:start` IPC |
| REQ-005 | Status updates in real-time | Must | StatusBar reflects health changes from the 30s poller without page refresh |

### 2.2 Integration Requirements

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| INT-001 | Reuse existing n8n:health push channel | Must | No new IPC push channels needed; renderer listens to existing `n8n:health` |
| INT-002 | Reuse existing n8n:start IPC | Must | Auto-restart button calls `n8n:start` (already in preload allowlist) |
| INT-003 | Docker status check IPC | Should | New `n8n:docker-status` invoke channel returns whether Docker daemon is reachable |

### 2.3 Security Requirements

| ID | Requirement | Source | Acceptance Criteria |
|----|-------------|--------|---------------------|
| SEC-001 | No new privileged operations | Security by Default | Wizard only reads Docker status, does not execute privileged commands |
| SEC-002 | IPC channels properly allowlisted | contextBridge rule | All new channels added to ALLOWED_INVOKE/ALLOWED_ON sets |

---

## 3. Constraints

### 3.1 Technical Constraints

| Constraint | Rationale |
|------------|-----------|
| Inline styles only (no CSS/Tailwind) | Existing pattern: all components use `style={{...}}` objects |
| No new npm dependencies | Reuse existing React + Zod + Electron APIs |
| Follow IPC patterns exactly | contextBridge allowlist + register*Handlers(deps) + Zod validation |
| Reuse existing health poller | 30s interval at `electron/main/docker/health.ts` already works |

### 3.2 Non-Goals (This Feature)

| Excluded | Rationale |
|----------|-----------|
| n8n workflow management UI | Hidden sidecar by design (PDR-003) |
| Docker Compose configuration editor | Out of scope for health monitoring |
| Push notifications for health changes | Status bar is sufficient for v1 |
| Historical health metrics | No database schema changes needed |

---

## 4. Technical Design

### 4.1 Component Architecture

```
Dashboard.tsx
  ├── StatusBar.tsx          (NEW: persistent health indicator in header)
  └── HealthCheckWizard.tsx  (NEW: modal with step-by-step checks)
```

### 4.2 StatusBar Component

**File:** `src/components/StatusBar.tsx`

Displays a small color-coded dot + text label in the dashboard header:

| Status | Color | Label | Icon |
|--------|-------|-------|------|
| healthy | `#22c55e` (green) | "n8n: Running" | ● |
| unhealthy | `#ef4444` (red) | "n8n: Unhealthy" | ● |
| starting | `#f59e0b` (amber) | "n8n: Starting" | ● |
| unknown | `#9ca3af` (gray) | "n8n: Unknown" | ● |

Props: `{ status: string; onClick: () => void }` — clicking opens the wizard.

### 4.3 HealthCheckWizard Component

**File:** `src/components/HealthCheckWizard.tsx`

A modal overlay with step-by-step Docker health checks:

**Steps:**
1. **Docker Daemon** — Check if Docker is running (`n8n:docker-status` IPC)
2. **Container Exists** — Check if `productivity-dashboard-n8n` container exists
3. **Container Healthy** — Check Docker health status
4. **n8n Responding** — Check n8n HTTP health endpoint

**Each step shows:**
- Step number and title
- Status: pending / checking / passed / failed
- Error message if failed
- Suggested action if failed

**Footer:**
- "Restart n8n" button (calls `n8n:start`, visible when unhealthy)
- "Close" button

### 4.4 New IPC Channel: n8n:docker-status

**File:** `electron/main/ipc/n8n-handlers.ts` (add handler)

```typescript
ipcMain.handle('n8n:docker-status', async () => {
  try {
    await execFileAsync('docker', ['info', '--format', '{{.ServerVersion}}']);
    return { available: true };
  } catch {
    return { available: false, error: 'Docker daemon is not running' };
  }
});
```

**Zod schema:**
```typescript
const N8nDockerStatusSchema = z.object({
  available: z.boolean(),
  error: z.string().optional(),
});
```

### 4.5 Preload Updates

**File:** `electron/preload/index.ts`

Add to `ALLOWED_INVOKE`:
```typescript
'n8n:docker-status',
```

Add to `n8n` namespace:
```typescript
dockerStatus: () => gatedInvoke('n8n:docker-status') as Promise<{ available: boolean; error?: string }>,
```

### 4.6 Type Updates

**File:** `electron/preload/types.d.ts`

Add to `ElectronAPI.n8n`:
```typescript
dockerStatus: () => Promise<{ available: boolean; error?: string }>;
```

### 4.7 Dashboard Integration

**File:** `src/components/Dashboard.tsx`

- Import `StatusBar` and `HealthCheckWizard`
- Add `n8nStatus` state, initialized via `n8n:status` IPC
- Listen to `n8n:health` push events to update state
- Render `StatusBar` in header row
- Render `HealthCheckWizard` as modal when `showWizard` is true

### 4.8 Project Structure

```
alpha/
├── electron/
│   └── main/
│       └── ipc/
│           └── n8n-handlers.ts        # MODIFIED: add n8n:docker-status handler
├── electron/
│   └── preload/
│       ├── index.ts                   # MODIFIED: add n8n:docker-status to allowlist
│       └── types.d.ts                 # MODIFIED: add dockerStatus type
├── src/
│   └── components/
│       ├── Dashboard.tsx              # MODIFIED: add StatusBar + wizard state
│       ├── StatusBar.tsx              # NEW: health indicator component
│       └── HealthCheckWizard.tsx      # NEW: step-by-step wizard modal
└── tests/
    └── main/
        └── ipc/
            └── n8n-handlers.test.ts   # MODIFIED: add docker-status test
```

---

## 5. Success Criteria

### 5.1 Functional Criteria

| ID | Criterion | Measurement |
|----|-----------|-------------|
| SC-001 | StatusBar visible in dashboard header | Visual inspection |
| SC-002 | Status color matches health state | Manual test: stop/start n8n, verify colors |
| SC-003 | Wizard opens on status click | Click status bar, verify modal appears |
| SC-004 | Wizard steps run sequentially | Each step shows checking/passed/failed |
| SC-005 | Restart button restarts n8n | Click restart, verify container comes up |
| SC-006 | Error messages are clear | Non-technical user can understand what to do |

### 5.2 Security Criteria

| ID | Criterion | Measurement |
|----|-----------|-------------|
| SEC-SC-001 | All IPC channels allowlisted | Code review: preload/index.ts |
| SEC-SC-002 | Zod validation on all payloads | Code review: n8n-handlers.ts |

---

## 6. Test Plan

### 6.1 Unit Tests

| Test | File | Validates |
|------|------|-----------|
| StatusBar renders correct color for each status | tests/components/StatusBar.test.tsx | REQ-001 |
| HealthCheckWizard renders step list | tests/components/HealthCheckWizard.test.tsx | REQ-002 |
| n8n:docker-status handler returns available=true | tests/main/ipc/n8n-handlers.test.ts | INT-003 |
| n8n:docker-status handler returns available=false | tests/main/ipc/n8n-handlers.test.ts | INT-003 |
| n8n:docker-status in preload allowlist | tests/preload/index.test.ts | SEC-002 |

### 6.2 Integration Tests

| Test | File | Validates |
|------|------|-----------|
| StatusBar updates on n8n:health push | tests/integration/health-wizard.test.ts | REQ-005 |
| Wizard restart triggers n8n:start | tests/integration/health-wizard.test.ts | REQ-004 |

---

## 7. Dependencies

| Dependency | Purpose | Version Constraint |
|------------|---------|-------------------|
| Existing health poller | Reuses 30s interval | No change |
| Existing n8n:start/stop IPC | Reuses restart mechanism | No change |
| Docker CLI | docker info for daemon check | User-provided |

---

## 8. PDR Traceability

| PDR | Decision | Impact on This Feature |
|-----|----------|----------------------|
| PDR-003 | n8n as Docker sidecar | Health monitoring is for the Docker container |
| PDR-001 | Electron + LAN | UI runs in Electron renderer process |
| PDR-006 | <15 min setup | Health wizard reduces setup friction |

---

## 9. Definition of Done

- [ ] StatusBar component renders in dashboard header with correct colors
- [ ] HealthCheckWizard modal opens on status click
- [ ] Wizard steps check Docker daemon, container, health, n8n endpoint
- [ ] Clear error messages displayed for each failure mode
- [ ] Restart button calls n8n:start IPC
- [ ] n8n:docker-status IPC channel added with Zod validation
- [ ] Preload allowlist updated
- [ ] TypeScript types updated
- [ ] Unit tests pass
- [ ] `npm run lint` and `npm run typecheck` pass
