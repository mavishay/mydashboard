import { useState, useEffect } from 'react';

interface CalendarEvent {
  id: string;
  accountId: string;
  title: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  location: string | null;
  description: string | null;
  htmlLink: string | null;
  calendarName: string | null;
  accountEmail: string;
  accountColor: string | null;
}

interface TodayCalendarProps {
  onError?: (error: string) => void;
}

export function TodayCalendar({ onError }: TodayCalendarProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadEventsFromDB = async () => {
    try {
      const todayEvents = await window.electronAPI.calendar.getTodayEvents();
      setEvents(todayEvents);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      onError?.(message);
    } finally {
      setLoading(false);
    }
  };

  const syncInBackground = async () => {
    try {
      await window.electronAPI.calendar.syncAll();
      const updatedEvents = await window.electronAPI.calendar.getTodayEvents();
      setEvents(updatedEvents);
    } catch (err) {
      console.error('Background sync failed:', err);
    }
  };

  useEffect(() => {
    loadEventsFromDB();
    syncInBackground();
  }, []);

  const formatTime = (dateTime: string): string => {
    try {
      const date = new Date(dateTime);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateTime;
    }
  };

  const formatTimeRange = (event: CalendarEvent): string => {
    if (event.allDay) {
      return 'All day';
    }
    
    const start = formatTime(event.startTime);
    const end = formatTime(event.endTime);
    return `${start} - ${end}`;
  };

  const handleEventClick = async (event: CalendarEvent) => {
    if (event.htmlLink) {
      await window.electronAPI.shell.openExternal(event.htmlLink);
    }
  };

  if (loading && events.length === 0) {
    return (
      <div style={{ padding: '1rem', textAlign: 'center', color: '#666' }}>
        Loading calendar events...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '1rem', border: '1px solid #ffcdd2', borderRadius: '4px', backgroundColor: '#ffebee' }}>
        <div style={{ color: '#c62828', fontWeight: 'bold', marginBottom: '0.5rem' }}>
          Calendar Error
        </div>
        <div style={{ color: '#c62828', fontSize: '0.875rem' }}>
          {error}
        </div>
        <button
          onClick={() => { setLoading(true); loadEventsFromDB(); syncInBackground(); }}
          style={{
            marginTop: '0.5rem',
            padding: '0.25rem 0.5rem',
            border: '1px solid #c62828',
            borderRadius: '4px',
            backgroundColor: 'transparent',
            color: '#c62828',
            cursor: 'pointer',
            fontSize: '0.75rem',
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div style={{ padding: '1rem', textAlign: 'center', color: '#666', fontStyle: 'italic' }}>
        No events today
      </div>
    );
  }

  return (
    <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
      {events.map((event) => (
        <div
          key={event.id}
          onClick={() => handleEventClick(event)}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            padding: '0.5rem',
            marginBottom: '0.5rem',
            border: '1px solid #e0e0e0',
            borderRadius: '4px',
            cursor: event.htmlLink ? 'pointer' : 'default',
            backgroundColor: '#fafafa',
            borderLeft: `3px solid ${event.accountColor ?? '#1976d2'}`,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 'bold', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
              {event.title}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '0.25rem' }}>
              {formatTimeRange(event)}
            </div>
            {event.location && (
              <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '0.25rem' }}>
                📍 {event.location}
              </div>
            )}
            <div style={{ fontSize: '0.625rem', color: '#999' }}>
              {event.accountEmail}
              {event.calendarName && ` • ${event.calendarName}`}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}