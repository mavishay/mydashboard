import type Database from 'better-sqlite3';

export interface WorkloadSnapshot {
  score: number;
  color: 'green' | 'yellow' | 'red';
  urgentEmails: number;
  actionEmails: number;
  overdueTasks: number;
  todayTasks: number;
  todayEvents: number;
  calculatedAt: string;
}

export class WorkloadService {
  constructor(private db: Database.Database) {}

  calculate(): WorkloadSnapshot {
    // Cleanup old snapshots (keep last 7 days)
    this.db.prepare("DELETE FROM workload_snapshots WHERE calculated_at < datetime('now', '-7 days')").run();

    // Count unread urgent emails
    const urgentRow = this.db
      .prepare("SELECT COUNT(*) as c FROM emails WHERE is_read = 0 AND classification = 'urgent'")
      .get() as { c: number };

    // Count unread action emails
    const actionRow = this.db
      .prepare("SELECT COUNT(*) as c FROM emails WHERE is_read = 0 AND classification = 'action'")
      .get() as { c: number };

    // Count overdue tasks (Google Tasks) — due < today, not deleted
    const gtOverdue = this.db
      .prepare("SELECT COUNT(*) as c FROM google_tasks WHERE status = 'needsAction' AND is_deleted = 0 AND due IS NOT NULL AND date(due) < date('now')")
      .get() as { c: number };

    // Count overdue tasks (TickTick) — due_date < today, not deleted
    const ttOverdue = this.db
      .prepare("SELECT COUNT(*) as c FROM ticktick_tasks WHERE status = 0 AND is_deleted = 0 AND due_date IS NOT NULL AND due_date < date('now')")
      .get() as { c: number };

    // Count today's tasks (Google Tasks) — not deleted
    const gtToday = this.db
      .prepare("SELECT COUNT(*) as c FROM google_tasks WHERE status = 'needsAction' AND is_deleted = 0 AND due IS NOT NULL AND date(due) = date('now')")
      .get() as { c: number };

    // Count today's tasks (TickTick) — not deleted
    const ttToday = this.db
      .prepare("SELECT COUNT(*) as c FROM ticktick_tasks WHERE status = 0 AND is_deleted = 0 AND due_date IS NOT NULL AND due_date = date('now')")
      .get() as { c: number };

    // Count today's calendar events (including all-day)
    const eventsRow = this.db
      .prepare("SELECT COUNT(*) as c FROM calendar_events WHERE date(start_time) = date('now')")
      .get() as { c: number };

    const urgentEmails = urgentRow.c;
    const actionEmails = actionRow.c;
    const overdueTasks = gtOverdue.c + ttOverdue.c;
    const todayTasks = gtToday.c + ttToday.c;
    const todayEvents = eventsRow.c;

    // Score calculation: 0-100
    const emailScore = Math.min((urgentEmails * 5) + (actionEmails * 2), 50);
    const taskScore = Math.min((overdueTasks * 10) + (todayTasks * 3), 40);
    const eventScore = Math.min(todayEvents * 4, 20);
    const score = Math.min(emailScore + taskScore + eventScore, 100);

    // Color thresholds
    let color: 'green' | 'yellow' | 'red';
    if (score < 40) color = 'green';
    else if (score < 70) color = 'yellow';
    else color = 'red';

    const now = new Date().toISOString();

    // Persist snapshot
    this.db
      .prepare(
        'INSERT INTO workload_snapshots (score, color, urgent_emails, action_emails, overdue_tasks, today_tasks, today_events, calculated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(score, color, urgentEmails, actionEmails, overdueTasks, todayTasks, todayEvents, now);

    return { score, color, urgentEmails, actionEmails, overdueTasks, todayTasks, todayEvents, calculatedAt: now };
  }

  getLatest(): WorkloadSnapshot | null {
    const row = this.db
      .prepare('SELECT * FROM workload_snapshots ORDER BY calculated_at DESC LIMIT 1')
      .get() as {
        score: number; color: string; urgent_emails: number; action_emails: number;
        overdue_tasks: number; today_tasks: number; today_events: number; calculated_at: string;
      } | undefined;

    if (!row) return null;

    return {
      score: row.score,
      color: row.color as 'green' | 'yellow' | 'red',
      urgentEmails: row.urgent_emails,
      actionEmails: row.action_emails,
      overdueTasks: row.overdue_tasks,
      todayTasks: row.today_tasks,
      todayEvents: row.today_events,
      calculatedAt: row.calculated_at,
    };
  }
}
