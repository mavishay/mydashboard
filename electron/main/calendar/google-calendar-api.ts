import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  htmlLink?: string;
  calendarId?: string;
  calendarName?: string;
}

export interface CalendarListEntry {
  id: string;
  summary: string;
  primary?: boolean;
  accessRole: string;
}

export async function listCalendars(
  client: OAuth2Client
): Promise<CalendarListEntry[]> {
  const calendar = google.calendar({ version: 'v3', auth: client });
  const response = await calendar.calendarList.list();
  return (response.data.items ?? []) as CalendarListEntry[];
}

export async function getTodayEvents(
  client: OAuth2Client,
  calendarId: string = 'primary'
): Promise<CalendarEvent[]> {
  const calendar = google.calendar({ version: 'v3', auth: client });
  
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);
  
  const response = await calendar.events.list({
    calendarId,
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 100,
  });
  
  return (response.data.items ?? []) as CalendarEvent[];
}

export async function getAllCalendarsTodayEvents(
  client: OAuth2Client
): Promise<CalendarEvent[]> {
  const calendars = await listCalendars(client);
  const allEvents: CalendarEvent[] = [];
  
  for (const cal of calendars) {
    if (cal.accessRole === 'reader' || cal.accessRole === 'writer' || cal.accessRole === 'owner') {
      const events = await getTodayEvents(client, cal.id);
      allEvents.push(
        ...events.map((event) => ({
          ...event,
          calendarId: cal.id,
          calendarName: cal.summary,
        }))
      );
    }
  }
  
  return allEvents.sort((a, b) => {
    const aTime = a.start.dateTime ?? a.start.date ?? '';
    const bTime = b.start.dateTime ?? b.start.date ?? '';
    return aTime.localeCompare(bTime);
  });
}