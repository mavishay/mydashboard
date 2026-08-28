# Risks and Mitigation: AI-Powered Focus Board

**PDRs Referenced**: PDR-001, PDR-002, PDR-003, PDR-004, PDR-006, PDR-007

---

## 10. Risks and Mitigation

**Purpose**: Document product risks and mitigation strategies

### 10.1 Risk Summary

| Risk | Category | Likelihood | Impact | Risk Score | PDR |
|------|----------|------------|--------|------------|-----|
| Gmail restricted-scope OAuth delays | Technical | High | High | High | PDR-007 |
| Docker install friction kills adoption | Market | Medium | High | High | PDR-003 |
| LLM API cost surprise for users | Market | Medium | Medium | Medium | PDR-002 |
| Electron security misconfiguration | Technical | Low | High | Medium | PDR-001 |
| n8n silent failure | Technical | Medium | Medium | Medium | PDR-003 |
| TickTick API undocumented changes | Technical | Medium | Medium | Medium | PDR-007 |
| Low telemetry opt-in skews metrics | Market | Medium | Low | Low | PDR-006 |
| Brand misuse after traction | Market | Low | Medium | Low | PDR-004 |

### 10.2 Technical Risks

#### Risk: Gmail Restricted-Scope OAuth Delay

| Attribute | Description |
|-----------|-------------|
| **Description** | Gmail restricted-scope verification may take weeks to approve, delaying public launch |
| **Likelihood** | High |
| **Impact** | High |
| **Mitigation Strategy** | Start scope request early; use testing mode for dogfooding; prepare M365 Graph as fallback phase 1 |
| **Contingency Plan** | Launch with M365 first if Gmail scope is delayed |
| **Owner** | Developer |

#### Risk: Electron Security Misconfiguration

| Attribute | Description |
|-----------|-------------|
| **Description** | contextBridge or IPC handler bugs could expose the app to code injection |
| **Likelihood** | Low |
| **Impact** | High |
| **Mitigation Strategy** | Enforce team IPC/contextBridge lint rules from day one; automated security audits |
| **Contingency Plan** | Security patch release within 24 hours |
| **Owner** | Developer |

#### Risk: n8n Silent Failure

| Attribute | Description |
|-----------|-------------|
| **Description** | n8n sidecar crashes or stops polling without user-visible error |
| **Likelihood** | Medium |
| **Impact** | Medium |
| **Mitigation Strategy** | Surface engine heartbeat in app status bar; Docker health check wizard |
| **Contingency Plan** | Auto-restart n8n container on failure detection |
| **Owner** | Developer |

#### Risk: TickTick API Undocumented Changes

| Attribute | Description |
|-----------|-------------|
| **Description** | TickTick API may change without notice, breaking task sync |
| **Likelihood** | Medium |
| **Impact** | Medium |
| **Mitigation Strategy** | Contract tests pinned to observed behavior; adapter interface for easy swap |
| **Contingency Plan** | Disable TickTick sync temporarily; notify users |
| **Owner** | Developer |

### 10.3 Market Risks

#### Risk: Docker Install Friction Kills Adoption

| Attribute | Description |
|-----------|-------------|
| **Description** | Users abandon setup when they see Docker is required |
| **Likelihood** | Medium |
| **Impact** | High |
| **Mitigation Strategy** | Ship docker-compose profile; in-app health-check wizard; clear quickstart docs |
| **Contingency Plan** | Explore embedded Docker runtime for future releases |
| **Owner** | Developer |

#### Risk: LLM API Cost Surprise

| Attribute | Description |
|-----------|-------------|
| **Description** | Users are surprised by OpenAI/Anthropic API costs after heavy email volume |
| **Likelihood** | Medium |
| **Impact** | Medium |
| **Mitigation Strategy** | Display cost estimate at onboarding; per-email cost tracking in settings |
| **Contingency Plan** | Add truncation mode to reduce payload size (post-v1) |
| **Owner** | Developer |

#### Risk: Low Telemetry Opt-In Skews Metrics

| Attribute | Description |
|-----------|-------------|
| **Description** | Few users opt in to telemetry, making success metrics unreliable |
| **Likelihood** | Medium |
| **Impact** | Low |
| **Mitigation Strategy** | Pair with local-only stats view users can inspect and share manually |
| **Contingency Plan** | Use GitHub issues/discussions as qualitative signal |
| **Owner** | Developer |

#### Risk: Brand Misuse After Traction

| Attribute | Description |
|-----------|-------------|
| **Description** | Fork or derivative uses the product name in confusing ways |
| **Likelihood** | Low |
| **Impact** | Medium |
| **Mitigation Strategy** | Define governance before publicity push; trademark if needed |
| **Contingency Plan** | Legal action only as last resort |
| **Owner** | Community |

### 10.4 Business Risks

| Risk | Description | Mitigation |
|------|-------------|------------|
| No revenue model | MIT license means no direct income | Community contributions offset maintenance; sponsorship optional |
| Feature-request pressure | OSS users demand features beyond scope | Public roadmap; clear out-of-scope documentation |

### 10.5 Risk Matrix

```text
Impact
  High   | Gmail OAuth | Docker Friction | Electron Security |
  Medium | n8n Failure | LLM Cost       | TickTick API     |
  Low    | Telemetry   |                |                  |
         └─────────────┴────────────────┴──────────────────┘
              Low          Medium           High
                       Likelihood
```

---

**PDR Traceability:**

| PDR | Consequence | Risk Identified |
|-----|-------------|-----------------|
| PDR-001 | Electron form factor | Security misconfiguration risk |
| PDR-002 | BYOK cloud-first | LLM cost surprise, full payload privacy |
| PDR-003 | Docker hard prerequisite | Install friction risk |
| PDR-004 | MIT license | No revenue model |
| PDR-006 | Telemetry-based metrics | Low opt-in risk |
| PDR-007 | Gmail-first phasing | OAuth scope delay risk |
