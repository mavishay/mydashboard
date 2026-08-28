import { useState, useRef } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

interface ApiKeyStepProps {
  onComplete: () => void;
  onError: (msg: string) => void;
}

type Provider = 'openai' | 'anthropic';

function ApiKeyStepInner({ onComplete, onError }: ApiKeyStepProps) {
  const [provider, setProvider] = useState<Provider>('openai');
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateKey = (key: string, p: Provider): boolean => {
    if (!key) {
      setError('API key is required');
      return false;
    }
    if (p === 'openai' && !key.startsWith('sk-')) {
      setError('OpenAI API keys start with sk-');
      return false;
    }
    if (p === 'anthropic' && !key.startsWith('sk-ant-')) {
      setError('Anthropic API keys start with sk-ant-');
      return false;
    }
    setError(null);
    return true;
  };

  const handleSubmit = async () => {
    if (!validateKey(apiKey, provider)) {
      inputRef.current?.focus();
      return;
    }

    setSaving(true);
    try {
      await window.electronAPI.apikey.save({ provider, label: `${provider}-key`, apiKey });
      await window.electronAPI.onboarding.setStepComplete('api-key');
      onComplete();
    } catch {
      const msg = 'Could not validate API key. Please check your credentials.';
      setError(msg);
      onError(msg);
    } finally {
      setSaving(false);
    }
  };

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
      }}>
        <h2 style={{
          margin: '0 0 0.5rem',
          fontSize: '1.125rem',
          fontWeight: 600,
          color: '#111827',
        }}>
          Configure AI Provider
        </h2>
        <p style={{
          margin: '0 0 1.5rem',
          fontSize: '0.875rem',
          color: '#6b7280',
        }}>
          Enter your API key for AI-powered email triage. Keys are stored securely in your OS keychain.
        </p>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: 500,
            color: '#374151',
            marginBottom: '0.375rem',
          }}>
            Provider
          </label>
          <select
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value as Provider);
              setError(null);
            }}
            style={{
              width: '100%',
              padding: '0.5rem',
              borderRadius: '4px',
              border: '1px solid #d1d5db',
              fontSize: '0.875rem',
              background: '#fff',
            }}
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
          </select>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: 500,
            color: '#374151',
            marginBottom: '0.375rem',
          }}>
            API Key
          </label>
          <input
            ref={inputRef}
            type="password"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setError(null);
            }}
            placeholder={provider === 'openai' ? 'sk-...' : 'sk-ant-...'}
            style={{
              width: '100%',
              padding: '0.5rem',
              borderRadius: '4px',
              border: error ? '1px solid #ef4444' : '1px solid #d1d5db',
              fontSize: '0.875rem',
              fontFamily: 'monospace',
            }}
          />
          {error && (
            <p style={{
              margin: '0.375rem 0 0',
              fontSize: '0.8125rem',
              color: '#dc2626',
            }}>
              {error}
            </p>
          )}
        </div>

        <div style={{
          background: '#f9fafb',
          borderRadius: '6px',
          padding: '0.75rem',
          marginBottom: '1.5rem',
        }}>
          <p style={{ margin: 0, fontSize: '0.8125rem', color: '#6b7280' }}>
            <strong>Security:</strong> Your API key is stored in your OS keychain (macOS Keychain, Windows Credential Vault, or Linux Secret Service) and never transmitted except to the AI provider you select.
          </p>
        </div>

        <button
          onClick={handleSubmit}
          disabled={saving || !apiKey}
          style={{
            width: '100%',
            padding: '0.75rem',
            borderRadius: '4px',
            border: 'none',
            background: saving || !apiKey ? '#93c5fd' : '#3b82f6',
            color: '#fff',
            cursor: saving || !apiKey ? 'not-allowed' : 'pointer',
            fontSize: '0.875rem',
            fontWeight: 600,
          }}
        >
          {saving ? 'Saving...' : error ? 'Retry' : 'Save API Key'}
        </button>
      </div>
    </div>
  );
}

export function ApiKeyStep(props: ApiKeyStepProps) {
  return (
    <ErrorBoundary>
      <ApiKeyStepInner {...props} />
    </ErrorBoundary>
  );
}
