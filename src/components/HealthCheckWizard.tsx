import { useState, useEffect } from 'react';

interface HealthCheckWizardProps {
  status: string;
  onClose: () => void;
  onRestart: () => void;
  restarting: boolean;
}

interface Step {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'checking' | 'passed' | 'failed';
  error?: string;
}

const INITIAL_STEPS: Step[] = [
  {
    id: 'docker',
    title: 'Docker Daemon',
    description: 'Checking if Docker is running...',
    status: 'pending',
  },
  {
    id: 'container',
    title: 'Container Exists',
    description: 'Checking if n8n container exists...',
    status: 'pending',
  },
  {
    id: 'healthy',
    title: 'Container Healthy',
    description: 'Checking container health status...',
    status: 'pending',
  },
  {
    id: 'responding',
    title: 'n8n Responding',
    description: 'Checking if n8n is responding to requests...',
    status: 'pending',
  },
];

const STEP_COLORS: Record<string, string> = {
  pending: '#9ca3af',
  checking: '#3b82f6',
  passed: '#22c55e',
  failed: '#ef4444',
};

const ERROR_MESSAGES: Record<string, string> = {
  docker: 'Docker is not running. Please start Docker Desktop or the Docker daemon.',
  container: 'n8n container not found. It may need to be created via docker compose.',
  healthy: 'n8n container is unhealthy. It may be starting up or experiencing issues.',
  responding: 'n8n is not responding. The container may need to be restarted.',
};

export function HealthCheckWizard({ status, onClose, onRestart, restarting }: HealthCheckWizardProps) {
  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS);

  useEffect(() => {
    let cancelled = false;

    async function runChecks() {
      const updated = [...INITIAL_STEPS];
      const initialStatus = status;

      // Step 1: Docker Daemon
      updated[0] = { ...updated[0], status: 'checking' };
      setSteps([...updated]);

      try {
        const dockerResult = await window.electronAPI.n8n.dockerStatus();
        if (cancelled) return;

        if (dockerResult.available) {
          updated[0] = { ...updated[0], status: 'passed' };
        } else {
          updated[0] = { ...updated[0], status: 'failed', error: dockerResult.error };
          setSteps([...updated]);
          return;
        }
      } catch {
        if (cancelled) return;
        updated[0] = { ...updated[0], status: 'failed', error: 'Failed to check Docker status' };
        setSteps([...updated]);
        return;
      }

      // Step 2: Container Exists
      updated[1] = { ...updated[1], status: 'checking' };
      setSteps([...updated]);

      try {
        const statusResult = await window.electronAPI.n8n.status();
        if (cancelled) return;

        if (statusResult.status !== 'unknown') {
          updated[1] = { ...updated[1], status: 'passed' };
        } else {
          updated[1] = { ...updated[1], status: 'failed', error: ERROR_MESSAGES.container };
          setSteps([...updated]);
          return;
        }
      } catch {
        if (cancelled) return;
        updated[1] = { ...updated[1], status: 'failed', error: 'Failed to check container status' };
        setSteps([...updated]);
        return;
      }

      // Step 3: Container Healthy (uses status captured at mount time)
      updated[2] = { ...updated[2], status: 'checking' };
      setSteps([...updated]);

      if (initialStatus === 'healthy') {
        updated[2] = { ...updated[2], status: 'passed' };
      } else if (initialStatus === 'starting') {
        updated[2] = { ...updated[2], status: 'failed', error: 'Container is still starting. Please wait.' };
        setSteps([...updated]);
        return;
      } else {
        updated[2] = { ...updated[2], status: 'failed', error: ERROR_MESSAGES.healthy };
        setSteps([...updated]);
        return;
      }

      // Step 4: n8n Responding (independent re-check via IPC)
      updated[3] = { ...updated[3], status: 'checking' };
      setSteps([...updated]);

      try {
        const recheck = await window.electronAPI.n8n.status();
        if (cancelled) return;

        if (recheck.status === 'healthy') {
          updated[3] = { ...updated[3], status: 'passed' };
        } else {
          updated[3] = { ...updated[3], status: 'failed', error: ERROR_MESSAGES.responding };
        }
      } catch {
        if (cancelled) return;
        updated[3] = { ...updated[3], status: 'failed', error: 'Failed to verify n8n is responding' };
      }

      setSteps([...updated]);
    }

    runChecks();

    return () => {
      cancelled = true;
    };
  }, []);

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
          <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>n8n Health Check</h2>
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {steps.map((step) => (
            <div
              key={step.id}
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
                    background: STEP_COLORS[step.status],
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>{step.title}</span>
                {step.status === 'checking' && (
                  <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Checking...</span>
                )}
              </div>
              {step.error && (
                <p style={{ margin: '0.375rem 0 0', fontSize: '0.8125rem', color: '#ef4444', paddingLeft: '1.125rem' }}>
                  {step.error}
                </p>
              )}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem' }}>
          {status !== 'healthy' && (
            <button
              onClick={onRestart}
              disabled={restarting}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '4px',
                border: '1px solid #3b82f6',
                background: restarting ? '#93c5fd' : '#3b82f6',
                color: '#fff',
                cursor: restarting ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                fontWeight: 500,
              }}
            >
              {restarting ? 'Restarting...' : 'Restart n8n'}
            </button>
          )}
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
