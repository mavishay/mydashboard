# Out of Scope: AI-Powered Unified Productivity Dashboard

**PDRs Referenced**: PDR-001, PDR-002, PDR-004, PDR-005, PDR-007

---

## 9. Out of Scope

**Purpose**: Define explicit exclusions to set clear boundaries

### 9.1 Feature Exclusions

| Excluded Feature | Rationale | Future Consideration |
|------------------|-----------|----------------------|
| Local-only AI (Ollama) | Quality floor too low for core triage promise | v2 if local models improve |
| Notion integration | API maturity uncertain, not in owner stack | Post-v1 based on demand |
| Todoist integration | Owner uses TickTick, not Todoist | Post-v1 based on demand |
| Workflow editor exposure | UX fragmentation, n8n hidden by design | Post-v1 if user demand emerges |

### 9.2 Technical Exclusions

| Excluded Capability | Rationale | Alternative |
|---------------------|-----------|-------------|
| Web app / SaaS deployment | Self-hosted is the thesis | Electron desktop + LAN |
| Native mobile apps (iOS/Android) | Scope too large for v1 | LAN dashboard for mobile viewing |
| Browser notifications | Less reliable than native | Electron native notification API |
| Multi-user / team features | Solo consultant focus | Post-v1 if team persona emerges |

### 9.3 Market Exclusions

| Excluded Market | Rationale | Future Consideration |
|-----------------|-----------|----------------------|
| Corporate employees on managed devices | Device policies block local mail readers | v2 if demand materializes |
| Single-account Gmail users | Superhuman/Mimestream already solve this | Not the target persona |
| Non-technical users | Docker prerequisite is a hard barrier | Web installer could address this |

### 9.4 Integration Exclusions

| Excluded Integration | Rationale | Workaround |
|----------------------|-----------|------------|
| Slack integration | Not in scope for email triage | Manual forwarding |
| Calendar unification | Separate from email/task triage | Standalone calendar app |
| CRM integration | Too broad for v1 scope | Post-v1 |

### 9.5 Scope Decisions Traced to PDRs

| Out of Scope Item | PDR | Decision | Rationale |
|-------------------|-----|----------|-----------|
| Local AI (Ollama) | PDR-002 | Cloud-first only | Quality threshold |
| Mobile native apps | PDR-001 | Electron only | Scope control |
| Todoist/Notion | PDR-007 | Deferred beyond v1 | Owner stack alignment |
| Team features | PDR-005 | Solo consultant focus | Anti-persona exclusion |

---

**PDR Traceability:**

| PDR | Decision | Impact on Scope |
|-----|----------|-----------------|
| PDR-001 | Electron + LAN | No mobile native, no web SaaS |
| PDR-002 | BYOK cloud-first | No local AI in v1 |
| PDR-004 | MIT license | No paid tier in v1 |
| PDR-005 | Consultant persona | Excludes corporate, non-technical users |
| PDR-007 | Gmail-first phasing | Todoist/Notion deferred |
