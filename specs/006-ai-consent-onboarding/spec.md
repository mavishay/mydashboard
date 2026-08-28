# Feature Specification: AI Consent Onboarding Flow

**Issue**: [#13](https://github.com/mavishay/mydashboard/issues/13)
**Milestone**: Alpha
**PDR**: PDR-002

## Goal

Display a full payload policy and BYOK consent screen during onboarding before any AI features are enabled. Users must explicitly acknowledge that email subject, sender, and snippet are sent to their chosen LLM provider (OpenAI/Anthropic/liteLLM) for classification before AI features activate.

## Success Criteria

1. New onboarding flow shows a consent screen between welcome and telemetry steps
2. Consent screen clearly explains that email subject, sender address, and preview snippet are sent to the LLM provider for classification
3. Consent screen explains that the user provides their own API key (BYOK) and data goes directly to the provider they configure
4. User must explicitly click "I Understand & Consent" to proceed; no silent acceptance
5. Consent is persisted in SQLite (`ai_consent` table) with timestamp and version
6. AI classification is blocked until consent is recorded — `classifyEmail` checks consent before calling LLM
7. Existing users who have already configured API keys are shown the consent screen on next launch (migration path)
8. Consent can be revoked from Settings, which disables AI features until re-consented

## Data Model

### Database Table: `ai_consent_settings`

```sql
CREATE TABLE ai_consent_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  consented INTEGER NOT NULL DEFAULT 0,
  policy_version TEXT NOT NULL DEFAULT '1.0',
  consented_at TEXT,
  revoked_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- Singleton row (id=1) matching `telemetry_settings` pattern
- `consented`: 0 = not consented / revoked, 1 = consented
- `policy_version`: tracks which version of the consent text the user accepted (for future policy updates)
- `consented_at` / `revoked_at`: ISO-8601 timestamps for audit trail
- `updated_at`: last modification timestamp

### Validation Schemas (Zod)

```typescript
// Get AI consent status
const GetAiConsentSchema = z.object({}).optional();

// Set AI consent
const SetAiConsentSchema = z.object({
  consented: z.boolean(),
});
```

## IPC Channels

| Channel | Direction | Payload | Response |
|---------|-----------|---------|----------|
| `ai-consent:getSettings` | renderer→main | none | `{ consented: boolean, policyVersion: string, consentedAt: string \| null, revokedAt: string \| null }` |
| `ai-consent:setConsent` | renderer→main | `{ consented: boolean }` | `{ success: boolean }` |

### Response Type

```typescript
interface AiConsentStatus {
  consented: boolean;
  policyVersion: string;
  consentedAt: string | null;
  revokedAt: string | null;
}
```

## Onboarding Flow

Current flow: `welcome → telemetry → dashboard`

New flow: `welcome → ai-consent → telemetry → dashboard`

### AI Consent Screen Content

The consent screen must clearly communicate:

1. **What data is sent**: Email subject line, sender address, and preview snippet (first ~200 characters) are sent to the configured LLM provider for classification
2. **Where it goes**: Data is sent directly to the API endpoint of the user's chosen provider (OpenAI, Anthropic, or liteLLM custom URL)
3. **BYOK model**: The user provides their own API key; no data passes through our servers
4. **Purpose**: To classify emails as urgent/action/fyi/noise for smart triage
5. **What is NOT sent**: Full email body, attachments, authentication credentials, or personal account information beyond sender address
6. **Revocability**: Consent can be revoked at any time in Settings, which disables AI classification

### UI Layout

```
┌─────────────────────────────────────────┐
│  🔒 AI Classification Consent          │
│                                         │
│  Before enabling AI-powered email       │
│  triage, please review how your data    │
│  is used.                              │
│                                         │
│  ┌─ What We Send to Your LLM ────────┐ │
│  │ • Email subject line               │ │
│  │ • Sender email address             │ │
│  │ • Email preview snippet            │ │
│  └────────────────────────────────────┘ │
│                                         │
│  ┌─ Your Data, Your Key ─────────────┐ │
│  │ This app uses BYOK (Bring Your     │ │
│  │ Own Key). Your data goes directly  │ │
│  │ to the LLM provider YOU configure  │ │
│  │ (OpenAI, Anthropic, or custom      │ │
│  │ liteLLM endpoint). Nothing passes  │ │
│  │ through our servers.               │ │
│  └────────────────────────────────────┘ │
│                                         │
│  ┌─ What We DON'T Send ──────────────┐ │
│  │ ✗ Full email body                  │ │
│  │ ✗ Attachments                      │ │
│  │ ✗ Passwords or API keys            │ │
│  └────────────────────────────────────┘ │
│                                         │
│  You can revoke this consent at any     │
│  time in Settings.                      │
│                                         │
│  [Skip AI Features]  [I Understand &   │
│                        Consent]         │
└─────────────────────────────────────────┘
```

- "Skip AI Features" proceeds without enabling AI (sets `consented=0`)
- "I Understand & Consent" enables AI (sets `consented=1`, records timestamp)
- Both options advance to the telemetry step

## Classification Guard

The `classifyEmail` function in `electron/main/ai/classifier.ts` must check consent before calling the LLM:

```typescript
export async function classifyEmail(
  db: Database.Database,
  emailId: string
): Promise<ClassificationResult | null> {
  // Check consent first
  const consent = db
    .prepare('SELECT consented FROM ai_consent WHERE id = 1')
    .get() as { consented: number } | undefined;

  if (!consent || consent.consented !== 1) {
    throw new Error('AI consent not granted. Enable AI features in Settings.');
  }

  // ... existing classification logic unchanged
}
```

Same guard applies to `classifyUnclassifiedEmails`.

## Settings Integration

Add an AI Consent section to `Settings.tsx` between Telemetry and existing sections:

- Show current consent status (consented / not consented)
- Show consent timestamp if consented
- Toggle button to grant/revoke consent
- Revoking consent immediately blocks future classification calls
- Granting consent requires re-reading the full policy text (not just a toggle)

## Migration Path for Existing Users

When the migration runs:
1. Check if `api_keys` table has any rows (user had BYOK configured)
2. If yes: insert `ai_consent` row with `consented=0` (requires explicit consent)
3. If no: insert `ai_consent` row with `consented=0`
4. On next app launch, `App.tsx` checks both telemetry consent AND AI consent
5. If AI consent is missing or `consented=0`, user sees the consent screen

### App.tsx Routing Logic

```typescript
type AppPage = 'onboarding' | 'dashboard';

const checkExistingConsent = useCallback(async () => {
  const [telemetry, aiConsent] = await Promise.all([
    window.electronAPI.telemetry.getSettings(),
    window.electronAPI.aiConsent.getStatus(),
  ]);
  if (telemetry.consentedAt && aiConsent.consented) {
    setPage('dashboard');
  } else if (telemetry.consentedAt && !aiConsent.consented) {
    setPage('onboarding'); // Re-show consent screen
  }
  // If telemetry not consented, show full onboarding
}, []);
```

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `electron/main/db/migrations/012-ai-consent.sql` | Create | New `ai_consent` table |
| `electron/main/db/index.ts` | Modify | Add migration 012, bump `CURRENT_SCHEMA_VERSION` to 12 |
| `electron/main/ipc/ai-consent-handlers.ts` | Create | IPC handlers for consent get/set |
| `electron/main/ipc/index.ts` | Modify | Register `aiConsentHandlers` |
| `electron/preload/types.d.ts` | Modify | Add `aiConsent` to `ElectronAPI` interface |
| `electron/preload/index.ts` | Modify | Expose `aiConsent` IPC channels |
| `src/components/Onboarding.tsx` | Modify | Add consent step between welcome and telemetry |
| `src/components/Settings.tsx` | Modify | Add AI consent section with toggle |
| `src/App.tsx` | Modify | Check AI consent status for routing |
| `electron/main/ai/classifier.ts` | Modify | Add consent guard before LLM calls |
| `specs/006-ai-consent-onboarding/spec.md` | Create | This spec |

## Non-Goals

- Not modifying AI classification logic or LLM provider integrations
- Not adding new LLM providers or changing existing BYOK key storage
- Not altering notification system or task consolidation features
- Not adding mobile native apps or web SaaS deployment
- Not implementing policy version upgrade flows (future enhancement)
