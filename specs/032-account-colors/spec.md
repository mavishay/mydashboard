# Feature Specification: Account Tags/Labels with Color Settings

**Issue**: #32
**Wave**: 4-improvements
**Status**: Draft

---

## Summary

Add configurable color tags/labels to accounts so users can visually identify which account an email, task, or calendar event belongs to. Colors are stored in SQLite, configurable via Settings UI, and displayed as visual indicators throughout the app.

---

## Source Reference Analysis

| File | Line(s) | Pattern to Adopt | Notes |
|------|---------|-------------------|-------|
| `electron/main/db/index.ts` | 1-89 | Migration system: sequential SQL files, `CURRENT_SCHEMA_VERSION` constant, `MIGRATIONS` record | New migration at version 13 |
| `electron/main/ipc/gmail-handlers.ts` | 1-222 | `registerHandlers(ipcMain, db)` pattern with Zod schemas at module scope | Follow same pattern for account color handlers |
| `electron/preload/index.ts` | 1-224 | `ALLOWED_INVOKE` Set with `gatedInvoke` and `contextBridge.exposeInMainWorld` | Add new channels to allowlist |
| `src/components/Settings.tsx` | 1-421 | Section-based Settings UI with `useState`/`useCallback`/`useEffect` pattern | Add Account Colors section |
| `src/components/EmailList.tsx` | 1-284 | `Account` interface, `accounts` state, filter dropdown, email card rendering | Add color indicator to cards and filter |
| `src/components/TaskList.tsx` | 1-272 | `Account` interface, task list rendering with source badges | Add color indicator to task items |
| `electron/main/db/migrations/001-initial.sql` | 1-41 | `accounts` table schema: `id TEXT PRIMARY KEY`, `type`, `email`, `display_name` | Add `color TEXT` column |

---

## Requirements

### REQ-003: Account Badges

Display colored account indicators in the unified inbox and task list so users can visually identify which account each item belongs to.

### REQ-004: Per-Account Identity

Each account has a unique, user-configurable color that persists across app restarts and is used consistently in all account references.

### REQ-016: Source Badges

Task list shows colored account indicators alongside source badges (Google Tasks, TickTick) for multi-source task identification.

---

## Functional Requirements

### FR-001: Color Storage

- Add `color TEXT` column to `accounts` table (migration 013)
- Bump `CURRENT_SCHEMA_VERSION` from 12 to 13 in `electron/main/db/index.ts`
- Color stored as hex string in `#RRGGBB` format (lowercase, e.g., `#1976d2`) or `null` for default
- Colors persist across app restarts (SQLite storage)
- Color applies only to the main `accounts` table (Gmail/M365 accounts). Google Tasks and TickTick accounts inherit colors from their linked Gmail account in the accounts table

### FR-002: Default Color Assignment

- When a new account is connected, assign a default color from the preset palette
- Default colors auto-assigned sequentially from the palette, ensuring distinct colors per account
- Existing accounts without a color get assigned on first app load after migration (application code, not migration SQL)
- If 10+ accounts exist, colors wrap around the palette (mod 10)
- Users can reset a color back to `null` (auto-assigned) via a "Reset to Default" option in the color picker

### FR-003: Color Picker in Settings

- Settings UI shows a new "Account Colors" section
- Each connected account row shows a color swatch + email
- Clicking the swatch opens an inline color picker (expandable section, not modal):
  - Preset palette: 10 curated colors (distinct in both light and dark themes)
  - Custom hex input field with validation:
    - Format: `#RRGGBB` (6-digit hex, lowercase normalized)
    - Max length: 7 characters
    - Invalid input: show inline error, prevent save
  - "Reset to Default" button to clear custom color (sets to null, auto-assigned)
- Color changes save immediately on selection (no save button needed for this section)
- Empty state: if 0 accounts connected, show "Connect an account to customize colors"

### FR-004: Email List Color Indicator

- Each email card shows a 3px left-border colored by the account's color
- Account filter dropdown: replace native `<select>` with custom dropdown that shows color dots next to account names
- Color is consistent across light and dark themes

### FR-005: Task List Color Indicator

- Each task item shows a 3px left-border colored by the account's color
- Works alongside existing Google Tasks / TickTick source badges

### FR-006: Account List API Enhancement

- `gmail:listAccounts` returns `color` field alongside `id`, `email`, `displayName`
- New IPC channels: `accounts:updateColor` for saving color changes

---

## IPC Channel Specification

### New Channels

| Channel | Direction | Payload | Response |
|---------|-----------|---------|----------|
| `accounts:updateColor` | invoke | `{ accountId: string; color: string \| null }` | `{ success: boolean }` |

### Modified Channels

| Channel | Change |
|---------|--------|
| `gmail:listAccounts` | Add `color: string \| null` to response |

### Zod Validation Schema

```typescript
import { z } from 'zod';

const UpdateColorSchema = z.object({
  accountId: z.string().min(1),
  color: z.string().regex(/^#[0-9a-f]{6}$/).nullable(),
});
```

---

## Database Schema Change

### Migration 013: Account Colors

```sql
-- 013-account-colors.sql
ALTER TABLE accounts ADD COLUMN color TEXT;
```

- `color` is nullable (NULL = use default auto-assigned color)
- Stored as hex string (e.g., `#1976d2`)

---

## Preset Color Palette

```typescript
const PRESET_COLORS = [
  '#1976d2', // Blue
  '#388e3c', // Green
  '#f57c00', // Orange
  '#7b1fa2', // Purple
  '#c62828', // Red
  '#00838f', // Teal
  '#455a64', // Blue Grey
  '#ad1457', // Pink
  '#558b2f', // Light Green
  '#ef6c00', // Amber
] as const;
```

Colors chosen for:
- High contrast in both light and dark themes
- Sufficient distinction from each other
- Accessible against white and dark backgrounds

---

## UI Design

### Settings: Account Colors Section

```
┌─────────────────────────────────────────┐
│ Account Colors                          │
│ Customize colors to identify accounts    │
│                                          │
│ ● #1976d2  user@gmail.com       [Edit]  │
│ ● #388e3c  client@company.com   [Edit]  │
│ ● #f57c00  work@domain.com      [Edit]  │
└─────────────────────────────────────────┘
```

Clicking [Edit] opens an inline color picker:

```
┌─────────────────────────────────────────┐
│ Pick a color for user@gmail.com         │
│                                          │
│ ● ● ● ● ●                              │
│ ● ● ● ● ●                              │
│                                          │
│ Custom: [#1976d2] [_______]             │
│                      [Apply] [Cancel]    │
└─────────────────────────────────────────┘
```

### Email List: Color Indicator

```
┌─────────────────────────────────────────┐
│ ● John Doe              Urgent  2m ago  │
│   Meeting tomorrow                                  │
│   Hey, can we reschedule...                          │
└─────────────────────────────────────────┘
```

The `●` is colored by account color. The left border of the card uses the same color.

### Task List: Color Indicator

```
○ ● Google Tasks  Review PR #123    due today
○ ● Google Tasks  Update docs       due tomorrow
○ ● TickTick      Call client       overdue
```

The `●` before the source badge uses the account color.

---

## File Changes

### New Files

| File | Purpose |
|------|---------|
| `electron/main/db/migrations/013-account-colors.sql` | Database migration |
| `electron/main/ipc/account-color-handlers.ts` | IPC handlers for color CRUD |

### Modified Files

| File | Changes |
|------|---------|
| `electron/main/db/index.ts` | Import migration 013, bump `CURRENT_SCHEMA_VERSION` to 13 |
| `electron/main/ipc/index.ts` | Import and register `registerAccountColorHandlers` |
| `electron/preload/index.ts` | Add `accounts:updateColor` to `ALLOWED_INVOKE`, expose `accounts.updateColor` API |
| `src/components/Settings.tsx` | Add Account Colors section with color picker |
| `src/components/EmailList.tsx` | Add color indicator to email cards, color dots in filter dropdown |
| `src/components/TaskList.tsx` | Add color indicator to task items |

---

## Acceptance Criteria

- [ ] Color picker offers preset palette (10 colors) + custom hex input in Settings
- [ ] Custom hex validates as `#RRGGBB` (6-digit lowercase hex)
- [ ] Email list shows colored 3px left-border per email
- [ ] Task list shows colored 3px left-border per task
- [ ] Account filter dropdown shows color dots next to account names (custom dropdown, not native select)
- [ ] Colors persist across app restarts (SQLite storage)
- [ ] Default colors auto-assigned on account connection (distinct per account, wraps at 10+)
- [ ] Colors work in both light and dark themes
- [ ] "Reset to Default" option sets color back to auto-assigned
- [ ] IPC channels follow contextBridge allowlist pattern
- [ ] Zod validation on all new IPC handlers
- [ ] Migration applies cleanly on fresh and existing databases
- [ ] Empty state shown when 0 accounts connected
- [ ] `CURRENT_SCHEMA_VERSION` bumped from 12 to 13

---

## Non-Goals

- Calendar event coloring (blocked by issue #17, not implemented yet)
- Bulk color operations (assign all, reset all)
- Color import/export functionality
- Modifying core email/task data structures (only add color metadata to accounts)

---

## Dependencies

- **Blocked by**: None
- **Blocks**: None
- **Related**: Issue #29 (Calendar view - future use of account colors)

---

## Labels

`enhancement`, `wave: 4-improvements`
