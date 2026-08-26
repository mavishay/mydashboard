import { useState, useEffect, useCallback } from 'react';

type Classification = 'urgent' | 'action' | 'fyi' | 'noise';

interface Email {
  id: string;
  accountId: string;
  subject: string | null;
  snippet: string | null;
  fromAddress: string | null;
  receivedAt: string | null;
  classification: Classification;
}

interface Account {
  id: string;
  email: string;
  displayName: string;
}

const CLASSIFICATION_COLORS: Record<Classification, { bg: string; text: string; label: string }> = {
  urgent: { bg: '#ffebee', text: '#c62828', label: 'Urgent' },
  action: { bg: '#fff3e0', text: '#e65100', label: 'Action' },
  fyi: { bg: '#e8f5e9', text: '#2e7d32', label: 'FYI' },
  noise: { bg: '#f5f5f5', text: '#757575', label: 'Noise' },
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function extractDisplayName(from: string | null): string {
  if (!from) return 'Unknown';
  const match = from.match(/^"?([^"<]+)"?\s*</);
  return match ? match[1].trim() : from.split('@')[0];
}

function ClassificationBadge({ classification }: { classification: Classification }) {
  const colors = CLASSIFICATION_COLORS[classification];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.125rem 0.5rem',
        borderRadius: '12px',
        fontSize: '0.75rem',
        fontWeight: 600,
        background: colors.bg,
        color: colors.text,
      }}
    >
      {colors.label}
    </span>
  );
}

export function EmailList() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [selectedClassification, setSelectedClassification] = useState<Classification | ''>('');
  const [syncing, setSyncing] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadEmails = useCallback(async () => {
    try {
      const result = await window.electronAPI.classification.getEmails({
        accountId: selectedAccount || undefined,
        classification: selectedClassification || undefined,
        limit: 50,
      });
      setEmails(result);
    } catch (err) {
      console.error('Failed to load emails:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedAccount, selectedClassification]);

  const loadAccounts = useCallback(async () => {
    try {
      const list = await window.electronAPI.gmail.listAccounts();
      setAccounts(list);
    } catch (err) {
      console.error('Failed to load accounts:', err);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    loadEmails();
  }, [loadEmails]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      if (selectedAccount) {
        await window.electronAPI.gmail.sync(selectedAccount);
      } else {
        await window.electronAPI.gmail.syncAll();
      }
      await loadEmails();
    } catch (err) {
      console.error('Failed to sync emails:', err);
    } finally {
      setSyncing(false);
    }
  };

  const handleClassify = async () => {
    setClassifying(true);
    try {
      if (selectedAccount) {
        await window.electronAPI.classification.classifyAccount(selectedAccount);
      } else {
        for (const account of accounts) {
          await window.electronAPI.classification.classifyAccount(account.id);
        }
      }
      await loadEmails();
    } catch (err) {
      console.error('Failed to classify emails:', err);
    } finally {
      setClassifying(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <select
          value={selectedAccount}
          onChange={(e) => setSelectedAccount(e.target.value)}
          style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc', fontSize: '0.875rem' }}
        >
          <option value="">All Accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.email}</option>
          ))}
        </select>

        <select
          value={selectedClassification}
          onChange={(e) => setSelectedClassification(e.target.value as Classification | '')}
          style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc', fontSize: '0.875rem' }}
        >
          <option value="">All Classifications</option>
          <option value="urgent">Urgent</option>
          <option value="action">Action</option>
          <option value="fyi">FYI</option>
          <option value="noise">Noise</option>
        </select>

        <button
          onClick={handleSync}
          disabled={syncing || accounts.length === 0}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '4px',
            border: '1px solid #1976d2',
            background: syncing || accounts.length === 0 ? '#e3f2fd' : '#1976d2',
            color: syncing || accounts.length === 0 ? '#90caf9' : '#fff',
            cursor: syncing || accounts.length === 0 ? 'not-allowed' : 'pointer',
            fontSize: '0.875rem',
            fontWeight: 600,
          }}
        >
          {syncing ? 'Syncing...' : 'Fetch Emails'}
        </button>

        <button
          onClick={handleClassify}
          disabled={classifying || emails.length === 0}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '4px',
            border: '1px solid #7b1fa2',
            background: classifying || emails.length === 0 ? '#f3e5f5' : '#7b1fa2',
            color: classifying || emails.length === 0 ? '#ce93d8' : '#fff',
            cursor: classifying || emails.length === 0 ? 'not-allowed' : 'pointer',
            fontSize: '0.875rem',
            fontWeight: 600,
          }}
        >
          {classifying ? 'Classifying...' : 'AI Classify'}
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <p style={{ color: '#666', textAlign: 'center', padding: '2rem' }}>Loading emails...</p>
        ) : emails.length === 0 ? (
          <p style={{ color: '#666', textAlign: 'center', padding: '2rem' }}>
            {accounts.length === 0
              ? 'Connect a Gmail account in Settings to get started.'
              : 'No emails found. Click "Fetch Emails" to sync.'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {emails.map((email) => (
              <div
                key={email.id}
                style={{
                  padding: '0.75rem 1rem',
                  border: '1px solid #e0e0e0',
                  borderRadius: '8px',
                  background: CLASSIFICATION_COLORS[email.classification].bg + '20',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                        {extractDisplayName(email.fromAddress)}
                      </span>
                      <ClassificationBadge classification={email.classification} />
                    </div>
                    <div style={{ fontWeight: 500, fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                      {email.subject || '(no subject)'}
                    </div>
                    <div style={{ color: '#666', fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {email.snippet}
                    </div>
                  </div>
                  <span style={{ color: '#999', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                    {formatDate(email.receivedAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
