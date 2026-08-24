---
feature: security-fixes
phase: implement
generated: 2026-08-24T01:23:09Z
---

_Previous team-context for ipc-handlers discarded._

## Discovered Team Context

| ID | Module | Type | Descriptor | Relevance |
|----|--------|------|------------|-----------|
| rule-electron-contextbridge-allowlist | context_modules/rules/electron/contextbridge-allowlist.md | Rule | All IPC channels MUST be explicitly allowlisted in the preload script before they can be invoked from the renderer. | High |
| rule-electron-ipc-registration | context_modules/rules/electron/ipc-handler-registration.md | Rule | Each IPC sub-domain MUST export a single register*Handlers(deps) function that registers all its channels in one call. Dependencies MUST be injected as parameters (never imported globally). An orchestrator module wires everything together. | High |
| CDR-2026-020 | context_modules/rules/security/pre_commit_checklist.md | Rule | Pre-commit security checklist to verify before submitting code (hardcoded secrets, input validation, XSS prevention). | Medium |
| rule-ts-zod-validation | context_modules/rules/typescript/zod-input-validation.md | Rule | Every IPC handler or API boundary MUST define a Zod schema at module scope and gate all incoming payloads through it. | Medium |
| CDR-2026-051 | context_modules/rules/fullstack/framework/fullstack_auth_patterns.md | Rule | Authentication and authorization patterns including JWT, OAuth/OIDC, RBAC/ABAC/PBAC, token management. | Medium |
| CDR-2026-038 | context_modules/personas/senior_fullstack_developer.md | Persona | Before providing a solution, identify the Fullstack Context Domain to activate the appropriate rules. | Medium |
| CDR-2026-017 | context_modules/rules/devops/secrets_management.md | Rule | Use environment-aware secret management; never hardcode secrets. | Low |
| example-atomic-vault-write | context_modules/examples/patterns/atomic-vault-write.md | Example | For file-based credential or config storage, write to a .tmp path first, then renameSync(). | Low |

_Searched 80 CDR entries, 0 PDR entries, 0 ADR entries, 8 matches found._

### Module Bodies

#### rule-electron-contextbridge-allowlist

All IPC channels MUST be explicitly allowlisted in the preload script before they can be invoked from the renderer. Define typed `Set<string>` constants (`ALLOWED_INVOKE`, `ALLOWED_SEND`, `ALLOWED_ON`) and gate every call against these sets.

#### rule-electron-ipc-registration

Each IPC sub-domain MUST export a single `register*Handlers(deps)` function that registers all its channels in one call. Dependencies MUST be injected as parameters (never imported globally). An orchestrator module wires everything together.

#### CDR-2026-020: Pre-Commit Security Checklist

Run through this checklist before every commit to ensure security best practices are followed.

**Critical Checks:**
- No hardcoded secrets (API keys, passwords, tokens)
- SQL injection prevention (parameterized queries)
- Input validation at system boundaries

**High Priority Checks:**
- XSS prevention (escape user-generated content, HTML sanitization)
- CSRF protection (CSRF tokens, SameSite cookies)
- Authentication & authorization

**Medium Priority Checks:**
- Rate limiting
- Error handling (no sensitive data leakage)
- Dependencies (no vulnerable deps)

#### rule-ts-zod-validation

Every IPC handler or API boundary MUST define a Zod schema at module scope and gate all incoming payloads through `Schema.safeParse(request)` before any business logic runs. No handler may trust `as`-cast or raw `unknown` data.

#### CDR-2026-051: Authentication and Authorization Patterns

Authentication and authorization patterns including JWT, OAuth/OIDC, RBAC/ABAC/PBAC, token management. Use environment variables for client secrets; never send them over IPC.

#### CDR-2026-038: Senior Fullstack Developer Persona

**Summary**: Architect cohesive systems across the entire stack — from UI through API to infrastructure — ensuring consistency, reliability, and maintainability at every layer. Own the full delivery path from design to deployment.

**Core Philosophy**:
- Layer Isolation with Clear Contracts
- BFF as the Frontend-Backend Seam
- No Shared Auth Context Across Trust Boundaries
- Observability by Default
- API Contracts Before Implementation
- Infrastructure as Code
- Think Before Coding
- Simplicity First
- Surgical Changes
- Goal-Driven Execution

**Interaction Protocol**: Before providing a solution, identify the Fullstack Context Domain to activate the appropriate ruleset.