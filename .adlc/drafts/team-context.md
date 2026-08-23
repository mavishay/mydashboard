---
feature: electron-shell-sqlite-code-review-fixes
phase: implement
generated: 2026-08-23T00:00:00Z
---

## Discovered Team Context

| ID | Module | Type | Descriptor | Relevance |
|----|--------|------|------------|-----------|
| CDR-2026-008 | context_modules/rules/architecture/dependency_injection.md | Rule | All services and components should use dependency injection (DI) | High |
| CDR-2026-021 | context_modules/rules/security/sql_injection_prevention.md | Rule | SQL injection prevention - parameterized queries, regression tests | High |
| rule-electron-ipc-registration | context_modules/rules/electron/ipc-handler-registration.md | Rule | Each IPC sub-domain MUST export a single registerHandlers(deps) function | High |
| rule-ts-zod-validation | context_modules/rules/typescript/zod-input-validation.md | Rule | Every IPC handler MUST define a Zod schema at module scope | High |
| rule-electron-contextbridge-allowlist | context_modules/rules/electron/contextbridge-allowlist.md | Rule | All IPC channels MUST be explicitly allowlisted in the preload script | Medium |
| rule-testing-platform-mocked | context_modules/rules/testing/platform-mocked-tests.md | Rule | Tests for Electron and platform-specific code MUST mock native modules | Medium |

_Searched 80 CDR entries, 7 PDR entries, 0 ADR entries, 6 matches found._
