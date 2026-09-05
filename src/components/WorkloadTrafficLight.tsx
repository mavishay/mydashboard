import { useState, useEffect, useCallback } from 'react';

const COLOR_CONFIG = {
  green: { bg: 'bg-green-500', text: 'text-green-700', label: 'Light Load' },
  yellow: { bg: 'bg-yellow-500', text: 'text-yellow-700', label: 'Moderate' },
  red: { bg: 'bg-red-500', text: 'text-red-700', label: 'Heavy Load' },
} as const;

export function WorkloadTrafficLight() {
  const [snapshot, setSnapshot] = useState<WorkloadSnapshot | null>(null);
  const [expanded, setExpanded] = useState(false);

  const refresh = useCallback(async () => {
    const result = await window.electronAPI.workload.getLatest();
    setSnapshot(result);
  }, []);

  useEffect(() => {
    refresh();
    const cleanup = window.electronAPI.cron.onStatusUpdate(() => {
      window.electronAPI.workload.calculate().then(setSnapshot).catch(() => {});
    });
    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, [refresh]);

  if (!snapshot) return null;

  const cfg = COLOR_CONFIG[snapshot.color];

  return (
    <div className="rounded-lg border bg-card p-3">
      <button
        type="button"
        className="w-full flex items-center gap-3 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <div className={`w-8 h-8 rounded-full ${cfg.bg} flex items-center justify-center text-white text-xs font-bold`}>
          {snapshot.score}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Workload</p>
          <p className={`text-xs ${cfg.text}`}>{cfg.label}</p>
        </div>
      </button>
      {expanded && (
        <div className="mt-3 space-y-1.5 text-xs border-t pt-3">
          <Row label="Urgent emails" value={snapshot.urgentEmails} />
          <Row label="Action emails" value={snapshot.actionEmails} />
          <Row label="Overdue tasks" value={snapshot.overdueTasks} />
          <Row label="Today's tasks" value={snapshot.todayTasks} />
          <Row label="Today's events" value={snapshot.todayEvents} />
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
