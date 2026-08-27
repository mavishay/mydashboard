interface StatusBarProps {
  status: string;
  onClick: () => void;
  dndEnabled: boolean;
}

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  healthy: { color: '#22c55e', label: 'n8n: Running' },
  unhealthy: { color: '#ef4444', label: 'n8n: Unhealthy' },
  starting: { color: '#f59e0b', label: 'n8n: Starting' },
  unknown: { color: '#9ca3af', label: 'n8n: Unknown' },
};

export function StatusBar({ status, onClick, dndEnabled }: StatusBarProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.unknown;

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
      <span
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: config.color,
          display: 'inline-block',
        }}
      />
      {config.label}
    </button>
  );
}
