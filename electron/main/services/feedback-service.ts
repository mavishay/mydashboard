import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

export interface FeedbackData {
  notificationId: string;
  emailId: string;
  classification: 'urgent';
  feedback: 'thumbs_up' | 'thumbs_down';
}

export class FeedbackService {
  constructor(private db: Database.Database) {}

  record(data: FeedbackData): { success: boolean } {
    const id = randomUUID();
    this.db.prepare(
      `INSERT INTO notification_feedback (id, notification_id, email_id, classification, feedback)
       VALUES (?, ?, ?, ?, ?)`
    ).run(id, data.notificationId, data.emailId, data.classification, data.feedback);
    return { success: true };
  }
}
