---
feature: lan-dashboard-pairing-https
phase: specify
generated: 2026-08-24T00:00:00Z
---

## Discovered Team Context

| ID | Module | Type | Descriptor | Relevance |
|----|--------|------|------------|-----------|
| rule-electron-contextbridge-allowlist | context_modules/rules/electron/contextbridge-allowlist.md | Rule | All IPC channels MUST be explicitly allowlisted in the preload script before they can be invoked from the renderer | High |
| rule-electron-ipc-registration | context_modules/rules/electron/ipc-handler-registration.md | Rule | Each IPC sub-domain MUST export a single register*Handlers(deps) function that registers all its channels in one call | High |
| rule-testing-platform-mocked | context_modules/rules/testing/platform-mocked-tests.md | Rule | Tests for Electron and platform-specific code MUST mock native modules to run in standard Node.js | High |
| rule-immediate-close-shutdown | context_modules/rules/architecture/immediate_close_shutdown.md | Rule | Use socket.destroy() instead of socket.end() for immediate cleanup on daemon shutdown | High |
| rule-ts-zod-validation | context_modules/rules/typescript/zod-input-validation.md | Rule | Every IPC handler or API boundary MUST define a Zod schema at module scope and gate all inputs | Medium |
| CDR-2026-022 | context_modules/rules/style-guides/file_organization.md | Rule | Standards for file organization, sizing, and code structure across all languages | Medium |
| PDR-001 | .adlc/memory/pdr/PDR-001.md | PDR | Electron + LAN server — Defines the delivery model and LAN access decisions | High |

_Searched 80 CDR entries, 0 PDR entries (index not found), 0 ADR entries (index not found), 7 matches found._

### High-Relevance Module Bodies

#### rule-electron-contextbridge-allowlist (IPC Channel Allowlisting)

All IPC channels **MUST** be explicitly allowlisted in the preload script before they can be invoked from the renderer. Define typed `Set<string>` constants (`ALLOWED_INVOKE`, `ALLOWED_SEND`, `ALLOWED_ON`) and gate every call against these sets.

#### rule-electron-ipc-registration (Handler Registration)

Each IPC sub-domain **MUST** export a single `register*Handlers(deps)` function that registers all its channels in one call. Dependencies **MUST** be injected as parameters (never imported globally). An orchestrator module wires everything together.

#### rule-testing-platform-mocked (Platform-Mocked Tests)

Tests for Electron and platform-specific code **MUST** mock native modules to run in standard Node.js (no Electron binary needed). Use `vi.mock('electron', ...)` for Electron APIs. For platform-switching code, use `Object.defineProperty(process, 'platform', ...)` with `vi.doMock` + `vi.resetModules()`.

#### rule-immediate-close-shutdown (Daemon Shutdown)

On daemon/server shutdown, immediately destroy all client sockets without waiting for pending writes. This prevents hanging during shutdown and ensures clean resource cleanup.

#### PDR-001 (Electron + LAN)

Form factor and architecture definition — Electron desktop app with LAN-accessible dashboard via HTTP server with pairing token + self-signed HTTPS.
