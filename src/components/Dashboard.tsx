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
    <div className="h-screen flex flex-col">
      <div className="sticky top-0 z-10 bg-background border-b border-border px-6 py-4 flex justify-between items-center shrink-0">
        <h1 className="m-0 text-xl font-semibold">Focus Board</h1>
        <div className="flex gap-3 items-center">
          <StatusBar services={services} onClick={() => setShowPanel(true)} dndEnabled={dndEnabled} cronStatus={cronStatus} />
          <button
            onClick={() => navigate('/settings')}
            className="px-4 py-2 rounded-lg border border-border bg-secondary text-secondary-foreground cursor-pointer text-sm font-medium hover:bg-secondary/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Settings
          </button>
        </div>
      </div>
      <div className="flex-1 p-4 overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 h-full">
          <div className="border border-border rounded-xl p-4 overflow-hidden flex flex-col bg-card">
            <h2 className="m-0 mb-4 text-base font-semibold">Email{emailCount > 0 ? ` (${emailCount})` : ''}</h2>
            <EmailList onCountChange={setEmailCount} />
          </div>
          <div className="border border-border rounded-xl p-4 overflow-hidden flex flex-col bg-card">
            <TodayCalendar />
            <div className="border-t border-border mt-3 pt-3">
              <h2 className="m-0 mb-4 text-base font-semibold">Tasks</h2>
              <TaskList />
            </div>
          </div>
        </div>
      </div>

      {showPanel && (
        <ServiceStatusPanel onClose={() => setShowPanel(false)} />
      )}
    </div>
  );
}
