# Implementation Plan: Account Tags/Labels with Color Settings

**Issue**: #32
**Spec**: `specs/032-account-colors/spec.md`
**Confidence**: HIGH

---

## Task 1: Database Migration — Add `color` column to accounts

**Description**: Create migration 013 and register it. Bump `CURRENT_SCHEMA_VERSION` from 12 to 13.

**Files to create/modify**:
- CREATE `electron/main/db/migrations/013-account-colors.sql`
- MODIFY `electron/main/db/index.ts` (lines 5, 18, 33)

**Source references**:
- Migration pattern: `electron/main/db/migrations/001-initial.sql:1-41` (accounts table schema)
- Version bump: `electron/main/db/index.ts:5` (`CURRENT_SCHEMA_VERSION = 12`)
- Import pattern: `electron/main/db/index.ts:7-18` (sequential `import migrationNNN`)
- MIGRATIONS record: `electron/main/db/index.ts:20-33`

**Implementation**:
1. Create `013-account-colors.sql` with content:
   ```sql
   ALTER TABLE accounts ADD COLUMN color TEXT;
   ```
2. In `electron/main/db/index.ts`:
   - Add `import migration013 from './migrations/013-account-colors.sql?raw';`
   - Add `13: migration013` to the `MIGRATIONS` record
   - Change `CURRENT_SCHEMA_VERSION` from `12` to `13`

**Verification**:
- [ ] `CURRENT_SCHEMA_VERSION` is 13
- [ ] `MIGRATIONS` record contains key `13`
- [ ] `013-account-colors.sql` exists and contains valid ALTER TABLE statement
- [ ] TypeScript compiles without errors (`npx tsc --noEmit`)

---

## Task 2: IPC Handler — `accounts:updateColor`

**Description**: Create new IPC handler module for account color CRUD operations, following the `gmail-handlers.ts` pattern.

**Files to create/modify**:
- CREATE `electron/main/ipc/account-color-handlers.ts`
- MODIFY `electron/main/ipc/index.ts` (add import + register call)

**Source references**:
- Handler pattern: `electron/main/ipc/gmail-handlers.ts:1-4` (imports: ipcMain type, Database type, z)
- Handler pattern: `electron/main/ipc/gmail-handlers.ts:48-52` (function signature)
- Zod schema pattern: `electron/main/ipc/gmail-handlers.ts:29-40` (module-scope schemas)
- Registration pattern: `electron/main/ipc/index.ts:1-14` (import + registerXxxHandlers)
- Registration call: `electron/main/ipc/index.ts:23-34` (registerIpcHandlers body)

**Implementation**:
1. Create `account-color-handlers.ts`:
   - Import `IpcMain` from `electron`, `Database` from `better-sqlite3`, `z` from `zod`
   - Define `UpdateColorSchema = z.object({ accountId: z.string().min(1), color: z.string().regex(/^#[0-9a-f]{6}$/).nullable() })`
   - Define `PRESET_COLORS` array (10 colors from spec)
   - Export `registerAccountColorHandlers(ipcMain, db)`:
     - `accounts:updateColor` handler: validate with Zod, run `UPDATE accounts SET color = ? WHERE id = ?`, return `{ success: true }`
     - `accounts:getDefaultColor` helper: assigns color from PRESET_COLORS based on account index (mod 10)
2. In `electron/main/ipc/index.ts`:
   - Add `import { registerAccountColorHandlers } from './account-color-handlers';`
   - Add `registerAccountColorHandlers(ipcMain, db);` call in `registerIpcHandlers`

**Verification**:
- [ ] Handler module compiles with correct types
- [ ] Zod schema validates `#RRGGBB` hex format correctly
- [ ] IPC registration appears in `registerIpcHandlers` body
- [ ] TypeScript compiles without errors

---

## Task 3: Modify `gmail:listAccounts` to return `color`

**Description**: Update the `gmail:listAccounts` handler to include the `color` field, and update the `GmailAccount` interface in `auth/gmail.ts`.

**Files to modify**:
- MODIFY `electron/main/auth/gmail.ts` (lines 13-17, 114-119)
- MODIFY `electron/main/ipc/gmail-handlers.ts` (lines 42-46, 151-158)

**Source references**:
- GmailAccount interface: `electron/main/auth/gmail.ts:13-17`
- listAccounts SQL: `electron/main/auth/gmail.ts:114-119`
- AccountResponse interface: `electron/main/ipc/gmail-handlers.ts:42-46`
- listAccounts handler: `electron/main/ipc/gmail-handlers.ts:151-158`

**Implementation**:
1. In `electron/main/auth/gmail.ts`:
   - Add `color: string | null` to `GmailAccount` interface (interface must be updated before SQL query uses it)
   - Update `listAccounts` SQL to `SELECT id, email, display_name, color FROM accounts WHERE type = 'gmail'`
2. In `electron/main/ipc/gmail-handlers.ts`:
   - Add `color: string | null` to `AccountResponse` interface
   - Update `gmail:listAccounts` handler return map to include `color: a.color ?? null`
   - Update `gmail:connect` handler return to include `color: null`

**Verification**:
- [ ] `gmail:listAccounts` returns objects with `id`, `email`, `displayName`, `color`
- [ ] New accounts get `color: null` (will be auto-assigned in frontend)
- [ ] TypeScript compiles without errors

---

## Task 4: Default Color Assignment on App Load

**Description**: Add logic to assign default colors to existing accounts that have `NULL` color, running on first app load after migration.

**Files to modify**:
- MODIFY `electron/main/db/index.ts` (add after migration run)

**Source references**:
- Migration execution: `electron/main/db/index.ts:50-89` (`runMigrations` function)
- Accounts table: `electron/main/db/migrations/001-initial.sql:2-9`
- PRESET_COLORS from spec: `specs/032-account-colors/spec.md:139-150`

**Implementation**:
1. Add `assignDefaultColors` function after `runMigrations`:
   - Query all accounts with `color IS NULL`
   - For each account, assign `PRESET_COLORS[index % 10]`
   - Update each account's color in a transaction
2. Call `assignDefaultColors(db)` after `runMigrations(db)` in `initializeDatabase`

**Verification**:
- [ ] Accounts with NULL color get assigned colors on first load
- [ ] Colors wrap around the 10-color palette for 10+ accounts
- [ ] Already-colored accounts are not overwritten
- [ ] Function runs in a single transaction

---

## Task 5: Preload — Add `accounts:updateColor` to Allowlist and API

**Description**: Add the new IPC channel to the preload allowlist and expose the `accounts.updateColor` method on `window.electronAPI`.

**Files to modify**:
- MODIFY `electron/preload/index.ts` (lines 3-63, 90-224)

**Source references**:
- ALLOWED_INVOKE set: `electron/preload/index.ts:3-63`
- contextBridge expose pattern: `electron/preload/index.ts:90-224`

**Implementation**:
1. Add `'accounts:updateColor'` to `ALLOWED_INVOKE` set (after `'gmail:syncStatus'`)
2. Add new `accounts` namespace to `contextBridge.exposeInMainWorld`:
   ```typescript
   accounts: {
     updateColor: (accountId: string, color: string | null) =>
       gatedInvoke('accounts:updateColor', { accountId, color }) as Promise<{ success: boolean }>,
   },
   ```

**Verification**:
- [ ] `'accounts:updateColor'` appears in `ALLOWED_INVOKE`
- [ ] `window.electronAPI.accounts.updateColor` is callable from renderer
- [ ] TypeScript compiles without errors

---

## Task 6: Settings UI — Account Colors Section

**Description**: Add an "Account Colors" section to Settings with a preset palette, custom hex input, and reset-to-default functionality.

**Files to modify**:
- MODIFY `src/components/Settings.tsx` (add section after Google Accounts section, ~line 238)

**Source references**:
- Settings sections pattern: `src/components/Settings.tsx:170-238` (Google Accounts section)
- Section styling pattern: `src/components/Settings.tsx:386-418` (Telemetry section)
- useState/useCallback pattern: `src/components/Settings.tsx:36-81`

**Implementation**:
1. Add `GmailAccountWithColor` interface extending `GmailAccount` with `color: string | null`
2. Add state: `accountColors`, `editingAccountId`, `editingColor`, `hexInput`, `hexError`
3. Add `loadAccountColors` callback using `window.electronAPI.gmail.listAccounts()`
4. Add `handleUpdateColor` callback using `window.electronAPI.accounts.updateColor()`
5. Add `handleResetColor` callback (sets color to null via `accounts:updateColor`)
6. Add "Account Colors" section UI:
   - Section header with subtitle "Customize colors to identify accounts"
   - For each account: color swatch circle + email + "Edit" button
   - Inline expandable picker when editing:
     - 2x5 grid of 10 preset color circles (click to select)
     - Custom hex input with `#RRGGBB` validation (validate before saving, show inline error for invalid input)
     - "Apply" and "Cancel" buttons
     - "Reset to Default" button
   - Empty state: "Connect an account to customize colors"
7. Color selection saves immediately on Apply (no save button)

**Verification**:
- [ ] Account Colors section renders below Google Accounts section
- [ ] Each account row shows color swatch + email + Edit button
- [ ] Clicking Edit opens inline color picker
- [ ] Preset palette shows 10 distinct color circles
- [ ] Custom hex input validates `#RRGGBB` format
- [ ] Invalid hex shows inline error message
- [ ] Apply saves color via IPC and updates swatch
- [ ] Reset to Default clears color (sets to null)
- [ ] Empty state shown when 0 accounts connected
- [ ] Works in both light and dark themes (colors from palette are theme-safe)

---

## Task 7: Email List — Color Indicator

**Description**: Add 3px left-border colored by account to each email card, and replace the native `<select>` account filter with a custom dropdown showing color dots.

**Files to modify**:
- MODIFY `src/components/EmailList.tsx` (lines 15-19, 162-171, 249-278)

**Source references**:
- Account interface: `src/components/EmailList.tsx:15-19`
- Filter dropdown (native select): `src/components/EmailList.tsx:162-171`
- Email card rendering: `src/components/EmailList.tsx:249-278`

**Implementation**:
1. Extend `Account` interface with `color: string | null`
2. Add `accountsColorMap: Record<string, string>` state (accountId → color)
3. Update `loadAccounts` to build color map from `listAccounts` response
4. Replace native `<select>` account filter with custom dropdown:
   - Button showing "All Accounts" or selected account email
   - Dropdown list with color dot (12px circle) + email per account
   - "All Accounts" option with no dot
   - Click outside to close
5. Add left border to email cards: `borderLeft: '3px solid {accountColor}'`
6. Look up account color from `accountsColorMap[email.accountId]`
7. Fallback to a default neutral color if account color is null

**Verification**:
- [ ] Each email card has a 3px left-border in the account's color
- [ ] Custom dropdown replaces native `<select>` for account filter
- [ ] Dropdown shows color dot next to each account name
- [ ] "All Accounts" option available
- [ ] Dropdown closes on outside click
- [ ] Colors work in both light and dark themes

---

## Task 8: Task List — Color Indicator

**Description**: Add 3px left-border colored by account to each task item, using the linked Gmail account's color.

**Files to modify**:
- MODIFY `src/components/TaskList.tsx` (lines 25-29, 52-77, 190-251)

**Source references**:
- Account interface: `src/components/TaskList.tsx:25-29`
- loadData function: `src/components/TaskList.tsx:60-77`
- Task list item rendering: `src/components/TaskList.tsx:190-251`

**Implementation**:
1. Extend `Account` interface with `color: string | null`
2. Update `loadData` to also call `window.electronAPI.gmail.listAccounts()` (which returns colors)
3. Build `accountsColorMap` from Gmail accounts (Google Tasks accounts inherit linked Gmail color)
4. Add left border to task `<li>`: `borderLeft: '3px solid {accountColor}'`
5. Look up account color from `accountsColorMap` (match by email since Google Tasks accounts share email with Gmail accounts)
6. Fallback to `GOOGLE_BLUE` if no color found

**Verification**:
- [ ] Each task item has a 3px left-border in the account's color
- [ ] Color is derived from the linked Gmail account
- [ ] Works alongside existing Google Tasks source badge
- [ ] Fallback to Google Blue when no color is set
- [ ] Colors work in both light and dark themes

---

## Execution Order

```
Task 1 (DB Migration) ──→ Task 3 (listAccounts color) ──→ Task 6 (Settings UI)
       ↓                           ↓
Task 2 (IPC Handler) ──→ Task 5 (Preload) ──→ Task 7 (Email List)
       ↓                                            ↓
Task 4 (Default Colors) ─────────────────────→ Task 8 (Task List)
```

**Parallelizable**: Tasks 1 and 2 can be done in parallel. Tasks 7 and 8 can be done in parallel after Task 5.

**Dependency note**: Task 4 requires Task 1 (DB Migration) to have run first — the `color` column must exist before `assignDefaultColors` can query it.

---

## Acceptance Criteria Checklist

- [ ] Color picker offers preset palette (10 colors) + custom hex input in Settings (Task 6)
- [ ] Custom hex validates as `#RRGGBB` (6-digit lowercase hex) (Task 6)
- [ ] Email list shows colored 3px left-border per email (Task 7)
- [ ] Task list shows colored 3px left-border per task (Task 8)
- [ ] Account filter dropdown shows color dots next to account names (Task 7)
- [ ] Colors persist across app restarts — SQLite storage (Task 1)
- [ ] Default colors auto-assigned on account connection (Task 4)
- [ ] Colors work in both light and dark themes (Tasks 6, 7, 8)
- [ ] "Reset to Default" option sets color back to auto-assigned (Task 6)
- [ ] IPC channels follow contextBridge allowlist pattern (Task 5)
- [ ] Zod validation on all new IPC handlers (Task 2)
- [ ] Migration applies cleanly on fresh and existing databases (Task 1)
- [ ] Empty state shown when 0 accounts connected (Task 6)
- [ ] `CURRENT_SCHEMA_VERSION` bumped from 12 to 13 (Task 1)
