import { useState, useEffect, useCallback } from 'react';
import { Settings } from './Settings';
import { TaskList } from './TaskList';
import { TelemetryStats } from './TelemetryStats';
import { EmailList } from './EmailList';
import { StatusBar } from './StatusBar';
import { HealthCheckWizard } from './HealthCheckWizard';

type Page = 'dashboard' | 'settings' | 'telemetry-stats';

export function Dashboard() {
  const [page, setPage] = useState<Page>('dashboard');
  const [n8nStatus, setN8nStatus] = useState<string>('unknown');
  const [showWizard, setShowWizard] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [dndEnabled, setDndEnabled] = useState(false);

  useEffect(() => {
    window.electronAPI.n8n.status().then((result) => {
      setN8nStatus(result.status);
    });

    window.electronAPI.notification.getDndStatus().then((result) => {
      setDndEnabled(result.enabled);
    });

    const cleanup = window.electronAPI.n8n.onHealth((status: string) => {
      setN8nStatus(status);
    });

    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, []);

  const handleRestart = useCallback(async () => {
    setRestarting(true);
    try {
      await window.electronAPI.n8n.start();
    } finally {
      setRestarting(false);
    }
  }, []);

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
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <StatusBar status={n8nStatus} onClick={() => setShowWizard(true)} dndEnabled={dndEnabled} />
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1rem', marginTop: '1rem', height: 'calc(100vh - 120px)' }}>
        <div style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '1rem', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ margin: '0 0 1rem 0' }}>Email</h2>
          <EmailList />
        </div>
        <div style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '1rem', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ margin: '0 0 1rem 0' }}>Tasks</h2>
          <TaskList />
        </div>
      </div>

      {showWizard && (
        <HealthCheckWizard
          status={n8nStatus}
          onClose={() => setShowWizard(false)}
          onRestart={handleRestart}
          restarting={restarting}
        />
      )}
    </div>
  );
}
