interface StatusBarProps {
  services: Array<{ id: string; name: string; status: string }>;
  onClick: () => void;
  dndEnabled: boolean;
  cronStatus?: {
    enabled: boolean;
    lastMode: 'work_hours' | 'off_hours' | null;
    config: { workIntervalSeconds: number; offHoursIntervalSeconds: number };
  } | null;
}

function getCronLabel(cronStatus: StatusBarProps['cronStatus']): string | null {
  if (!cronStatus?.enabled) return null;
  const mode = cronStatus.lastMode ?? 'work_hours';
  const intervalSeconds = mode === 'work_hours'
    ? cronStatus.config.workIntervalSeconds
    : cronStatus.config.offHoursIntervalSeconds;
  const minutes = Math.round(intervalSeconds / 60);
  const modeLabel = mode === 'work_hours' ? 'Work' : 'Off';
  return `Cron: ${modeLabel} ${minutes < 60 ? `${minutes}m` : `${minutes / 60}h`}`;
}

export function StatusBar({ services, onClick, dndEnabled, cronStatus }: StatusBarProps) {
  const cronLabel = getCronLabel(cronStatus);

  const runningCount = services.filter(s => s.status === 'running').length;
  const hasErrors = services.some(s => s.status === 'error');
  const statusColor = hasErrors ? '#ef4444' : runningCount > 0 ? '#22c55e' : '#9ca3af';
  const statusLabel = `${runningCount}/${services.length} services`;

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.375rem',
        padding: '0.375rem 0.75rem',
        borderRadius: '4px',
        border: '1px solid #e5e7eb',
        background: '#f9fafb',
        cursor: 'pointer',
        fontSize: '0.75rem',
        fontFamily: 'system-ui, sans-serif',
        color: '#374151',
      }}
    >
      {dndEnabled && (
        <span
          title="Do Not Disturb"
          style={{
            fontSize: '0.625rem',
            color: '#f59e0b',
            fontWeight: 600,
            marginRight: '0.25rem',
          }}
        >
          DND
        </span>
      )}
      {cronStatus?.enabled && (
        <span
          title="Auto-Fetch Active"
          style={{
            fontSize: '0.625rem',
            color: '#22c55e',
            fontWeight: 600,
            marginRight: '0.25rem',
          }}
        >
          {cronLabel}
        </span>
      )}
      <span
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: statusColor,
          display: 'inline-block',
        }}
      />
      {statusLabel}
    </button>
  );
}
