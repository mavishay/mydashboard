interface AiConsentOnboardingProps {
  onAccept: () => void;
  onDecline: () => void;
}

export function AiConsentOnboarding({ onAccept, onDecline }: AiConsentOnboardingProps) {
  return (
    <div style={{
      padding: '3rem',
      fontFamily: 'system-ui, sans-serif',
      maxWidth: '600px',
      margin: '0 auto',
    }}>
      <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>
        AI Features Consent
      </h2>
      <p style={{ color: '#666', marginBottom: '1.5rem' }}>
        This app uses AI to classify your emails and prioritize notifications. To enable AI features, please review the following:
      </p>

      <div style={{
        background: '#f5f5f5',
        borderRadius: '8px',
        padding: '1rem',
        marginBottom: '1.5rem',
      }}>
        <h3 style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>What AI features do:</h3>
        <ul style={{ color: '#666', fontSize: '0.875rem', margin: 0, paddingLeft: '1.5rem' }}>
          <li>Classify emails as urgent, action, FYI, or noise</li>
          <li>Send notifications only for urgent emails</li>
          <li>Learn from your thumbs-up/down feedback</li>
        </ul>
      </div>

      <div style={{
        background: '#fff3e0',
        borderRadius: '8px',
        padding: '1rem',
        marginBottom: '1.5rem',
        border: '1px solid #ffe0b2',
      }}>
        <h3 style={{ fontSize: '0.9rem', marginBottom: '0.5rem', color: '#e65100' }}>
          Important: Full Email Payloads Sent to Cloud
        </h3>
        <p style={{ color: '#666', fontSize: '0.875rem', margin: 0 }}>
          To classify your emails, <strong>full email content</strong> (subject, sender, preview) is sent to external LLM providers (OpenAI or Anthropic). You must provide your own API keys (BYOK). Email content is processed by these providers but is <strong>not stored</strong> by them.
        </p>
      </div>

      <div style={{
        background: '#f5f5f5',
        borderRadius: '8px',
        padding: '1rem',
        marginBottom: '1.5rem',
      }}>
        <h3 style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>Your control:</h3>
        <ul style={{ color: '#666', fontSize: '0.875rem', margin: 0, paddingLeft: '1.5rem' }}>
          <li>You provide your own API keys — no third party has access</li>
          <li>You can disable AI features at any time in Settings</li>
          <li>No personal information is shared beyond email content for classification</li>
        </ul>
      </div>

      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
        <button
          onClick={onDecline}
          style={{
            padding: '0.75rem 1.5rem',
            borderRadius: '4px',
            border: '1px solid #ccc',
            background: '#fff',
            cursor: 'pointer',
            fontSize: '0.875rem',
          }}
        >
          Skip AI Features
        </button>
        <button
          onClick={onAccept}
          style={{
            padding: '0.75rem 1.5rem',
            borderRadius: '4px',
            border: 'none',
            background: '#1976d2',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 600,
          }}
        >
          I Understand and Accept
        </button>
      </div>
    </div>
  );
}
