## Discovered Team Context

| ID | Module | Type | Descriptor | Relevance |
|----|--------|------|------------|-----------|
| rule-electron-contextbridge-allowlist | context_modules/rules/electron/contextbridge-allowlist.md | Rule | All IPC channels MUST be explicitly allowlisted in the preload script before they can be invoked from the renderer | High |
| rule-electron-ipc-registration | context_modules/rules/electron/ipc-handler-registration.md | Rule | Each IPC sub-domain MUST export a single registerHandlers(deps) function that registers all its channels in one call | High |
| rule-security-pre_commit_checklist | context_modules/rules/security/pre_commit_checklist.md | Rule | Pre-commit security checklist to verify before submitting code | High |
| rule-source-reference-analysis | context_modules/rules/architecture/source_reference_analysis.md | Rule | Mandatory source code analysis from previous versions before implementing features | Medium |
| rule-lint-compliance-no-config-changes | context_modules/rules/devops/lint_compliance_no_config_changes.md | Rule | Fix code to match existing lint rules rather than weakening the rules | Medium |
| persona-devops_engineer | context_modules/personas/devops_engineer.md | Persona | DevOps Engineer persona focused on enabling reliable, scalable, and secure software delivery through automation, infrastructure as code, and observability | Medium |
| PDR-001 | .adlc/memory/pdr/PDR-001.md (missing) | PDR | Electron + LAN | Low |
| PDR-002 | .adlc/memory/pdr/PDR-002.md (missing) | PDR | BYOK cloud AI | Low |
| PDR-003 | .adlc/memory/pdr/PDR-003.md (missing) | PDR | n8n sidecar | High |
| PDR-004 | .adlc/memory/pdr/PDR-004.md (missing) | PDR | MIT license | Low |
| PDR-005 | .adlc/memory/pdr/PDR-005.md (missing) | PDR | Consultant persona | Low |
| PDR-006 | .adlc/memory/pdr/PDR-006.md (missing) | PDR | Success metrics | Low |
| PDR-007 | .adlc/memory/pdr/PDR-007.md (missing) | PDR | Gmail-first phasing | Low |

_Searched 80 CDR entries, 7 PDR entries, 0 ADR entries, 6 matches found._