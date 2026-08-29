import { useState, useEffect, useCallback } from 'react';
import { NotificationPreferences } from './notifications/NotificationPreferences';
import { ClassificationRules } from './ClassificationRules';

type Provider = 'openai' | 'anthropic' | 'litellm';

interface ApiKeyMeta {
  id: string;
  provider: Provider;
  label: string;
  baseUrl?: string;
  createdAt: string;
}

interface GmailAccount {
  id: string;
  email: string;
  displayName: string;
}

interface TelemetrySettings {
  optedIn: boolean;
  consentedAt: string | null;
}

interface AiConsentSettings {
  consented: boolean;
  policyVersion: string;
  consentedAt: string | null;
  revokedAt: string | null;
}

const PROVIDER_LABELS: Record<Provider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  litellm: 'liteLLM (Custom)',
};

function maskKey(label: string, provider: string): string {
  return `${provider.charAt(0).toUpperCase()}${provider.slice(1)}: ${label.slice(0, 3)}***`;
}

export function Settings({ onBack }: { onBack: () => void }) {
  const [keys, setKeys] = useState<ApiKeyMeta[]>([]);
  const [gmailAccounts, setGmailAccounts] = useState<GmailAccount[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [provider, setProvider] = useState<Provider>('openai');
  const [label, setLabel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [telemetrySettings, setTelemetrySettings] = useState<TelemetrySettings | null>(null);
  const [telemetrySaving, setTelemetrySaving] = useState(false);
  const [aiConsentSettings, setAiConsentSettings] = useState<AiConsentSettings | null>(null);
  const [aiConsentSaving, setAiConsentSaving] = useState(false);

  const loadKeys = useCallback(async () => {
    try {
      const list = await window.electronAPI.apikey.list();
      setKeys(list);
    } catch (err) {
      console.error('Failed to load API keys:', err);
    }
  }, []);

  const loadGmailAccounts = useCallback(async () => {
    try {
      const list = await window.electronAPI.gmail.listAccounts();
      setGmailAccounts(list);
    } catch (err) {
      console.error('Failed to load Gmail accounts:', err);
    }
  }, []);

  const loadTelemetrySettings = useCallback(async () => {
    try {
      const settings = await window.electronAPI.telemetry.getSettings();
      setTelemetrySettings(settings);
    } catch (err) {
      console.error('Failed to load telemetry settings:', err);
    }
  }, []);

  const loadAiConsentSettings = useCallback(async () => {
    try {
      const settings = await window.electronAPI.aiConsent.getSettings();
      setAiConsentSettings(settings);
    } catch (err) {
      console.error('Failed to load AI consent settings:', err);
    }
  }, []);

  useEffect(() => {
    loadKeys();
    loadGmailAccounts();
    loadTelemetrySettings();
    loadAiConsentSettings();
  }, [loadKeys, loadGmailAccounts, loadTelemetrySettings, loadAiConsentSettings]);

  const handleSave = async () => {
    setError(null);
    setSuccess(false);
    setSaving(true);

    try {
      await window.electronAPI.apikey.save({
        provider,
        label: label || `${PROVIDER_LABELS[provider]} Key`,
        apiKey,
        baseUrl: provider === 'litellm' ? baseUrl : undefined,
      });
      setSuccess(true);
      setLabel('');
      setApiKey('');
      setBaseUrl('');
      setShowKey(false);
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save API key');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (keyId: string) => {
    try {
      await window.electronAPI.apikey.delete(keyId);
      await loadKeys();
    } catch (err) {
      console.error('Failed to delete API key:', err);
    }
  };

  const handleConnectGmail = async () => {
    setConnecting(true);
    setError(null);
    try {
      await window.electronAPI.gmail.connect();
      await loadGmailAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect Gmail account');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnectGmail = async (accountId: string) => {
    try {
      await window.electronAPI.gmail.disconnect(accountId);
      await loadGmailAccounts();
    } catch (err) {
      console.error('Failed to disconnect Gmail account:', err);
    }
  };

  const handleTelemetryToggle = async () => {
    if (!telemetrySettings) return;
    setTelemetrySaving(true);
    try {
      await window.electronAPI.telemetry.setOptIn(!telemetrySettings.optedIn);
      await loadTelemetrySettings();
    } catch (err) {
      console.error('Failed to update telemetry settings:', err);
    } finally {
      setTelemetrySaving(false);
    }
  };

  const handleAiConsentToggle = async () => {
    if (!aiConsentSettings) return;
    const newConsented = !aiConsentSettings.consented;
    // If enabling AI features, require explicit re-acknowledgment of policy
    if (newConsented) {
      const confirmed = window.confirm(
        'AI Classification Consent\n\n' +
        'To enable AI features, you must acknowledge that:\n\n' +
        '• Email subject, sender address, and preview snippet will be sent to external LLM providers (OpenAI/Anthropic)\n' +
        '• You provide your own API keys (BYOK)\n' +
        '• Data is processed directly by the provider you configure\n' +
        '• You can revoke consent at any time in Settings\n\n' +
        'Do you accept these terms and want to enable AI features?'
      );
      if (!confirmed) return;
    } else {
      // Confirm revocation
      const confirmed = window.confirm(
        'Disable AI Classification\n\n' +
        'Disabling AI features will stop email classification and urgent notifications. ' +
        'You can re-enable AI features at any time in Settings.\n\n' +
        'Do you want to disable AI features?'
      );
      if (!confirmed) return;
    }
    setAiConsentSaving(true);
    try {
      await window.electronAPI.aiConsent.setConsent(newConsented);
      await loadAiConsentSettings();
    } catch (err) {
      console.error('Failed to update AI consent settings:', err);
    } finally {
      setAiConsentSaving(false);
    }
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif', maxWidth: '640px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '1.2rem',
            padding: '0.25rem',
          }}
        >
          ← Back
        </button>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Settings</h1>
      </div>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Google Accounts</h2>
        <p style={{ color: '#666', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Connect your Google account to access Gmail and Google Tasks.
        </p>

        {gmailAccounts.length === 0 ? (
          <p style={{ color: '#999', fontSize: '0.875rem', marginBottom: '1rem' }}>
            No accounts connected.
          </p>
        ) : (
          <div style={{ marginBottom: '1rem' }}>
            {gmailAccounts.map((account) => (
              <div
                key={account.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.75rem 1rem',
                  border: '1px solid #e0e0e0',
                  borderRadius: '8px',
                  marginBottom: '0.5rem',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                    {account.displayName}
                  </div>
                  <div style={{ color: '#666', fontSize: '0.75rem' }}>
                    {account.email}
                  </div>
                </div>
                <button
                  onClick={() => handleDisconnectGmail(account.id)}
                  style={{
                    background: 'none',
                    border: '1px solid #d32f2f',
                    color: '#d32f2f',
                    borderRadius: '4px',
                    padding: '0.25rem 0.5rem',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                  }}
                >
                  Disconnect
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={handleConnectGmail}
          disabled={connecting}
          style={{
            padding: '0.625rem 1.25rem',
            borderRadius: '4px',
            border: 'none',
            background: connecting ? '#ccc' : '#1976d2',
            color: '#fff',
            cursor: connecting ? 'not-allowed' : 'pointer',
            fontSize: '0.875rem',
            fontWeight: 600,
          }}
        >
          {connecting ? 'Connecting...' : 'Connect Gmail Account'}
        </button>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Add API Key</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
              Provider
            </label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as Provider)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="litellm">liteLLM (Custom URL)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
              Label
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={`${PROVIDER_LABELS[provider]} Key`}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
            />
          </div>

          {provider === 'litellm' && (
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                Base URL
              </label>
              <input
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:4000"
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
              />
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
              API Key
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                style={{ flex: 1, padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                style={{ padding: '0.5rem 0.75rem', borderRadius: '4px', border: '1px solid #ccc', background: '#f5f5f5', cursor: 'pointer' }}
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {error && (
            <div style={{ color: '#d32f2f', fontSize: '0.875rem', padding: '0.5rem', background: '#ffeaea', borderRadius: '4px' }}>
              {error}
            </div>
          )}

          {success && (
            <div style={{ color: '#2e7d32', fontSize: '0.875rem', padding: '0.5rem', background: '#e8f5e9', borderRadius: '4px' }}>
              API key saved and validated successfully.
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving || !apiKey}
            style={{
              padding: '0.625rem 1.25rem',
              borderRadius: '4px',
              border: 'none',
              background: saving || !apiKey ? '#ccc' : '#1976d2',
              color: '#fff',
              cursor: saving || !apiKey ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
              fontWeight: 600,
              alignSelf: 'flex-start',
            }}
          >
            {saving ? 'Validating & Saving...' : 'Save API Key'}
          </button>
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Saved API Keys</h2>
        {keys.length === 0 ? (
          <p style={{ color: '#666', fontSize: '0.875rem' }}>No API keys configured.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #eee' }}>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Label</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Provider</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Key</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Base URL</th>
                <th style={{ padding: '0.5rem' }} />
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.5rem' }}>{key.label}</td>
                  <td style={{ padding: '0.5rem' }}>{PROVIDER_LABELS[key.provider]}</td>
                  <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>{maskKey(key.label, key.provider)}</td>
                  <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>{key.baseUrl ?? '—'}</td>
                  <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                    <button
                      onClick={() => handleDelete(key.id)}
                      style={{
                        background: 'none',
                        border: '1px solid #d32f2f',
                        color: '#d32f2f',
                        borderRadius: '4px',
                        padding: '0.25rem 0.5rem',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section style={{ marginTop: '2rem', borderTop: '1px solid #eee', paddingTop: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Telemetry</h2>
        <p style={{ color: '#666', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Help us improve by sharing anonymous usage statistics. No personal data is collected.
        </p>
        {telemetrySettings ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={telemetrySettings.optedIn}
                onChange={handleTelemetryToggle}
                disabled={telemetrySaving}
                style={{ width: '1.25rem', height: '1.25rem' }}
              />
              <span style={{ fontSize: '0.875rem' }}>
                {telemetrySettings.optedIn ? 'Telemetry enabled' : 'Telemetry disabled'}
              </span>
            </label>
            {telemetrySettings.consentedAt && (
              <span style={{ color: '#999', fontSize: '0.75rem' }}>
                Since: {new Date(telemetrySettings.consentedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        ) : (
          <p style={{ color: '#999', fontSize: '0.875rem' }}>Loading...</p>
        )}
      </section>

      <section style={{ marginTop: '2rem', borderTop: '1px solid #eee', paddingTop: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>AI Features</h2>
        <p style={{ color: '#666', fontSize: '0.875rem', marginBottom: '1rem' }}>
          AI features classify your emails and send email subject, sender address, and preview snippet to external LLM providers (OpenAI/Anthropic). You provide your own API keys.
        </p>
        {aiConsentSettings ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={aiConsentSettings.consented}
                onChange={handleAiConsentToggle}
                disabled={aiConsentSaving}
                style={{ width: '1.25rem', height: '1.25rem' }}
              />
              <span style={{ fontSize: '0.875rem' }}>
                {aiConsentSettings.consented ? 'AI features enabled' : 'AI features disabled'}
              </span>
            </label>
            {aiConsentSettings.consentedAt && (
              <span style={{ color: '#999', fontSize: '0.75rem' }}>
                Since: {new Date(aiConsentSettings.consentedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        ) : (
          <p style={{ color: '#999', fontSize: '0.875rem' }}>Loading...</p>
        )}
        <div style={{ marginTop: '2rem' }}>
          <NotificationPreferences />
        </div>
      </section>

      <section style={{ marginTop: '2rem', borderTop: '1px solid #eee', paddingTop: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Classification Rules</h2>
        <ClassificationRules />
      </section>
    </div>
  );
}
