# Investment and Resources: AI-Powered Unified Productivity Dashboard

**PDRs Referenced**: PDR-001, PDR-003, PDR-004, PDR-006

---

## 10.5 Investment and Resources

**Purpose**: Define team, budget, and resource requirements

### 10.5.1 Team Composition

| Role | FTEs | Phase | Duration | Responsibility |
|------|------|-------|----------|----------------|
| Solo Developer | 1 | All | Ongoing | Architecture, implementation, maintenance |
| AI Collaboration | Support | All | Ongoing | Code generation, documentation, review |

**Total:** 1 FTE average

### 10.5.2 Budget Estimate

| Category | Phase 1 | Phase 2 | Phase 3 | Annual Run Rate |
|----------|---------|---------|---------|-----------------|
| Personnel | $0 (solo) | $0 (solo) | $0 (solo) | $0 |
| Infrastructure | $0 (user Docker) | $0 (user Docker) | $0 (user Docker) | $0 |
| Third-Party (LLM) | User BYOK | User BYOK | User BYOK | User BYOK |
| Tools and Licenses | $0 (MIT) | $0 (MIT) | $0 (MIT) | $0 |
| **Total** | **$0** | **$0** | **$0** | **$0** |

### 10.5.3 Risk-Adjusted ROI

| Scenario | Probability | 12-Month Outcome | NPV | Payback |
|----------|-------------|------------------|-----|---------|
| Optimistic | 30% | 500+ GitHub stars, active community | Community value | N/A (OSS) |
| Base Case | 50% | Solid personal tool, moderate community | Personal value | N/A (OSS) |
| Pessimistic | 20% | Niche personal tool, limited traction | Personal value | N/A (OSS) |
| **Weighted Average** | 100% | **Positive personal ROI** | **Positive** | **Immediate** |

### 10.5.4 Key Assumptions

| Assumption | Basis | Risk if Wrong |
|------------|-------|---------------|
| Solo developer can build full stack | Electron + Node.js experience | Scope must be reduced |
| Docker is acceptable prerequisite | Target persona is tech-savvy | Adoption drops significantly |
| LLM costs are manageable per-user | BYOK model, user controls spend | Users may abandon AI features |
| Community contributions will emerge | MIT license, active GitHub | Maintenance burden falls on solo |

### 10.5.5 Go/No-Go Criteria

| Checkpoint | Date | Criteria | Decision |
|------------|------|----------|----------|
| Phase 1 (Gmail + Triage) | TBD | Gmail connected, AI classification working, notifications firing | Go / No-Go |
| Phase 2 (Graph + Tasks) | TBD | M365 connected, task consolidation working, LAN access functional | Go / No-Go |
| Phase 3 (TickTick + Polish) | TBD | TickTick connected, setup <15min, all metrics on track | Go / No-Go |

---

**PDR Traceability:**

| PDR | Decision | Impact on Investment |
|-----|----------|---------------------|
| PDR-001 | Electron + LAN | Infrastructure is user-provided |
| PDR-003 | n8n Docker sidecar | Docker is hard prerequisite |
| PDR-004 | MIT license | No revenue model |
| PDR-006 | Success metrics | Go/No-Go criteria derived from metrics |
