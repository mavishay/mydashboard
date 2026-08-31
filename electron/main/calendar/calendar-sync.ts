import type Database from 'better-sqlite3';
import { google } from 'googleapis';
import { getAllCalendarsTodayEvents, type CalendarEvent } from './google-calendar-api';
import { retrieveTokens } from '../auth/gmail';

export interface CalendarSyncStatus {
  accountId: string;
  status: 'syncing' | 'idle' | 'error';
  lastSyncAt: string | null;
  error: string | null;
  fetched: number;
}

export class CalendarSync {
  private db: Database.Database;
  private syncing = new Map<string, boolean>();
  private lastStatuses = new Map<string, CalendarSyncStatus>();

  constructor(db: Database.Database) {
    this.db = db;
  }

  async syncAccount(accountId: string): Promise<CalendarSyncStatus> {
    if (this.syncing.get(accountId)) {
      return this.lastStatuses.get(accountId) ?? {
        accountId,
        status: 'idle',
        lastSyncAt: null,
        error: null,
        fetched: 0,
      };
    }

    this.syncing.set(accountId, true);
    this.updateStatus(accountId, { status: 'syncing', error: null });

    try {
      const tokens = retrieveTokens(this.db, accountId);
      if (!tokens) {
        throw new Error('No tokens found for account');
      }

      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        'http://127.0.0.1:1/callback'
      );

      oauth2Client.setCredentials({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date,
      });

      const events = await getAllCalendarsTodayEvents(oauth2Client);
      
      this.storeEvents(accountId, events);
      
      const now = new Date().toISOString();
      this.updateStatus(accountId, {
        status: 'idle',
        lastSyncAt: now,
        fetched: events.length,
      });

      return this.lastStatuses.get(accountId)!;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[CalendarSync] Sync failed for account ${accountId}:`, message);
      this.updateStatus(accountId, {
        status: 'error',
        error: message,
        fetched: 0,
      });
      return this.lastStatuses.get(accountId)!;
    } finally {
      this.syncing.set(accountId, false);
    }
  }

  async syncAll(): Promise<CalendarSyncStatus[]> {
    const accounts = this.db
      .prepare("SELECT id FROM accounts WHERE type IN ('gmail', 'google_tasks')")
      .all() as { id: string }[];

    const results: CalendarSyncStatus[] = [];
    for (const account of accounts) {
      const status = await this.syncAccount(account.id);
      results.push(status);
    }

    return results;
  }

  getTodayEvents(): Array<{
    id: string;
    accountId: string;
    title: string;
    startTime: string;
    endTime: string;
    allDay: boolean;
    location: string | null;
    description: string | null;
    htmlLink: string | null;
    calendarName: string | null;
    accountEmail: string;
    accountColor: string | null;
  }> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);
    
    const startStr = startOfDay.toISOString();
    const endStr = endOfDay.toISOString();

    const events = this.db
      .prepare(`
        SELECT 
          ce.*,
          a.email as account_email,
          a.color as account_color
        FROM calendar_events ce
        JOIN accounts a ON ce.account_id = a.id
        WHERE (
          (ce.all_day = 1 AND ce.start_time >= ? AND ce.start_time < ?)
          OR
          (ce.all_day = 0 AND ce.start_time < ? AND ce.end_time > ?)
        )
        ORDER BY ce.all_day DESC, ce.start_time ASC
      `)
      .all(startStr, endStr, endStr, startStr) as Array<{
        id: string;
        account_id: string;
        title: string;
        start_time: string;
        end_time: string;
        all_day: number;
        location: string | null;
        description: string | null;
        html_link: string | null;
        calendar_name: string | null;
        account_email: string;
        account_color: string | null;
      }>;

    return events.map((e) => ({
      id: e.id,
      accountId: e.account_id,
      title: e.title,
      startTime: e.start_time,
      endTime: e.end_time,
      allDay: e.all_day === 1,
      location: e.location,
      description: e.description,
      htmlLink: e.html_link,
      calendarName: e.calendar_name,
      accountEmail: e.account_email,
      accountColor: e.account_color,
    }));
  }

  private storeEvents(accountId: string, events: CalendarEvent[]): void {
    const deleteStmt = this.db.prepare(
      'DELETE FROM calendar_events WHERE account_id = ?'
    );
    
    const insertStmt = this.db.prepare(`
      INSERT OR REPLACE INTO calendar_events (
        id, account_id, external_id, title, description, location,
        start_time, end_time, all_day, calendar_id, calendar_name,
        html_link, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    this.db.exec('BEGIN TRANSACTION');
    try {
      deleteStmt.run(accountId);
      
      for (const event of events) {
        const isAllDay = !event.start.dateTime;
        const startTime = event.start.dateTime ?? event.start.date ?? '';
        const endTime = event.end.dateTime ?? event.end.date ?? '';
        
        insertStmt.run(
          `${accountId}:${event.id}`,
          accountId,
          event.id,
          event.summary,
          event.description ?? null,
          event.location ?? null,
          startTime,
          endTime,
          isAllDay ? 1 : 0,
          event.calendarId ?? null,
          event.calendarName ?? null,
          event.htmlLink ?? null
        );
      }
      
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  private updateStatus(accountId: string, partial: Partial<Omit<CalendarSyncStatus, 'accountId'>>): void {
    const current = this.lastStatuses.get(accountId) ?? {
      accountId,
      status: 'idle' as const,
      lastSyncAt: null,
      error: null,
      fetched: 0,
    };
    this.lastStatuses.set(accountId, { ...current, ...partial });
  }
}