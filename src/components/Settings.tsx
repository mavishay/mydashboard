import { useState, useEffect, useCallback, useRef } from 'react';
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
  color?: string | null;
}

const PRESET_COLORS = [
  '#1976d2', // Blue
  '#388e3c', // Green
  '#f57c00', // Orange
  '#7b1fa2', // Purple
  '#c62828', // Red
  '#00838f', // Teal
  '#455a64', // Blue Grey
  '#ad1457', // Pink
  '#558b2f', // Light Green
  '#ef6c00', // Amber
] as const;

const DEFAULT_COLOR = '#9e9e9e';

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
  const [cronStatus, setCronStatus] = useState<{
    enabled: boolean;
    lastMode: 'work_hours' | 'off_hours' | null;
    config: {
      workStartHour: number;
      workStartMinute: number;
      workEndHour: number;
      workEndMinute: number;
      workIntervalSeconds: number;
      offHoursIntervalSeconds: number;
    };
  } | null>(null);
  const [cronSaving, setCronSaving] = useState(false);
  const cronConfigTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editingColor, setEditingColor] = useState<string>(DEFAULT_COLOR);
  const [hexInput, setHexInput] = useState('');
  const [hexError, setHexError] = useState<string | null>(null);
  const [colorSaving, setColorSaving] = useState(false);

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

  const loadCronStatus = useCallback(async () => {
    try {
      const status = await window.electronAPI.cron.status();
      setCronStatus(status);
    } catch (err) {
      console.error('Failed to load cron status:', err);
    }
  }, []);

  useEffect(() => {
    loadKeys();
    loadGmailAccounts();
    loadTelemetrySettings();
    loadAiConsentSettings();
    loadCronStatus();
  }, [loadKeys, loadGmailAccounts, loadTelemetrySettings, loadAiConsentSettings, loadCronStatus]);

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

  const handleCronToggle = async () => {
    if (!cronStatus) return;
    setCronSaving(true);
    try {
      if (cronStatus.enabled) {
        await window.electronAPI.cron.stop();
      } else {
        await window.electronAPI.cron.start();
      }
      await loadCronStatus();
    } catch (err) {
      console.error('Failed to toggle cron:', err);
    } finally {
      setCronSaving(false);
    }
  };

  const handleCronRunNow = async () => {
    setCronSaving(true);
    try {
      await window.electronAPI.cron.runNow();
      await loadCronStatus();
    } catch (err) {
      console.error('Failed to run cron now:', err);
    } finally {
      setCronSaving(false);
    }
  };

  const debouncedCronUpdate = useCallback((patch: Record<string, number>) => {
    if (cronConfigTimerRef.current) {
      clearTimeout(cronConfigTimerRef.current);
    }
    cronConfigTimerRef.current = setTimeout(async () => {
      try {
        await window.electronAPI.cron.updateConfig(patch);
        await loadCronStatus();
      } catch (err) {
        console.error('Failed to update cron config:', err);
      }
    }, 500);
  }, [loadCronStatus]);

  useEffect(() => {
    return () => {
      if (cronConfigTimerRef.current) {
        clearTimeout(cronConfigTimerRef.current);
      }
    };
  }, []);

  const handleApplyColor = async (accountId: string) => {
    setColorSaving(true);
    try {
      await window.electronAPI.accounts.updateColor(accountId, editingColor);
      await loadGmailAccounts();
      setEditingAccountId(null);
    } catch (err) {
      console.error('Failed to update account color:', err);
    } finally {
      setColorSaving(false);
    }
  };

  const handleResetColor = async (accountId: string) => {
    setColorSaving(true);
    try {
      await window.electronAPI.accounts.updateColor(accountId, null);
      await loadGmailAccounts();
      setEditingAccountId(null);
    } catch (err) {
      console.error('Failed to reset account color:', err);
    } finally {
      setColorSaving(false);
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
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Auto-Fetch</h2>
        <p style={{ color: '#666', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Automatically fetch and classify emails on a schedule. During work hours, emails are fetched every 5 minutes. Outside work hours, every 60 minutes.
        </p>

        {cronStatus ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={cronStatus.enabled}
                  onChange={handleCronToggle}
                  disabled={cronSaving}
                  style={{ width: '1.25rem', height: '1.25rem' }}
                />
                <span style={{ fontSize: '0.875rem' }}>
                  {cronStatus.enabled ? 'Auto-fetch enabled' : 'Auto-fetch disabled'}
                </span>
              </label>
              {cronStatus.enabled && (
                <span style={{ color: '#666', fontSize: '0.75rem' }}>
                  Mode: {cronStatus.lastMode === 'work_hours' ? 'Work Hours' : 'Off Hours'} | 
                  Interval: {cronStatus.lastMode === 'work_hours' 
                    ? `${cronStatus.config.workIntervalSeconds / 60}min` 
                    : `${cronStatus.config.offHoursIntervalSeconds / 60}min`}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
              <span style={{ color: '#666' }}>Work hours:</span>
              <input
                type="number"
                min={0}
                max={23}
                value={cronStatus.config.workStartHour}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) {
                    debouncedCronUpdate({ workStartHour: val });
                  }
                }}
                style={{ width: '3rem', padding: '0.25rem', borderRadius: '4px', border: '1px solid #ccc', fontSize: '0.875rem' }}
              />
              <span>:</span>
              <input
                type="number"
                min={0}
                max={59}
                value={cronStatus.config.workStartMinute}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) {
                    debouncedCronUpdate({ workStartMinute: val });
                  }
                }}
                style={{ width: '3rem', padding: '0.25rem', borderRadius: '4px', border: '1px solid #ccc', fontSize: '0.875rem' }}
              />
              <span style={{ color: '#666' }}>–</span>
              <input
                type="number"
                min={0}
                max={23}
                value={cronStatus.config.workEndHour}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) {
                    debouncedCronUpdate({ workEndHour: val });
                  }
                }}
                style={{ width: '3rem', padding: '0.25rem', borderRadius: '4px', border: '1px solid #ccc', fontSize: '0.875rem' }}
              />
              <span>:</span>
              <input
                type="number"
                min={0}
                max={59}
                value={cronStatus.config.workEndMinute}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) {
                    debouncedCronUpdate({ workEndMinute: val });
                  }
                }}
                style={{ width: '3rem', padding: '0.25rem', borderRadius: '4px', border: '1px solid #ccc', fontSize: '0.875rem' }}
              />
            </div>
            <button
              onClick={handleCronRunNow}
              disabled={cronSaving || !cronStatus.enabled}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '4px',
                border: '1px solid #ccc',
                background: cronSaving || !cronStatus.enabled ? '#f5f5f5' : '#1976d2',
                color: cronSaving || !cronStatus.enabled ? '#999' : '#fff',
                cursor: cronSaving || !cronStatus.enabled ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                alignSelf: 'flex-start',
              }}
            >
              {cronSaving ? 'Running...' : 'Run Now'}
            </button>
          </div>
        ) : (
          <p style={{ color: '#999', fontSize: '0.875rem' }}>Loading...</p>
        )}
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Account Colors</h2>
        <p style={{ color: '#666', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Customize colors to identify accounts.
        </p>

        {gmailAccounts.length === 0 ? (
          <p style={{ color: '#999', fontSize: '0.875rem', marginBottom: '1rem' }}>
            Connect an account to customize colors.
          </p>
        ) : (
          <div style={{ marginBottom: '1rem' }}>
            {gmailAccounts.map((account) => {
              const accountColor = account.color || DEFAULT_COLOR;
              const isEditing = editingAccountId === account.id;

              return (
                <div
                  key={account.id}
                  style={{
                    border: '1px solid #e0e0e0',
                    borderRadius: '8px',
                    marginBottom: '0.5rem',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.75rem 1rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div
                        style={{
                          width: '16px',
                          height: '16px',
                          borderRadius: '50%',
                          backgroundColor: accountColor,
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                        {account.email}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        if (isEditing) {
                          setEditingAccountId(null);
                        } else {
                          setEditingAccountId(account.id);
                          setEditingColor(accountColor);
                          setHexInput('');
                          setHexError(null);
                        }
                      }}
                      style={{
                        background: 'none',
                        border: '1px solid #1976d2',
                        color: '#1976d2',
                        borderRadius: '4px',
                        padding: '0.25rem 0.5rem',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                      }}
                    >
                      {isEditing ? 'Cancel' : 'Edit'}
                    </button>
                  </div>

                  {isEditing && (
                    <div style={{ padding: '0 1rem 1rem', borderTop: '1px solid #eee' }}>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(5, 1fr)',
                          gap: '0.5rem',
                          marginBottom: '1rem',
                          marginTop: '0.75rem',
                        }}
                      >
                        {PRESET_COLORS.map((color) => (
                          <button
                            key={color}
                            aria-label={`Select color ${color}`}
                            onClick={() => {
                              setEditingColor(color);
                              setHexInput('');
                              setHexError(null);
                            }}
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              backgroundColor: color,
                              border: editingColor === color ? '3px solid #333' : '2px solid transparent',
                              cursor: 'pointer',
                              justifySelf: 'center',
                            }}
                            title={color}
                          />
                        ))}
                      </div>

                      <div style={{ marginBottom: '0.75rem' }}>
                        <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                          Custom Color
                        </label>
                        <input
                          type="text"
                          placeholder="#RRGGBB"
                          value={hexInput}
                          onChange={(e) => {
                            const val = e.target.value;
                            setHexInput(val);
                            if (val === '') {
                              setHexError(null);
                              return;
                            }
                            if (/^#[0-9a-f]{6}$/i.test(val)) {
                              setEditingColor(val.toLowerCase());
                              setHexError(null);
                            } else {
                              setHexError('Enter a valid hex color (e.g. #ff0000)');
                            }
                          }}
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            borderRadius: '4px',
                            border: '1px solid #ccc',
                            fontFamily: 'monospace',
                          }}
                        />
                        {hexError && (
                          <div style={{ color: '#d32f2f', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                            {hexError}
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <button
                          onClick={() => handleApplyColor(account.id)}
                          disabled={colorSaving || hexError !== null}
                          style={{
                            padding: '0.5rem 1rem',
                            borderRadius: '4px',
                            border: 'none',
                            background: colorSaving || hexError ? '#ccc' : '#1976d2',
                            color: '#fff',
                            cursor: colorSaving || hexError ? 'not-allowed' : 'pointer',
                            fontSize: '0.875rem',
                            fontWeight: 600,
                          }}
                        >
                          {colorSaving ? 'Saving...' : 'Apply'}
                        </button>
                        <button
                          onClick={() => handleResetColor(account.id)}
                          disabled={colorSaving}
                          style={{
                            padding: '0.5rem 1rem',
                            borderRadius: '4px',
                            border: '1px solid #999',
                            background: 'none',
                            color: '#666',
                            cursor: colorSaving ? 'not-allowed' : 'pointer',
                            fontSize: '0.875rem',
                          }}
                        >
                          Reset to Default
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
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
