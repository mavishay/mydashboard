import { useState, useEffect, useCallback } from 'react';

interface ServiceInfo {
  id: string;
  name: string;
  status: string;
  lastError: string | null;
  startedAt: string | null;
}

interface ServiceStatusPanelProps {
  onClose: () => void;
}

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  running: { color: '#22c55e', label: 'Running' },
  stopped: { color: '#9ca3af', label: 'Stopped' },
  error: { color: '#ef4444', label: 'Error' },
  starting: { color: '#f59e0b', label: 'Starting' },
};

export function ServiceStatusPanel({ onClose }: ServiceStatusPanelProps) {
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const result = await window.electronAPI.services.status();
      setServices(result.services);
    } catch (err) {
      console.error('Failed to fetch service status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleRestart = async () => {
    try {
      await window.electronAPI.services.stop();
      await window.electronAPI.services.start();
      await fetchStatus();
    } catch (err) {
      console.error('Failed to restart services:', err);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '8px',
          padding: '1.5rem',
          width: '480px',
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 4px 24px rgba(0, 0, 0, 0.15)',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>Background Services</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.25rem',
              cursor: 'pointer',
              color: '#6b7280',
              padding: '0.25rem',
            }}
          >
            &times;
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
            Loading service status...
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {services.map((service) => {
              const config = STATUS_CONFIG[service.status] ?? STATUS_CONFIG.stopped;
              return (
                <div
                  key={service.id}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    padding: '0.75rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: config.color,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>{service.name}</span>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280', marginLeft: 'auto' }}>
                      {config.label}
                    </span>
                  </div>
                  {service.lastError && (
                    <p style={{ margin: '0.375rem 0 0', fontSize: '0.8125rem', color: '#ef4444', paddingLeft: '1.125rem' }}>
                      {service.lastError}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem' }}>
          <button
            onClick={handleRestart}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '4px',
              border: '1px solid #3b82f6',
              background: '#3b82f6',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 500,
            }}
          >
            Restart All
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '4px',
              border: '1px solid #d1d5db',
              background: '#fff',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
