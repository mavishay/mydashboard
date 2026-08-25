import { useState, useEffect, useCallback } from 'react';
import { Dashboard } from './components/Dashboard';
import { Onboarding } from './components/Onboarding';

type AppPage = 'onboarding' | 'dashboard';

export function App() {
  const [page, setPage] = useState<AppPage>('onboarding');
  const [checkingConsent, setCheckingConsent] = useState(true);

  const checkExistingConsent = useCallback(async () => {
    try {
      const settings = await window.electronAPI.telemetry.getSettings();
      if (settings.consentedAt) {
        setPage('dashboard');
      }
    } catch (err) {
      console.error('Failed to check telemetry settings:', err);
    } finally {
      setCheckingConsent(false);
    }
  }, []);

  useEffect(() => {
    checkExistingConsent();
  }, [checkExistingConsent]);

  if (checkingConsent) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <p>Loading...</p>
      </div>
    );
  }

  if (page === 'onboarding') {
    return <Onboarding onComplete={() => setPage('dashboard')} />;
  }

  return <Dashboard />;
}
