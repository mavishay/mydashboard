import type Database from 'better-sqlite3';

export interface AiConsentSettings {
  consented: boolean;
  consentedAt: string | null;
}

export function getAiConsentSettings(db: Database.Database): AiConsentSettings {
  const row = db
    .prepare('SELECT consented, consented_at FROM ai_consent_settings WHERE id = 1')
    .get() as { consented: number; consented_at: string | null } | undefined;

  return {
    consented: row?.consented === 1,
    consentedAt: row?.consented_at ?? null,
  };
}

export function setAiConsent(db: Database.Database, consented: boolean): void {
  const existing = db
    .prepare('SELECT id, consented FROM ai_consent_settings WHERE id = 1')
    .get() as { id: number; consented: number } | undefined;

  if (existing) {
    if (consented && existing.consented === 0) {
      db.prepare(
        'UPDATE ai_consent_settings SET consented = 1, consented_at = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = 1'
      ).run();
    } else {
      db.prepare(
        'UPDATE ai_consent_settings SET consented = ?, updated_at = datetime(\'now\') WHERE id = 1'
      ).run(consented ? 1 : 0);
    }
  } else {
    db.prepare(
      'INSERT INTO ai_consent_settings (id, consented, consented_at) VALUES (1, ?, datetime(\'now\'))'
    ).run(consented ? 1 : 0);
  }
}

export function hasAiConsent(db: Database.Database): boolean {
  const settings = getAiConsentSettings(db);
  return settings.consented;
}
