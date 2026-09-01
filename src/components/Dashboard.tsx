import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TaskList } from './TaskList';
import { EmailList } from './EmailList';
import { StatusBar } from './StatusBar';
import { TodayCalendar } from './TodayCalendar';
import { ServiceStatusPanel } from './ServiceStatusPanel';

interface ServiceInfo {
  id: string;
  name: string;
  status: string;
  lastError: string | null;
  startedAt: string | null;
}

export function Dashboard() {
  const navigate = useNavigate();
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

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-4">
        <h1 className="m-0">Focus Board</h1>
        <div className="flex gap-2 items-center">
          <StatusBar services={services} onClick={() => setShowPanel(true)} dndEnabled={dndEnabled} cronStatus={cronStatus} />
          <button
            onClick={() => navigate('/settings')}
            className="px-4 py-2 rounded border border-border bg-secondary text-secondary-foreground cursor-pointer text-sm"
          >
            Settings
          </button>
        </div>
      </div>
      <div className="grid grid-cols-[1fr_380px] gap-4 mt-4" style={{ height: 'calc(100vh - 120px)' }}>
        <div className="border border-border rounded-lg p-4 overflow-hidden flex flex-col">
          <h2 className="m-0 mb-4">Email{emailCount > 0 ? ` (${emailCount})` : ''}</h2>
          <EmailList onCountChange={setEmailCount} />
        </div>
        <div className="border border-border rounded-lg p-4 overflow-hidden flex flex-col">
          <TodayCalendar />
          <div className="border-t border-border mt-3 pt-3">
            <h2 className="m-0 mb-4">Tasks</h2>
            <TaskList />
          </div>
        </div>
      </div>

      {showPanel && (
        <ServiceStatusPanel onClose={() => setShowPanel(false)} />
      )}
    </div>
  );
}
