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

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type EmailTab = 'urgent' | 'action';

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







function getVariantFromClassification(classification: string) {
  switch (classification) {
    case 'urgent': return 'destructive';
    case 'action': return 'default';
    case 'fyi': return 'secondary';
    case 'noise': return 'outline';
    default: return 'default';
  }
}

function formatTimeAgo(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
  
  if (diffInHours < 1) return 'Just now';
  if (diffInHours < 24) return `${diffInHours}h ago`;
  return `${Math.floor(diffInHours / 24)}d ago`;
}





export function EmailList({ onCountChange }: { onCountChange?: (count: number | ((prev: number) => number)) => void } = {}) {
  const [emails, setEmails] = useState<Email[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [syncing, setSyncing] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  const [activeTab, setActiveTab] = useState<EmailTab>('urgent');

  const loadEmails = useCallback(async () => {
    try {
      setError(null);
      const result = await window.electronAPI.classification.getEmails({
        accountId: selectedAccount || undefined,
        limit: 50,
      });
      setEmails(result);
      const filteredCount = result.filter(e => e.classification === activeTab).length;
      onCountChange?.(filteredCount);
    } catch (err) {
      console.error('Failed to load emails:', err);
      setError('Failed to load emails. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [selectedAccount, onCountChange, activeTab]);

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

  const loadEmailsRef = useRef(loadEmails);
  useEffect(() => {
    loadEmailsRef.current = loadEmails;
  }, [loadEmails]);

  useEffect(() => {
    const unsubscribe = window.electronAPI.cron.onStatusUpdate(() => {
      loadEmailsRef.current();
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const intervalId = setInterval(() => {
      loadEmailsRef.current();
    }, 5 * 60 * 1000);
    return () => clearInterval(intervalId);
  }, []);

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

  const displayEmails = useMemo(() => {
    return emails.filter(e => e.classification === activeTab);
  }, [emails, activeTab]);

  const tabCounts = useMemo(() => {
    return {
      urgent: emails.filter(e => e.classification === 'urgent').length,
      action: emails.filter(e => e.classification === 'action').length,
    };
  }, [emails]);

  const sortedEmails = useMemo(() => {
    return sortEmails(displayEmails, sortPrefs.option, sortPrefs.direction);
  }, [displayEmails, sortPrefs]);

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



  const handleBatchMarkAsRead = useCallback(async () => {
    const idsToMark = new Set(selectedIds);
    const emailsToMark = displayEmails.filter(e => idsToMark.has(e.id));
    if (emailsToMark.length === 0) return;

    setBatchProgress(`Marking 0/${emailsToMark.length}...`);

    setEmails(prev => prev.map(e =>
      idsToMark.has(e.id) ? { ...e, isRead: 1 } : e
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
        setEmails(prev => prev.filter(e => !idsToMark.has(e.id)));
        onCountChange?.(prev => prev - result.marked);
      }, 500);
    } catch (err) {
      setError(`Batch mark as read failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setEmails(prev => prev.map(e =>
        idsToMark.has(e.id) ? { ...e, isRead: 0 } : e
      ));
    } finally {
      setSelectedIds(new Set());
      setBatchProgress(null);
      setMarkingIds(new Set());
    }
  }, [displayEmails, selectedIds, onCountChange]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-2 mb-4 flex-wrap">
        <div ref={dropdownRef} className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            aria-label="Account filter"
            aria-haspopup="listbox"
            aria-expanded={dropdownOpen}
            className="flex items-center gap-2 px-3 py-2 rounded border border-border bg-background text-sm cursor-pointer min-w-[160px] text-left"
          >
            {!selectedAccount ? (
              'All Accounts'
            ) : (
              <>
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ background: accountsColorMap[selectedAccount] ?? '#9e9e9e' }}
                />
                {accounts.find((a) => a.id === selectedAccount)?.email ?? selectedAccount}
              </>
            )}
          </button>
          {dropdownOpen && (
            <div
              role="listbox"
              aria-label="Select account"
              className="absolute top-full left-0 mt-1 bg-background border border-border rounded shadow-lg z-10 min-w-[200px] max-h-60 overflow-y-auto"
            >
              <button
                role="option"
                aria-selected={!selectedAccount}
                onClick={() => { setSelectedAccount(''); setDropdownOpen(false); }}
                className={`flex items-center gap-2 w-full px-3 py-2 border-none text-sm cursor-pointer text-left ${
                  !selectedAccount ? 'bg-primary/10' : 'bg-transparent'
                }`}
              >
                All Accounts
              </button>
              {accounts.map((a) => (
                <button
                  key={a.id}
                  role="option"
                  aria-selected={selectedAccount === a.id}
                  onClick={() => { setSelectedAccount(a.id); setDropdownOpen(false); }}
                  className={`flex items-center gap-2 w-full px-3 py-2 border-none text-sm cursor-pointer text-left ${
                    selectedAccount === a.id ? 'bg-primary/10' : 'bg-transparent'
                  }`}
                >
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ background: accountsColorMap[a.id] ?? '#9e9e9e' }}
                  />
                  {a.email}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={handleSync}
          disabled={syncing || accounts.length === 0}
          className={`px-4 py-2 rounded border text-sm font-semibold ${
            syncing || accounts.length === 0
              ? 'bg-primary/10 text-primary/50 cursor-not-allowed border-primary/20'
              : 'bg-primary text-primary-foreground cursor-pointer border-transparent'
          }`}
        >
          {syncing ? 'Syncing...' : 'Fetch Emails'}
        </button>

        <button
          onClick={handleClassify}
          disabled={classifying || emails.length === 0}
          className={`px-4 py-2 rounded border text-sm font-semibold ${
            classifying || emails.length === 0
              ? 'bg-purple-500/10 text-purple-400 cursor-not-allowed border-purple-500/20'
              : 'bg-purple-600 text-white cursor-pointer border-transparent hover:bg-purple-700'
          }`}
        >
          {classifying ? 'Classifying...' : 'AI Classify'}
        </button>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as EmailTab)}>
        <TabsList>
          <TabsTrigger value="urgent">
            Urgent ({tabCounts.urgent})
          </TabsTrigger>
          <TabsTrigger value="action">
            Action ({tabCounts.action})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <SortGroupControls
        sortPrefs={sortPrefs}
        groupPrefs={groupPrefs}
        onSortChange={setSortPrefs}
        onGroupChange={setGroupPrefs}
        emailCount={displayEmails.length}
      />

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-3 py-2 mb-3 bg-primary/10 rounded-lg text-sm">
          <span className="font-semibold">{selectedIds.size} selected</span>
          <button onClick={handleBatchMarkAsRead} disabled={markingIds.size > 0}
            className="px-3 py-1.5 rounded border-none bg-primary text-primary-foreground cursor-pointer text-xs font-semibold disabled:cursor-not-allowed">
            {batchProgress ?? 'Mark as Read'}
          </button>
          <button onClick={() => setSelectedIds(new Set())}
            className="px-3 py-1.5 rounded border border-border bg-background cursor-pointer text-xs">
            Clear
          </button>
        </div>
      )}

      {error && (
        <div className="px-3 py-3 mb-4 rounded-lg bg-destructive/10 text-destructive text-sm flex items-center gap-2">
          <span className="text-lg">⚠</span>
          {error}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex flex-col gap-3 p-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="p-3 border border-border rounded-xl animate-pulse">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-4 w-4 bg-muted rounded" />
                  <div className="h-2 w-2 bg-muted rounded-full" />
                  <div className="h-4 w-20 bg-muted rounded" />
                  <div className="h-4 w-12 bg-muted rounded-full" />
                </div>
                <div className="h-4 w-3/4 bg-muted rounded mb-2" />
                <div className="h-3 w-full bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : emails.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <div className="text-4xl mb-3 opacity-50">📧</div>
            <p className="text-muted-foreground text-sm font-medium">
              {accounts.length === 0
                ? 'Connect a Gmail account in Settings to get started.'
                : 'No emails found. Click "Fetch Emails" to sync.'}
            </p>
          </div>
        ) : displayEmails.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <div className="text-4xl mb-3 opacity-50">📭</div>
            <p className="text-muted-foreground text-sm font-medium">
              No {activeTab} emails. Try a different tab or fetch more emails.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {[...groupedEmails.entries()].map(([groupKey, groupEmails]) => (
              <div key={groupKey} className="flex flex-col gap-2">
                {groupPrefs.option !== 'none' && (
                  <EmailGroupHeader
                    label={groupKey}
                    count={groupEmails.length}
                    isCollapsed={collapsedGroups.has(groupKey)}
                    onToggleCollapse={() => toggleGroupCollapse(groupKey)}
                  />
                )}
                {!collapsedGroups.has(groupKey) && groupEmails.map((email) => (
                  <Card
                    key={email.id}
                    onClick={() => {
                      setPreviewEmailId(email.id);
                      setPreviewAccountId(email.accountId);
                    }}
                    className="p-4 hover:bg-accent transition-colors cursor-pointer ml-4"
                    style={{
                      borderLeftWidth: '4px',
                      borderLeftColor: accountsColorMap[email.accountId] ?? '#9e9e9e',
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={getVariantFromClassification(email.classification ?? '')}>
                            {email.classification}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {formatTimeAgo(email.receivedAt ?? '')}
                          </span>
                        </div>
                        <h3 className={`font-medium truncate ${!email.isRead ? 'font-bold' : ''}`}>
                          {email.subject || '(no subject)'}
                        </h3>
                        <p className="text-sm text-muted-foreground truncate">
                          {email.fromAddress}
                        </p>
                      </div>
                    </div>
                  </Card>
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
    </div>
  );
}
