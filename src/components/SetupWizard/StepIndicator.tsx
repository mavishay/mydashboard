import React from 'react';
import { ErrorBoundary } from './ErrorBoundary';

interface StepIndicatorProps {
  steps: Array<{
    id: string;
    title: string;
    status: 'pending' | 'active' | 'completed' | 'failed';
  }>;
  currentStepIndex: number;
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#9ca3af',
  active: '#3b82f6',
  completed: '#22c55e',
  failed: '#ef4444',
};

function StepIndicatorInner({ steps, currentStepIndex }: StepIndicatorProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      padding: '1rem',
      fontFamily: 'system-ui, sans-serif',
      borderBottom: '1px solid #e5e7eb',
      background: '#f9fafb',
    }}>
      {steps.map((step, index) => {
        const isActive = index === currentStepIndex;
        const isCompleted = step.status === 'completed';
        const color = STATUS_COLORS[step.status];

        return (
          <React.Fragment key={step.id}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
            }}>
              <div style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: isCompleted ? color : isActive ? color : 'transparent',
                border: `2px solid ${color}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: isCompleted || isActive ? '#fff' : color,
                transition: 'all 0.2s ease',
              }}>
                {isCompleted ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  index + 1
                )}
              </div>
              <span style={{
                fontSize: '0.875rem',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? '#111827' : '#6b7280',
              }}>
                {step.title}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div style={{
                width: '24px',
                height: '2px',
                background: isCompleted ? STATUS_COLORS.completed : '#e5e7eb',
                flexShrink: 0,
              }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export function StepIndicator(props: StepIndicatorProps) {
  return (
    <ErrorBoundary>
      <StepIndicatorInner {...props} />
    </ErrorBoundary>
  );
}
