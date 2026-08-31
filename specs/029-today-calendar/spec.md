# Feature Specification: Today Calendar View

**Issue**: #29
**Wave**: 4-improvements
**Status**: Draft
**Created**: 2026-08-31

---

## 1. Overview

Add a compact "Today" calendar view above the task list in the right column of the dashboard. This widget shows all events from all connected Google Calendar accounts for the current day, providing at-a-glance awareness of meetings and time blocks alongside tasks.

**Demo Sentence:** User opens the app and sees today's calendar events (with time, title, and account color) displayed above the task list, syncing automatically every 5 minutes.

---

## 2. Requirements

### 2.1 Core Requirements

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| REQ-001 | Fetch today's events from Google Calendar API for all connected accounts | Must | Events from every connected Google account appear in the widget |
| REQ-002 | Display events as a vertical timeline with time range, title, and account indicator | Must | Each event row shows start–end time, summary, and a colored dot for the account |
| REQ-003 | Calendar widget positioned above the task list in the right column | Must | Widget renders in the right column, above `<TaskList />`, max ~200px height |
| REQ-004 | Sync calendar events every 5 minutes | Must | Background poll updates the `calendar_events` table and notifies the renderer |
| REQ-005 | Click event opens details or Google Calendar in browser | Must | Clicking an event opens its Google Calendar URL via `shell:openExternal` |
| REQ-006 | Empty state shows "No events today" | Must | When zero events exist for today, display the empty state message |
| REQ-007 | OAuth scope `calendar.readonly` requested during account connection | Must | New and existing accounts request the calendar read scope |
| REQ-008 | Zod validation on all IPC payloads | Must | Every calendar IPC handler validates input with Zod schemas |
| REQ-009 | contextBridge allowlist enforcement | Must | New IPC channels added to `ALLOWED_INVOKE` set |

### 2.2 Security Requirements

| ID | Requirement | Source | Acceptance Criteria |
|----|-------------|--------|---------------------|
| SEC-001 | No `nodeIntegration` in renderer | Constitution: Security by Default | Calendar data fetched only via IPC from main process |
| SEC-002 | IPC channels explicitly allowlisted | CDR: rule-electron-contextbridge-allowlist | All calendar channels in `ALLOWED_INVOKE` |
| SEC-003 | Zod validation on all IPC payloads | CDR: rule-ts-zod-validation | `Schema.safeParse()` in every handler before business logic |
| SEC-004 | Tokens never stored in plain text | PDR-002 | Reuse existing `electron-safeStorage` token infrastructure |

### 2.3 Database Requirements

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| DB-001 | `calendar_events` table stores today's events | Must | Table created with migration 020, stores event data per account |
| DB-002 | Indexed by `start_time` and `account_id` | Must | Queries for today's events use index scans |
| DB-003 | Events upserted on sync (deduplicate by `google_event_id`) | Must | Re-syncing the same events does not create duplicates |

---

## 3. Constraints

### 3.1 Technical Constraints

| Constraint | Rationale |
|------------|-----------|
| Electron 33 + React 19 + TypeScript 5.7 | Existing stack |
| Same Google OAuth credentials as Gmail/Tasks | No separate OAuth app needed |
| Inline styles only (no CSS framework) | Project convention |
| Zod validation on all IPC payloads | Team security directive |
| contextBridge allowlist security model | Electron security best practice |
| Vitest 3 for testing | Existing test framework |
| Reuse `electron-safeStorage` for token encryption | Existing infrastructure in `electron/main/auth/gmail.ts` |

### 3.2 Non-Goals (This Feature)

| Excluded | Rationale |
|----------|-----------|
| Full calendar unification | Only show today, not full calendar management |
| Calendar write/edit operations | Read-only view |
| Multiple calendar providers | Google only for v1 |
| Recurring event management | Show as individual events |
| n8n integration changes | Separate concern |
| Full calendar navigation (week/month views) | Today view only |
| Calendar event creation | Read-only |
| All-day event grouping | Display inline like other events |

---

## 4. Technical Design

### 4.1 OAuth Scope Extension

The existing Gmail OAuth flow in `electron/main/ipc/gmail-handlers.ts:24-28` uses these scopes:

```typescript
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.labels',
  'https://www.googleapis.com/auth/tasks',
];
```

**Change:** Add `https://www.googleapis.com/auth/calendar.readonly` to `GOOGLE_SCOPES`.

For existing accounts that lack the calendar scope, the sync service will detect `403` responses and log a warning. A future enhancement can prompt re-authentication; for v1, new connections include the scope automatically.

### 4.2 Database Schema (Migration 020)

```sql
-- electron/main/db/migrations/020-calendar-events.sql
CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  google_event_id TEXT NOT NULL,
  summary TEXT,
  description TEXT,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  all_day INTEGER DEFAULT 0,
  location TEXT,
  hangout_link TEXT,
  html_link TEXT,
  status TEXT DEFAULT 'confirmed',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_calendar_events_start_time ON calendar_events(start_time);
CREATE INDEX idx_calendar_events_account_id ON calendar_events(account_id);
CREATE UNIQUE INDEX idx_calendar_events_google_id ON calendar_events(account_id, google_event_id);
```

**Schema version bump:** `CURRENT_SCHEMA_VERSION` from 19 → 20 in `electron/main/db/index.ts`.

### 4.3 Calendar API Client

Create `electron/main/calendar/google-calendar-api.ts`:

```typescript
import { google } from 'googleapis';
import type Database from 'better-sqlite3';
import { getValidAccessToken } from '../auth/google-tasks';

export interface CalendarEvent {
  id: string;
  accountId: string;
  googleEventId: string;
  summary: string | null;
  description: string | null;
  startTime: string;
  endTime: string;
  allDay: boolean;
  location: string | null;
  hangoutLink: string | null;
  htmlLink: string | null;
  status: string;
}

export async function fetchTodayEvents(
  db: Database.Database,
  accountId: string
): Promise<CalendarEvent[]> {
  const accessToken = await getValidAccessToken(db, accountId);
  const calendar = google.calendar({ version: 'v3', auth: new google.auth.OAuth2() });

  // Set credentials directly
  calendar.context._options.auth = undefined;
  // Use the access token via headers

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 50,
  });

  return (response.data.items ?? []).map((event) => ({
    id: `${accountId}-${event.id}`,
    accountId,
    googleEventId: event.id ?? '',
    summary: event.summary ?? null,
    description: event.description ?? null,
    startTime: event.start?.dateTime ?? event.start?.date ?? '',
    endTime: event.end?.dateTime ?? event.end?.date ?? '',
    allDay: !event.start?.dateTime,
    location: event.location ?? null,
    hangoutLink: event.hangoutLink ?? null,
    htmlLink: event.htmlLink ?? null,
    status: event.status ?? 'confirmed',
  }));
}
```

### 4.4 Calendar Sync Service

Create `electron/main/calendar/calendar-sync.ts`:

```typescript
import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { fetchTodayEvents, CalendarEvent } from './google-calendar-api';

export interface CalendarSyncResult {
  accountId: string;
  eventsCount: number;
  error?: string;
}

export async function syncTodayEvents(
  db: Database.Database
): Promise<CalendarSyncResult[]> {
  const accounts = db
    .prepare("SELECT id FROM accounts WHERE type = 'gmail'")
    .all() as { id: string }[];

  const results: CalendarSyncResult[] = [];

  for (const account of accounts) {
    try {
      const events = await fetchTodayEvents(db, account.id);
      upsertEvents(db, account.id, events);
      results.push({ accountId: account.id, eventsCount: events.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ accountId: account.id, eventsCount: 0, error: message });
    }
  }

  return results;
}

function upsertEvents(
  db: Database.Database,
  accountId: string,
  events: CalendarEvent[]
): void {
  // Delete old events for this account, then insert new ones
  db.prepare('DELETE FROM calendar_events WHERE account_id = ?').run(accountId);

  const insert = db.prepare(`
    INSERT INTO calendar_events (id, account_id, google_event_id, summary, description, start_time, end_time, all_day, location, hangout_link, html_link, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((items: CalendarEvent[]) => {
    for (const event of items) {
      insert.run(
        event.id,
        event.accountId,
        event.googleEventId,
        event.summary,
        event.description,
        event.startTime,
        event.endTime,
        event.allDay ? 1 : 0,
        event.location,
        event.hangoutLink,
        event.htmlLink,
        event.status
      );
    }
  });

  insertMany(events);
}

export function getTodayEvents(
  db: Database.Database
): Array<CalendarEvent & { accountEmail: string; accountColor: string | null }> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  return db
    .prepare(`
      SELECT ce.*, a.email as accountEmail, a.color as accountColor
      FROM calendar_events ce
      JOIN accounts a ON a.id = ce.account_id
      WHERE ce.start_time >= ? AND ce.start_time < ?
      ORDER BY ce.start_time ASC
    `)
    .all(startOfDay.toISOString(), endOfDay.toISOString()) as Array<CalendarEvent & { accountEmail: string; accountColor: string | null }>;
}
```

### 4.5 IPC Channel Design

**New Allowed Channels:**

```typescript
// electron/preload/index.ts — add to ALLOWED_INVOKE
'calendar:sync',
'calendar:getTodayEvents',
```

**New IPC Handlers:**

```typescript
// electron/main/ipc/calendar-handlers.ts
import { z } from 'zod';
import type Database from 'better-sqlite3';
import { syncTodayEvents, getTodayEvents } from '../calendar/calendar-sync';

export function registerCalendarHandlers(
  ipcMain: typeof import('electron').ipcMain,
  db: Database.Database
): void {
  ipcMain.handle('calendar:sync', async () => {
    const results = await syncTodayEvents(db);
    return results;
  });

  ipcMain.handle('calendar:getTodayEvents', async () => {
    return getTodayEvents(db);
  });
}
```

**Preload API:**

```typescript
// electron/preload/index.ts — add to contextBridge.exposeInMainWorld
calendar: {
  sync: () =>
    gatedInvoke('calendar:sync') as Promise<Array<{ accountId: string; eventsCount: number; error?: string }>>,
  getTodayEvents: () =>
    gatedInvoke('calendar:getTodayEvents') as Promise<Array<{
      id: string;
      accountId: string;
      summary: string | null;
      startTime: string;
      endTime: string;
      allDay: boolean;
      location: string | null;
      hangoutLink: string | null;
      htmlLink: string | null;
      accountEmail: string;
      accountColor: string | null;
    }>>,
},
```

### 4.6 Cron Integration

Extend `electron/main/cron/cron-scheduler.ts` to call `syncTodayEvents` on each tick, alongside the existing email fetch and classification:

```typescript
// In CronScheduler.tick(), add:
import { syncTodayEvents } from '../calendar/calendar-sync';

// After fetchEmailsForAllAccounts and classifyForAllAccounts:
try {
  await syncTodayEvents(this.db);
} catch (err) {
  console.error('[CronScheduler] Calendar sync failed:', err);
}
```

The existing cron interval (configurable, defaults to work-hours polling) handles the 5-minute sync cadence. Calendar sync runs as part of the same tick.

### 4.7 Calendar Widget UI

Create `src/components/TodayCalendar.tsx`:

```typescript
// Compact calendar widget showing today's events
// - Max height ~200px with overflow scroll
// - Each event row: time range | title | account color dot
// - Empty state: "No events today"
// - Loading skeleton while initial load
// - Click event → open Google Calendar in browser
```

**UI Layout:**

```
┌─────────────────────────────────────┐
│ Today · Monday, Aug 31              │
│                                     │
│ 09:00–09:30  Standup      ● blue   │
│ 10:00–11:00  Design Review ● green  │
│ 14:00–15:00  Client Call   ● orange │
│                                     │
│ (scrollable if > 5 events)          │
└─────────────────────────────────────┘
```

- `●` = 10px circle filled with account color (from Issue #32)
- Time range formatted as `HH:MM–HH:MM` (24h) or `h:MM AM–h:MM PM` (12h based on locale)
- All-day events shown at top with "All day" label instead of time range
- Events sorted by start time ascending
- Clicking an event calls `window.electronAPI.shell.openExternal(event.htmlLink)`

### 4.8 Dashboard Integration

Modify `src/components/Dashboard.tsx`:

```tsx
// Right column becomes:
<div style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '1rem', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
  <TodayCalendar />
  <div style={{ borderTop: '1px solid #e5e7eb', marginTop: '0.75rem', paddingTop: '0.75rem' }}>
    <h2 style={{ margin: '0 0 1rem 0' }}>Tasks</h2>
    <TaskList />
  </div>
</div>
```

The `<TodayCalendar />` component self-manages its height (max ~200px) and does not require props — it fetches its own data via IPC.

---

## 5. File Changes

### New Files

| File | Purpose |
|------|---------|
| `electron/main/db/migrations/020-calendar-events.sql` | Database migration for calendar_events table |
| `electron/main/calendar/google-calendar-api.ts` | Google Calendar API client (fetch today's events) |
| `electron/main/calendar/calendar-sync.ts` | Calendar sync service (upsert events, query today) |
| `electron/main/ipc/calendar-handlers.ts` | IPC handlers for calendar:sync and calendar:getTodayEvents |
| `src/components/TodayCalendar.tsx` | React widget for today's calendar events |

### Modified Files

| File | Changes |
|------|---------|
| `electron/main/db/index.ts` | Import migration 020, bump `CURRENT_SCHEMA_VERSION` from 19 to 20 |
| `electron/main/ipc/gmail-handlers.ts` | Add `calendar.readonly` to `GOOGLE_SCOPES` array (line 24) |
| `electron/main/ipc/index.ts` | Import and register `registerCalendarHandlers` |
| `electron/preload/index.ts` | Add `calendar:sync` and `calendar:getTodayEvents` to `ALLOWED_INVOKE`; expose `calendar` namespace on `window.electronAPI` |
| `electron/main/cron/cron-scheduler.ts` | Call `syncTodayEvents` in `tick()` method |
| `src/components/Dashboard.tsx` | Add `<TodayCalendar />` above `<TaskList />` in right column |

---

## 6. Success Criteria

### 6.1 Functional Criteria

| ID | Criterion | Measurement |
|----|-----------|-------------|
| SC-001 | Today's events appear above the task list | Manual: open app, verify calendar widget renders above tasks |
| SC-002 | Events from all connected Google accounts shown | Manual: connect 2+ accounts, verify events from each appear |
| SC-003 | Events display time range, title, and account indicator | Manual: verify each event row shows time, summary, color dot |
| SC-004 | Calendar syncs every 5 minutes | Manual: add event in Google Calendar, verify it appears within 5 min |
| SC-005 | Click event opens Google Calendar in browser | Manual: click an event, verify browser opens to event URL |
| SC-006 | Empty state shows "No events today" | Manual: verify message when no events exist |
| SC-007 | OAuth scope for calendar.readonly requested | Code review: scope in `GOOGLE_SCOPES` array |
| SC-008 | Calendar widget is compact (~200px height) | Manual: widget does not dominate right column |
| SC-009 | All existing tests continue to pass | `npm run test` passes |

### 6.2 Security Criteria

| ID | Criterion | Measurement |
|----|-----------|-------------|
| SEC-SC-001 | No `nodeIntegration` in renderer | Code review: calendar data only via IPC |
| SEC-SC-002 | All IPC channels allowlisted | Code review: `ALLOWED_INVOKE` contains calendar channels |
| SEC-SC-003 | Zod validation on IPC payloads | Code review: handlers use `safeParse` |
| SEC-SC-004 | Tokens encrypted | Code review: reuse `getValidAccessToken` from `google-tasks.ts` |

### 6.3 Quality Criteria

| ID | Criterion | Measurement |
|----|-----------|-------------|
| QC-001 | TypeScript strict mode | `npx tsc --noEmit` passes |
| QC-002 | No lint errors | `npm run lint` passes |
| QC-003 | Calendar IPC handlers have unit tests | Test coverage for `calendar-handlers.ts` |
| QC-004 | Calendar sync service has unit tests | Test coverage for `calendar-sync.ts` |

---

## 7. Test Plan

### 7.1 Unit Tests

| Test | File | Validates |
|------|------|-----------|
| Zod schema validates sync payload | `ipc/calendar-handlers.test.ts` | SEC-003 |
| `getTodayEvents` returns events for current day only | `calendar/calendar-sync.test.ts` | SC-001 |
| `upsertEvents` deduplicates by `google_event_id` | `calendar/calendar-sync.test.ts` | DB-003 |
| `fetchTodayEvents` handles API errors gracefully | `calendar/google-calendar-api.test.ts` | SC-002 |
| Empty state returned when no events exist | `calendar/calendar-sync.test.ts` | SC-006 |

### 7.2 Integration Tests

| Test | File | Validates |
|------|------|-----------|
| Full sync flow: API → DB → IPC response | `calendar/calendar-sync.integration.test.ts` | SC-001, SC-002 |
| Calendar widget renders events from IPC data | `components/TodayCalendar.test.tsx` | SC-003, SC-006 |

### 7.3 Platform-Mocked Tests

Per CDR: rule-testing-platform-mocked, all Electron tests must mock native modules:

```typescript
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  shell: { openExternal: vi.fn() },
}));
```

---

## 8. Dependencies

| Dependency | Purpose | Version Constraint |
|------------|---------|-------------------|
| googleapis | Google Calendar API v3 | ^140.0.0 (already in project) |
| better-sqlite3 | Database queries | ^11.0.0 (already in project) |
| zod | IPC payload validation | ^3.23.0 (already in project) |
| uuid | Event ID generation | Already in project |

---

## 9. Open Questions

| ID | Question | Resolution |
|----|----------|------------|
| OQ-001 | How to handle existing accounts without calendar scope? | v1: log warning on 403, future: prompt re-auth |
| OQ-002 | Should calendar sync be a separate cron job or part of existing tick? | Part of existing cron tick (simpler, aligns with email sync cadence) |
| OQ-003 | Time format: 12h or 24h? | Use locale-based formatting via `Intl.DateTimeFormat` |

---

## 10. PDR Traceability

| PDR | Decision | Impact on This Feature |
|-----|----------|----------------------|
| PDR-001 | Electron + LAN | Desktop OAuth flow for Calendar API |
| PDR-002 | BYOK cloud-first | User's own Google OAuth credentials used |
| PDR-005 | Multi-Hat Consultant | Needs at-a-glance calendar awareness |
| PDR-007 | Gmail-first phasing | Google Calendar is natural extension of Gmail OAuth |

---

## 11. Definition of Done

- [ ] Calendar events table created via migration 020
- [ ] `CURRENT_SCHEMA_VERSION` bumped from 19 to 20
- [ ] `calendar.readonly` scope added to `GOOGLE_SCOPES`
- [ ] `google-calendar-api.ts` fetches today's events from Google Calendar API
- [ ] `calendar-sync.ts` upserts events and queries today's events
- [ ] `calendar-handlers.ts` registers `calendar:sync` and `calendar:getTodayEvents` IPC handlers
- [ ] Preload allowlist includes `calendar:sync` and `calendar:getTodayEvents`
- [ ] `window.electronAPI.calendar` namespace exposed in preload
- [ ] `TodayCalendar.tsx` renders events with time, title, and account color dot
- [ ] `<TodayCalendar />` positioned above `<TaskList />` in Dashboard right column
- [ ] Widget height capped at ~200px with scroll overflow
- [ ] Click event opens Google Calendar URL in browser
- [ ] Empty state shows "No events today"
- [ ] Cron scheduler calls `syncTodayEvents` on each tick
- [ ] Zod validation on all calendar IPC handlers
- [ ] Unit tests pass for calendar handlers and sync service
- [ ] All existing tests continue to pass
- [ ] `npm run lint` and `npm run typecheck` pass
