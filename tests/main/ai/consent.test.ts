import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  getAiConsentSettings,
  setAiConsent,
  hasAiConsent,
} from '../../../electron/main/ai/consent';
import { registerAiConsentHandlers } from '../../../electron/main/ipc/ai-consent-handlers';


describe('AI Consent Module', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_consent_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        consented INTEGER NOT NULL DEFAULT 0,
        policy_version TEXT NOT NULL DEFAULT '1.0',
        consented_at TEXT,
        revoked_at TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  });

  afterEach(() => {
    db.close();
  });

  describe('getAiConsentSettings', () => {
    it('returns default settings when no row exists', () => {
      const settings = getAiConsentSettings(db);
      expect(settings.consented).toBe(false);
      expect(settings.policyVersion).toBe('1.0');
      expect(settings.consentedAt).toBeNull();
      expect(settings.revokedAt).toBeNull();
    });

    it('returns settings after consent', () => {
      setAiConsent(db, true);
      const settings = getAiConsentSettings(db);
      expect(settings.consented).toBe(true);
      expect(settings.policyVersion).toBe('1.0');
      expect(settings.consentedAt).not.toBeNull();
      expect(settings.revokedAt).toBeNull();
    });
  });

  describe('setAiConsent', () => {
    it('creates settings row on first call', () => {
      setAiConsent(db, true);
      const row = db.prepare('SELECT * FROM ai_consent_settings WHERE id = 1').get();
      expect(row).toBeDefined();
    });

    it('updates existing settings row', () => {
      setAiConsent(db, true);
      setAiConsent(db, false);
      const settings = getAiConsentSettings(db);
      expect(settings.consented).toBe(false);
    });

    it('sets consented_at when consenting', () => {
      setAiConsent(db, true);
      const settings = getAiConsentSettings(db);
      expect(settings.consentedAt).not.toBeNull();
    });

    it('sets revoked_at when revoking consent', () => {
      setAiConsent(db, true); // First consent
      setAiConsent(db, false); // Then revoke
      const settings = getAiConsentSettings(db);
      expect(settings.consented).toBe(false);
      expect(settings.revokedAt).not.toBeNull();
      expect(settings.consentedAt).not.toBeNull(); // Should retain original consent timestamp
    });
  });

  describe('hasAiConsent', () => {
    it('returns false when no consent given', () => {
      expect(hasAiConsent(db)).toBe(false);
    });

    it('returns true after consent', () => {
      setAiConsent(db, true);
      expect(hasAiConsent(db)).toBe(true);
    });

    it('returns false after consent revoked', () => {
      setAiConsent(db, true);
      setAiConsent(db, false);
      expect(hasAiConsent(db)).toBe(false);
    });
  });
});

describe('AI Consent IPC Handlers', () => {
  let db: Database.Database;
  let handlers: Record<string, (...args: unknown[]) => unknown>;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_consent_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        consented INTEGER NOT NULL DEFAULT 0,
        policy_version TEXT NOT NULL DEFAULT '1.0',
        consented_at TEXT,
        revoked_at TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    handlers = {};
    const mockIpcMain = {
      handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
        handlers[channel] = handler;
      },
    };

    registerAiConsentHandlers(mockIpcMain as never, db);
  });

  afterEach(() => {
    db.close();
  });

  it('getSettings returns default settings', async () => {
    const result = await handlers['ai-consent:getSettings']();
    expect(result).toEqual({ consented: false, policyVersion: '1.0', consentedAt: null, revokedAt: null });
  });

  it('setConsent updates settings', async () => {
    await handlers['ai-consent:setConsent'](null, { consented: true });
    const result = await handlers['ai-consent:getSettings']();
    expect(result).toEqual({ consented: true, policyVersion: '1.0', consentedAt: expect.any(String), revokedAt: null });
  });

  it('setConsent rejects invalid payload', async () => {
    await expect(
      handlers['ai-consent:setConsent'](null, { consented: 'not-a-boolean' })
    ).rejects.toThrow('Invalid payload');
  });
});
