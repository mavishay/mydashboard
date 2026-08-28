# Non-Functional Requirements: AI-Powered Focus Board

**PDRs Referenced**: PDR-001, PDR-002, PDR-003

---

## 8. Non-Functional Requirements (NFRs)

**Purpose**: Define quality attributes and constraints

### 8.1 Performance

| Requirement | Target | Measurement |
|-------------|--------|-------------|
| Email classification latency | 5 seconds per email | Time from arrival to SQLite write |
| LAN dashboard load time | 2 seconds | Time from phone browser request to render |
| Notification delivery | 10 seconds from classification | End-to-end latency |
| SQLite query response | 100ms p95 | Query time for inbox/task views |

### 8.2 Security

| Requirement | Standard | Compliance |
|-------------|----------|------------|
| API key storage | OS keychain (electron-safeStorage) | Never plain text in DB or config |
| LAN access | Pairing token + self-signed HTTPS | First-run pairing required |
| Electron IPC | contextBridge allowlist rules | Team security directives |
| LLM payload consent | Explicit consent at onboarding | Full payload sent with user awareness |

### 8.3 Reliability

| Requirement | Target | Measurement |
|-------------|--------|-------------|
| n8n sidecar heartbeat | 99% during active sessions | Health log monitoring |
| Offline inbox access | 100% for cached emails | SQLite read availability |
| Data persistence | Zero data loss on crash | SQLite WAL mode + Electron crash recovery |

### 8.4 Usability

| Requirement | Target | Measurement |
|-------------|--------|-------------|
| Setup completion | 15 minutes from download to first triage | Onboarding funnel |
| Learnability | No tutorial needed for core triage | User testing |
| Error recovery | Clear error messages for OAuth failures | UX review |

### 8.5 Scalability

| Requirement | Target | Measurement |
|-------------|--------|-------------|
| Email accounts | 10+ per user | Load testing |
| Email volume | 1000+ emails/day per account | Load testing |
| Task items | 500+ consolidated tasks | SQLite performance |

### 8.6 NFRs Traced to PDRs

| NFR Category | Requirement | PDR | Rationale |
|--------------|-------------|-----|-----------|
| Security | OS keychain for API keys | PDR-002 | BYOK model requires secure key storage |
| Security | Pairing token + HTTPS for LAN | PDR-001 | LAN access must be authenticated and encrypted |
| Performance | 5s classification latency | PDR-006 | User expects near-real-time triage |
| Reliability | 99% n8n heartbeat | PDR-003 | Automation engine must be dependable |
| Usability | 15-min setup | PDR-006 | Docker prerequisite is a friction point |
| Scalability | 10+ accounts | PDR-005 | Unlimited accounts per persona decision |

---

**PDR Traceability:**

| PDR | Decision | Impact on NFRs |
|-----|----------|----------------|
| PDR-001 | Electron + LAN | Security and performance NFRs |
| PDR-002 | BYOK cloud AI | Security NFRs for key storage |
| PDR-003 | n8n sidecar | Reliability NFRs for heartbeat |
