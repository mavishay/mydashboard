import { useState, useEffect } from 'react';
import { Settings } from './Settings';
import { TaskList } from './TaskList';
import { TelemetryStats } from './TelemetryStats';
import { EmailList } from './EmailList';
import { StatusBar } from './StatusBar';
import { ServiceStatusPanel } from './ServiceStatusPanel';

type Page = 'dashboard' | 'settings' | 'telemetry-stats';

interface ServiceInfo {
  id: string;
  name: string;
  status: string;
  lastError: string | null;
  startedAt: string | null;
}

export function Dashboard() {
  const [page, setPage] = useState<Page>('dashboard');
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [showPanel, setShowPanel] = useState(false);
  const [dndEnabled, setDndEnabled] = useState(false);
  const [cronStatus, setCronStatus] = useState<{
    enabled: boolean;
    lastMode: 'work_hours' | 'off_hours' | null;
    config: { workIntervalSeconds: number; offHoursIntervalSeconds: number };
  } | null>(null);
  const [emailCount, setEmailCount] = useState(0);

  useEffect(() => {
    window.electronAPI.services.status().then((result) => {
      setServices(result.services);
    });

    window.electronAPI.notification.getDndStatus().then((result) => {
      setDndEnabled(result.enabled);
    });

    window.electronAPI.cron.status().then((result) => {
      setCronStatus(result);
    });

    const cleanupCron = window.electronAPI.cron.onStatusUpdate((status) => {
      setCronStatus(status);
    });

    return () => {
      if (typeof cleanupCron === 'function') cleanupCron();
    };
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
        <h1 style={{ margin: 0 }}>Focus Board</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <StatusBar services={services} onClick={() => setShowPanel(true)} dndEnabled={dndEnabled} cronStatus={cronStatus} />
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
          <h2 style={{ margin: '0 0 1rem 0' }}>Email{emailCount > 0 ? ` (${emailCount})` : ''}</h2>
          <EmailList onCountChange={setEmailCount} />
        </div>
        <div style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '1rem', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ margin: '0 0 1rem 0' }}>Tasks</h2>
          <TaskList />
        </div>
      </div>

      {showPanel && (
        <ServiceStatusPanel onClose={() => setShowPanel(false)} />
      )}
    </div>
  );
}
