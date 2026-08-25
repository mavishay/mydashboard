import { useState } from 'react';
import { Settings } from './Settings';
import { TaskList } from './TaskList';
import { TelemetryStats } from './TelemetryStats';

type Page = 'dashboard' | 'settings' | 'telemetry-stats';

export function Dashboard() {
  const [page, setPage] = useState<Page>('dashboard');

  if (page === 'settings') {
    return <Settings onBack={() => setPage('dashboard')} />;
  }

  if (page === 'telemetry-stats') {
    return <TelemetryStats onBack={() => setPage('dashboard')} />;
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>Unified Productivity Dashboard</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setPage('telemetry-stats')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '4px',
              border: '1px solid #ccc',
              background: '#f5f5f5',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            Telemetry Data
          </button>
          <button
            onClick={() => setPage('settings')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '4px',
              border: '1px solid #ccc',
              background: '#f5f5f5',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            Settings
          </button>
        </div>
      </div>
      <p>Phase 1: App shell with SQLite storage</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
        <div style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '1rem' }}>
          <h2>Email</h2>
          <p>No accounts connected</p>
        </div>
        <div style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '1rem' }}>
          <h2>Tasks</h2>
          <TaskList />
        </div>
      </div>
    </div>
  );
}
