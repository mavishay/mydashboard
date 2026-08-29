import { useState, useEffect, useCallback, useRef } from 'react';

type Classification = 'urgent' | 'action' | 'fyi' | 'noise' | null;

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
  color: string | null;
}

const CLASSIFICATION_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  urgent: { bg: '#ffebee', text: '#c62828', label: 'Urgent' },
  action: { bg: '#fff3e0', text: '#e65100', label: 'Action' },
  fyi: { bg: '#e8f5e9', text: '#2e7d32', label: 'FYI' },
  noise: { bg: '#f5f5f5', text: '#757575', label: 'Noise' },
  unclassified: { bg: '#e3f2fd', text: '#1565c0', label: 'Unclassified' },
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
  const key = classification ?? 'unclassified';
  const colors = CLASSIFICATION_COLORS[key] ?? CLASSIFICATION_COLORS.unclassified;
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
  const [error, setError] = useState<string | null>(null);
  const [accountsColorMap, setAccountsColorMap] = useState<Record<string, string>>({});
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const loadEmails = useCallback(async () => {
    try {
      setError(null);
      const result = await window.electronAPI.classification.getEmails({
        accountId: selectedAccount || undefined,
        classification: selectedClassification || undefined,
        limit: 50,
      });
      setEmails(result);
    } catch (err) {
      console.error('Failed to load emails:', err);
      setError('Failed to load emails. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [selectedAccount, selectedClassification]);

  const loadAccounts = useCallback(async () => {
    try {
      setError(null);
      const list = await window.electronAPI.gmail.listAccounts();
      setAccounts(list);
      const colorMap: Record<string, string> = {};
      for (const a of list) {
        if (a.color) {
          colorMap[a.id] = a.color;
        }
      }
      setAccountsColorMap(colorMap);
    } catch (err) {
      console.error('Failed to load accounts:', err);
      setError('Failed to load accounts. Please try again.');
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [dropdownOpen]);

  useEffect(() => {
    loadEmails();
  }, [loadEmails]);

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    console.log('[EmailList] Starting sync...');
    try {
      let result;
      if (selectedAccount) {
        console.log(`[EmailList] Syncing account: ${selectedAccount}`);
        result = await window.electronAPI.gmail.sync(selectedAccount);
      } else {
        console.log('[EmailList] Syncing all accounts');
        result = await window.electronAPI.gmail.syncAll();
      }
      console.log('[EmailList] Sync result:', result);
      await loadEmails();
    } catch (err) {
      console.error('[EmailList] Failed to sync emails:', err);
      setError(`Failed to sync emails: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleClassify = async () => {
    setClassifying(true);
    setError(null);
    try {
      const consent = await window.electronAPI.aiConsent.getSettings();
      if (!consent.consented) {
        setError('AI consent not granted. Please enable AI features in Settings to classify emails.');
        setClassifying(false);
        return;
      }

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
      setError('Failed to classify emails. Please try again.');
    } finally {
      setClassifying(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <div ref={dropdownRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            aria-label="Account filter"
            aria-haspopup="listbox"
            aria-expanded={dropdownOpen}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 0.75rem',
              borderRadius: '4px',
              border: '1px solid #ccc',
              background: '#fff',
              fontSize: '0.875rem',
              cursor: 'pointer',
              minWidth: '160px',
              textAlign: 'left',
            }}
          >
            {!selectedAccount ? (
              'All Accounts'
            ) : (
              <>
                <span
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    background: accountsColorMap[selectedAccount] ?? '#9e9e9e',
                    flexShrink: 0,
                  }}
                />
                {accounts.find((a) => a.id === selectedAccount)?.email ?? selectedAccount}
              </>
            )}
          </button>
          {dropdownOpen && (
            <div
              role="listbox"
              aria-label="Select account"
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: '4px',
                background: '#fff',
                border: '1px solid #ccc',
                borderRadius: '4px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                zIndex: 10,
                minWidth: '200px',
                maxHeight: '240px',
                overflowY: 'auto',
              }}
            >
              <button
                role="option"
                aria-selected={!selectedAccount}
                onClick={() => { setSelectedAccount(''); setDropdownOpen(false); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  border: 'none',
                  background: !selectedAccount ? '#e3f2fd' : 'transparent',
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                All Accounts
              </button>
              {accounts.map((a) => (
                <button
                  key={a.id}
                  role="option"
                  aria-selected={selectedAccount === a.id}
                  onClick={() => { setSelectedAccount(a.id); setDropdownOpen(false); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: 'none',
                    background: selectedAccount === a.id ? '#e3f2fd' : 'transparent',
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span
                    style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      background: accountsColorMap[a.id] ?? '#9e9e9e',
                      flexShrink: 0,
                    }}
                  />
                  {a.email}
                </button>
              ))}
            </div>
          )}
        </div>

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

      {error && (
        <div style={{
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
          borderRadius: '8px',
          background: '#ffebee',
          color: '#c62828',
          fontSize: '0.875rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          <span style={{ fontSize: '1.25rem' }}>⚠</span>
          {error}
        </div>
      )}

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
                  borderLeft: `3px solid ${accountsColorMap[email.accountId] ?? '#9e9e9e'}`,
                  borderRadius: '8px',
                  background: (CLASSIFICATION_COLORS[email.classification ?? 'unclassified']?.bg ?? '#e3f2fd') + '20',
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
