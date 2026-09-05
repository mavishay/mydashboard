# Feature Specification: Scheduled System Notifications

**Issue**: #30
**Wave**: 5-notifications
**Status**: Draft
**Created**: 2026-09-05

---

## 1. Overview

Implement scheduled system notifications that fire 3 times daily (9:00, 12:00, 17:00) showing unread email count with urgent highlights, today's calendar events, and incomplete tasks due today. This provides a proactive summary rather than only reacting to urgent emails.

**Demo Sentence:** User receives a native notification at 9:00, 12:00, and 17:00 showing "5 unread (2 urgent), 3 meetings today, 4 tasks due today" with a click to bring the app to focus.

---

## 2. Requirements

### 2.1 Core Requirements

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| REQ-001 | Scheduled notifications fire at configurable times (default 9:00, 12:00, 17:00) | Must | Notifications appear at each configured time slot |
| REQ-002 | Notification body shows unread email count with urgent email highlights | Must | Body reads like "5 unread (2 urgent)" with urgent subjects listed |
| REQ-003 | Notification body shows today's remaining calendar events | Must | Upcoming events with time and title displayed |
| REQ-004 | Notification body shows incomplete tasks due today | Must | Tasks due today from Google Tasks and TickTick displayed |
| REQ-005 | Click notification brings app to focus | Must | `BrowserWindow.focus()` called on notification click |
| REQ-006 | Per-slot enable/disable in Settings | Must | Each of 3 time slots can be independently toggled on/off |
| REQ-007 | Quiet hours suppress all scheduled notifications | Must | Notifications suppressed during configured quiet hours |
| REQ-008 | DND mode suppresses all scheduled notifications | Must | Notifications suppressed when DND is enabled |
| REQ-009 | Test notification button in Settings | Must | Button sends a test notification immediately |
| REQ-010 | Use Electron native Notification API | Must | No browser Notification API used |
| REQ-011 | Zod validation on all IPC payloads | Must | All handler inputs validated with `Schema.safeParse()` |
| REQ-012 | contextBridge allowlist enforcement | Must | New IPC channels added to `ALLOWED_INVOKE` set |

### 2.2 Security Requirements

| ID | Requirement | Source | Acceptance Criteria |
|----|-------------|--------|---------------------|
| SEC-001 | No `nodeIntegration` in renderer | Constitution: Security by Default | Notification data fetched only via IPC from main process |
| SEC-002 | IPC channels explicitly allowlisted | CDR: rule-electron-contextbridge-allowlist | All notification channels in `ALLOWED_INVOKE` |
| SEC-003 | Zod validation on all IPC payloads | CDR: rule-ts-zod-validation | `Schema.safeParse()` in every handler before business logic |

### 2.3 Database Requirements

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| DB-001 | `notification_settings` table stores scheduled notification config | Must | Table created with migration 023 |
| DB-002 | Per-slot enable/disable persisted in DB | Must | Settings survive app restart |
| DB-003 | Slot times configurable and persisted | Must | Custom times saved and respected |
| DB-004 | `notification_log` extended for scheduled notifications | Must | Log entries distinguish scheduled vs urgent notifications |

---

## 3. Constraints

### 3.1 Technical Constraints

| Constraint | Rationale |
|------------|-----------|
| Electron 33 + React 19 + TypeScript 5.7 | Existing stack |
| Electron native Notification API | REQ-010, better reliability than browser notifications |
| SQLite via better-sqlite3 | Existing database layer |
| Must use real data from DB | emails, calendar_events, google_tasks, ticktick_tasks tables |
| Zod validation on IPC payloads | Team security directive |
| contextBridge allowlist security model | Electron security best practice |
| Vitest 3 for testing | Existing test framework |
| Notification delivery within 10 seconds | NFR from PRD |

### 3.2 Non-Goals (This Feature)

| Excluded | Rationale |
|----------|-----------|
| Per-email urgent notification system | Covered by issue #5 |
| Email classification AI logic | Covered by issue #15 |
| Calendar data fetching | Covered by issue #17 |
| Task CRUD operations | Covered by issue #31 |
| Email read/unread tracking | Separate concern |
| Custom notification sounds | OS default sounds |

---

## 4. Technical Design

### 4.1 Database Schema (Migration 023)

```sql
-- electron/main/db/migrations/023-scheduled-notifications.sql
CREATE TABLE IF NOT EXISTS notification_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  scheduled_notifications_enabled INTEGER NOT NULL DEFAULT 1,
  slot_1_enabled INTEGER NOT NULL DEFAULT 1,
  slot_1_hour INTEGER NOT NULL DEFAULT 9,
  slot_1_minute INTEGER NOT NULL DEFAULT 0,
  slot_2_enabled INTEGER NOT NULL DEFAULT 1,
  slot_2_hour INTEGER NOT NULL DEFAULT 12,
  slot_2_minute INTEGER NOT NULL DEFAULT 0,
  slot_3_enabled INTEGER NOT NULL DEFAULT 1,
  slot_3_hour INTEGER NOT NULL DEFAULT 17,
  slot_3_minute INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT single_row CHECK (id = 1)
);
```

**Schema version bump:** `CURRENT_SCHEMA_VERSION` from 22 → 23 in `electron/main/db/index.ts`.

### 4.2 Scheduled Notification Service

Create `electron/main/services/scheduled-notification-service.ts`:

```typescript
import type Database from 'better-sqlite3';
import { Notification, BrowserWindow } from 'electron';
import { QuietHoursService } from './quiet-hours-service';
import { NotificationService } from './notification-service';

export interface NotificationSettings {
  enabled: boolean;
  slots: [
    { enabled: boolean; hour: number; minute: number },
    { enabled: boolean; hour: number; minute: number },
    { enabled: boolean; hour: number; minute: number },
  ];
}

export interface ScheduledNotificationData {
  unreadCount: number;
  urgentCount: number;
  urgentEmails: Array<{ subject: string; sender: string }>;
  todayEvents: Array<{ time: string; title: string }>;
  todayTasks: Array<{ title: string; source: string }>;
}

export class ScheduledNotificationService {
  private timers: ReturnType<typeof setTimeout>[] = [];
  private getWindow: () => BrowserWindow | null;

  constructor(
    private db: Database.Database,
    private quietHoursService: QuietHoursService,
    private notificationService: NotificationService,
    getWindow: () => BrowserWindow | null = () => null,
  ) {
    this.getWindow = getWindow;
  }

  start(): void {
    this.stop();
    const settings = this.getSettings();
    if (!settings.enabled) return;
    
    for (const slot of settings.slots) {
      if (slot.enabled) {
        this.scheduleSlot(slot.hour, slot.minute);
      }
    }
  }

  stop(): void {
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers = [];
  }

  private scheduleSlot(hour: number, minute: number): void {
    const now = new Date();
    const target = new Date();
    target.setHours(hour, minute, 0, 0);
    
    if (target <= now) {
      target.setDate(target.getDate() + 1);
    }
    
    const delay = target.getTime() - now.getTime();
    const timer = setTimeout(() => {
      void this.sendScheduledNotification();
      this.scheduleSlot(hour, minute); // Reschedule for next day
    }, delay);
    
    this.timers.push(timer);
  }

  private async sendScheduledNotification(): Promise<void> {
    // Check quiet hours and DND
    if (this.notificationService.getDndStatus()) return;
    if (this.quietHoursService.isQuietHours()) return;
    
    const data = this.gatherNotificationData();
    if (data.unreadCount === 0 && data.todayEvents.length === 0 && data.todayTasks.length === 0) {
      return; // Don't notify if nothing to report
    }
    
    const notification = new Notification({
      title: 'Focus Board Summary',
      body: this.buildNotificationBody(data),
      silent: false,
      timeoutType: 'default',
    });
    
    notification.on('click', () => {
      const mainWindow = this.getWindow();
      if (mainWindow) {
        mainWindow.focus();
      }
    });
    
    notification.show();
    
    // Log to notification_log
    this.db.prepare(
      `INSERT INTO notification_log (id, email_id, subject, sender, classification, status)
       VALUES (?, 'scheduled', ?, '', 'scheduled', 'sent')`
    ).run(crypto.randomUUID(), `Summary: ${data.unreadCount} unread, ${data.todayEvents.length} events, ${data.todayTasks.length} tasks`);
  }

  private gatherNotificationData(): ScheduledNotificationData {
    // Query emails table for unread count and urgent highlights
    const emailStats = this.db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN classification = 'urgent' THEN 1 ELSE 0 END) as urgent
      FROM emails WHERE read = 0
    `).get() as { total: number; urgent: number };
    
    const urgentEmails = this.db.prepare(`
      SELECT subject, from_address as sender 
      FROM emails 
      WHERE classification = 'urgent' AND read = 0
      LIMIT 3
    `).all() as Array<{ subject: string; sender: string }>;
    
    // Query calendar_events for today's events
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);
    
    const todayEvents = this.db.prepare(`
      SELECT title, start_time as time
      FROM calendar_events
      WHERE start_time >= ? AND start_time < ?
      ORDER BY start_time ASC
      LIMIT 5
    `).all(startOfDay.toISOString(), endOfDay.toISOString()) as Array<{ time: string; title: string }>;
    
    // Query tasks due today from google_tasks and ticktick_tasks
    const todayStr = now.toISOString().split('T')[0];
    const todayTasks = this.db.prepare(`
      SELECT title, 'Google Tasks' as source FROM google_tasks 
      WHERE due LIKE ? AND status = 'needsAction'
      UNION ALL
      SELECT title, 'TickTick' as source FROM ticktick_tasks
      WHERE due_date LIKE ? AND status = 0
      LIMIT 5
    `).all(`${todayStr}%`, `${todayStr}%`) as Array<{ title: string; source: string }>;
    
    return {
      unreadCount: emailStats.total,
      urgentCount: emailStats.urgent,
      urgentEmails,
      todayEvents,
      todayTasks,
    };
  }

  private buildNotificationBody(data: ScheduledNotificationData): string {
    const parts: string[] = [];
    
    if (data.unreadCount > 0) {
      parts.push(`${data.unreadCount} unread (${data.urgentCount} urgent)`);
    }
    
    if (data.todayEvents.length > 0) {
      parts.push(`${data.todayEvents.length} event${data.todayEvents.length > 1 ? 's' : ''} today`);
    }
    
    if (data.todayTasks.length > 0) {
      parts.push(`${data.todayTasks.length} task${data.todayTasks.length > 1 ? 's' : ''} due today`);
    }
    
    return parts.join(', ') || 'No items to report';
  }

  getSettings(): NotificationSettings {
    const row = this.db.prepare(
      'SELECT * FROM notification_settings WHERE id = 1'
    ).get() as {
      scheduled_notifications_enabled: number;
      slot_1_enabled: number;
      slot_1_hour: number;
      slot_1_minute: number;
      slot_2_enabled: number;
      slot_2_hour: number;
      slot_2_minute: number;
      slot_3_enabled: number;
      slot_3_hour: number;
      slot_3_minute: number;
    } | undefined;
    
    if (!row) {
      return {
        enabled: true,
        slots: [
          { enabled: true, hour: 9, minute: 0 },
          { enabled: true, hour: 12, minute: 0 },
          { enabled: true, hour: 17, minute: 0 },
        ],
      };
    }
    
    return {
      enabled: row.scheduled_notifications_enabled === 1,
      slots: [
        { enabled: row.slot_1_enabled === 1, hour: row.slot_1_hour, minute: row.slot_1_minute },
        { enabled: row.slot_2_enabled === 1, hour: row.slot_2_hour, minute: row.slot_2_minute },
        { enabled: row.slot_3_enabled === 1, hour: row.slot_3_hour, minute: row.slot_3_minute },
      ],
    };
  }

  updateSettings(settings: NotificationSettings): { success: boolean } {
    this.db.prepare(
      `INSERT INTO notification_settings (id, scheduled_notifications_enabled, 
        slot_1_enabled, slot_1_hour, slot_1_minute,
        slot_2_enabled, slot_2_hour, slot_2_minute,
        slot_3_enabled, slot_3_hour, slot_3_minute, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         scheduled_notifications_enabled = excluded.scheduled_notifications_enabled,
         slot_1_enabled = excluded.slot_1_enabled,
         slot_1_hour = excluded.slot_1_hour,
         slot_1_minute = excluded.slot_1_minute,
         slot_2_enabled = excluded.slot_2_enabled,
         slot_2_hour = excluded.slot_2_hour,
         slot_2_minute = excluded.slot_2_minute,
         slot_3_enabled = excluded.slot_3_enabled,
         slot_3_hour = excluded.slot_3_hour,
         slot_3_minute = excluded.slot_3_minute,
         updated_at = excluded.updated_at`
    ).run(
      settings.enabled ? 1 : 0,
      settings.slots[0].enabled ? 1 : 0, settings.slots[0].hour, settings.slots[0].minute,
      settings.slots[1].enabled ? 1 : 0, settings.slots[1].hour, settings.slots[1].minute,
      settings.slots[2].enabled ? 1 : 0, settings.slots[2].hour, settings.slots[2].minute,
    );
    
    this.stop();
    this.start();
    
    return { success: true };
  }

  sendTestNotification(): { success: boolean } {
    const notification = new Notification({
      title: 'Focus Board Test',
      body: 'Scheduled notifications are working correctly!',
      silent: false,
      timeoutType: 'default',
    });
    
    notification.on('click', () => {
      const mainWindow = this.getWindow();
      if (mainWindow) {
        mainWindow.focus();
      }
    });
    
    notification.show();
    return { success: true };
  }
}
```

### 4.3 IPC Channel Design

**New Allowed Channels:**

```typescript
// electron/preload/index.ts — add to ALLOWED_INVOKE
'notification:get-scheduled-settings',
'notification:set-scheduled-settings',
'notification:send-test-notification',
```

**New IPC Handlers:**

```typescript
// electron/main/ipc/notification-handlers.ts — extend existing file
import { z } from 'zod';
import { ScheduledNotificationService } from '../services/scheduled-notification-service';

const ScheduledSettingsSchema = z.object({
  enabled: z.boolean(),
  slots: z.array(z.object({
    enabled: z.boolean(),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
  })).length(3),
});

// Add to existing registerNotificationHandlers:
ipcMain.handle('notification:get-scheduled-settings', async () => {
  return scheduledNotificationService.getSettings();
});

ipcMain.handle('notification:set-scheduled-settings', async (_, payload) => {
  const parsed = ScheduledSettingsSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`Invalid payload: ${parsed.error.message}`);
  }
  return scheduledNotificationService.updateSettings(parsed.data);
});

ipcMain.handle('notification:send-test-notification', async () => {
  return scheduledNotificationService.sendTestNotification();
});
```

**Preload API:**

```typescript
// electron/preload/index.ts — add to contextBridge.exposeInMainWorld
notifications: {
  getScheduledSettings: () =>
    gatedInvoke('notification:get-scheduled-settings') as Promise<NotificationSettings>,
  setScheduledSettings: (settings: NotificationSettings) =>
    gatedInvoke('notification:set-scheduled-settings', settings) as Promise<{ success: boolean }>,
  sendTestNotification: () =>
    gatedInvoke('notification:send-test-notification') as Promise<{ success: boolean }>,
},
```

### 4.4 Service Registration

Extend `electron/main/services/service-registry.ts` to register `ScheduledNotificationService`:

```typescript
// In main process initialization:
import { ScheduledNotificationService } from './services/scheduled-notification-service';

const scheduledNotificationService = new ScheduledNotificationService(
  db, quietHoursService, notificationService, getWindow
);
serviceRegistry.register(new ScheduledNotificationService(scheduledNotificationService));
```

### 4.5 Settings UI

Create `src/components/NotificationSettings.tsx`:

```tsx
// Settings panel for scheduled notifications
// - Global toggle to enable/disable all scheduled notifications
// - 3 time slot rows, each with:
//   - Enable/disable toggle
//   - Hour input (0-23)
//   - Minute input (0-59)
// - Test notification button
// - Save button
```

**UI Layout:**

```
┌─────────────────────────────────────────────────────────┐
│ Scheduled Notifications                                 │
│                                                         │
│ ☐ Enable scheduled notifications                        │
│                                                         │
│ Time Slots:                                             │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ ☑ 09:00  [Test]                                    │ │
│ │ ☑ 12:00  [Test]                                    │ │
│ │ ☑ 17:00  [Test]                                    │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ [Test Notification]  [Save]                             │
└─────────────────────────────────────────────────────────┘
```

### 4.6 Integration with Existing Services

The `ScheduledNotificationService` leverages existing infrastructure:

1. **QuietHoursService**: Reuses `isQuietHours()` method to suppress notifications
2. **NotificationService**: Reuses `getDndStatus()` to check DND mode
3. **Database**: Reads from existing `emails`, `calendar_events`, `google_tasks`, `ticktick_tasks` tables
4. **ServiceRegistry**: Follows `ManagedService` interface for lifecycle management

---

## 5. File Changes

### New Files

| File | Purpose |
|------|---------|
| `electron/main/db/migrations/023-scheduled-notifications.sql` | Database migration for notification_settings table |
| `electron/main/services/scheduled-notification-service.ts` | Service for scheduling and sending summary notifications |
| `src/components/NotificationSettings.tsx` | Settings UI for scheduled notification configuration |

### Modified Files

| File | Changes |
|------|---------|
| `electron/main/db/index.ts` | Import migration 023, bump `CURRENT_SCHEMA_VERSION` from 22 to 23 |
| `electron/main/ipc/notification-handlers.ts` | Add handlers for get/set scheduled settings and test notification |
| `electron/main/services/service-registry.ts` | Register ScheduledNotificationService |
| `electron/preload/index.ts` | Add channels to `ALLOWED_INVOKE`; expose `notifications` namespace |
| `src/components/Settings.tsx` | Add NotificationSettings panel |

---

## 6. Success Criteria

### 6.1 Functional Criteria

| ID | Criterion | Measurement |
|----|-----------|-------------|
| SC-001 | Notifications fire at 9:00, 12:00, 17:00 | Manual: wait for scheduled time, verify notification appears |
| SC-002 | Notification body shows unread email count | Manual: verify email count matches inbox |
| SC-003 | Notification body shows urgent email highlights | Manual: verify urgent emails listed in notification |
| SC-004 | Notification body shows today's calendar events | Manual: verify events match calendar |
| SC-005 | Notification body shows tasks due today | Manual: verify tasks match task list |
| SC-006 | Click notification brings app to focus | Manual: click notification, verify app focuses |
| SC-007 | Per-slot enable/disable works | Manual: disable a slot, verify no notification at that time |
| SC-008 | Quiet hours suppress notifications | Manual: enable quiet hours, verify no notifications during quiet period |
| SC-009 | DND suppresses notifications | Manual: enable DND, verify no scheduled notifications |
| SC-010 | Test notification button works | Manual: click Test button, verify notification appears immediately |
| SC-011 | Settings persist across restart | Manual: change settings, restart app, verify settings retained |
| SC-012 | Empty state handled gracefully | Manual: no unread emails, no events, no tasks → no notification sent |

### 6.2 Security Criteria

| ID | Criterion | Measurement |
|----|-----------|-------------|
| SEC-SC-001 | No `nodeIntegration` in renderer | Code review: notification data only via IPC |
| SEC-SC-002 | All IPC channels allowlisted | Code review: `ALLOWED_INVOKE` contains notification channels |
| SEC-SC-003 | Zod validation on IPC payloads | Code review: handlers use `safeParse` |

### 6.3 Quality Criteria

| ID | Criterion | Measurement |
|----|-----------|-------------|
| QC-001 | TypeScript strict mode | `npx tsc --noEmit` passes |
| QC-002 | No lint errors | `npm run lint` passes |
| QC-003 | Scheduled notification service has unit tests | Test coverage for `scheduled-notification-service.ts` |
| QC-004 | IPC handlers have unit tests | Test coverage for notification handlers |

---

## 7. Test Plan

### 7.1 Unit Tests

| Test | File | Validates |
|------|------|-----------|
| Zod schema validates settings payload | `ipc/notification-handlers.test.ts` | SEC-003 |
| `gatherNotificationData` returns correct counts | `services/scheduled-notification-service.test.ts` | SC-001 |
| `buildNotificationBody` formats message correctly | `services/scheduled-notification-service.test.ts` | SC-002 |
| Quiet hours suppress scheduled notifications | `services/scheduled-notification-service.test.ts` | SC-008 |
| DND suppresses scheduled notifications | `services/scheduled-notification-service.test.ts` | SC-009 |
| Settings update reschedules timers | `services/scheduled-notification-service.test.ts` | SC-007 |
| Test notification sends immediately | `services/scheduled-notification-service.test.ts` | SC-010 |

### 7.2 Integration Tests

| Test | File | Validates |
|------|------|-----------|
| Full flow: settings save → timer reschedule → notification fire | `services/scheduled-notification-service.integration.test.ts` | SC-001, SC-011 |
| Settings UI renders and saves correctly | `components/NotificationSettings.test.tsx` | SC-007 |

### 7.3 Platform-Mocked Tests

Per CDR: rule-testing-platform-mocked, all Electron tests must mock native modules:

```typescript
vi.mock('electron', () => ({
  Notification: vi.fn().mockImplementation(() => ({
    show: vi.fn(),
    on: vi.fn(),
  })),
  BrowserWindow: vi.fn(),
}));
```

---

## 8. Dependencies

| Dependency | Purpose | Version Constraint |
|------------|---------|-------------------|
| better-sqlite3 | Database queries | ^11.0.0 (already in project) |
| zod | IPC payload validation | ^3.23.0 (already in project) |
| Electron Notification API | Native notifications | Built into Electron |

---

## 9. Open Questions

| ID | Question | Resolution |
|----|----------|------------|
| OQ-001 | Should notifications fire if there's nothing to report? | No — suppress notification if unread=0, events=0, tasks=0 |
| OQ-002 | How to handle app not running at scheduled time? | Next notification fires at next scheduled time; no catch-up |
| OQ-003 | Should urgent emails be listed in notification body? | Yes, show up to 3 urgent email subjects in the notification |
| OQ-004 | Time zone handling? | Use system local time zone for scheduling |

---

## 10. PDR Traceability

| PDR | Decision | Impact on This Feature |
|-----|----------|----------------------|
| PDR-001 | Electron + LAN | Desktop native Notification API |
| PDR-002 | BYOK cloud-first | User's own email data used for summaries |
| PDR-005 | Multi-Hat Consultant | Needs proactive daily summaries |
| PDR-006 | V1 success metrics | Notification precision target applies |

---

## 11. Definition of Done

- [ ] `notification_settings` table created via migration 023
- [ ] `CURRENT_SCHEMA_VERSION` bumped from 22 to 23
- [ ] `scheduled-notification-service.ts` implements scheduling and notification logic
- [ ] Service queries `emails`, `calendar_events`, `google_tasks`, `ticktick_tasks` tables
- [ ] Quiet hours and DND checks integrated
- [ ] IPC handlers registered for get/set settings and test notification
- [ ] Preload allowlist includes notification channels
- [ ] `window.electronAPI.notifications` namespace exposed in preload
- [ ] `NotificationSettings.tsx` renders settings UI with 3 time slots
- [ ] Per-slot enable/disable toggles work
- [ ] Test notification button sends notification immediately
- [ ] Settings persist to database and survive restart
- [ ] Notifications suppress when nothing to report
- [ ] Click notification brings app to focus
- [ ] Unit tests pass for scheduled notification service
- [ ] All existing tests continue to pass
- [ ] `npm run lint` and `npm run typecheck` pass
