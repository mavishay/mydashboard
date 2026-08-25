import { useState, useEffect, useCallback } from 'react';

interface TelemetryStatsProps {
  onBack: () => void;
}

export function TelemetryStats({ onBack }: TelemetryStatsProps) {
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  const loadEvents = useCallback(async () => {
    try {
      const data = await window.electronAPI.telemetry.getEvents(100);
      setEvents(data);
    } catch (err) {
      console.error('Failed to load telemetry events:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const handleClear = async () => {
    if (!confirm('Are you sure you want to clear all telemetry data?')) return;
    setClearing(true);
    try {
      await window.electronAPI.telemetry.clearEvents();
      setEvents([]);
    } catch (err) {
      console.error('Failed to clear telemetry events:', err);
    } finally {
      setClearing(false);
    }
  };

  const handleExport = () => {
    const data = JSON.stringify(events, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `telemetry-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const eventTypeCounts = events.reduce((acc, event) => {
    acc[event.eventType] = (acc[event.eventType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif', maxWidth: '800px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '1.2rem',
            padding: '0.25rem',
          }}
        >
          ← Back
        </button>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Telemetry Data</h1>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
        <button
          onClick={handleExport}
          disabled={events.length === 0}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '4px',
            border: '1px solid #ccc',
            background: events.length === 0 ? '#f5f5f5' : '#fff',
            cursor: events.length === 0 ? 'not-allowed' : 'pointer',
            fontSize: '0.875rem',
          }}
        >
          Export Data
        </button>
        <button
          onClick={handleClear}
          disabled={clearing || events.length === 0}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '4px',
            border: '1px solid #d32f2f',
            color: '#d32f2f',
            background: clearing || events.length === 0 ? '#f5f5f5' : '#fff',
            cursor: clearing || events.length === 0 ? 'not-allowed' : 'pointer',
            fontSize: '0.875rem',
          }}
        >
          {clearing ? 'Clearing...' : 'Clear All Data'}
        </button>
      </div>

      {loading ? (
        <p style={{ color: '#666' }}>Loading...</p>
      ) : events.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '3rem',
          background: '#f5f5f5',
          borderRadius: '8px',
        }}>
          <p style={{ color: '#666', marginBottom: '0.5rem' }}>No telemetry data collected yet.</p>
          <p style={{ color: '#999', fontSize: '0.875rem' }}>
            Data will appear here once you start using the app with telemetry enabled.
          </p>
        </div>
      ) : (
        <>
          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Event Summary</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
              {Object.entries(eventTypeCounts).map(([type, count]) => (
                <div key={type} style={{
                  padding: '1rem',
                  background: '#f5f5f5',
                  borderRadius: '8px',
                }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>{count}</div>
                  <div style={{ color: '#666', fontSize: '0.875rem' }}>{type}</div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Recent Events</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #eee' }}>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Type</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Payload</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '0.5rem' }}>{event.eventType}</td>
                    <td style={{ padding: '0.5rem', fontFamily: 'monospace', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {event.payload}
                    </td>
                    <td style={{ padding: '0.5rem', color: '#666' }}>
                      {new Date(event.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
