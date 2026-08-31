import { useState, useEffect } from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import { StepIndicator } from './StepIndicator';
import { ApiKeyStep } from './ApiKeyStep';
import { AccountConnectStep } from './AccountConnectStep';
import { SetupCompleteStep } from './SetupCompleteStep';

interface SetupWizardProps {
  onComplete: () => void;
}

const STEP_IDS = ['api-key', 'account-connect', 'setup-complete'];

const STEP_LABELS: Record<string, string> = {
  'api-key': 'API Key',
  'account-connect': 'Account Connect',
  'setup-complete': 'Setup Complete',
};

type StepStatus = 'pending' | 'active' | 'completed' | 'failed';

function SetupWizardInner({ onComplete }: SetupWizardProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [stepStatuses, setStepStatuses] = useState<StepStatus[]>(STEP_IDS.map(() => 'pending'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadProgress = async () => {
      try {
        const status = await window.electronAPI.onboarding.getStatus();
        // Map status booleans to step indices
        const completedSteps = [
          status.servicesReady,
          status.apiKeyComplete,
          status.accountConnected,
          status.setupCompletedAt !== null,
        ];
        
        const newStatuses = completedSteps.map((completed, idx) => {
          if (completed) return 'completed' as StepStatus;
          // First incomplete step is active
          if (idx === completedSteps.findIndex(c => !c)) return 'active' as StepStatus;
          return 'pending' as StepStatus;
        });
        
        setStepStatuses(newStatuses);
        // Find first incomplete step index
        const firstIncomplete = completedSteps.findIndex(c => !c);
        setCurrentStepIndex(firstIncomplete === -1 ? STEP_IDS.length - 1 : firstIncomplete);
      } catch (err) {
        console.error('Failed to load setup progress:', err);
      } finally {
        setLoading(false);
      }
    };
    loadProgress();
  }, []);

  const handleStepComplete = async () => {
    // Mark current step as completed
    const newStatuses = [...stepStatuses];
    newStatuses[currentStepIndex] = 'completed';
    
    // Move to next step
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEP_IDS.length) {
      newStatuses[nextIndex] = 'active';
      setStepStatuses(newStatuses);
      setCurrentStepIndex(nextIndex);
    } else {
      // All steps completed
      setStepStatuses(newStatuses);
      onComplete();
    }
  };

  const handleStepError = (_msg: string) => {
    const newStatuses = [...stepStatuses];
    newStatuses[currentStepIndex] = 'failed';
    setStepStatuses(newStatuses);
  };

  if (loading) {
    return (
      <div style={{
        padding: '2rem',
        fontFamily: 'system-ui, sans-serif',
        textAlign: 'center',
        color: '#6b7280',
      }}>
        Loading setup progress...
      </div>
    );
  }

  const steps = STEP_IDS.map((id, index) => ({
    id,
    title: STEP_LABELS[id],
    status: stepStatuses[index],
  }));

  const renderCurrentStep = () => {
    const stepId = STEP_IDS[currentStepIndex];
    switch (stepId) {
      case 'api-key':
        return <ApiKeyStep onComplete={handleStepComplete} onError={handleStepError} />;
      case 'account-connect':
        return <AccountConnectStep onComplete={handleStepComplete} onError={handleStepError} />;
      case 'setup-complete':
        return (
          <SetupCompleteStep
            onComplete={onComplete}
            completedSteps={STEP_IDS.slice(0, currentStepIndex)}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f3f4f6',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <StepIndicator steps={steps} currentStepIndex={currentStepIndex} />
      <div style={{
        padding: '2rem',
        maxWidth: '600px',
        margin: '0 auto',
      }}>
        {renderCurrentStep()}
      </div>
    </div>
  );
}

export function SetupWizard(props: SetupWizardProps) {
  return (
    <ErrorBoundary>
      <SetupWizardInner {...props} />
    </ErrorBoundary>
  );
}
