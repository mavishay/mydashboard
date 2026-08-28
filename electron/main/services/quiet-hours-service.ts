import type Database from 'better-sqlite3';

export interface QuietHoursSettings {
  enabled: boolean;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
}

export class QuietHoursService {
  private settings: QuietHoursSettings = {
    enabled: false,
    startHour: 22,
    startMinute: 0,
    endHour: 7,
    endMinute: 0,
  };

  constructor(private db: Database.Database) {
    this.loadSettings();
  }

  isQuietHours(): boolean {
    if (!this.settings.enabled) return false;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = this.settings.startHour * 60 + this.settings.startMinute;
    const endMinutes = this.settings.endHour * 60 + this.settings.endMinute;

    if (startMinutes < endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    } else {
      // Overnight range (e.g., 22:00–07:00)
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
  }

  getSettings(): QuietHoursSettings {
    return { ...this.settings };
  }

  updateSettings(settings: QuietHoursSettings): { success: boolean } {
    this.settings = settings;
    this.db.prepare(
      `INSERT INTO notification_preferences (id, quiet_hours_enabled, quiet_hours_start_hour, quiet_hours_start_minute, quiet_hours_end_hour, quiet_hours_end_minute, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         quiet_hours_enabled = excluded.quiet_hours_enabled,
         quiet_hours_start_hour = excluded.quiet_hours_start_hour,
         quiet_hours_start_minute = excluded.quiet_hours_start_minute,
         quiet_hours_end_hour = excluded.quiet_hours_end_hour,
         quiet_hours_end_minute = excluded.quiet_hours_end_minute,
         updated_at = excluded.updated_at`
    ).run(
      settings.enabled ? 1 : 0,
      settings.startHour,
      settings.startMinute,
      settings.endHour,
      settings.endMinute,
    );
    return { success: true };
  }

  private loadSettings(): void {
    const row = this.db.prepare(
      'SELECT quiet_hours_enabled, quiet_hours_start_hour, quiet_hours_start_minute, quiet_hours_end_hour, quiet_hours_end_minute FROM notification_preferences WHERE id = 1'
    ).get() as {
      quiet_hours_enabled: number;
      quiet_hours_start_hour: number;
      quiet_hours_start_minute: number;
      quiet_hours_end_hour: number;
      quiet_hours_end_minute: number;
    } | undefined;

    if (row) {
      this.settings = {
        enabled: row.quiet_hours_enabled === 1,
        startHour: row.quiet_hours_start_hour,
        startMinute: row.quiet_hours_start_minute,
        endHour: row.quiet_hours_end_hour,
        endMinute: row.quiet_hours_end_minute,
      };
    }
  }
}
