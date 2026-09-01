import { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/components/ThemeProvider';
import { AppLayout } from '@/components/AppLayout';
import { Onboarding } from '@/components/Onboarding';
import { Dashboard } from '@/components/Dashboard';
import { Settings } from '@/components/Settings';

function LoadingScreen() {
  return (
    <div className="flex justify-center items-center h-screen">
      <p className="text-muted-foreground">Loading...</p>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    window.electronAPI.onboarding.getStatus().then((status) => {
      if (status.servicesReady && status.apiKeyComplete && status.accountConnected) {
        setAuthorized(true);
      }
      setChecking(false);
    }).catch(() => setChecking(false));
  }, []);

  if (checking) return <LoadingScreen />;
  if (!authorized) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="focusboard-theme">
      <TooltipProvider>
        <HashRouter>
          <Routes>
            <Route path="/onboarding" element={<Onboarding onComplete={() => {}} />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HashRouter>
      </TooltipProvider>
    </ThemeProvider>
  );
}
