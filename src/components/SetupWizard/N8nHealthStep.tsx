import { useState, useEffect, useCallback, useRef } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

interface N8nHealthStepProps {
  onComplete: () => void;
  onError: (msg: string) => void;
}

function N8nHealthStepInner({ onComplete, onError }: N8nHealthStepProps) {
  const [dockerAvailable, setDockerAvailable] = useState<boolean | null>(null);
  const [n8nStatus, setN8nStatus] = useState<string>('unknown');
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  const checkHealth = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      // First check Docker
      const dockerResult = await window.electronAPI.n8n.dockerStatus();
      if (!dockerResult.available) {
        setDockerAvailable(false);
        setChecking(false);
        const msg = dockerResult.error || 'Docker is not running';
        setError(msg);
        onError(msg);
        return;
      }
      setDockerAvailable(true);

      // Then check n8n status
      const statusResult = await window.electronAPI.n8n.status();
      setN8nStatus(statusResult.status);
      setChecking(false);

      if (statusResult.status === 'healthy') {
        await window.electronAPI.onboarding.setStepComplete('n8n-health');
        onComplete();
      } else if (statusResult.status === 'starting') {
        setError('n8n is starting up. Please wait a moment.');
        retryTimeoutRef.current = setTimeout(checkHealth, 5000);
      } else if (statusResult.status === 'not_found') {
        const msg = 'n8n container not found. Run `docker compose up -d` to start it.';
        setError(msg);
        onError(msg);
      } else {
        const msg = 'n8n is not responding. Try restarting.';
        setError(msg);
        onError(msg);
      }
    } catch {
      setChecking(false);
      const msg = 'Failed to check n8n health';
      setError(msg);
      onError(msg);
    }
  }, [onComplete, onError]);

  const handleRestart = async () => {
    setRestarting(true);
    try {
      await window.electronAPI.n8n.start();
      // Wait a moment then recheck
      setTimeout(checkHealth, 2000);
    } catch {
      const msg = 'Failed to restart n8n';
      setError(msg);
      onError(msg);
    } finally {
      setRestarting(false);
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  return (
    <div style={{
      padding: '2rem',
      fontFamily: 'system-ui, sans-serif',
      maxWidth: '480px',
      margin: '0 auto',
    }}>
      <div style={{
        background: '#fff',
        borderRadius: '8px',
        padding: '1.5rem',
        border: '1px solid #e5e7eb',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
      }}>
        <h2 style={{
          margin: '0 0 1rem',
          fontSize: '1.125rem',
          fontWeight: 600,
          color: '#111827',
        }}>
          Check n8n Engine
        </h2>

        {/* Docker status */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.75rem',
          background: dockerAvailable === true ? '#f0fdf4' : dockerAvailable === false ? '#fef2f2' : '#f9fafb',
          borderRadius: '6px',
          border: `1px solid ${dockerAvailable === true ? '#bbf7d0' : dockerAvailable === false ? '#fecaca' : '#e5e7eb'}`,
          marginBottom: '0.75rem',
        }}>
          <div style={{
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            background: dockerAvailable === true ? '#22c55e' : dockerAvailable === false ? '#ef4444' : '#9ca3af',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            {dockerAvailable === true ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : dockerAvailable === false ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : null}
          </div>
          <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827' }}>
            Docker {dockerAvailable === true ? 'Running' : dockerAvailable === false ? 'Not Running' : 'Checking...'}
          </span>
        </div>

        {/* n8n status */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.75rem',
          background: n8nStatus === 'healthy' ? '#f0fdf4' : n8nStatus === 'starting' ? '#fefce8' : '#f9fafb',
          borderRadius: '6px',
          border: `1px solid ${n8nStatus === 'healthy' ? '#bbf7d0' : n8nStatus === 'starting' ? '#fef08a' : '#e5e7eb'}`,
        }}>
          <div style={{
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            background: n8nStatus === 'healthy' ? '#22c55e' : n8nStatus === 'starting' ? '#f59e0b' : '#9ca3af',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            {n8nStatus === 'healthy' ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : n8nStatus === 'starting' ? (
              <div style={{
                width: '8px',
                height: '8px',
                border: '2px solid white',
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }} />
            ) : null}
          </div>
          <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827' }}>
            n8n Engine {n8nStatus === 'healthy' ? 'Healthy' : n8nStatus === 'starting' ? 'Starting...' : n8nStatus === 'unknown' ? 'Checking...' : `Status: ${n8nStatus}`}
          </span>
        </div>

        {error && (
          <div style={{
            marginTop: '1rem',
            padding: '0.75rem',
            background: '#fef2f2',
            borderRadius: '6px',
            border: '1px solid #fecaca',
          }}>
            <div style={{ fontSize: '0.875rem', color: '#dc2626' }}>{error}</div>
          </div>
        )}

        {n8nStatus !== 'healthy' && n8nStatus !== 'starting' && (
          <div style={{
            marginTop: '1rem',
            display: 'flex',
            gap: '0.75rem',
          }}>
            <button
              onClick={checkHealth}
              disabled={checking}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '4px',
                border: '1px solid #3b82f6',
                background: checking ? '#93c5fd' : '#3b82f6',
                color: '#fff',
                cursor: checking ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                fontWeight: 500,
              }}
            >
              {checking ? 'Checking...' : 'Retry'}
            </button>
            <button
              onClick={handleRestart}
              disabled={restarting}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '4px',
                border: '1px solid #22c55e',
                background: restarting ? '#86efac' : '#22c55e',
                color: '#fff',
                cursor: restarting ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                fontWeight: 500,
              }}
            >
              {restarting ? 'Restarting...' : 'Restart n8n'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function N8nHealthStep(props: N8nHealthStepProps) {
  return (
    <ErrorBoundary>
      <N8nHealthStepInner {...props} />
    </ErrorBoundary>
  );
}
