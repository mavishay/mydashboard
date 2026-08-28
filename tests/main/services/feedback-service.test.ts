import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rmSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/test-app'),
  },
}));

function testDbPath(): string {
  return join(__dirname, `__test_${randomBytes(4).toString('hex')}.db`);
}

function cleanupDb(path: string): void {
  try { rmSync(path); } catch {}
  try { rmSync(path + '-wal'); } catch {}
  try { rmSync(path + '-shm'); } catch {}
}

describe('FeedbackService', () => {
  let dbPath: string;

  beforeEach(async () => {
    dbPath = testDbPath();
  });

  it('records feedback with correct fields', async () => {
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);
    const { FeedbackService } = await import('../../../electron/main/services/feedback-service');
    const svc = new FeedbackService(db);

    const result = svc.record({
      notificationId: 'notif-1',
      emailId: 'email-1',
      classification: 'urgent',
      feedback: 'thumbs_up',
    });

    expect(result).toEqual({ success: true });

    const row = db.prepare(
      'SELECT * FROM notification_feedback WHERE notification_id = ?'
    ).get('notif-1') as { id: string; notification_id: string; email_id: string; classification: string; feedback: string };

    expect(row.notification_id).toBe('notif-1');
    expect(row.email_id).toBe('email-1');
    expect(row.classification).toBe('urgent');
    expect(row.feedback).toBe('thumbs_up');
    expect(row.id).toBeTruthy();

    db.close();
    cleanupDb(dbPath);
  });

  it('records thumbs_down feedback', async () => {
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);
    const { FeedbackService } = await import('../../../electron/main/services/feedback-service');
    const svc = new FeedbackService(db);

    svc.record({
      notificationId: 'notif-2',
      emailId: 'email-2',
      classification: 'urgent',
      feedback: 'thumbs_down',
    });

    const row = db.prepare(
      'SELECT feedback FROM notification_feedback WHERE notification_id = ?'
    ).get('notif-2') as { feedback: string };

    expect(row.feedback).toBe('thumbs_down');

    db.close();
    cleanupDb(dbPath);
  });

  it('generates unique IDs for each feedback record', async () => {
    const { initializeDatabase } = await import('../../../electron/main/db');
    const db = initializeDatabase(dbPath);
    const { FeedbackService } = await import('../../../electron/main/services/feedback-service');
    const svc = new FeedbackService(db);

    svc.record({
      notificationId: 'notif-1',
      emailId: 'email-1',
      classification: 'urgent',
      feedback: 'thumbs_up',
    });

    svc.record({
      notificationId: 'notif-1',
      emailId: 'email-1',
      classification: 'urgent',
      feedback: 'thumbs_down',
    });

    const rows = db.prepare(
      'SELECT id FROM notification_feedback WHERE notification_id = ?'
    ).all('notif-1') as { id: string }[];

    expect(rows).toHaveLength(2);
    expect(rows[0].id).not.toBe(rows[1].id);

    db.close();
    cleanupDb(dbPath);
  });
});
