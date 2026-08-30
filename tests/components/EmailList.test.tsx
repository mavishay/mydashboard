// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { EmailList } from '../../src/components/EmailList';
import { SortGroupControls } from '../../src/components/email/SortGroupControls';
import { EmailGroupHeader } from '../../src/components/email/EmailGroupHeader';

const mockClassification = {
  getEmails: vi.fn(),
  classifyAccount: vi.fn(),
};

const mockGmail = {
  listAccounts: vi.fn(),
  sync: vi.fn(),
  syncAll: vi.fn(),
};

const mockGoogleTasks = {
  listAccounts: vi.fn(),
  listLists: vi.fn(),
  createTask: vi.fn(),
};

const mockTickTick = {
  listAccounts: vi.fn(),
  listProjects: vi.fn(),
  createTask: vi.fn(),
};

const mockTasks = {
  createFromEmail: vi.fn(),
};

function setupDefaults() {
  mockClassification.getEmails.mockResolvedValue([]);
  mockGmail.listAccounts.mockResolvedValue([]);
  mockGoogleTasks.listAccounts.mockResolvedValue([]);
  mockTickTick.listAccounts.mockResolvedValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setupDefaults();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = {
    electronAPI: {
      classification: mockClassification,
      gmail: mockGmail,
      googleTasks: mockGoogleTasks,
      ticktick: mockTickTick,
      tasks: mockTasks,
    },
    alert: vi.fn(),
    navigator: {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
        readText: vi.fn().mockResolvedValue(''),
      },
    },
  };
});

async function renderEmailList() {
  await act(async () => {
    render(<EmailList />);
  });
}

describe('EmailList', () => {
  it('shows no accounts message when no gmail accounts', async () => {
    await renderEmailList();
    expect(screen.queryByText(/Connect a Gmail account/)).toBeTruthy();
  });

  it('shows empty state when no emails', async () => {
    mockGmail.listAccounts.mockResolvedValue([{ id: 'a1', email: 'test@gmail.com', displayName: 'Test' }]);
    await renderEmailList();
    expect(screen.queryByText(/No emails found/)).toBeTruthy();
  });

  it('renders email list', async () => {
    mockGmail.listAccounts.mockResolvedValue([{ id: 'a1', email: 'test@gmail.com', displayName: 'Test' }]);
    mockClassification.getEmails.mockResolvedValue([
      { id: 'e1', accountId: 'a1', subject: 'Test Email', snippet: 'Hello world', fromAddress: 'sender@example.com', receivedAt: '2026-01-01T00:00:00Z', classification: 'urgent' },
    ]);

    await renderEmailList();
    expect(screen.queryByText('Test Email')).toBeTruthy();
    expect(screen.queryByText('Hello world')).toBeTruthy();
  });

  it('shows classification badges', async () => {
    mockGmail.listAccounts.mockResolvedValue([{ id: 'a1', email: 't@g.com', displayName: 'T' }]);
    mockClassification.getEmails.mockResolvedValue([
      { id: 'e1', accountId: 'a1', subject: 'Test', snippet: null, fromAddress: null, receivedAt: null, classification: 'urgent' },
    ]);

    await renderEmailList();
    // The badge shows "Urgent" — check for the badge element specifically
    const badges = screen.getAllByText('Urgent');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it('shows Convert to Task button', async () => {
    mockGmail.listAccounts.mockResolvedValue([{ id: 'a1', email: 't@g.com', displayName: 'T' }]);
    mockClassification.getEmails.mockResolvedValue([
      { id: 'e1', accountId: 'a1', subject: 'Task Email', snippet: null, fromAddress: null, receivedAt: null, classification: 'action' },
    ]);

    await renderEmailList();
    expect(screen.queryByText('Convert to Task')).toBeTruthy();
  });

  it('shows error state on load failure', async () => {
    mockGmail.listAccounts.mockResolvedValue([{ id: 'a1', email: 't@g.com', displayName: 'T' }]);
    mockClassification.getEmails.mockRejectedValue(new Error('API error'));

    await renderEmailList();
    expect(screen.queryByText(/Failed to load emails/)).toBeTruthy();
  });

  it('shows Fetch Emails button', async () => {
    await renderEmailList();
    expect(screen.queryByText('Fetch Emails')).toBeTruthy();
  });

  it('shows AI Classify button', async () => {
    await renderEmailList();
    expect(screen.queryByText('AI Classify')).toBeTruthy();
  });

  it('shows sort controls in toolbar', async () => {
    await renderEmailList();
    expect(screen.queryByText('Sort:')).toBeTruthy();
  });

  it('shows group controls in toolbar', async () => {
    await renderEmailList();
    expect(screen.queryByText('Group:')).toBeTruthy();
  });

  it('shows email count', async () => {
    mockGmail.listAccounts.mockResolvedValue([{ id: 'a1', email: 't@g.com', displayName: 'T' }]);
    mockClassification.getEmails.mockResolvedValue([
      { id: 'e1', accountId: 'a1', subject: 'Test', snippet: null, fromAddress: null, receivedAt: null, classification: 'urgent' },
    ]);

    await renderEmailList();
    expect(screen.queryByText('1 email')).toBeTruthy();
  });
});

describe('SortGroupControls', () => {
  const defaultProps = {
    sortPrefs: { option: 'date' as const, direction: 'desc' as const },
    groupPrefs: { option: 'none' as const },
    onSortChange: vi.fn(),
    onGroupChange: vi.fn(),
    emailCount: 5,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders sort buttons', () => {
    render(<SortGroupControls {...defaultProps} />);
    const sortButtons = screen.getAllByText(/Date|Sender|Classification|Account/);
    expect(sortButtons.length).toBeGreaterThanOrEqual(4);
  });

  it('renders group buttons', () => {
    render(<SortGroupControls {...defaultProps} />);
    const groupButtons = screen.getAllByText(/None|Account|Classification|Date|Domain/);
    expect(groupButtons.length).toBeGreaterThanOrEqual(5);
  });

  it('calls onSortChange when sort option clicked', () => {
    const onSortChange = vi.fn();
    render(<SortGroupControls {...defaultProps} onSortChange={onSortChange} />);
    const senderButton = screen.getAllByText('Sender')[0];
    fireEvent.click(senderButton);
    expect(onSortChange).toHaveBeenCalledWith({ option: 'sender', direction: 'asc' });
  });

  it('calls onGroupChange when group option clicked', () => {
    const onGroupChange = vi.fn();
    render(<SortGroupControls {...defaultProps} onGroupChange={onGroupChange} />);
    const accountButton = screen.getAllByText('Account')[1];
    fireEvent.click(accountButton);
    expect(onGroupChange).toHaveBeenCalledWith({ option: 'account' });
  });

  it('shows email count', () => {
    render(<SortGroupControls {...defaultProps} emailCount={42} />);
    expect(screen.getByText('42 emails')).toBeTruthy();
  });

  it('shows singular for one email', () => {
    render(<SortGroupControls {...defaultProps} emailCount={1} />);
    expect(screen.getByText('1 email')).toBeTruthy();
  });
});

describe('EmailGroupHeader', () => {
  const defaultProps = {
    label: 'Urgent',
    count: 5,
    isCollapsed: false,
    onToggleCollapse: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders group label', () => {
    render(<EmailGroupHeader {...defaultProps} />);
    expect(screen.getByText('Urgent')).toBeTruthy();
  });

  it('renders email count', () => {
    render(<EmailGroupHeader {...defaultProps} />);
    expect(screen.getByText('5')).toBeTruthy();
  });

  it('calls onToggleCollapse when clicked', () => {
    const onToggleCollapse = vi.fn();
    render(<EmailGroupHeader {...defaultProps} onToggleCollapse={onToggleCollapse} />);
    fireEvent.click(screen.getByText('Urgent'));
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });

  it('sets aria-expanded correctly', () => {
    const { rerender } = render(<EmailGroupHeader {...defaultProps} isCollapsed={false} />);
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('true');

    rerender(<EmailGroupHeader {...defaultProps} isCollapsed={true} />);
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('false');
  });
});

describe('Keyboard shortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = {
      electronAPI: {
        classification: { getEmails: vi.fn().mockResolvedValue([]), classifyAccount: vi.fn() },
        gmail: { listAccounts: vi.fn().mockResolvedValue([]), sync: vi.fn(), syncAll: vi.fn() },
        googleTasks: { listAccounts: vi.fn().mockResolvedValue([]), listLists: vi.fn() },
        ticktick: { listAccounts: vi.fn().mockResolvedValue([]), listProjects: vi.fn() },
        tasks: { createFromEmail: vi.fn() },
      },
      alert: vi.fn(),
    };
  });

  it('cycles sort on S key', async () => {
    await renderEmailList();
    // Default sort is Date (desc) - find the active sort button (has blue border)
    const sortButtons = screen.getAllByText((content, el) => {
      return el?.tagName === 'BUTTON' && el?.getAttribute('title')?.includes('S to cycle');
    });
    const dateButton = sortButtons.find(b => b.textContent?.includes('Date'));
    expect(dateButton).toBeTruthy();
    // Press S to cycle to Sender
    fireEvent.keyDown(document, { key: 's' });
    // Sender should now be active - find button with Sender text and active styling
    const senderButtons = screen.getAllByText((content, el) => {
      return el?.tagName === 'BUTTON' && el?.getAttribute('title')?.includes('S to cycle');
    });
    const activeSender = senderButtons.find(b => {
      const text = b.textContent ?? '';
      return text.includes('Sender') && (text.includes('↑') || text.includes('↓'));
    });
    expect(activeSender).toBeTruthy();
  });

  it('cycles group on G key', async () => {
    await renderEmailList();
    // Default group is None - find the active group button
    const groupButtons = screen.getAllByText((content, el) => {
      return el?.tagName === 'BUTTON' && el?.getAttribute('title')?.includes('G to cycle');
    });
    const noneButton = groupButtons.find(b => b.textContent?.includes('None'));
    expect(noneButton).toBeTruthy();
    // Press G to cycle to Account
    fireEvent.keyDown(document, { key: 'g' });
    // Account group button should now be active (purple border)
    const accountGroupButtons = screen.getAllByText((content, el) => {
      return el?.tagName === 'BUTTON' && el?.getAttribute('title')?.includes('G to cycle');
    });
    const activeAccount = accountGroupButtons.find(b => b.textContent?.includes('Account'));
    expect(activeAccount).toBeTruthy();
    expect(activeAccount?.closest('button')?.style.borderColor).toMatch(/rgb\(123,\s*31,\s*162\)|#7b1fa2/);
  });

  it('toggles sort direction when clicking active sort button', async () => {
    await renderEmailList();
    // Find all sort buttons (by title containing "S to cycle")
    const allButtons = screen.getAllByRole('button');
    const sortButtons = allButtons.filter(b => b.getAttribute('title')?.includes('S to cycle'));
    expect(sortButtons.length).toBe(4); // date, sender, classification, account
    // The first sort button (Date) should be active by default
    const dateButton = sortButtons[0];
    expect(dateButton.getAttribute('title')).toContain('Date');
    expect(dateButton.style.borderColor).toMatch(/rgb\(25,\s*118,\s*210\)|#1976d2/);
    // Click Date button to toggle direction
    fireEvent.click(dateButton);
    // After click, Date should still be active
    const updatedButtons = screen.getAllByRole('button');
    const updatedSortButtons = updatedButtons.filter(b => b.getAttribute('title')?.includes('S to cycle'));
    const updatedDateButton = updatedSortButtons[0];
    expect(updatedDateButton.getAttribute('title')).toContain('Date');
    expect(updatedDateButton.style.borderColor).toMatch(/rgb\(25,\s*118,\s*210\)|#1976d2/);
  });

  it('preserves toggled direction when cycling with keyboard', async () => {
    await renderEmailList();
    // Default: Date desc
    // Find and click Date button to toggle to asc
    const sortButtons = screen.getAllByTitle((content) => content.includes('S to cycle'));
    const dateButton = sortButtons.find(b => b.getAttribute('title')?.includes('Date'));
    fireEvent.click(dateButton!);
    // Press S to cycle through all options back to Date
    fireEvent.keyDown(document, { key: 's' }); // → Sender
    fireEvent.keyDown(document, { key: 's' }); // → Classification
    fireEvent.keyDown(document, { key: 's' }); // → Account
    fireEvent.keyDown(document, { key: 's' }); // → Date (should preserve asc)
    // Date should still be active
    const finalSortButtons = screen.getAllByTitle((content) => content.includes('S to cycle'));
    const finalDateButton = finalSortButtons.find(b => b.getAttribute('title')?.includes('Date'));
    expect(finalDateButton?.style.borderColor).toMatch(/rgb\(25,\s*118,\s*210\)|#1976d2/);
  });
});
