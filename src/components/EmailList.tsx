import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  SortPrefs,
  GroupPrefs,
  SortOption,
  SortDirection,
  GroupOption,
  sortEmails,
  groupEmails,
  loadSortPrefs,
  saveSortPrefs,
  loadGroupPrefs,
  saveGroupPrefs,
} from './email/utils';
import { SortGroupControls } from './email/SortGroupControls';
import { EmailGroupHeader } from './email/EmailGroupHeader';
import { EmailPreviewModal } from './EmailPreviewModal';

type Classification = 'urgent' | 'action' | 'fyi' | 'noise' | null;

interface Email {
  id: string;
  accountId: string;
  externalId: string;
  subject: string | null;
  snippet: string | null;
  fromAddress: string | null;
  receivedAt: string | null;
  classification: Classification;
  isRead: number;
}

interface Account {
  id: string;
  email: string;
  displayName: string;
  color: string | null;
}

const SORT_CYCLE: SortOption[] = ['date', 'sender', 'classification', 'account'];
const GROUP_CYCLE: GroupOption[] = ['none', 'account', 'classification', 'date', 'sender-domain'];

interface TaskListItem {
  id: string;
  title: string;
  source: 'google-tasks' | 'ticktick';
  accountId: string;
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

export function EmailList({ onCountChange }: { onCountChange?: (count: number) => void } = {}) {
  const [emails, setEmails] = useState<Email[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [selectedClassification, setSelectedClassification] = useState<Classification | ''>('');
  const [syncing, setSyncing] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [convertingIds, setConvertingIds] = useState<Set<string>>(new Set());
  const [convertModal, setConvertModal] = useState<{ email: Email; lists: TaskListItem[] } | null>(null);
  const [selectedConvertListId, setSelectedConvertListId] = useState('');
  const [accountsColorMap, setAccountsColorMap] = useState<Record<string, string>>({});
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [sortPrefs, setSortPrefs] = useState<SortPrefs>(() => loadSortPrefs());
  const [groupPrefs, setGroupPrefs] = useState<GroupPrefs>(() => loadGroupPrefs());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [lastDirectionMap, setLastDirectionMap] = useState<Record<SortOption, SortDirection>>({
    date: 'desc',
    sender: 'asc',
    classification: 'desc',
    account: 'asc',
  });
  const [previewEmailId, setPreviewEmailId] = useState<string | null>(null);
  const [previewAccountId, setPreviewAccountId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [markingIds, setMarkingIds] = useState<Set<string>>(new Set());
  const [batchProgress, setBatchProgress] = useState<string | null>(null);

  const loadEmails = useCallback(async () => {
    try {
      setError(null);
      const result = await window.electronAPI.classification.getEmails({
        accountId: selectedAccount || undefined,
        classification: selectedClassification || undefined,
        limit: 50,
      });
      setEmails(result);
      onCountChange?.(result.length);
    } catch (err) {
      console.error('Failed to load emails:', err);
      setError('Failed to load emails. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [selectedAccount, selectedClassification, onCountChange]);

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

  useEffect(() => {
    saveSortPrefs(sortPrefs);
  }, [sortPrefs]);

  useEffect(() => {
    saveGroupPrefs(groupPrefs);
  }, [groupPrefs]);

  const cycleSort = useCallback(() => {
    setSortPrefs(prev => {
      const currentIndex = SORT_CYCLE.indexOf(prev.option);
      const nextIndex = (currentIndex + 1) % SORT_CYCLE.length;
      const nextOption = SORT_CYCLE[nextIndex];
      setLastDirectionMap(current => ({ ...current, [prev.option]: prev.direction }));
      return { option: nextOption, direction: lastDirectionMap[nextOption] };
    });
  }, [lastDirectionMap]);

  const cycleGroup = useCallback(() => {
    setGroupPrefs(prev => {
      const currentIndex = GROUP_CYCLE.indexOf(prev.option);
      const nextIndex = (currentIndex + 1) % GROUP_CYCLE.length;
      return { option: GROUP_CYCLE[nextIndex] };
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        cycleSort();
      } else if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        cycleGroup();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [cycleSort, cycleGroup]);

  const sortedEmails = useMemo(() => {
    return sortEmails(emails, sortPrefs.option, sortPrefs.direction);
  }, [emails, sortPrefs]);

  const groupedEmails = useMemo(() => {
    return groupEmails(sortedEmails, groupPrefs.option, accounts);
  }, [sortedEmails, groupPrefs, accounts]);

  const toggleGroupCollapse = useCallback((key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

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

  const handleConvertToTask = async (email: Email) => {
    setConvertingIds((prev) => new Set(prev).add(email.id));
    setError(null);
    try {
      // Load available lists for picker
      const [gtAccounts, ttAccounts] = await Promise.all([
        window.electronAPI.googleTasks.listAccounts(),
        window.electronAPI.ticktick.listAccounts(),
      ]);
      const lists: TaskListItem[] = [];
      for (const acc of gtAccounts) {
        const gtLists = await window.electronAPI.googleTasks.listLists(acc.id);
        for (const l of gtLists) {
          lists.push({ id: l.id, title: l.title, source: 'google-tasks', accountId: acc.id });
        }
      }
      for (const acc of ttAccounts) {
        const ttProjects = await window.electronAPI.ticktick.listProjects(acc.id);
        for (const p of ttProjects) {
          lists.push({ id: p.id, title: p.name, source: 'ticktick', accountId: acc.id });
        }
      }
      if (lists.length === 0) {
        throw new Error('No task accounts connected');
      }
      // Show list picker modal
      setSelectedConvertListId(lists[0].id);
      setConvertModal({ email, lists });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load task lists');
    } finally {
      setConvertingIds((prev) => {
        const next = new Set(prev);
        next.delete(email.id);
        return next;
      });
    }
  };

  const handleConvertConfirm = async () => {
    if (!convertModal) return;
    const { email, lists } = convertModal;
    const listItem = lists.find((l) => l.id === selectedConvertListId);
    if (!listItem) return;

    setConvertingIds((prev) => new Set(prev).add(email.id));
    setConvertModal(null);
    setError(null);
    try {
      const result = await window.electronAPI.tasks.createFromEmail({
        listType: listItem.source,
        accountId: listItem.accountId,
        listId: listItem.id,
        title: email.subject || '(no subject)',
        description: email.snippet || undefined,
      });
      if (!result.success) throw new Error(result.error);
      window.alert('Task created successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task from email');
    } finally {
      setConvertingIds((prev) => {
        const next = new Set(prev);
        next.delete(email.id);
        return next;
      });
    }
  };

  const handleMarkAsRead = useCallback(async (email: Email) => {
    setMarkingIds(prev => new Set(prev).add(email.id));
    try {
      await window.electronAPI.gmail.markAsRead({
        emailId: email.id,
        externalId: email.externalId,
        accountId: email.accountId,
      });
      setEmails(prev => prev.map(e =>
        e.id === email.id ? { ...e, isRead: 1 } : e
      ));
      setTimeout(() => {
        setEmails(prev => prev.filter(e => e.id !== email.id));
        onCountChange?.(prev => prev - 1);
      }, 500);
    } catch (err) {
      setError(`Failed to mark as read: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setMarkingIds(prev => {
        const next = new Set(prev);
        next.delete(email.id);
        return next;
      });
    }
  }, [onCountChange]);

  const handleBatchMarkAsRead = useCallback(async () => {
    const emailsToMark = emails.filter(e => selectedIds.has(e.id));
    if (emailsToMark.length === 0) return;

    setBatchProgress(`Marking 0/${emailsToMark.length}...`);

    setEmails(prev => prev.map(e =>
      selectedIds.has(e.id) ? { ...e, isRead: 1 } : e
    ));

    try {
      const result = await window.electronAPI.gmail.markAsReadBatch({
        emails: emailsToMark.map(e => ({
          emailId: e.id,
          externalId: e.externalId,
          accountId: e.accountId,
        })),
      });

      if (result.failed.length > 0) {
        setError(`Marked ${result.marked} emails as read. ${result.failed.length} failed.`);
      }

      setTimeout(() => {
        setEmails(prev => prev.filter(e => !selectedIds.has(e.id)));
        onCountChange?.(prev => prev - result.marked);
      }, 500);
    } catch (err) {
      setError(`Batch mark as read failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setEmails(prev => prev.map(e =>
        selectedIds.has(e.id) ? { ...e, isRead: 0 } : e
      ));
    } finally {
      setSelectedIds(new Set());
      setBatchProgress(null);
      setMarkingIds(new Set());
    }
  }, [emails, selectedIds, onCountChange]);

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

      <SortGroupControls
        sortPrefs={sortPrefs}
        groupPrefs={groupPrefs}
        onSortChange={setSortPrefs}
        onGroupChange={setGroupPrefs}
        emailCount={emails.length}
      />

      {selectedIds.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          padding: '0.5rem 0.75rem', marginBottom: '0.75rem',
          background: '#e3f2fd', borderRadius: '8px', fontSize: '0.875rem',
        }}>
          <span style={{ fontWeight: 600 }}>{selectedIds.size} selected</span>
          <button onClick={handleBatchMarkAsRead} disabled={markingIds.size > 0}
            style={{ padding: '0.375rem 0.75rem', borderRadius: '4px', border: 'none',
              background: '#1976d2', color: '#fff',
              cursor: markingIds.size > 0 ? 'not-allowed' : 'pointer',
              fontSize: '0.8125rem', fontWeight: 600 }}>
            {batchProgress ?? 'Mark as Read'}
          </button>
          <button onClick={() => setSelectedIds(new Set())}
            style={{ padding: '0.375rem 0.75rem', borderRadius: '4px',
              border: '1px solid #ccc', background: '#fff', cursor: 'pointer',
              fontSize: '0.8125rem' }}>
            Clear
          </button>
        </div>
      )}

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
            {[...groupedEmails.entries()].map(([groupKey, groupEmails]) => (
              <div key={groupKey} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {groupPrefs.option !== 'none' && (
                  <EmailGroupHeader
                    label={groupKey}
                    count={groupEmails.length}
                    isCollapsed={collapsedGroups.has(groupKey)}
                    onToggleCollapse={() => toggleGroupCollapse(groupKey)}
                  />
                )}
                {!collapsedGroups.has(groupKey) && groupEmails.map((email) => (
                  <div
                    key={email.id}
                    onClick={() => {
                      setPreviewEmailId(email.id);
                      setPreviewAccountId(email.accountId);
                    }}
                    style={{
                      padding: '0.75rem 1rem',
                      border: '1px solid #e0e0e0',
                      borderLeft: `3px solid ${accountsColorMap[email.accountId] ?? '#9e9e9e'}`,
                      borderRadius: '8px',
                      background: (CLASSIFICATION_COLORS[email.classification ?? 'unclassified']?.bg ?? '#e3f2fd') + '20',
                      marginLeft: groupPrefs.option !== 'none' ? '1rem' : '0',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(email.id)}
                            onChange={(e) => {
                              e.stopPropagation();
                              setSelectedIds(prev => {
                                const next = new Set(prev);
                                if (next.has(email.id)) next.delete(email.id);
                                else next.add(email.id);
                                return next;
                              });
                            }}
                            onClick={(e) => e.stopPropagation()}
                            style={{ flexShrink: 0, cursor: 'pointer' }}
                          />
                          {!email.isRead && (
                            <span style={{
                              display: 'inline-block',
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              background: '#1976d2',
                              flexShrink: 0,
                            }} />
                          )}
                          <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                            {extractDisplayName(email.fromAddress)}
                          </span>
                          <ClassificationBadge classification={email.classification} />
                        </div>
                        <div style={{ fontWeight: email.isRead ? 500 : 700, fontSize: '0.875rem', marginBottom: '0.25rem', transition: 'font-weight 300ms ease' }}>
                          {email.subject || '(no subject)'}
                        </div>
                        <div style={{ color: '#666', fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {email.snippet}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
                        <span style={{ color: '#999', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                          {formatDate(email.receivedAt)}
                        </span>
                        {!email.isRead && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMarkAsRead(email);
                            }}
                            disabled={markingIds.has(email.id)}
                            style={{
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              border: '1px solid #757575',
                              background: markingIds.has(email.id) ? '#f5f5f5' : 'transparent',
                              color: '#757575',
                              cursor: markingIds.has(email.id) ? 'not-allowed' : 'pointer',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                            }}
                          >
                            {markingIds.has(email.id) ? 'Marking...' : 'Mark Read'}
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleConvertToTask(email);
                          }}
                          disabled={convertingIds.has(email.id)}
                          style={{
                            padding: '0.25rem 0.5rem',
                            borderRadius: '4px',
                            border: '1px solid #1976d2',
                            background: convertingIds.has(email.id) ? '#e3f2fd' : '#1976d2',
                            color: convertingIds.has(email.id) ? '#90caf9' : '#fff',
                            cursor: convertingIds.has(email.id) ? 'not-allowed' : 'pointer',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                          }}
                        >
                          {convertingIds.has(email.id) ? 'Creating...' : 'Convert to Task'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {previewEmailId && previewAccountId && (
        <EmailPreviewModal
          emailId={previewEmailId}
          accountId={previewAccountId}
          onClose={() => {
            setPreviewEmailId(null);
            setPreviewAccountId(null);
          }}
        />
      )}

      {convertModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: '#fff',
            borderRadius: '8px',
            padding: '1.5rem',
            maxWidth: '400px',
            width: '90%',
            boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
          }}>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 600 }}>
              Convert to Task
            </h3>
            <p style={{ margin: '0 0 1rem', fontSize: '0.875rem', color: '#6b7280' }}>
              "{convertModal.email.subject || '(no subject)'}"
            </p>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
              Select list:
            </label>
            <select
              value={selectedConvertListId}
              onChange={(e) => setSelectedConvertListId(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '0.875rem', marginBottom: '1rem' }}
            >
              {convertModal.lists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.source === 'google-tasks' ? '🟢' : '🔵'} {list.title}
                </option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConvertModal(null)}
                style={{ padding: '0.5rem 1rem', borderRadius: '4px', border: '1px solid #d1d5db', background: '#f9fafb', cursor: 'pointer', fontSize: '0.875rem' }}
              >
                Cancel
              </button>
              <button
                onClick={handleConvertConfirm}
                style={{ padding: '0.5rem 1rem', borderRadius: '4px', border: 'none', background: '#1976d2', color: '#fff', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 }}
              >
                Create Task
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
