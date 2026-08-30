// Sort and group types
export type SortOption = 'date' | 'sender' | 'classification' | 'account';
export type SortDirection = 'asc' | 'desc';
export type GroupOption = 'none' | 'account' | 'classification' | 'date' | 'sender-domain';

export interface SortPrefs {
  option: SortOption;
  direction: SortDirection;
}

export interface GroupPrefs {
  option: GroupOption;
}

interface Email {
  id: string;
  accountId: string;
  subject: string | null;
  snippet: string | null;
  fromAddress: string | null;
  receivedAt: string | null;
  classification: string | null;
}

interface Account {
  id: string;
  email: string;
  displayName: string;
  color: string | null;
}

export function sortEmails(emails: Email[], sortOption: SortOption, sortDirection: SortDirection): Email[] {
  const sorted = [...emails].sort((a, b) => {
    let comparison = 0;

    switch (sortOption) {
      case 'date':
        comparison = new Date(a.receivedAt ?? 0).getTime() - new Date(b.receivedAt ?? 0).getTime();
        break;
      case 'sender':
        comparison = (a.fromAddress ?? '').localeCompare(b.fromAddress ?? '');
        break;
      case 'classification': {
        const order = { urgent: 0, action: 1, fyi: 2, noise: 3, unclassified: 4 };
        comparison = (order[a.classification as keyof typeof order] ?? 4) - (order[b.classification as keyof typeof order] ?? 4);
        break;
      }
      case 'account':
        comparison = a.accountId.localeCompare(b.accountId);
        break;
    }

    return sortDirection === 'desc' ? -comparison : comparison;
  });

  return sorted;
}

export function groupEmails(emails: Email[], groupOption: GroupOption, accounts: Account[]): Map<string, Email[]> {
  if (groupOption === 'none') {
    return new Map([['all', emails]]);
  }

  const groups = new Map<string, Email[]>();

  for (const email of emails) {
    let key: string;

    switch (groupOption) {
      case 'account':
        key = accounts.find(a => a.id === email.accountId)?.email ?? email.accountId;
        break;
      case 'classification':
        key = email.classification ?? 'unclassified';
        break;
      case 'date':
        key = getDateGroupKey(email.receivedAt);
        break;
      case 'sender-domain':
        key = extractDomain(email.fromAddress);
        break;
    }

    if (!groups.has(key!)) {
      groups.set(key!, []);
    }
    groups.get(key!)!.push(email);
  }

  if (groupOption === 'date') {
    const dateOrder = ['Today', 'Yesterday', 'This Week', 'Earlier', 'Unknown Date'];
    return new Map([...groups.entries()].sort(([a], [b]) => {
      const ai = dateOrder.indexOf(a);
      const bi = dateOrder.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    }));
  }

  return new Map([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

export function extractDomain(fromAddress: string | null): string {
  if (!fromAddress) return 'Unknown Domain';
  const match = fromAddress.match(/@(.+\..+)$/);
  if (!match) return 'Unknown Domain';
  const domain = match[1];
  const parts = domain.split('.');
  return parts.length >= 2 ? `${parts[parts.length - 2]}.${parts[parts.length - 1]}` : domain;
}

export function getDateGroupKey(receivedAt: string | null): string {
  if (!receivedAt) return 'Unknown Date';

  const date = new Date(receivedAt);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  if (date >= today) return 'Today';
  if (date >= yesterday) return 'Yesterday';
  if (date >= weekAgo) return 'This Week';
  return 'Earlier';
}

const SORT_STORAGE_KEY = 'email-sort-prefs';
const GROUP_STORAGE_KEY = 'email-group-prefs';
const COLLAPSED_STORAGE_KEY = 'email-collapsed-groups';

export function loadSortPrefs(): SortPrefs {
  try {
    const stored = localStorage.getItem(SORT_STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return { option: 'date', direction: 'desc' };
}

export function saveSortPrefs(prefs: SortPrefs): void {
  localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(prefs));
}

export function loadGroupPrefs(): GroupPrefs {
  try {
    const stored = localStorage.getItem(GROUP_STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return { option: 'none' };
}

export function saveGroupPrefs(prefs: GroupPrefs): void {
  localStorage.setItem(GROUP_STORAGE_KEY, JSON.stringify(prefs));
}

export function loadCollapsedGroups(): Set<string> {
  try {
    const stored = localStorage.getItem(COLLAPSED_STORAGE_KEY);
    if (stored) return new Set(JSON.parse(stored));
  } catch { /* ignore */ }
  return new Set();
}

export function saveCollapsedGroups(groups: Set<string>): void {
  localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify([...groups]));
}
