import { useState } from 'react';
import { Settings } from './Settings';

type Page = 'dashboard' | 'settings';

export function Dashboard() {
  const [page, setPage] = useState<Page>('dashboard');

  if (page === 'settings') {
    return <Settings onBack={() => setPage('dashboard')} />;
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>Unified Productivity Dashboard</h1>
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
      <p>Phase 1: App shell with SQLite storage</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
        <div style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '1rem' }}>
          <h2>Email</h2>
          <p>No accounts connected</p>
        </div>
        <div style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '1rem' }}>
          <h2>Tasks</h2>
          <p>No tasks yet</p>
        </div>
      </div>
    </div>
  );
}
