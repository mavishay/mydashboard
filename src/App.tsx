import { useState, useEffect, useCallback } from 'react';
import { Dashboard } from './components/Dashboard';
import { Onboarding } from './components/Onboarding';

type AppPage = 'onboarding' | 'dashboard';

export function App() {
  const [page, setPage] = useState<AppPage>('onboarding');
  const [checkingConsent, setCheckingConsent] = useState(true);

  const checkExistingConsent = useCallback(async () => {
    try {
<<<<<<< HEAD
      const settings = await window.electronAPI.telemetry.getSettings();
      if (settings.consentedAt) {
        const aiSettings = await window.electronAPI.aiConsent.getSettings();
        if (aiSettings.consented) {
          setPage('dashboard');
        } else {
          // Telemetry consent exists but AI consent missing, show onboarding for AI consent
          setPage('onboarding');
        }
      }
    } catch (err) {
      console.error('Failed to check consent settings:', err);
=======
      const status = await window.electronAPI.onboarding.getStatus();
      if (
        status.dockerCheckComplete &&
        status.n8nHealthComplete &&
        status.apiKeyComplete &&
        status.accountConnected
      ) {
        setPage('dashboard');
        return;
      }
    } catch (err) {
      console.error('Failed to check onboarding status:', err);
>>>>>>> origin/main
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