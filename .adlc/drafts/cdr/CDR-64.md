## CDR-64: Resolve Rule Conflict: Scope overlap: DRY secrets rules

### Status

**Resolved**

### Dates

- **Created**: 2026-08-23
- **Modified**: 2026-08-23
- **Source**: Rule conflict detection via /team-repair

### Target Module

`context_modules/rules/devops/`

### Context Type

Rule

### Context

**Conflict Details** (warning): rules/devops/secrets_management_dry.md overlaps rules/devops/secrets_management.md; CDR-2026-002 recorded consolidation of *_dry into secrets_management.md, but the _dry variant still exists on disk.

### Decision

**Proposed Resolution**:
1. Resolve merge markers / remove superseded duplicate
2. Edit rules to avoid conflict
3. Mark intentional exception
4. Deprecate one rule via CDR lifecycle (`/levelup-clarify`)


### Resolution Applied

Deleted superseded file per accepted CDR-2026-002; consolidated content verified present in secrets_management.md (2026-08-23).
