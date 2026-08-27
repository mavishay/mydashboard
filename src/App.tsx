import { useState, useEffect, useCallback } from 'react';
import { Dashboard } from './components/Dashboard';
import { Onboarding } from './components/Onboarding';

type AppPage = 'onboarding' | 'dashboard';

export function App() {
  const [page, setPage] = useState<AppPage>('onboarding');
  const [checkingConsent, setCheckingConsent] = useState(true);
  const [aiConsented, setAiConsented] = useState(false);

  const checkExistingConsent = useCallback(async () => {
    try {
      const settings = await window.electronAPI.telemetry.getSettings();
      if (settings.consentedAt) {
        const aiSettings = await window.electronAPI.aiConsent.getSettings();
        setAiConsented(aiSettings.consented);
        setPage('dashboard');
      }
    } catch (err) {
      console.error('Failed to check consent settings:', err);
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
    return <Onboarding onComplete={() => { setAiConsented(true); setPage('dashboard'); }} />;
  }

  return <Dashboard />;
}
