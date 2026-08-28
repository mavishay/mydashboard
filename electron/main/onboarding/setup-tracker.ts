import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

export type SetupEventType = 'setup_started' | 'setup_step_completed' | 'setup_completed' | 'setup_resumed';

export interface SetupEvent {
  eventType: SetupEventType;
  stepId?: string;
  elapsedMs?: number;
  metadata?: Record<string, unknown>;
}

export interface SetupStatus {
  dockerCheckComplete: boolean;
  n8nHealthComplete: boolean;
  apiKeyComplete: boolean;
  accountConnected: boolean;
  setupCompletedAt: string | null;
}

const STEP_COLUMN_MAP: Record<string, string> = {
  'docker-check': 'docker_check_complete',
  'n8n-health': 'n8n_health_complete',
  'api-key': 'api_key_complete',
  'account-connect': 'account_connected',
};

export function hasSetupStarted(db: Database.Database): boolean {
  const row = db
    .prepare("SELECT 1 FROM setup_tracking WHERE event_type = 'setup_started' LIMIT 1")
    .get();
  return !!row;
}

export function recordSetupEvent(db: Database.Database, event: SetupEvent): void {
  const id = uuidv4();
  db.prepare(
    'INSERT INTO setup_tracking (id, event_type, step_id, elapsed_ms, metadata) VALUES (?, ?, ?, ?, ?)'
  ).run(
    id,
    event.eventType,
    event.stepId ?? null,
    event.elapsedMs ?? null,
    event.metadata ? JSON.stringify(event.metadata) : null,
  );
}

function getSetupStartTime(db: Database.Database): number | null {
  const row = db
    .prepare("SELECT timestamp FROM setup_tracking WHERE event_type = 'setup_started' ORDER BY created_at ASC LIMIT 1")
    .get() as { timestamp: string } | undefined;
  return row ? new Date(row.timestamp).getTime() : null;
}

export function getSetupStatus(db: Database.Database): SetupStatus {
  const row = db
    .prepare(
      'SELECT docker_check_complete, n8n_health_complete, api_key_complete, account_connected, setup_completed_at FROM setup_status WHERE id = 1'
    )
    .get() as
    | {
        docker_check_complete: number;
        n8n_health_complete: number;
        api_key_complete: number;
        account_connected: number;
        setup_completed_at: string | null;
      }
    | undefined;

  if (!row) {
    db.prepare(
      'INSERT OR IGNORE INTO setup_status (id) VALUES (1)'
    ).run();
    return {
      dockerCheckComplete: false,
      n8nHealthComplete: false,
      apiKeyComplete: false,
      accountConnected: false,
      setupCompletedAt: null,
    };
  }

  return {
    dockerCheckComplete: row.docker_check_complete === 1,
    n8nHealthComplete: row.n8n_health_complete === 1,
    apiKeyComplete: row.api_key_complete === 1,
    accountConnected: row.account_connected === 1,
    setupCompletedAt: row.setup_completed_at,
  };
}

export function markStepComplete(db: Database.Database, stepId: string): void {
  const column = STEP_COLUMN_MAP[stepId];
  if (!column) {
    throw new Error(`Unknown setup step: ${stepId}`);
  }

  db.prepare(`INSERT OR IGNORE INTO setup_status (id) VALUES (1)`).run();
  db.prepare(
    `UPDATE setup_status SET ${column} = 1, updated_at = datetime('now') WHERE id = 1`
  ).run();

  const startTime = getSetupStartTime(db);
  const elapsedMs = startTime ? Date.now() - startTime : undefined;
  recordSetupEvent(db, { eventType: 'setup_step_completed', stepId, elapsedMs });

  if (isSetupComplete(db)) {
    db.prepare(
      "UPDATE setup_status SET setup_completed_at = datetime('now'), updated_at = datetime('now') WHERE id = 1"
    ).run();
    const totalElapsedMs = startTime ? Date.now() - startTime : undefined;
    recordSetupEvent(db, { eventType: 'setup_completed', elapsedMs: totalElapsedMs });
  }
}

export function isSetupComplete(db: Database.Database): boolean {
  const row = db
    .prepare(
      'SELECT docker_check_complete, n8n_health_complete, api_key_complete, account_connected FROM setup_status WHERE id = 1'
    )
    .get() as
    | {
        docker_check_complete: number;
        n8n_health_complete: number;
        api_key_complete: number;
        account_connected: number;
      }
    | undefined;

  if (!row) {
    return false;
  }

  return (
    row.docker_check_complete === 1 &&
    row.n8n_health_complete === 1 &&
    row.api_key_complete === 1 &&
    row.account_connected === 1
  );
}
