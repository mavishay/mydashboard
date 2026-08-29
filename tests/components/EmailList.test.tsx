// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { EmailList } from '../../src/components/EmailList';

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
});
