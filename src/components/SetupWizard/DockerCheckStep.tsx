import { useState, useEffect } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

interface DockerCheckStepProps {
  onComplete: () => void;
  onError: (msg: string) => void;
}

function DockerCheckStepInner({ onComplete, onError }: DockerCheckStepProps) {
  const [status, setStatus] = useState<'checking' | 'passed' | 'failed'>('checking');
  const [error, setError] = useState<string | null>(null);
  const [dockerInstalled, setDockerInstalled] = useState<boolean | null>(null);

  const checkDocker = async () => {
    setStatus('checking');
    setError(null);
    try {
      const result = await window.electronAPI.n8n.dockerStatus();
      if (result.available) {
        setStatus('passed');
        await window.electronAPI.onboarding.setStepComplete('docker-check');
        onComplete();
      } else {
        setStatus('failed');
        const rawError = result.error || '';
        const isNotInstalled = rawError.includes('not found') || rawError.includes('not installed') || rawError.includes('No such file');
        setDockerInstalled(!isNotInstalled);
        const msg = isNotInstalled
          ? 'Docker is not installed. Please install Docker Desktop.'
          : 'Docker is not running. Please start Docker Desktop.';
        setError(msg);
        onError(msg);
      }
    } catch (err) {
      setStatus('failed');
      const rawMsg = err instanceof Error ? err.message : '';
      const isNotInstalled = rawMsg.includes('not found') || rawMsg.includes('ENOENT') || rawMsg.includes('No such file');
      setDockerInstalled(!isNotInstalled);
      const msg = isNotInstalled
        ? 'Docker is not installed. Please install Docker Desktop.'
        : 'Docker is not running. Please start Docker Desktop.';
      setError(msg);
      onError(msg);
    }
  };

  useEffect(() => {
    checkDocker();
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
          Check Docker Installation
        </h2>
        
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '1rem',
          background: status === 'passed' ? '#f0fdf4' : status === 'failed' ? '#fef2f2' : '#f9fafb',
          borderRadius: '6px',
          border: `1px solid ${status === 'passed' ? '#bbf7d0' : status === 'failed' ? '#fecaca' : '#e5e7eb'}`,
        }}>
          <div style={{
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            background: status === 'passed' ? '#22c55e' : status === 'failed' ? '#ef4444' : '#3b82f6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            {status === 'passed' ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : status === 'failed' ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <div style={{
                width: '10px',
                height: '10px',
                border: '2px solid white',
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }} />
            )}
          </div>
          <div>
            <div style={{
              fontSize: '0.875rem',
              fontWeight: 500,
              color: '#111827',
            }}>
              {status === 'checking' ? 'Checking Docker...' : status === 'passed' ? 'Docker is running' : 'Docker check failed'}
            </div>
            {error && (
              <div style={{
                fontSize: '0.8125rem',
                color: '#dc2626',
                marginTop: '0.25rem',
              }}>
                {error}
              </div>
            )}
          </div>
        </div>

        {status === 'failed' && (
          <div style={{
            marginTop: '1rem',
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'center',
          }}>
            {dockerInstalled !== false && (
              <button
                onClick={checkDocker}
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
                Retry
              </button>
            )}
            <a
              href="https://docs.docker.com/get-docker/"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: '0.875rem',
                color: '#2563eb',
                textDecoration: 'none',
              }}
            >
              Install Docker
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export function DockerCheckStep(props: DockerCheckStepProps) {
  return (
    <ErrorBoundary>
      <DockerCheckStepInner {...props} />
    </ErrorBoundary>
  );
}
