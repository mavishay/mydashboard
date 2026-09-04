# Calendar Component Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix calendar component to load events instantly from local DB, hide past/all-day events, and sync auto-refresh with email cron timing

**Architecture:** Backend query changes to filter events, frontend instant load with background sync, cron event listener for auto-refresh

**Tech Stack:** TypeScript, better-sqlite3, React, Electron IPC, shadcn/ui

---

## File Structure

| File | Purpose |
|------|---------|
| `electron/main/calendar/calendar-sync.ts` | Update query, add date range method |
| `electron/main/ipc/calendar-handlers.ts` | Add filtered events handler |
| `src/components/TodayCalendar.tsx` | Instant load, background sync, cron listener |
| `electron/preload/index.ts` | Add new IPC channel |

---

### Task 1: Update Backend Query to Filter Events

**Files:**
- Modify: `electron/main/calendar/calendar-sync.ts:45-65`

- [ ] **Step 1: Update `getTodayEvents()` method**

```typescript
// In CalendarSync class
getTodayEvents(): CalendarEvent[] {
  const now = new Date().toISOString();
  return this.db.prepare(`
    SELECT 
      ce.*,
      a.email as accountEmail,
      a.color as accountColor
    FROM calendar_events ce
    JOIN accounts a ON ce.account_id = a.id
    WHERE date(ce.start_time) = date('now')
      AND ce.all_day = 0
      AND ce.end_time > ?
    ORDER BY ce.start_time ASC
  `).all(now) as CalendarEvent[];
}
```

- [ ] **Step 2: Add `getEventsForDateRange()` method**

```typescript
// In CalendarSync class
getEventsForDateRange(startDate: string, endDate: string): CalendarEvent[] {
  const now = new Date().toISOString();
  return this.db.prepare(`
    SELECT 
      ce.*,
      a.email as accountEmail,
      a.color as accountColor
    FROM calendar_events ce
    JOIN accounts a ON ce.account_id = a.id
    WHERE date(ce.start_time) >= date(?)
      AND date(ce.start_time) <= date(?)
      AND ce.all_day = 0
      AND ce.end_time > ?
    ORDER BY ce.start_time ASC
  `).all(startDate, endDate, now) as CalendarEvent[];
}
```

- [ ] **Step 3: Test query changes**

Run: `pnpm test -- --grep "calendar"`
Expected: Existing tests pass

- [ ] **Step 4: Commit**

```bash
git add electron/main/calendar/calendar-sync.ts
git commit -m "fix(calendar): filter out past and all-day events from query"
```

---

### Task 2: Add IPC Handler for Filtered Events

**Files:**
- Modify: `electron/main/ipc/calendar-handlers.ts:1-30`

- [ ] **Step 1: Add `getFilteredEvents` handler**

```typescript
// In calendar-handlers.ts
ipcMain.handle('calendar:getFilteredEvents', async (_, { startDate, endDate }) => {
  const db = getDatabase();
  const calendarSync = new CalendarSync(db);
  return calendarSync.getEventsForDateRange(startDate, endDate);
});
```

- [ ] **Step 2: Update preload to expose new channel**

```typescript
// In electron/preload/index.ts
calendar: {
  syncAll: () => ipcRenderer.invoke('calendar:syncAll'),
  getTodayEvents: () => ipcRenderer.invoke('calendar:getTodayEvents'),
  getFilteredEvents: (startDate: string, endDate: string) => 
    ipcRenderer.invoke('calendar:getFilteredEvents', { startDate, endDate }),
  status: () => ipcRenderer.invoke('calendar:status'),
},
```

- [ ] **Step 3: Test IPC handler**

Run: `pnpm test -- --grep "calendar"`
Expected: Tests pass

- [ ] **Step 4: Commit**

```bash
git add electron/main/ipc/calendar-handlers.ts electron/preload/index.ts
git commit -m "feat(calendar): add IPC handler for filtered events"
```

---

### Task 3: Implement Instant Load in Frontend

**Files:**
- Modify: `src/components/TodayCalendar.tsx:1-50`

- [ ] **Step 1: Add instant load on mount**

```typescript
// In TodayCalendar component
useEffect(() => {
  // Instant load from local DB
  loadEventsFromDB();
  // Background sync
  syncInBackground();
}, []);

const loadEventsFromDB = async () => {
  try {
    const events = await window.electronAPI.calendar.getTodayEvents();
    setEvents(events);
    setError(null);
  } catch (err) {
    console.error('Failed to load events:', err);
    setError('Failed to load events');
  }
};

const syncInBackground = async () => {
  try {
    await window.electronAPI.calendar.syncAll();
    // Re-fetch after sync completes
    const updatedEvents = await window.electronAPI.calendar.getTodayEvents();
    setEvents(updatedEvents);
  } catch (err) {
    console.error('Background sync failed:', err);
    // Don't show error - we already have cached events
  }
};
```

- [ ] **Step 2: Remove polling interval**

```typescript
// Remove this useEffect
useEffect(() => {
  const interval = setInterval(fetchEvents, 5 * 60 * 1000);
  return () => clearInterval(interval);
}, []);
```

- [ ] **Step 3: Test instant load**

Run: `pnpm dev`
Expected: Events load immediately on page refresh

- [ ] **Step 4: Commit**

```bash
git add src/components/TodayCalendar.tsx
git commit -m "fix(calendar): implement instant load from local DB"
```

---

### Task 4: Add Cron Event Listener for Auto-Refresh

**Files:**
- Modify: `src/components/TodayCalendar.tsx:50-80`

- [ ] **Step 1: Add cron event listener**

```typescript
// In TodayCalendar component
useEffect(() => {
  const unsubscribe = window.electronAPI.cron.onStatusUpdate(() => {
    // Re-fetch events after cron tick
    loadEventsFromDB();
  });
  return unsubscribe;
}, []);
```

- [ ] **Step 2: Test auto-refresh**

Run: `pnpm dev`
Expected: Events update automatically after cron tick

- [ ] **Step 3: Commit**

```bash
git add src/components/TodayCalendar.tsx
git commit -m "feat(calendar): add cron event listener for auto-refresh"
```

---

### Task 5: Update Frontend Query for Date Range

**Files:**
- Modify: `src/components/TodayCalendar.tsx:80-100`

- [ ] **Step 1: Add date range state**

```typescript
const [dateRange, setDateRange] = useState({
  startDate: new Date().toISOString().split('T')[0],
  endDate: new Date().toISOString().split('T')[0]
});
```

- [ ] **Step 2: Update loadEventsFromDB to use date range**

```typescript
const loadEventsFromDB = async () => {
  try {
    const events = await window.electronAPI.calendar.getFilteredEvents(
      dateRange.startDate,
      dateRange.endDate
    );
    setEvents(events);
    setError(null);
  } catch (err) {
    console.error('Failed to load events:', err);
    setError('Failed to load events');
  }
};
```

- [ ] **Step 3: Test date range filtering**

Run: `pnpm dev`
Expected: Only today's future events show

- [ ] **Step 4: Commit**

```bash
git add src/components/TodayCalendar.tsx
git commit -m "feat(calendar): implement date range filtering"
```

---

### Task 6: Verify and Test

**Files:**
- None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `pnpm test`
Expected: All tests pass

- [ ] **Step 2: Manual testing checklist**

- [ ] Events load instantly on page refresh
- [ ] Past events (end_time < now) are hidden
- [ ] All-day events are hidden
- [ ] Auto-refresh works with cron
- [ ] Background sync updates view without blocking

- [ ] **Step 3: Commit (if any fixes needed)**

```bash
git add .
git commit -m "fix(calendar): resolve test failures"
```

---

## Acceptance Criteria

- [ ] Events load instantly from local DB on page refresh
- [ ] Past events (end_time < now) are hidden
- [ ] All-day events are hidden
- [ ] Auto-refresh matches email cron timing
- [ ] Background sync updates view without blocking

## Next Steps

After completing this plan, proceed to the Home Page Redesign implementation plan.
