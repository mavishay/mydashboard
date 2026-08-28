# Task List: Onboarding Consent Flow for Issue #13

## Overview
Implement onboarding consent flow that displays full payload policy and BYOK consent before enabling AI features.

## Task 1: Create Database Migration for AI Consent Settings
**File**: `electron/main/db/migrations/012-ai-consent-settings.sql`

**Description**: Add a new table to store AI consent settings, separate from telemetry settings.

**Steps**:
1. Create migration file with SQL to add `ai_consent_settings` table
2. Table should store: `id` (INTEGER PRIMARY KEY CHECK id=1), `consented` (INTEGER NOT NULL DEFAULT 0), `consented_at` (TEXT), `updated_at` (TEXT)
3. Update `electron/main/db/index.ts` to import and include migration 012

**Verification**:
- Run migration and verify table is created
- Check that existing telemetry_settings table is unaffected

---

## Task 2: Create AI Consent Backend Module
**File**: `electron/main/ai/consent.ts`

**Description**: Create module to handle AI consent persistence operations.

**Steps**:
1. Create `getAiConsentSettings(db: Database.Database)` function that returns `{ consented: boolean; consentedAt: string | null }`
2. Create `setAiConsent(db: Database.Database, consented: boolean)` function to update consent
3. Create `hasAiConsent(db: Database.Database)` convenience function that returns boolean
4. Export all functions

**Verification**:
- Test functions work correctly with database
- Verify consent can be read and updated

---

## Task 3: Register AI Consent IPC Handlers
**File**: `electron/main/ipc/ai-consent-handlers.ts`

**Description**: Create IPC handlers for AI consent operations.

**Steps**:
1. Create `registerAiConsentHandlers(ipcMain: IpcMain, db: Database.Database)` function
2. Add handler for `ai-consent:getSettings`
3. Add handler for `ai-consent:setConsent`
4. Update `electron/main/ipc/index.ts` to import and register the new handlers

**Verification**:
- Test IPC handlers can be called from renderer
- Verify consent state can be read and updated

---

## Task 4: Update Preload Types and API
**File**: `electron/preload/index.ts`

**Description**: Add AI consent API to the preload bridge.

**Steps**:
1. Add `'ai-consent:getSettings'` and `'ai-consent:setConsent'` to `ALLOWED_INVOKE` set
2. Add `aiConsent` object to `electronAPI` with `getSettings()` and `setConsent(consented: boolean)` methods
3. Update types in `electron/preload/types.d.ts` if needed

**Verification**:
- Test that new API methods are accessible from renderer
- Verify security (only allowed channels are invoked)

---

## Task 5: Create AI Consent Onboarding Component
**File**: `src/components/AiConsentOnboarding.tsx`

**Description**: Create UI component for AI consent screen.

**Steps**:
1. Create component with props: `onAccept: () => void`, `onDecline: () => void`
2. Display clear explanation that:
   - Full email payloads will be sent to external LLM providers (OpenAI/Anthropic)
   - User must provide their own API keys (BYOK)
   - Email content is processed but not stored by LLM providers
   - User can disable AI features at any time in Settings
3. Create prominent "I Understand and Accept" button
4. Create "Skip AI Features" button
5. Style consistently with existing onboarding UI

**Verification**:
- UI renders correctly
- Both buttons trigger appropriate callbacks
- Content is clear and accurate

---

## Task 6: Update Onboarding Flow to Include AI Consent Step
**File**: `src/components/Onboarding.tsx`

**Description**: Extend onboarding to include AI consent after telemetry consent.

**Steps**:
1. Add new step type: `'welcome' | 'telemetry' | 'ai-consent'`
2. After telemetry consent, transition to AI consent step
3. Import and render `AiConsentOnboarding` component
4. Handle AI consent acceptance/decline
5. Store AI consent in database via new IPC API

**Verification**:
- Complete onboarding flow works: welcome → telemetry → AI consent
- Consent is stored in database
- User can skip AI consent and still complete onboarding

---

## Task 7: Add AI Consent Check in App.tsx
**File**: `src/App.tsx`

**Description**: Ensure AI features are only enabled after consent is given.

**Steps**:
1. After checking telemetry consent, also check AI consent
2. Store AI consent state in app context or state
3. Pass AI consent state to Dashboard component
4. Dashboard can use this to conditionally enable AI features

**Verification**:
- App correctly checks both telemetry and AI consent
- Dashboard receives AI consent state
- AI features are disabled if consent not given

---

## Task 8: Update Settings to Show AI Consent Status
**File**: `src/components/Settings.tsx`

**Description**: Add AI consent section to Settings page.

**Steps**:
1. Add AI consent state management (load from API)
2. Create AI Consent section with:
   - Current consent status display
   - Toggle to enable/disable AI features
   - Explanation text about what consent means
3. Style consistently with existing Telemetry section
4. Handle consent updates and persist to database

**Verification**:
- AI consent status displays correctly
- Toggle works and persists changes
- UI is consistent with existing Settings design

---

## Task 9: Guard AI Classification with Consent Check
**File**: `electron/main/ai/classifier.ts`

**Description**: Ensure classification only runs if user has given AI consent.

**Steps**:
1. Import `hasAiConsent` from consent module
2. In `classifyEmail()` and `classifyUnclassifiedEmails()`, check consent before proceeding
3. Throw descriptive error if consent not given: "AI consent required. Enable AI features in Settings."
4. Do not modify classification logic itself

**Verification**:
- Classification fails gracefully if consent not given
- Error message is clear and actionable
- Classification works normally when consent is given

---

## Task 10: Add Tests for AI Consent Flow
**File**: `tests/main/ai-consent.test.ts`

**Description**: Write tests for the new AI consent functionality.

**Steps**:
1. Test database migration creates correct table
2. Test consent module functions (get, set, has)
3. Test IPC handlers respond correctly
4. Test onboarding flow completes with consent
5. Test settings page shows/updates consent
6. Test classification respects consent check

**Verification**:
- All tests pass
- Code coverage is adequate
- Edge cases are covered (no consent, consent given, consent revoked)

---

## Task 11: Update Documentation
**File**: `docs/ai-consent.md` (or update existing docs)

**Description**: Document the AI consent feature.

**Steps**:
1. Document what AI consent covers
2. Explain BYOK architecture
3. Describe how consent is stored and managed
4. Add to user guide/help documentation

**Verification**:
- Documentation is accurate
- Covers user-facing and developer-facing aspects
- Is clear and comprehensive

---

## Implementation Order
1. Task 1 (Database migration)
2. Task 2 (Backend module)
3. Task 3 (IPC handlers)
4. Task 4 (Preload API)
5. Task 5 (UI component)
6. Task 6 (Onboarding flow)
7. Task 7 (App.tsx guard)
8. Task 8 (Settings UI)
9. Task 9 (Classification guard)
10. Task 10 (Tests)
11. Task 11 (Documentation)

## Dependencies
- Tasks 1-4 are backend/API work
- Tasks 5-8 are frontend/UI work
- Task 9 is integration work
- Tasks 10-11 are verification/documentation

## Risk Assessment
- **Low Risk**: Database migration (isolated change)
- **Low Risk**: Backend module (new functionality)
- **Medium Risk**: Onboarding flow (user-facing change)
- **Low Risk**: Classification guard (defensive check)
- **Low Risk**: Settings UI (additive change)

## Success Criteria Met
- ✅ Consent screen appears before AI activation
- ✅ Clear explanation that full email payloads will be sent to LLM
- ✅ User must explicitly accept before proceeding
- ✅ Consent recorded in settings (SQLite)
- ✅ No AI features enabled until consent given
