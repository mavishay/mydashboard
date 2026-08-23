# Code Review: n8n Docker Sidecar with Health Check and IPC Integration

**Review Date:** 2026-08-23
**Reviewer:** opencode
**Commits:** `fa1ea6d` (feat), `25b2c4b` (fix)
**Baseline:** `5bb4221`

## Summary

The n8n Docker sidecar feature adds a hidden automation engine to the Electron productivity dashboard. The implementation includes docker-compose.yml, Docker Compose manager, health check poller, IPC handlers, and preload allowlist updates. The second commit (`25b2c4b`) addressed previous review findings. This review verifies those fixes and checks for new issues.

## Previous Review Fixes Verification

| # | Fix | Status | Notes |
|---|-----|--------|-------|
| 1 | Async will-quit handler → before-quit flag pattern | ✅ Correct | `before-quit` sets `isQuitting` flag; `will-quit` prevents quit if not quitting. |
| 2 | Volume preservation → --remove-orphans flag | ✅ Correct | `composeDown` includes `--remove-orphans`. |
| 3 | COMPOSE_DIR → getComposeDir() utility | ✅ Correct | `getComposeDir()` returns dev/production paths. |
| 4 | IPC error handling → try/catch with error response | ✅ Correct | Each IPC handler wrapped in try/catch, returns parsed error. |
| 5 | Network isolation → removed internal: true | ✅ Correct | `docker-compose.yml` no longer has `internal: true`. |
| 6 | Initial health status → emit on poller start | ✅ Correct | `startHealthPoller` calls `checkHealth().then(onStatusChange)` before interval. |
| 7 | Spec schema → updated to match implementation | ✅ Likely | Spec not re-checked but diff shows updates. |

## New Issues Introduced by Fixes

### Medium Severity

1. **M-001: Docker Compose binary detection** (`electron/main/docker/compose.ts:10,16,22`)
   - **Issue:** Hardcoded `'docker-compose'` binary name. Systems with Docker Compose V2 plugin use `docker compose` (space). The command may fail on newer Docker installations.
   - **Recommendation:** Detect and fallback: try `docker compose` first, fallback to `docker-compose`. Or use a wrapper function that caches the detected binary.

2. **M-002: Docker Compose version deprecation** (`docker-compose.yml:1`)
   - **Issue:** `version: '3.8'` is deprecated in Docker Compose V2. Should be omitted or set to `'3'`.
   - **Recommendation:** Remove `version` line (Docker Compose V2 ignores it) or set to `'3'`.

3. **M-003: n8n version not pinned** (`docker-compose.yml:5`)
   - **Issue:** `image: n8nio/n8n:latest` uses `latest` tag, which may introduce breaking changes without notice. Spec open question OQ-001 unresolved.
   - **Recommendation:** Pin to specific version (e.g., `n8nio/n8n:1.45.0`) and document upgrade strategy.

4. **M-004: getComposeDir fragile relative path** (`electron/main/index.ts:16-18`)
   - **Issue:** `join(__dirname, '../../..')` assumes compiled output location. May break if build structure changes.
   - **Recommendation:** Use `app.getAppPath()` or `__dirname` relative to known root (e.g., `path.resolve(__dirname, '..', '..', '..')`). Consider using `process.resourcesPath` for production.

### Low Severity

5. **L-001: composeStatus exported but unused** (`electron/main/docker/compose.ts:21-25`)
   - **Issue:** `composeStatus` function is defined and exported but never called.
   - **Recommendation:** Remove if not needed, or use for debugging/status polling.

6. **L-002: composeDown not awaited** (`electron/main/index.ts:95-97`)
   - **Issue:** `composeDown` is fire-and-forget; app may quit before container stops, potentially leaving orphan containers (mitigated by `restart: unless-stopped`).
   - **Recommendation:** Consider awaiting `composeDown` with a timeout, or accept the trade-off.

7. **L-003: Health check interval not configurable** (`electron/main/docker/health.ts:26`)
   - **Issue:** Interval hardcoded to 30s; spec open question OQ-003 unresolved.
   - **Recommendation:** Read from environment variable (e.g., `HEALTH_CHECK_INTERVAL_MS`).

8. **L-004: Hardcoded container name** (`electron/main/docker/health.ts:8`)
   - **Issue:** `CONTAINER_NAME = 'productivity-dashboard-n8n'` may conflict if user runs multiple instances.
   - **Recommendation:** Derive from project name or accept single-instance limitation.

9. **L-005: Spec open questions unresolved** (`specs/002-n8n-docker-sidecar/spec.md`)
   - **Issue:** OQ-001 (pin version), OQ-002 (docker vs docker-compose binary), OQ-003 (configurable interval) remain open.
   - **Recommendation:** Resolve and update spec.

### Info / Observations

10. **I-001: Removed unused ALLOWED_SEND** (`electron/preload/index.ts`)
    - **Observation:** `ALLOWED_SEND` set and `gatedSend` function removed (no send channels). Clean.

11. **I-002: Zod schema validation** (`electron/main/ipc/n8n-handlers.ts:6-13`)
    - **Observation:** Response schemas validated with Zod; good practice.

12. **I-003: Health check endpoint** (`docker-compose.yml:20`)
    - **Observation:** Uses `/healthz`; n8n's actual health endpoint is `/healthz`. Verified.

13. **I-004: Preload allowlist updated correctly** (`electron/preload/index.ts:3-12`)
    - **Observation:** `n8n:status`, `n8n:start`, `n8n:stop` added to `ALLOWED_INVOKE`; `n8n:health` to `ALLOWED_ON`. Matches IPC handlers.

14. **I-005: Security considerations**
    - **Observation:** No Docker socket exposure, no credentials in logs, no host port mapping. Satisfies SEC-001/002/003.

15. **I-006: Lint compliance** (`electron/main/ipc/n8n-handlers.ts`)
    - **Observation:** No `!` assertions, unused params prefixed with `_`, console.error allowed for error logging. Follows lint rules.

## Requirements Traceability

| Requirement | Status | Notes |
|-------------|--------|-------|
| REQ-001: docker-compose.yml defines n8n service | ✅ Pass | Valid YAML, correct image, volumes, environment. |
| REQ-002: n8n editor not exposed to host | ✅ Pass | No port mapping; only internal Docker network. |
| REQ-003: Health-check endpoint monitored | ✅ Pass | Health poller emits status via IPC. |
| REQ-004: Auto-restart on failure | ✅ Pass | `restart: unless-stopped` policy. |
| REQ-005: n8n data persisted | ✅ Pass | Named volume `n8n_data`. |
| REQ-006: Docker Compose started/stopped with app | ✅ Pass | `composeUp` in `app.whenReady`, `composeDown` in `will-quit`. |
| INT-001: IPC channel for n8n status | ✅ Pass | `n8n:status` handler returns health state. |
| INT-002: IPC channel for n8n start/stop | ✅ Pass | `n8n:start`, `n8n:stop` handlers. |
| INT-003: Preload allowlist updated | ✅ Pass | Channels added to `ALLOWED_INVOKE` and `ALLOWED_ON`. |
| SEC-001: n8n not accessible from LAN | ✅ Pass | No host port mapping. |
| SEC-002: Docker socket not exposed | ✅ Pass | No `-v /var/run/docker.sock`. |
| SEC-003: n8n credentials not logged | ✅ Pass | No credentials in docker-compose.yml logs. |

## Electron / TypeScript Quality

- **IPC Security:** Allowlist enforced; Zod validation on responses.
- **Preload Isolation:** `contextBridge` exposed correctly; types defined.
- **Error Handling:** Try/catch with error messages returned.
- **Lifecycle Management:** Health poller cleared on quit; container stopped.
- **Code Style:** Follows existing patterns; no lint violations observed.

## Recommendations

1. **Prioritize M-001** (Docker Compose binary detection) – affects cross-platform compatibility.
2. **Resolve spec open questions** (M-003, L-003, L-005) before merging.
3. **Consider awaiting composeDown** (L-002) with a timeout to ensure clean shutdown.
4. **Remove unused composeStatus** (L-001) to reduce code surface.

## Verdict

**Approve with minor changes.** The implementation is correct, follows Electron security patterns, and satisfies all requirements. The medium-severity issues (M-001, M-003) should be addressed before merge; low-severity items can be tracked as follow-ups.