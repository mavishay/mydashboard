import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  getTelemetrySettings,
  setTelemetryOptIn,
  recordTelemetryEvent,
  getTelemetryEvents,
  clearTelemetryEvents,
} from '../../../electron/main/telemetry';

describe('Telemetry Module', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS telemetry_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        opted_in INTEGER NOT NULL DEFAULT 0,
        consented_at TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS telemetry_events (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  });

  afterEach(() => {
    db.close();
  });

  describe('getTelemetrySettings', () => {
    it('returns default settings when no row exists', () => {
      const settings = getTelemetrySettings(db);
      expect(settings.optedIn).toBe(false);
      expect(settings.consentedAt).toBeNull();
    });

    it('returns settings after opt-in', () => {
      setTelemetryOptIn(db, true);
      const settings = getTelemetrySettings(db);
      expect(settings.optedIn).toBe(true);
      expect(settings.consentedAt).not.toBeNull();
    });
  });

  describe('setTelemetryOptIn', () => {
    it('creates settings row on first call', () => {
      setTelemetryOptIn(db, true);
      const row = db.prepare('SELECT * FROM telemetry_settings WHERE id = 1').get();
      expect(row).toBeDefined();
    });

    it('updates existing settings row', () => {
      setTelemetryOptIn(db, true);
      setTelemetryOptIn(db, false);
      const settings = getTelemetrySettings(db);
      expect(settings.optedIn).toBe(false);
    });
  });

  describe('recordTelemetryEvent', () => {
    it('stores event with correct fields', () => {
      recordTelemetryEvent(db, 'notification_sent', { priority: 'urgent' });
      const events = getTelemetryEvents(db);
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('notification_sent');
      expect(events[0].payload).toBe('{"priority":"urgent"}');
    });

    it('generates unique IDs', () => {
      recordTelemetryEvent(db, 'event1', {});
      recordTelemetryEvent(db, 'event2', {});
      const events = getTelemetryEvents(db);
      expect(events[0].id).not.toBe(events[1].id);
    });
  });

  describe('getTelemetryEvents', () => {
    it('returns events ordered by created_at descending', () => {
      recordTelemetryEvent(db, 'event1', {});
      recordTelemetryEvent(db, 'event2', {});
      const events = getTelemetryEvents(db);
      expect(events[0].eventType).toBe('event2');
      expect(events[1].eventType).toBe('event1');
    });

    it('respects limit parameter', () => {
      recordTelemetryEvent(db, 'event1', {});
      recordTelemetryEvent(db, 'event2', {});
      recordTelemetryEvent(db, 'event3', {});
      const events = getTelemetryEvents(db, 2);
      expect(events).toHaveLength(2);
    });
  });

  describe('clearTelemetryEvents', () => {
    it('removes all events', () => {
      recordTelemetryEvent(db, 'event1', {});
      recordTelemetryEvent(db, 'event2', {});
      clearTelemetryEvents(db);
      const events = getTelemetryEvents(db);
      expect(events).toHaveLength(0);
    });
  });
});
