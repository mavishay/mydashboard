// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  sortEmails,
  groupEmails,
  extractDomain,
  getDateGroupKey,
  loadSortPrefs,
  saveSortPrefs,
  loadGroupPrefs,
  saveGroupPrefs,
  loadCollapsedGroups,
  saveCollapsedGroups,
  SortPrefs,
  GroupPrefs,
} from '../../../src/components/email/utils';

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

function makeEmail(overrides: Partial<Email> = {}): Email {
  return {
    id: 'e1',
    accountId: 'a1',
    subject: 'Test',
    snippet: null,
    fromAddress: null,
    receivedAt: null,
    classification: null,
    ...overrides,
  };
}

const accounts: Account[] = [
  { id: 'a1', email: 'user@gmail.com', displayName: 'Gmail', color: '#fff' },
  { id: 'a2', email: 'user@company.com', displayName: 'Company', color: '#000' },
];

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('sortEmails', () => {
  const emails: Email[] = [
    makeEmail({ id: 'e1', receivedAt: '2026-01-03T00:00:00Z', fromAddress: 'bob@example.com', classification: 'fyi', accountId: 'a1' }),
    makeEmail({ id: 'e2', receivedAt: '2026-01-01T00:00:00Z', fromAddress: 'alice@example.com', classification: 'urgent', accountId: 'a2' }),
    makeEmail({ id: 'e3', receivedAt: '2026-01-02T00:00:00Z', fromAddress: 'charlie@example.com', classification: 'action', accountId: 'a1' }),
  ];

  it('sorts by date descending (newest first)', () => {
    const result = sortEmails(emails, 'date', 'desc');
    expect(result.map(e => e.id)).toEqual(['e1', 'e3', 'e2']);
  });

  it('sorts by date ascending (oldest first)', () => {
    const result = sortEmails(emails, 'date', 'asc');
    expect(result.map(e => e.id)).toEqual(['e2', 'e3', 'e1']);
  });

  it('sorts by sender A-Z', () => {
    const result = sortEmails(emails, 'sender', 'asc');
    expect(result.map(e => e.id)).toEqual(['e2', 'e1', 'e3']);
  });

  it('sorts by sender Z-A', () => {
    const result = sortEmails(emails, 'sender', 'desc');
    expect(result.map(e => e.id)).toEqual(['e3', 'e1', 'e2']);
  });

  it('sorts by classification order (urgent > action > fyi > noise > unclassified)', () => {
    const classEmails = [
      makeEmail({ id: 'e1', classification: 'noise' }),
      makeEmail({ id: 'e2', classification: 'urgent' }),
      makeEmail({ id: 'e3', classification: null }),
      makeEmail({ id: 'e4', classification: 'action' }),
      makeEmail({ id: 'e5', classification: 'fyi' }),
    ];
    const result = sortEmails(classEmails, 'classification', 'asc');
    expect(result.map(e => e.id)).toEqual(['e2', 'e4', 'e5', 'e1', 'e3']);
  });

  it('sorts by account', () => {
    const result = sortEmails(emails, 'account', 'asc');
    expect(result.map(e => e.id)).toEqual(['e1', 'e3', 'e2']);
  });

  it('handles null/undefined fields gracefully', () => {
    const emailsWithNulls = [
      makeEmail({ id: 'e1', receivedAt: null, fromAddress: null }),
      makeEmail({ id: 'e2', receivedAt: '2026-01-01T00:00:00Z', fromAddress: 'a@b.com' }),
    ];
    const result = sortEmails(emailsWithNulls, 'date', 'desc');
    expect(result).toHaveLength(2);
  });

  it('does not mutate original array', () => {
    const original = [...emails];
    sortEmails(emails, 'date', 'desc');
    expect(emails.map(e => e.id)).toEqual(original.map(e => e.id));
  });
});

describe('groupEmails', () => {
  const emails: Email[] = [
    makeEmail({ id: 'e1', accountId: 'a1', classification: 'urgent', receivedAt: new Date().toISOString(), fromAddress: 'a@gmail.com' }),
    makeEmail({ id: 'e2', accountId: 'a1', classification: 'fyi', receivedAt: new Date().toISOString(), fromAddress: 'b@company.com' }),
    makeEmail({ id: 'e3', accountId: 'a2', classification: 'urgent', receivedAt: new Date().toISOString(), fromAddress: 'c@gmail.com' }),
  ];

  it('returns single group when groupOption is none', () => {
    const result = groupEmails(emails, 'none', accounts);
    expect(result.size).toBe(1);
    expect(result.has('all')).toBe(true);
    expect(result.get('all')).toHaveLength(3);
  });

  it('groups by account', () => {
    const result = groupEmails(emails, 'account', accounts);
    expect(result.size).toBe(2);
    expect(result.has('user@gmail.com')).toBe(true);
    expect(result.has('user@company.com')).toBe(true);
    expect(result.get('user@gmail.com')).toHaveLength(2);
    expect(result.get('user@company.com')).toHaveLength(1);
  });

  it('groups by classification', () => {
    const result = groupEmails(emails, 'classification', accounts);
    expect(result.size).toBe(2);
    expect(result.has('urgent')).toBe(true);
    expect(result.has('fyi')).toBe(true);
    expect(result.get('urgent')).toHaveLength(2);
  });

  it('groups by date', () => {
    const result = groupEmails(emails, 'date', accounts);
    expect(result.has('Today')).toBe(true);
    expect(result.get('Today')).toHaveLength(3);
  });

  it('sorts date groups chronologically (Today before Yesterday before This Week before Earlier)', () => {
    const now = new Date();
    const today = now.toISOString();
    const yesterday = new Date(now.getTime() - 86400000).toISOString();
    const twoDaysAgo = new Date(now.getTime() - 2 * 86400000).toISOString();
    const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000).toISOString();

    const dateEmails: Email[] = [
      { id: '1', accountId: 'a1', subject: null, snippet: null, fromAddress: null, receivedAt: twoWeeksAgo, classification: null },
      { id: '2', accountId: 'a1', subject: null, snippet: null, fromAddress: null, receivedAt: today, classification: null },
      { id: '3', accountId: 'a1', subject: null, snippet: null, fromAddress: null, receivedAt: yesterday, classification: null },
      { id: '4', accountId: 'a1', subject: null, snippet: null, fromAddress: null, receivedAt: twoDaysAgo, classification: null },
    ];

    const result = groupEmails(dateEmails, 'date', accounts);
    const keys = [...result.keys()];

    expect(keys).toEqual(['Today', 'Yesterday', 'This Week', 'Earlier']);
  });

  it('groups by sender domain', () => {
    const result = groupEmails(emails, 'sender-domain', accounts);
    expect(result.size).toBe(2);
    expect(result.has('gmail.com')).toBe(true);
    expect(result.has('company.com')).toBe(true);
    expect(result.get('gmail.com')).toHaveLength(2);
  });

  it('handles empty email list', () => {
    const result = groupEmails([], 'account', accounts);
    expect(result.size).toBe(0);
  });
});

describe('extractDomain', () => {
  it('extracts domain from email address', () => {
    expect(extractDomain('user@example.com')).toBe('example.com');
  });

  it('returns Unknown Domain for null', () => {
    expect(extractDomain(null)).toBe('Unknown Domain');
  });

  it('handles malformed email addresses', () => {
    expect(extractDomain('no-at-sign')).toBe('Unknown Domain');
  });

  it('handles subdomains', () => {
    expect(extractDomain('user@mail.company.com')).toBe('company.com');
  });
});

describe('getDateGroupKey', () => {
  it('returns Today for current date', () => {
    expect(getDateGroupKey(new Date().toISOString())).toBe('Today');
  });

  it('returns Yesterday for previous day', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(getDateGroupKey(yesterday.toISOString())).toBe('Yesterday');
  });

  it('returns This Week for past 7 days', () => {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    expect(getDateGroupKey(threeDaysAgo.toISOString())).toBe('This Week');
  });

  it('returns Earlier for older dates', () => {
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    expect(getDateGroupKey(twoWeeksAgo.toISOString())).toBe('Earlier');
  });

  it('returns Unknown Date for null', () => {
    expect(getDateGroupKey(null)).toBe('Unknown Date');
  });
});

describe('localStorage persistence', () => {
  it('saves and loads sort prefs', () => {
    const prefs: SortPrefs = { option: 'sender', direction: 'asc' };
    saveSortPrefs(prefs);
    expect(loadSortPrefs()).toEqual(prefs);
  });

  it('loads default sort prefs when empty', () => {
    expect(loadSortPrefs()).toEqual({ option: 'date', direction: 'desc' });
  });

  it('saves and loads group prefs', () => {
    const prefs: GroupPrefs = { option: 'classification' };
    saveGroupPrefs(prefs);
    expect(loadGroupPrefs()).toEqual(prefs);
  });

  it('loads default group prefs when empty', () => {
    expect(loadGroupPrefs()).toEqual({ option: 'none' });
  });

  it('saves and loads collapsed groups', () => {
    const collapsed = new Set(['urgent', 'fyi']);
    saveCollapsedGroups(collapsed);
    const loaded = loadCollapsedGroups();
    expect(loaded.has('urgent')).toBe(true);
    expect(loaded.has('fyi')).toBe(true);
    expect(loaded.size).toBe(2);
  });

  it('loads empty set when no collapsed groups saved', () => {
    const loaded = loadCollapsedGroups();
    expect(loaded.size).toBe(0);
  });
});
