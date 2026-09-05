import { ServiceStatusPanel } from "./ServiceStatusPanel";
import { StatusBar } from "./StatusBar";
import { useEffect, useState } from "react";

interface ServiceInfo {
  id: string;
  name: string;
  status: string;
  lastError: string | null;
  startedAt: string | null;
}

const Footer = () => {
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [dndEnabled, setDndEnabled] = useState(false);
  const [showPanel, setShowPanel] = useState(false);

  const [cronStatus, setCronStatus] = useState<{
    enabled: boolean;
    lastMode: "work_hours" | "off_hours" | null;
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
      if (typeof cleanupCron === "function") cleanupCron();
    };
  }, []);

  return (
    <>
      <div className="h-8 w-full fixed bottom-0 border-t border-secondary bg-secondary flex px-4 items-center flex-0 justify-between pr-20">
        <div></div>
        <StatusBar
          services={services}
          onClick={() => setShowPanel(true)}
          dndEnabled={dndEnabled}
          cronStatus={cronStatus}
        />
      </div>
      {showPanel && <ServiceStatusPanel onClose={() => setShowPanel(false)} />}
    </>
  );
};

export default Footer;
