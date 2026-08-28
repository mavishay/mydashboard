import { useEffect } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

interface SetupCompleteStepProps {
  onComplete: () => void;
  completedSteps?: string[];
}

const STEP_LABELS: Record<string, string> = {
  'docker-check': 'Docker Check',
  'n8n-health': 'n8n Engine Health',
  'api-key': 'AI Provider Key',
  'account-connect': 'Gmail Account',
  'setup-complete': 'Setup Complete',
};

function SetupCompleteStepInner({ onComplete, completedSteps = [] }: SetupCompleteStepProps) {
  useEffect(() => {
    window.electronAPI.onboarding.setStepComplete('setup-complete');
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
        textAlign: 'center',
      }}>
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          background: '#f0fdf4',
          border: '2px solid #22c55e',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 1.5rem',
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <h2 style={{
          margin: '0 0 0.5rem',
          fontSize: '1.5rem',
          fontWeight: 600,
          color: '#111827',
        }}>
          Setup Complete!
        </h2>
        <p style={{
          margin: '0 0 1.5rem',
          fontSize: '0.875rem',
          color: '#6b7280',
        }}>
          Your dashboard is ready. All configuration steps have been completed successfully.
        </p>

        <div style={{
          textAlign: 'left',
          padding: '1rem',
          background: '#f9fafb',
          borderRadius: '6px',
          border: '1px solid #e5e7eb',
          marginBottom: '1.5rem',
        }}>
          {Object.entries(STEP_LABELS).map(([id, label]) => {
            const isCompleted = completedSteps.includes(id) || id === 'setup-complete';
            return (
              <div key={id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.375rem 0',
              }}>
                <div style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  background: isCompleted ? '#22c55e' : '#e5e7eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {isCompleted && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
                <span style={{
                  fontSize: '0.875rem',
                  color: isCompleted ? '#111827' : '#9ca3af',
                  fontWeight: isCompleted ? 500 : 400,
                }}>
                  {label}
                </span>
              </div>
            );
          })}
        </div>

        <button
          onClick={onComplete}
          style={{
            width: '100%',
            padding: '0.75rem',
            borderRadius: '4px',
            border: 'none',
            background: '#22c55e',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 600,
          }}
        >
          Go to Dashboard
        </button>
      </div>
    </div>
  );
}

export function SetupCompleteStep(props: SetupCompleteStepProps) {
  return (
    <ErrorBoundary>
      <SetupCompleteStepInner {...props} />
    </ErrorBoundary>
  );
}
