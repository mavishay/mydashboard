import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

export interface TelemetrySettings {
  optedIn: boolean;
  consentedAt: string | null;
}

export interface TelemetryEvent {
  id: string;
  eventType: string;
  payload: string;
  createdAt: string;
}

export function getTelemetrySettings(db: Database.Database): TelemetrySettings {
  const row = db
    .prepare('SELECT opted_in, consented_at FROM telemetry_settings WHERE id = 1')
    .get() as { opted_in: number; consented_at: string | null } | undefined;

  return {
    optedIn: row?.opted_in === 1,
    consentedAt: row?.consented_at ?? null,
  };
}

export function setTelemetryOptIn(db: Database.Database, optedIn: boolean): void {
  const existing = db
    .prepare('SELECT id, opted_in FROM telemetry_settings WHERE id = 1')
    .get() as { id: number; opted_in: number } | undefined;

  if (existing) {
    if (optedIn && existing.opted_in === 0) {
      db.prepare(
        'UPDATE telemetry_settings SET opted_in = 1, consented_at = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = 1'
      ).run();
    } else {
      db.prepare(
        'UPDATE telemetry_settings SET opted_in = ?, updated_at = datetime(\'now\') WHERE id = 1'
      ).run(optedIn ? 1 : 0);
    }
  } else {
    db.prepare(
      'INSERT INTO telemetry_settings (id, opted_in, consented_at) VALUES (1, ?, datetime(\'now\'))'
    ).run(optedIn ? 1 : 0);
  }
}

export function recordTelemetryEvent(
  db: Database.Database,
  eventType: string,
  payload: object
): void {
  const settings = getTelemetrySettings(db);
  if (!settings.optedIn) {
    return;
  }

  const id = uuidv4();
  db.prepare(
    'INSERT INTO telemetry_events (id, event_type, payload) VALUES (?, ?, ?)'
  ).run(id, eventType, JSON.stringify(payload));
}

export function getTelemetryEvents(
  db: Database.Database,
  limit: number = 100
): TelemetryEvent[] {
  return db
    .prepare(
      'SELECT id, event_type as eventType, payload, created_at as createdAt FROM telemetry_events ORDER BY created_at DESC LIMIT ?'
    )
    .all(limit) as TelemetryEvent[];
}

export function clearTelemetryEvents(db: Database.Database): void {
  db.prepare('DELETE FROM telemetry_events').run();
}
