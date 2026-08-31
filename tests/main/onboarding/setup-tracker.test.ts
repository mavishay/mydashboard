import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  recordSetupEvent,
  getSetupStatus,
  markStepComplete,
  isSetupComplete,
} from '../../../electron/main/onboarding/setup-tracker';

describe('Setup Tracker Module', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS setup_tracking (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL CHECK (event_type IN (
          'setup_started',
          'setup_step_completed',
          'setup_completed',
          'setup_resumed'
        )),
        step_id TEXT,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        elapsed_ms INTEGER,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS setup_status (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        services_ready INTEGER NOT NULL DEFAULT 0,
        api_key_complete INTEGER NOT NULL DEFAULT 0,
        account_connected INTEGER NOT NULL DEFAULT 0,
        setup_completed_at TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  });

  afterEach(() => {
    db.close();
  });

  describe('recordSetupEvent', () => {
    it('inserts correct row with event_type and step_id', () => {
      recordSetupEvent(db, { eventType: 'setup_started' });
      const rows = db.prepare('SELECT * FROM setup_tracking').all();
      expect(rows).toHaveLength(1);
      expect((rows[0] as any).event_type).toBe('setup_started');
      expect((rows[0] as any).step_id).toBeNull();
    });

    it('inserts row with step_id when provided', () => {
      recordSetupEvent(db, { eventType: 'setup_step_completed', stepId: 'docker-check' });
      const rows = db.prepare('SELECT * FROM setup_tracking').all();
      expect(rows).toHaveLength(1);
      expect((rows[0] as any).step_id).toBe('docker-check');
    });

    it('inserts row with metadata when provided', () => {
      recordSetupEvent(db, { eventType: 'setup_started', metadata: { source: 'test' } });
      const row = db.prepare('SELECT * FROM setup_tracking').get() as any;
      expect(JSON.parse(row.metadata)).toEqual({ source: 'test' });
    });

    it('inserts row with elapsed_ms when provided', () => {
      recordSetupEvent(db, { eventType: 'setup_completed', elapsedMs: 120000 });
      const row = db.prepare('SELECT * FROM setup_tracking').get() as any;
      expect(row.elapsed_ms).toBe(120000);
    });

    it('generates unique IDs for each event', () => {
      recordSetupEvent(db, { eventType: 'setup_started' });
      recordSetupEvent(db, { eventType: 'setup_step_completed', stepId: 'docker-check' });
      const rows = db.prepare('SELECT id FROM setup_tracking').all() as any[];
      expect(rows[0].id).not.toBe(rows[1].id);
    });
  });

  describe('getSetupStatus', () => {
    it('returns defaults when no row exists', () => {
      const status = getSetupStatus(db);
      expect(status.servicesReady).toBe(false);
      expect(status.apiKeyComplete).toBe(false);
      expect(status.accountConnected).toBe(false);
      expect(status.setupCompletedAt).toBeNull();
    });

    it('creates default row when none exists', () => {
      getSetupStatus(db);
      const row = db.prepare('SELECT * FROM setup_status WHERE id = 1').get();
      expect(row).toBeDefined();
    });

    it('returns correct status after marking steps complete', () => {
      markStepComplete(db, 'docker-check');
      const status = getSetupStatus(db);
      expect(status.servicesReady).toBe(true);
    });
  });

  describe('markStepComplete', () => {
    it('updates services_ready for docker-check (migration)', () => {
      markStepComplete(db, 'docker-check');
      const row = db.prepare('SELECT services_ready FROM setup_status WHERE id = 1').get() as any;
      expect(row.services_ready).toBe(1);
    });

    it('updates services_ready for n8n-health (migration)', () => {
      markStepComplete(db, 'n8n-health');
      const row = db.prepare('SELECT services_ready FROM setup_status WHERE id = 1').get() as any;
      expect(row.services_ready).toBe(1);
    });

    it('updates correct boolean column for api-key', () => {
      markStepComplete(db, 'api-key');
      const row = db.prepare('SELECT api_key_complete FROM setup_status WHERE id = 1').get() as any;
      expect(row.api_key_complete).toBe(1);
    });

    it('updates correct boolean column for account-connect', () => {
      markStepComplete(db, 'account-connect');
      const row = db.prepare('SELECT account_connected FROM setup_status WHERE id = 1').get() as any;
      expect(row.account_connected).toBe(1);
    });

    it('records a setup_step_completed event', () => {
      markStepComplete(db, 'docker-check');
      const events = db.prepare("SELECT * FROM setup_tracking WHERE event_type = 'setup_step_completed'").all();
      expect(events).toHaveLength(1);
      expect((events[0] as any).step_id).toBe('docker-check');
    });

    it('throws on unknown step ID', () => {
      expect(() => markStepComplete(db, 'unknown-step')).toThrow('Unknown setup step: unknown-step');
    });

    it('creates setup_status row if not exists', () => {
      markStepComplete(db, 'docker-check');
      const row = db.prepare('SELECT * FROM setup_status WHERE id = 1').get();
      expect(row).toBeDefined();
    });
  });

  describe('isSetupComplete', () => {
    it('returns false when no steps are complete', () => {
      expect(isSetupComplete(db)).toBe(false);
    });

    it('returns false when only some steps are complete', () => {
      markStepComplete(db, 'docker-check');
      expect(isSetupComplete(db)).toBe(false);
    });

    it('returns true when all required columns are 1', () => {
      markStepComplete(db, 'docker-check');
      markStepComplete(db, 'api-key');
      markStepComplete(db, 'account-connect');
      expect(isSetupComplete(db)).toBe(true);
    });

    it('returns false when setup_status row does not exist', () => {
      expect(isSetupComplete(db)).toBe(false);
    });
  });
});
