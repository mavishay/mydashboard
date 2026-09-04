import { useState, useEffect, useRef, useCallback } from 'react';

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
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState({
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  const dateRangeRef = useRef(dateRange);

  const loadEventsFromDB = useCallback(async (startDate: string, endDate: string) => {
    try {
      const filtered = await window.electronAPI.calendar.getFilteredEvents(
        startDate,
        endDate
      );
      setEvents(filtered);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      onError?.(message);
    } finally {
      setLoading(false);
    }
  }, [onError]);

  const syncInBackground = useCallback(async () => {
    try {
      setSyncing(true);
      await window.electronAPI.calendar.syncAll();
      const { startDate, endDate } = dateRangeRef.current;
      const updatedEvents = await window.electronAPI.calendar.getFilteredEvents(
        startDate,
        endDate
      );
      setEvents(updatedEvents);
    } catch (err) {
      console.error('Background sync failed:', err);
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    dateRangeRef.current = dateRange;
    setLoading(true);
    loadEventsFromDB(dateRange.startDate, dateRange.endDate);
    syncInBackground();

    const unsubscribe = window.electronAPI.cron.onStatusUpdate(() => {
      loadEventsFromDB(dateRangeRef.current.startDate, dateRangeRef.current.endDate);
    });
    return unsubscribe;
  }, [dateRange.startDate, dateRange.endDate, loadEventsFromDB, syncInBackground]);

  const handleDateChange = (field: 'startDate' | 'endDate', value: string) => {
    setDateRange(prev => {
      const next = { ...prev, [field]: value };
      if (next.startDate > next.endDate) {
        if (field === 'startDate') {
          next.endDate = value;
        } else {
          next.startDate = value;
        }
      }
      return next;
    });
  };

  const formatTime = (dateTime: string): string => {
    try {
      const date = new Date(dateTime);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateTime;
    }
  };

  const formatDuration = (startTime: string, endTime: string): string => {
    try {
      const start = new Date(startTime);
      const end = new Date(endTime);
      const diffInMinutes = Math.floor((end.getTime() - start.getTime()) / (1000 * 60));
      
      if (diffInMinutes < 60) return `${diffInMinutes}m`;
      const hours = Math.floor(diffInMinutes / 60);
      const minutes = diffInMinutes % 60;
      return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    } catch {
      return '';
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

  const isSingleDay = dateRange.startDate === dateRange.endDate;

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
          onClick={() => { setLoading(true); loadEventsFromDB(dateRange.startDate, dateRange.endDate); syncInBackground(); }}
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
      <div>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', padding: '0.5rem', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
          <input
            type="date"
            value={dateRange.startDate}
            onChange={(e) => handleDateChange('startDate', e.target.value)}
            style={{ flex: 1, padding: '0.25rem', border: '1px solid #ddd', borderRadius: '4px', fontSize: '0.75rem' }}
          />
          <input
            type="date"
            value={dateRange.endDate}
            onChange={(e) => handleDateChange('endDate', e.target.value)}
            style={{ flex: 1, padding: '0.25rem', border: '1px solid #ddd', borderRadius: '4px', fontSize: '0.75rem' }}
          />
        </div>
        <div style={{ padding: '1rem', textAlign: 'center', color: '#666', fontStyle: 'italic' }}>
          {isSingleDay ? 'No events for this day' : 'No events for selected date range'}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', padding: '0.5rem', backgroundColor: '#f5f5f5', borderRadius: '4px', opacity: syncing || loading ? 0.6 : 1 }}>
        <input
          type="date"
          value={dateRange.startDate}
          onChange={(e) => handleDateChange('startDate', e.target.value)}
          disabled={loading || syncing}
          style={{ flex: 1, padding: '0.25rem', border: '1px solid #ddd', borderRadius: '4px', fontSize: '0.75rem' }}
        />
        <input
          type="date"
          value={dateRange.endDate}
          onChange={(e) => handleDateChange('endDate', e.target.value)}
          disabled={loading || syncing}
          style={{ flex: 1, padding: '0.25rem', border: '1px solid #ddd', borderRadius: '4px', fontSize: '0.75rem' }}
        />
        {syncing && <span style={{ fontSize: '0.625rem', color: '#888', alignSelf: 'center' }}>Syncing...</span>}
      </div>
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
              {!event.allDay && (
                <span style={{ marginLeft: '0.5rem', color: '#888' }}>
                  ({formatDuration(event.startTime, event.endTime)})
                </span>
              )}
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
    </div>
  );
}