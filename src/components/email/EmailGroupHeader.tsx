interface EmailGroupHeaderProps {
  label: string;
  count: number;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function EmailGroupHeader({
  label,
  count,
  isCollapsed,
  onToggleCollapse,
}: EmailGroupHeaderProps) {
  return (
    <button
      onClick={onToggleCollapse}
      aria-expanded={!isCollapsed}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        width: '100%',
        padding: '0.5rem 0.75rem',
        border: '1px solid #e0e0e0',
        borderRadius: '4px',
        background: '#f5f5f5',
        cursor: 'pointer',
        textAlign: 'left',
        fontSize: '0.875rem',
        fontWeight: 600,
        color: '#333',
      }}
    >
      <span
        style={{
          display: 'inline-block',
          width: '12px',
          transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
          transition: 'transform 0.15s ease',
          fontSize: '0.75rem',
        }}
      >
        ▼
      </span>
      <span>{label}</span>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: '1.5rem',
          padding: '0.125rem 0.375rem',
          borderRadius: '12px',
          background: '#e0e0e0',
          fontSize: '0.75rem',
          fontWeight: 500,
          color: '#555',
        }}
      >
        {count}
      </span>
    </button>
  );
}
