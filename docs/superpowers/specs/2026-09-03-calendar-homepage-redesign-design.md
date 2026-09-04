# Calendar & Home Page Redesign Design

**Date:** 2026-09-03  
**Status:** Approved  
**Scope:** Calendar component fix + Home page full redesign

---

## Issue 1: Calendar Component Fix

### Problem Statement

The calendar component has several issues:
1. **5-7 second delay on page refresh** - Events take time to load because the component waits for a full sync before displaying
2. **All-day events showing** - Should be hidden per requirements
3. **Past events displayed** - Events that have ended (end_time < now) are still shown
4. **Auto-refresh not synced** - Calendar refresh timing doesn't match email cron

### Requirements

- Load events instantly from local DB on page load
- Background sync updates view without blocking
- Filter out all-day events
- Hide events where end_time < datetime('now')
- Auto-refresh matches email cron timing (5 min work hours, 60 min off-hours)

### Design: Instant Load + Background Sync

#### Backend Changes

**1. Update `getTodayEvents()` query in `calendar-sync.ts`:**

Current query shows all today's events:
```sql
SELECT * FROM calendar_events WHERE date(start_time) = date('now')
```

New query filters appropriately:
```sql
SELECT * FROM calendar_events 
WHERE date(start_time) = date('now')
  AND all_day = 0
  AND end_time > datetime('now')
ORDER BY start_time ASC
```

**2. Add `getEventsForDateRange()` method:**
- Accept start/end date parameters
- Allow fetching events for any date range (for future calendar views)
- Same filtering logic (no all-day, no past events)

**3. Add IPC handler for filtered events:**
- `calendar:getFilteredEvents` - accepts date range and filters
- Returns filtered events from local DB

#### Frontend Changes

**1. Instant load on mount in `TodayCalendar.tsx`:**
```typescript
// On mount, load from DB immediately
useEffect(() => {
  loadEventsFromDB(); // Instant load from local DB
  syncInBackground(); // Background sync
}, []);

const loadEventsFromDB = async () => {
  const events = await window.electronAPI.calendar.getTodayEvents();
  setEvents(events);
};

const syncInBackground = async () => {
  await window.electronAPI.calendar.syncAll();
  // Re-fetch after sync completes
  const updatedEvents = await window.electronAPI.calendar.getTodayEvents();
  setEvents(updatedEvents);
};
```

**2. Background sync without blocking:**
- Show cached events immediately
- Trigger sync in background
- Update view when sync completes
- No loading spinner - seamless update

**3. Auto-refresh via cron events:**
```typescript
useEffect(() => {
  const unsubscribe = window.electronAPI.cron.onStatusUpdate(() => {
    // Re-fetch events after cron tick
    loadEventsFromDB();
  });
  return unsubscribe;
}, []);
```

**4. Keep polling as fallback:**
- 5-minute polling interval as backup
- But prioritize event-driven updates from cron

### Files to Modify

| File | Changes |
|------|---------|
| `electron/main/calendar/calendar-sync.ts` | Update query, add date range method |
| `electron/main/ipc/calendar-handlers.ts` | Add filtered events handler |
| `src/components/TodayCalendar.tsx` | Instant load, background sync, cron listener |
| `electron/preload/index.ts` | Add new IPC channel |

### Testing

- Verify events load instantly on page refresh
- Verify past events are hidden
- Verify all-day events are hidden
- Verify auto-refresh works with cron
- Verify background sync updates view

---

## Issue 2: Home Page Full Redesign

### Problem Statement

The home page shows all emails (urgent, action, fyi, noise) which is overwhelming. Users need a way to focus on important emails. Additionally, components need UI polish and consistency.

### Requirements

- Show only urgent emails by default
- Add tabs to switch between Urgent and Action emails
- General UI/UX improvements across all components
- Better layout and spacing

### Design: Tabs + Full Component Redesign

#### 1. Email Tabs (Urgent + Action)

**New EmailList component structure:**
```
EmailList
├── Tab Bar (Urgent | Action)
├── Email List (filtered by tab)
└── Empty State (per tab)
```

**Backend changes:**

Add new IPC handler in `email-handlers.ts`:
```typescript
ipcMain.handle('email:getByClassification', async (_, classification: string) => {
  return db.prepare(`
    SELECT * FROM emails 
    WHERE classification = ? 
      AND is_read = 0 
    ORDER BY received_at DESC
  `).all(classification);
});
```

**Frontend changes:**

Update `EmailList.tsx`:
```typescript
const [activeTab, setActiveTab] = useState<'urgent' | 'action'>('urgent');
const [urgentEmails, setUrgentEmails] = useState<Email[]>([]);
const [actionEmails, setActionEmails] = useState<Email[]>([]);

useEffect(() => {
  loadEmails();
}, [activeTab]);

const loadEmails = async () => {
  const emails = await window.electronAPI.email.getByClassification(activeTab);
  setUrgentEmails(activeTab === 'urgent' ? emails : urgentEmails);
  setActionEmails(activeTab === 'action' ? emails : actionEmails);
};
```

**UI:**
- shadcn Tabs component
- Default to "Urgent" tab
- Badge showing count on each tab
- Empty state per tab ("No urgent emails" / "No action emails")

#### 2. Dashboard Layout Redesign

**Current layout:**
```
2-column grid (1fr | 380px)
Left: EmailList
Right: TodayCalendar + TaskList
```

**New layout:**
```
Header: FocusBoard + StatusBar + Settings
├── Left Column (60%)
│   └── EmailList (with tabs)
└── Right Column (40%)
    ├── TodayCalendar
    └── TaskList
```

**Changes:**
- Adjust column ratios (60/40 instead of fixed 380px)
- Better spacing and padding (p-6 instead of p-8)
- Consistent card styling with shadcn Card component
- Better responsive design

#### 3. Component UI Improvements

**EmailList:**
- Better email cards with hover states
- Classification badges (color-coded: urgent=red, action=yellow, fyi=blue, noise=gray)
- Time ago format (e.g., "2h ago" instead of full timestamp)
- Unread indicator (bold subject line)
- Click to expand/preview functionality

**TodayCalendar:**
- Time-based sorting (already implemented)
- Color-coded by calendar/account (already implemented)
- Duration display (e.g., "1h 30m")
- Location with map icon
- Better empty state

**TaskList:**
- Priority indicators (high/medium/low)
- Due date highlighting (overdue, today, upcoming)
- Progress indicators (checkboxes)
- Better empty states

**Sidebar:**
- Active state highlighting
- Smooth transitions
- Better icon sizing
- Collapse animation

#### 4. Responsive Design

- Mobile-friendly layout
- Stack columns on small screens (< 768px)
- Touch-friendly interactions
- Better spacing on mobile

### Files to Modify

| File | Changes |
|------|---------|
| `src/components/Dashboard.tsx` | Layout redesign, new grid |
| `src/components/EmailList.tsx` | Add tabs, filter by classification |
| `src/components/TodayCalendar.tsx` | UI improvements |
| `src/components/TaskList.tsx` | UI improvements |
| `src/components/Sidebar.tsx` | UI improvements |
| `electron/main/ipc/email-handlers.ts` | Add getByClassification handler |
| `electron/preload/index.ts` | Add new IPC channel |

### Testing

- Verify tabs switch between urgent and action emails
- Verify urgent emails show by default
- Verify all components render correctly
- Verify responsive design works
- Verify sidebar navigation works

---

## Implementation Order

1. **Calendar Component Fix** (Issue #58)
   - Backend query changes
   - Frontend instant load + background sync
   - Cron event listener

2. **Home Page Redesign** (Issue #59)
   - Email tabs implementation
   - Dashboard layout redesign
   - Component UI improvements

## Dependencies

- Issue #58 (Calendar) - No dependencies
- Issue #59 (Home Page) - Depends on Issue #58 for calendar UI improvements

## Acceptance Criteria

### Issue #58: Calendar Component Fix
- [ ] Events load instantly from local DB on page refresh
- [ ] Past events (end_time < now) are hidden
- [ ] All-day events are hidden
- [ ] Auto-refresh matches email cron timing
- [ ] Background sync updates view without blocking

### Issue #59: Home Page Redesign
- [ ] Urgent emails show by default
- [ ] Tabs switch between Urgent and Action emails
- [ ] Tab badges show email counts
- [ ] All components have improved UI
- [ ] Responsive design works on mobile
- [ ] Layout uses 60/40 column split
