# Scheduled System Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement scheduled system notifications that fire 3 times daily (9:00, 12:00, 17:00) showing unread email count with urgent highlights, today's calendar events, and incomplete tasks due today.

**Architecture:** Extend existing notification infrastructure with a new `ScheduledNotificationService` that uses `setTimeout` to schedule daily notifications. The service queries the database for real-time data, respects quiet hours and DND modes, and logs notifications to the existing `notification_log` table. UI settings are added to the existing Settings page with per-slot enable/disable toggles.

**Tech Stack:** Electron 33, React 19, TypeScript 5.7, SQLite via better-sqlite3, Zod validation, Vitest 3 for testing.

---

## File Structure

| File | Purpose |
|------|---------|
| `electron/main/db/migrations/023-scheduled-notifications.sql` | ALTER TABLE adding scheduled notification columns |
| `electron/main/services/scheduled-notification-service.ts` | Service for scheduling and sending summary notifications |
| `electron/main/ipc/notification-handlers.ts` | Extend with handlers for get/set settings and test notification |
| `electron/preload/index.ts` | Add allowed channels and expose `notifications` namespace |
| `src/components/NotificationSettings.tsx` | Settings UI for scheduled notification configuration |
| `src/components/Settings.tsx` | Integrate NotificationSettings panel |
| `electron/main/db/index.ts` | Import migration, bump schema version |
| `electron/main/index.ts` | Register ScheduledNotificationService with ServiceRegistry |
| `tests/main/services/scheduled-notification-service.test.ts` | Unit tests for service |
| `tests/main/ipc/notification-handlers.test.ts` | Unit tests for IPC handlers |
| `tests/components/NotificationSettings.test.tsx` | Component tests for settings UI |

---

## Task 1: Database Migration

**Files:**
- Create: `electron/main/db/migrations/023-scheduled-notifications.sql`
- Modify: `electron/main/db/index.ts:5,28-53`

- [ ] **Step 1: Create migration SQL file**

```sql
-- electron/main/db/migrations/023-scheduled-notifications.sql
ALTER TABLE notification_preferences ADD COLUMN scheduled_notifications_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE notification_preferences ADD COLUMN slot_1_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE notification_preferences ADD COLUMN slot_1_hour INTEGER NOT NULL DEFAULT 9;
ALTER TABLE notification_preferences ADD COLUMN slot_1_minute INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notification_preferences ADD COLUMN slot_2_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE notification_preferences ADD COLUMN slot_2_hour INTEGER NOT NULL DEFAULT 12;
ALTER TABLE notification_preferences ADD COLUMN slot_2_minute INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notification_preferences ADD COLUMN slot_3_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE notification_preferences ADD COLUMN slot_3_hour INTEGER NOT NULL DEFAULT 17;
ALTER TABLE notification_preferences ADD COLUMN slot_3_minute INTEGER NOT NULL DEFAULT 0;
```

- [ ] **Step 2: Update schema version and import migration**

```typescript
// electron/main/db/index.ts line 5
const CURRENT_SCHEMA_VERSION = 23;

// Add import after line 28
import migration023 from './migrations/023-scheduled-notifications.sql?raw';

// Add entry to MIGRATIONS record after line 52
23: migration023,
```

- [ ] **Step 3: Verify migration works**

Run: `npm run typecheck`
Expected: No TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add electron/main/db/migrations/023-scheduled-notifications.sql electron/main/db/index.ts
git commit -m "feat(db): add migration 023 for scheduled notification settings"
```

---

## Task 2: ScheduledNotificationService

**Files:**
- Create: `electron/main/services/scheduled-notification-service.ts`
- Create: `tests/main/services/scheduled-notification-service.test.ts`

- [ ] **Step 1: Write the failing test for service creation**

```typescript
// tests/main/services/scheduled-notification-service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScheduledNotificationService } from '../../../electron/main/services/scheduled-notification-service';

vi.mock('electron', () => ({
  Notification: vi.fn().mockImplementation(() => ({
    show: vi.fn(),
    on: vi.fn(),
  })),
  BrowserWindow: vi.fn(),
}));

describe('ScheduledNotificationService', () => {
  let service: ScheduledNotificationService;
  const mockDb = {
    prepare: vi.fn().mockReturnThis(),
    get: vi.fn(),
    all: vi.fn(),
    run: vi.fn(),
  };
  const mockQuietHoursService = { isQuietHours: vi.fn().mockReturnValue(false) };
  const mockNotificationService = { getDndStatus: vi.fn().mockReturnValue(false) };
  const mockGetWindow = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ScheduledNotificationService(
      mockDb as any,
      mockQuietHoursService as any,
      mockNotificationService as any,
      mockGetWindow
    );
  });

  it('should create service with correct id and name', () => {
    expect(service.id).toBe('scheduled-notifications');
    expect(service.name).toBe('Scheduled Notifications');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/services/scheduled-notification-service.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write minimal implementation**

```typescript
// electron/main/services/scheduled-notification-service.ts
import type Database from 'better-sqlite3';
import { Notification, BrowserWindow } from 'electron';
import type { QuietHoursService } from './quiet-hours-service';
import type { NotificationService } from './notification-service';
import type { ManagedService, ServiceStatus } from './service-registry';

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

export class ScheduledNotificationService implements ManagedService {
  id = 'scheduled-notifications';
  name = 'Scheduled Notifications';
  private status: ServiceStatus = 'stopped';
  private lastError: string | null = null;
  private startedAt: string | null = null;
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

  async start(): Promise<void> {
    this.status = 'starting';
    try {
      this.scheduleAllSlots();
      this.status = 'running';
      this.startedAt = new Date().toISOString();
    } catch (err) {
      this.status = 'error';
      this.lastError = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  stop(): void {
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers = [];
    this.status = 'stopped';
    this.startedAt = null;
  }

  getStatus(): ServiceStatus {
    return this.status;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  getStartedAt(): string | null {
    return this.startedAt;
  }

  // Additional methods will be added in subsequent steps
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/main/services/scheduled-notification-service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/main/services/scheduled-notification-service.ts tests/main/services/scheduled-notification-service.test.ts
git commit -m "feat(service): add ScheduledNotificationService skeleton with ManagedService interface"
```

---

## Task 3: Implement Scheduling Logic

**Files:**
- Modify: `electron/main/services/scheduled-notification-service.ts`
- Modify: `tests/main/services/scheduled-notification-service.test.ts`

- [ ] **Step 1: Write failing tests for scheduling**

Add to existing test file:

```typescript
describe('scheduling', () => {
  it('should schedule timers for enabled slots', () => {
    mockDb.prepare.mockReturnValue({
      get: vi.fn().mockReturnValue({
        scheduled_notifications_enabled: 1,
        slot_1_enabled: 1,
        slot_1_hour: 9,
        slot_1_minute: 0,
        slot_2_enabled: 1,
        slot_2_hour: 12,
        slot_2_minute: 0,
        slot_3_enabled: 1,
        slot_3_hour: 17,
        slot_3_minute: 0,
      }),
    });
    service.start();
    expect(service['timers']).toHaveLength(3);
  });

  it('should not schedule disabled slots', () => {
    mockDb.prepare.mockReturnValue({
      get: vi.fn().mockReturnValue({
        scheduled_notifications_enabled: 1,
        slot_1_enabled: 1,
        slot_1_hour: 9,
        slot_1_minute: 0,
        slot_2_enabled: 0,
        slot_2_hour: 12,
        slot_2_minute: 0,
        slot_3_enabled: 0,
        slot_3_hour: 17,
        slot_3_minute: 0,
      }),
    });
    service.start();
    expect(service['timers']).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/main/services/scheduled-notification-service.test.ts`
Expected: FAIL with "service.start is not a function"

- [ ] **Step 3: Implement scheduling logic**

Add to `scheduled-notification-service.ts` (note: the skeleton's async `start()` already calls `scheduleAllSlots()`):

```typescript
  private scheduleAllSlots(): void {
    this.stop();
    const settings = this.getSettings();
    if (!settings.enabled) return;
    
    for (const slot of settings.slots) {
      if (slot.enabled) {
        this.scheduleSlot(slot.hour, slot.minute);
      }
    }
  }

  private scheduleSlot(hour: number, minute: number): void {
    const now = new Date();
    const target = new Date();
    target.setHours(hour, minute, 0, 0);
    
    if (target <= now) {
      target.setDate(target.getDate() + 1);
    }
    
    const delay = target.getTime() - now.getTime();
    const timer = setTimeout(async () => {
      try {
        await this.sendScheduledNotification();
      } catch (err) {
        console.error('Scheduled notification failed:', err);
      } finally {
        this.scheduleSlot(hour, minute); // Always reschedule
      }
    }, delay);
    
    this.timers.push(timer);
  }
```

Also add `getSettings()` method:

```typescript
  getSettings(): NotificationSettings {
    const row = this.db.prepare(
      'SELECT * FROM notification_preferences WHERE id = 1'
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/main/services/scheduled-notification-service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/main/services/scheduled-notification-service.ts tests/main/services/scheduled-notification-service.test.ts
git commit -m "feat(service): implement timer scheduling for enabled notification slots"
```

---

## Task 4: Implement Notification Sending

**Files:**
- Modify: `electron/main/services/scheduled-notification-service.ts`
- Modify: `tests/main/services/scheduled-notification-service.test.ts`

- [ ] **Step 1: Write failing tests for notification sending**

Add to test file:

```typescript
describe('sendScheduledNotification', () => {
  it('should not send if quiet hours active', async () => {
    mockQuietHoursService.isQuietHours.mockReturnValue(true);
    await service['sendScheduledNotification']();
    expect(Notification).not.toHaveBeenCalled();
  });

  it('should not send if DND enabled', async () => {
    mockNotificationService.getDndStatus.mockReturnValue(true);
    await service['sendScheduledNotification']();
    expect(Notification).not.toHaveBeenCalled();
  });

  it('should not send if nothing to report', async () => {
    mockDb.prepare.mockReturnValue({
      get: vi.fn().mockReturnValue({ total: 0, urgent: 0 }),
    });
    mockDb.prepare.mockReturnValue({
      all: vi.fn().mockReturnValue([]),
    });
    await service['sendScheduledNotification']();
    expect(Notification).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/main/services/scheduled-notification-service.test.ts`
Expected: FAIL with "sendScheduledNotification is not a function"

- [ ] **Step 3: Implement notification sending**

Add to `scheduled-notification-service.ts`:

```typescript
  private async sendScheduledNotification(): Promise<void> {
    if (this.notificationService.getDndStatus()) return;
    if (this.quietHoursService.isQuietHours()) return;
    
    const data = this.gatherNotificationData();
    if (data.unreadCount === 0 && data.todayEvents.length === 0 && data.todayTasks.length === 0) {
      return;
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
      `INSERT INTO notification_log (id, email_id, subject, sender, classification, status, quiet_hours_suppressed, dnd_suppressed)
       VALUES (?, 'scheduled', ?, '', 'scheduled', 'sent', 0, 0)`
    ).run(crypto.randomUUID(), `Summary: ${data.unreadCount} unread, ${data.todayEvents.length} events, ${data.todayTasks.length} tasks`);
  }

  private gatherNotificationData(): ScheduledNotificationData {
    // Query emails table for unread count and urgent highlights
    const emailStats = this.db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN classification = 'urgent' THEN 1 ELSE 0 END) as urgent
      FROM emails WHERE is_read = 0
    `).get() as { total: number; urgent: number };
    
    const urgentEmails = this.db.prepare(`
      SELECT subject, from_address as sender 
      FROM emails 
      WHERE classification = 'urgent' AND is_read = 0
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
      WHERE due LIKE ? AND status = 'needsAction' AND is_deleted = 0
      UNION ALL
      SELECT title, 'TickTick' as source FROM ticktick_tasks
      WHERE due_date LIKE ? AND status = 0 AND is_deleted = 0
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/main/services/scheduled-notification-service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/main/services/scheduled-notification-service.ts tests/main/services/scheduled-notification-service.test.ts
git commit -m "feat(service): implement notification sending with data gathering and logging"
```

---

## Task 5: Implement Settings Update and Test Notification

**Files:**
- Modify: `electron/main/services/scheduled-notification-service.ts`
- Modify: `tests/main/services/scheduled-notification-service.test.ts`

- [ ] **Step 1: Write failing tests for settings update and test notification**

Add to test file:

```typescript
describe('updateSettings', () => {
  it('should update settings and reschedule timers', () => {
    const newSettings: NotificationSettings = {
      enabled: true,
      slots: [
        { enabled: true, hour: 10, minute: 0 },
        { enabled: false, hour: 12, minute: 0 },
        { enabled: true, hour: 18, minute: 0 },
      ],
    };
    service.updateSettings(newSettings);
    expect(mockDb.prepare).toHaveBeenCalled();
    expect(service['timers']).toHaveLength(2);
  });
});

describe('sendTestNotification', () => {
  it('should send test notification immediately', () => {
    service.sendTestNotification();
    expect(Notification).toHaveBeenCalledWith({
      title: 'Focus Board Test',
      body: 'Scheduled notifications are working correctly!',
      silent: false,
      timeoutType: 'default',
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/main/services/scheduled-notification-service.test.ts`
Expected: FAIL with "updateSettings is not a function"

- [ ] **Step 3: Implement settings update and test notification**

Add to `scheduled-notification-service.ts`:

```typescript
  updateSettings(settings: NotificationSettings): { success: boolean } {
    this.db.prepare(
      `INSERT INTO notification_preferences (id, scheduled_notifications_enabled, 
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/main/services/scheduled-notification-service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/main/services/scheduled-notification-service.ts tests/main/services/scheduled-notification-service.test.ts
git commit -m "feat(service): implement settings update and test notification"
```

---

## Task 6: IPC Handlers

**Files:**
- Modify: `electron/main/ipc/notification-handlers.ts:30-75`
- Modify: `electron/main/ipc/index.ts:29,40,60`
- Create: `tests/main/ipc/notification-handlers.test.ts`

- [ ] **Step 1: Write failing tests for IPC handlers**

```typescript
// tests/main/ipc/notification-handlers.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerNotificationHandlers } from '../../../electron/main/ipc/notification-handlers';

vi.mock('electron', () => ({
  Notification: vi.fn(),
  BrowserWindow: vi.fn(),
}));

describe('registerNotificationHandlers', () => {
  const mockIpcMain = {
    handle: vi.fn(),
  };
  const mockDb = {
    prepare: vi.fn().mockReturnThis(),
    get: vi.fn(),
    run: vi.fn(),
  };
  const mockGetWindow = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should register three new notification channels', () => {
    registerNotificationHandlers(mockIpcMain as any, mockDb as any, mockGetWindow);
    const channels = mockIpcMain.handle.mock.calls.map(call => call[0]);
    expect(channels).toContain('notification:get-scheduled-settings');
    expect(channels).toContain('notification:set-scheduled-settings');
    expect(channels).toContain('notification:send-test-notification');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/ipc/notification-handlers.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Extend notification-handlers.ts**

Add to `electron/main/ipc/notification-handlers.ts`:

```typescript
import { ScheduledNotificationService } from '../services/scheduled-notification-service';

const ScheduledSettingsSchema = z.object({
  enabled: z.boolean(),
  slots: z.array(z.object({
    enabled: z.boolean(),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
  })).length(3),
});

// Inside registerNotificationHandlers function, after creating notificationService:
const scheduledNotificationService = new ScheduledNotificationService(
  db, quietHoursService, notificationService, getWindow
);

// Add handlers:
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

// Update return statement:
return { notificationService, scheduledNotificationService };
```

- [ ] **Step 4: Update ipc/index.ts to return scheduledNotificationService**

```typescript
// electron/main/ipc/index.ts line 29
): { notificationService?: import('../services/notification-service').NotificationService; scheduledNotificationService?: import('../services/scheduled-notification-service').ScheduledNotificationService; cronScheduler: CronScheduler } {

// line 40
const { notificationService, scheduledNotificationService } = registerNotificationHandlers(ipcMain, db, getWindow);

// line 60
return { notificationService, scheduledNotificationService, cronScheduler };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/main/ipc/notification-handlers.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add electron/main/ipc/notification-handlers.ts electron/main/ipc/index.ts tests/main/ipc/notification-handlers.test.ts
git commit -m "feat(ipc): add handlers for scheduled notification settings and test notification"
```

---

## Task 7: Preload API

**Files:**
- Modify: `electron/preload/index.ts:3-95,126-353`

- [ ] **Step 1: Add allowed IPC channels**

Add to `ALLOWED_INVOKE` set (after line 67):

```typescript
'notification:get-scheduled-settings',
'notification:set-scheduled-settings',
'notification:send-test-notification',
```

- [ ] **Step 2: Expose notifications namespace**

Extend `notification` object in `contextBridge.exposeInMainWorld` (after line 298):

```typescript
getScheduledSettings: () =>
  gatedInvoke('notification:get-scheduled-settings') as Promise<NotificationSettings>,
setScheduledSettings: (settings: NotificationSettings) =>
  gatedInvoke('notification:set-scheduled-settings', settings) as Promise<{ success: boolean }>,
sendTestNotification: () =>
  gatedInvoke('notification:send-test-notification') as Promise<{ success: boolean }>,
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add electron/preload/index.ts
git commit -m "feat(preload): add scheduled notification channels to allowlist and expose API"
```

---

## Task 8: Settings UI Component

**Files:**
- Create: `src/components/NotificationSettings.tsx`
- Create: `tests/components/NotificationSettings.test.tsx`

- [ ] **Step 1: Write failing test for component**

```typescript
// tests/components/NotificationSettings.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NotificationSettings } from '../../src/components/NotificationSettings';

vi.mock('electron', () => ({
  Notification: vi.fn(),
}));

describe('NotificationSettings', () => {
  it('should render scheduled notifications section', () => {
    render(<NotificationSettings />);
    expect(screen.getByText('Scheduled Notifications')).toBeInTheDocument();
  });

  it('should render three time slot rows', () => {
    render(<NotificationSettings />);
    expect(screen.getByText('09:00')).toBeInTheDocument();
    expect(screen.getByText('12:00')).toBeInTheDocument();
    expect(screen.getByText('17:00')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/NotificationSettings.test.tsx`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Create NotificationSettings component**

```tsx
// src/components/NotificationSettings.tsx
import { useState, useEffect } from 'react';

interface NotificationSettings {
  enabled: boolean;
  slots: [
    { enabled: boolean; hour: number; minute: number },
    { enabled: boolean; hour: number; minute: number },
    { enabled: boolean; hour: number; minute: number },
  ];
}

export function NotificationSettings() {
  const [settings, setSettings] = useState<NotificationSettings>({
    enabled: true,
    slots: [
      { enabled: true, hour: 9, minute: 0 },
      { enabled: true, hour: 12, minute: 0 },
      { enabled: true, hour: 17, minute: 0 },
    ],
  });
  const [saving, setSaving] = useState(false);
  const [testSending, setTestSending] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await window.electronAPI.notification.getScheduledSettings();
      setSettings(data);
    } catch (error) {
      console.error('Failed to load scheduled notification settings:', error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await window.electronAPI.notification.setScheduledSettings(settings);
    } catch (error) {
      console.error('Failed to save scheduled notification settings:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleTestNotification = async () => {
    setTestSending(true);
    try {
      await window.electronAPI.notification.sendTestNotification();
    } catch (error) {
      console.error('Failed to send test notification:', error);
    } finally {
      setTestSending(false);
    }
  };

  const updateSlot = (index: number, field: 'enabled' | 'hour' | 'minute', value: boolean | number) => {
    const newSlots = [...settings.slots] as NotificationSettings['slots'];
    newSlots[index] = { ...newSlots[index], [field]: value };
    setSettings({ ...settings, slots: newSlots });
  };

  return (
    <div className="mb-6">
      <h4 className="text-sm font-semibold mb-2">
        Scheduled Notifications
      </h4>
      <p className="text-muted-foreground text-sm mb-4">
        Receive summary notifications at configured times.
      </p>

      <div className="mb-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
          />
          Enable scheduled notifications
        </label>
      </div>

      {settings.enabled && (
        <div className="mb-4">
          <p className="text-sm font-medium mb-2">
            Time Slots:
          </p>
          {settings.slots.map((slot, index) => (
            <div key={index} className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={slot.enabled}
                onChange={(e) => updateSlot(index, 'enabled', e.target.checked)}
              />
              <input
                type="number"
                min="0"
                max="23"
                value={slot.hour}
                onChange={(e) => updateSlot(index, 'hour', parseInt(e.target.value))}
                className="w-16 border rounded px-2 py-1"
              />
              <span>:</span>
              <input
                type="number"
                min="0"
                max="59"
                value={slot.minute}
                onChange={(e) => updateSlot(index, 'minute', parseInt(e.target.value))}
                className="w-16 border rounded px-2 py-1"
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleTestNotification}
          disabled={testSending}
          className="px-4 py-2 text-sm border rounded"
        >
          {testSending ? 'Sending...' : 'Test Notification'}
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 text-sm border rounded"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/NotificationSettings.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/NotificationSettings.tsx tests/components/NotificationSettings.test.tsx
git commit -m "feat(ui): create NotificationSettings component with time slot configuration"
```

---

## Task 9: Integrate into Settings Page

**Files:**
- Modify: `src/components/Settings.tsx:3,905`

- [ ] **Step 1: Add import**

```typescript
// src/components/Settings.tsx line 3
import { NotificationSettings } from './NotificationSettings';
```

- [ ] **Step 2: Add component to settings page**

After `<NotificationPreferences />` (line 905), add:

```tsx
<NotificationSettings />
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/Settings.tsx
git commit -m "feat(ui): integrate NotificationSettings into Settings page"
```

---

## Task 10: Service Registration

**Files:**
- Modify: `electron/main/index.ts:86-98`

- [ ] **Step 1: Register ScheduledNotificationService with ServiceRegistry**

After obtaining `scheduledNotificationService` from `registerIpcHandlers`, add:

```typescript
// electron/main/index.ts after line 86
const { notificationService, scheduledNotificationService } = registerIpcHandlers(db, () => mainWindow, () => app.quit(), lanServer);

// After line 95
if (scheduledNotificationService) {
  serviceRegistry.register(scheduledNotificationService);
}
```

- [ ] **Step 2: Verify service starts and stops**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add electron/main/index.ts
git commit -m "feat(main): register ScheduledNotificationService with ServiceRegistry"
```

---

## Task 11: Final Verification

- [ ] **Step 1: Run all tests**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 4: Manual smoke test**

1. Start app
2. Go to Settings → Notifications
3. Enable scheduled notifications
4. Set one slot to current time (e.g., if now is 14:30, set slot to 14:31)
5. Click "Test Notification" button
6. Verify notification appears with summary
7. Click notification, verify app focuses
8. Disable a slot, verify no notification at that time
9. Enable quiet hours, verify no scheduled notifications
10. Restart app, verify settings persist

- [ ] **Step 5: Commit final changes**

```bash
git add -A
git commit -m "feat: complete scheduled system notifications implementation"
```

---

## Dependency Graph

```
Task 1 (DB) → Task 2 (Service) → Task 3 (Scheduling) → Task 4 (Sending) → Task 5 (Settings)
Task 6 (IPC) depends on Task 2
Task 7 (Preload) depends on Task 6
Task 8 (UI) depends on Task 7
Task 9 (Integration) depends on Task 8
Task 10 (Registration) depends on Task 2
Task 11 (Verification) depends on all previous tasks
```

## Risk Mitigation

- **Database migration**: Test on fresh DB and existing DB with version 22.
- **Timer scheduling**: Ensure timers are cleared on settings update and app quit.
- **Quiet hours/DND**: Reuse existing services; ensure they are up-to-date.
- **IPC security**: Follow existing patterns for Zod validation and allowlist.

## Success Criteria Mapping

- SC-001 to SC-012 covered by tasks above.
- Security criteria covered by Task 7 (allowlist) and Task 6 (Zod).
- Quality criteria covered by Task 11.

## Estimated Effort

- Task 1: 0.5 hours
- Task 2: 1 hour
- Task 3: 1 hour
- Task 4: 1 hour
- Task 5: 0.5 hours
- Task 6: 1 hour
- Task 7: 0.5 hours
- Task 8: 1.5 hours
- Task 9: 0.5 hours
- Task 10: 0.5 hours
- Task 11: 1 hour
- Total: ~9 hours

## Notes

- Follow existing code style (TypeScript strict, functional components, hooks).
- Use `better-sqlite3` synchronous API.
- Ensure `BrowserWindow.focus()` on notification click.
- Log scheduled notifications to `notification_log` with `classification = 'scheduled'`.
- Handle empty state (no unread, events, tasks) by not sending notification.
- All tests must mock Electron native modules per CDR: rule-testing-platform-mocked.