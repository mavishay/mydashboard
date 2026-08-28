import type Database from 'better-sqlite3';

export interface AiConsentSettings {
  consented: boolean;
  policyVersion: string;
  consentedAt: string | null;
  revokedAt: string | null;
}

export function getAiConsentSettings(db: Database.Database): AiConsentSettings {
  const row = db
    .prepare('SELECT consented, policy_version, consented_at, revoked_at FROM ai_consent_settings WHERE id = 1')
    .get() as { consented: number; policy_version: string; consented_at: string | null; revoked_at: string | null } | undefined;

  return {
    consented: row?.consented === 1,
    policyVersion: row?.policy_version ?? '1.0',
    consentedAt: row?.consented_at ?? null,
    revokedAt: row?.revoked_at ?? null,
  };
}

export function setAiConsent(db: Database.Database, consented: boolean): void {
  const existing = db
    .prepare('SELECT id, consented FROM ai_consent_settings WHERE id = 1')
    .get() as { id: number; consented: number } | undefined;

  if (existing) {
    if (consented && existing.consented === 0) {
      // Granting consent: update consented_at, clear revoked_at
      db.prepare(
        'UPDATE ai_consent_settings SET consented = 1, consented_at = datetime(\'now\'), revoked_at = NULL, updated_at = datetime(\'now\') WHERE id = 1'
      ).run();
    } else if (!consented && existing.consented === 1) {
      // Revoking consent: update revoked_at, keep consented_at for audit
      db.prepare(
        'UPDATE ai_consent_settings SET consented = 0, revoked_at = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = 1'
      ).run();
    } else {
      // No change in consent status (already consented or already revoked)
      db.prepare(
        'UPDATE ai_consent_settings SET updated_at = datetime(\'now\') WHERE id = 1'
      ).run();
    }
  } else {
    // First time: insert row
    db.prepare(
      'INSERT INTO ai_consent_settings (id, consented, consented_at) VALUES (1, ?, datetime(\'now\'))'
    ).run(consented ? 1 : 0);
  }
}

export function hasAiConsent(db: Database.Database): boolean {
  const settings = getAiConsentSettings(db);
  return settings.consented;
}