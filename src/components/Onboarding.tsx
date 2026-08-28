import { useState, useEffect } from 'react';
import { AiConsentOnboarding } from './AiConsentOnboarding';

interface OnboardingProps {
  onComplete: () => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<'welcome' | 'ai-consent' | 'telemetry'>('welcome');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const checkExistingConsent = async () => {
      try {
        const settings = await window.electronAPI.telemetry.getSettings();
        if (settings.consentedAt) {
        const aiSettings = await window.electronAPI.aiConsent.getSettings();
        if (aiSettings.consented) {
          onComplete();
        }
        }
      } catch (err) {
        console.error('Failed to check existing consent:', err);
      }
    };
    checkExistingConsent();
  }, [onComplete]);

  const handleAiConsentChoice = async (consented: boolean) => {
    setSaving(true);
    try {
      await window.electronAPI.aiConsent.setConsent(consented);
      setStep('telemetry');
    } catch (err) {
      console.error('Failed to save AI consent:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleTelemetryChoice = async (optedIn: boolean) => {
    setSaving(true);
    try {
      await window.electronAPI.telemetry.setOptIn(optedIn);
      onComplete();
    } catch (err) {
      console.error('Failed to save telemetry settings:', err);
    } finally {
      setSaving(false);
    }
  };

  if (step === 'welcome') {
    return (
      <div style={{
        padding: '3rem',
        fontFamily: 'system-ui, sans-serif',
        maxWidth: '600px',
        margin: '0 auto',
        textAlign: 'center',
      }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>
          Welcome to Focus Board
        </h1>
        <p style={{ color: '#666', fontSize: '1.1rem', marginBottom: '2rem' }}>
          One dashboard for all your email accounts. AI-powered triage that only pings you when it matters.
        </p>
        <button
          onClick={() => setStep('ai-consent')}
          style={{
            padding: '0.75rem 1.5rem',
            borderRadius: '4px',
            border: 'none',
            background: '#1976d2',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: 600,
          }}
        >
          Get Started
        </button>
      </div>
    );
  }

  if (step === 'ai-consent') {
    return (
      <AiConsentOnboarding
        onAccept={() => handleAiConsentChoice(true)}
        onDecline={() => handleAiConsentChoice(false)}
        saving={saving}
      />
    );
  }

  // step === 'telemetry'
  return (
    <div style={{
      padding: '3rem',
      fontFamily: 'system-ui, sans-serif',
      maxWidth: '600px',
      margin: '0 auto',
    }}>
      <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>
        Help Us Improve
      </h2>
      <p style={{ color: '#666', marginBottom: '1.5rem' }}>
        We collect anonymous usage statistics to improve the product. This helps us understand:
      </p>
      <ul style={{ color: '#666', marginBottom: '1.5rem', paddingLeft: '1.5rem' }}>
        <li>Notification precision (are notifications helpful?)</li>
        <li>Triage coverage (how many emails are auto-classified?)</li>
        <li>Weekly retention (are users finding value?)</li>
      </ul>
      <div style={{
        background: '#f5f5f5',
        borderRadius: '8px',
        padding: '1rem',
        marginBottom: '1.5rem',
      }}>
        <h3 style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>What we DON'T collect:</h3>
        <ul style={{ color: '#666', fontSize: '0.875rem', margin: 0, paddingLeft: '1.5rem' }}>
          <li>Email content or subject lines</li>
          <li>Personal information (name, email address)</li>
          <li>API keys or credentials</li>
          <li>Any identifiable data</li>
        </ul>
      </div>
      <p style={{ color: '#666', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        You can view all collected data in Settings and opt out at any time.
      </p>
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
        <button
          onClick={() => handleTelemetryChoice(false)}
          disabled={saving}
          style={{
            padding: '0.75rem 1.5rem',
            borderRadius: '4px',
            border: '1px solid #ccc',
            background: '#fff',
            cursor: saving ? 'not-allowed' : 'pointer',
            fontSize: '0.875rem',
          }}
        >
          {saving ? 'Saving...' : 'Skip'}
        </button>
        <button
          onClick={() => handleTelemetryChoice(true)}
          disabled={saving}
          style={{
            padding: '0.75rem 1.5rem',
            borderRadius: '4px',
            border: 'none',
            background: saving ? '#ccc' : '#1976d2',
            color: '#fff',
            cursor: saving ? 'not-allowed' : 'pointer',
            fontSize: '0.875rem',
            fontWeight: 600,
          }}
        >
          {saving ? 'Saving...' : 'Enable Telemetry'}
        </button>
      </div>
    </div>
  );
}