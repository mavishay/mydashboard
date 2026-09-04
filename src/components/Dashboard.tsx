import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TaskList } from './TaskList';
import { EmailList } from './EmailList';
import { StatusBar } from './StatusBar';
import { TodayCalendar } from './TodayCalendar';
import { ServiceStatusPanel } from './ServiceStatusPanel';
import { Button } from '@/components/ui/button';
import { Settings } from 'lucide-react';

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
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Focus Board</h1>
        <div className="flex items-center gap-4">
          <StatusBar services={services} onClick={() => setShowPanel(true)} dndEnabled={dndEnabled} cronStatus={cronStatus} />
          <Button variant="outline" size="icon" onClick={() => navigate('/settings')}>
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-6 h-[calc(100vh-120px)]">
        <div className="space-y-4">
          <EmailList />
        </div>
        <div className="space-y-4">
          <TodayCalendar />
          <TaskList />
        </div>
      </div>

      {showPanel && (
        <ServiceStatusPanel onClose={() => setShowPanel(false)} />
      )}
    </div>
  );
}
