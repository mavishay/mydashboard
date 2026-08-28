import { useState } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

interface AccountConnectStepProps {
  onComplete: () => void;
  onError: (msg: string) => void;
}

function AccountConnectStepInner({ onComplete, onError }: AccountConnectStepProps) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      await window.electronAPI.gmail.connect();
      await window.electronAPI.onboarding.setStepComplete('account-connect');
      onComplete();
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : '';
      const isNetworkError = rawMsg.includes('ECONNREFUSED') || rawMsg.includes('ETIMEDOUT') || rawMsg.includes('fetch failed') || rawMsg.includes('network') || rawMsg.includes('Network');
      const msg = isNetworkError
        ? 'Network error. Check your connection and try again.'
        : 'Google sign-in failed. Please try again.';
      setError(msg);
      onError(msg);
    } finally {
      setConnecting(false);
    }
  };

  const handleSkip = async () => {
    await window.electronAPI.onboarding.setStepComplete('account-connect');
    onComplete();
  };

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
          margin: '0 0 0.5rem',
          fontSize: '1.125rem',
          fontWeight: 600,
          color: '#111827',
        }}>
          Connect Gmail Account
        </h2>
        <p style={{
          margin: '0 0 1.5rem',
          fontSize: '0.875rem',
          color: '#6b7280',
        }}>
          Connect your Gmail account to enable AI-powered email triage. You can connect multiple accounts later.
        </p>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '1rem',
          background: '#f9fafb',
          borderRadius: '6px',
          border: '1px solid #e5e7eb',
          marginBottom: '1.5rem',
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          <div>
            <div style={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827' }}>
              Google OAuth2
            </div>
            <div style={{ fontSize: '0.8125rem', color: '#6b7280' }}>
              Secure authentication via Google
            </div>
          </div>
        </div>

        {error && (
          <div style={{
            padding: '0.75rem',
            background: '#fef2f2',
            borderRadius: '6px',
            border: '1px solid #fecaca',
            marginBottom: '1rem',
          }}>
            <div style={{ fontSize: '0.875rem', color: '#dc2626' }}>{error}</div>
          </div>
        )}

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}>
          <button
            onClick={handleConnect}
            disabled={connecting}
            style={{
              padding: '0.75rem',
              borderRadius: '4px',
              border: 'none',
              background: connecting ? '#93c5fd' : '#1976d2',
              color: '#fff',
              cursor: connecting ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
              fontWeight: 600,
            }}
          >
            {connecting ? 'Connecting...' : 'Connect Gmail Account'}
          </button>
          <button
            onClick={handleSkip}
            style={{
              padding: '0.75rem',
              borderRadius: '4px',
              border: '1px solid #d1d5db',
              background: '#fff',
              color: '#374151',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}

export function AccountConnectStep(props: AccountConnectStepProps) {
  return (
    <ErrorBoundary>
      <AccountConnectStepInner {...props} />
    </ErrorBoundary>
  );
}
