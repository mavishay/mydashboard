// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskList } from '../../src/components/TaskList';

const mockGoogleTasks = {
  listTasks: vi.fn(),
  status: vi.fn(),
  listAccounts: vi.fn(),
  listLists: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  sync: vi.fn(),
};

const mockTickTick = {
  listTasks: vi.fn(),
  status: vi.fn(),
  listAccounts: vi.fn(),
  listProjects: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  sync: vi.fn(),
};

function setupDefaults() {
  mockGoogleTasks.listTasks.mockResolvedValue([]);
  mockGoogleTasks.status.mockResolvedValue({ status: 'idle', lastSyncAt: null, error: null });
  mockGoogleTasks.listAccounts.mockResolvedValue([]);
  mockTickTick.listTasks.mockResolvedValue([]);
  mockTickTick.status.mockResolvedValue({ status: 'idle', lastSyncAt: null, error: null });
  mockTickTick.listAccounts.mockResolvedValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  setupDefaults();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = {
    electronAPI: {
      googleTasks: mockGoogleTasks,
      ticktick: mockTickTick,
    },
    confirm: vi.fn().mockReturnValue(true),
    navigator: {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
        readText: vi.fn().mockResolvedValue(''),
      },
    },
  };
});

async function renderTaskList() {
  await act(async () => {
    render(<TaskList />);
  });
}

describe('TaskList', () => {
  it('shows empty state when no tasks and no accounts', async () => {
    await renderTaskList();
    expect(screen.queryByText('No task accounts connected')).toBeTruthy();
  });

  it('shows Connect Task Account button when no accounts', async () => {
    await renderTaskList();
    expect(screen.queryByText('Connect Task Account')).toBeTruthy();
  });

  it('renders tasks from both providers', async () => {
    mockGoogleTasks.listAccounts.mockResolvedValue([{ id: 'gt-1', email: 'test@gmail.com', displayName: 'Test' }]);
    mockGoogleTasks.listTasks.mockResolvedValue([
      { id: 't1', title: 'Google Task', notes: null, status: 'needsAction', due: null, completedAt: null, updatedAt: '2026-01-01T00:00:00Z', listId: 'l1', listTitle: 'My List', source: 'Google Tasks' },
    ]);
    mockTickTick.listAccounts.mockResolvedValue([{ id: 'tt-1', email: 'test@ticktick.com', displayName: 'TT' }]);
    mockTickTick.listTasks.mockResolvedValue([
      { id: 't2', title: 'TickTick Task', content: null, status: '0', dueDate: null, completedAt: null, updatedAt: '2026-01-02T00:00:00Z', projectId: 'p1', projectTitle: 'My Project', source: 'TickTick' },
    ]);

    await renderTaskList();
    expect(screen.queryByText('Google Task')).toBeTruthy();
    expect(screen.queryByText('TickTick Task')).toBeTruthy();
  });

  it('shows source badges', async () => {
    mockGoogleTasks.listAccounts.mockResolvedValue([{ id: 'gt-1', email: 't@g.com', displayName: 'T' }]);
    mockGoogleTasks.listTasks.mockResolvedValue([
      { id: 't1', title: 'Task', notes: null, status: 'needsAction', due: null, completedAt: null, updatedAt: '2026-01-01T00:00:00Z', listId: 'l1', listTitle: 'L', source: 'Google Tasks' },
    ]);

    await renderTaskList();
    expect(screen.queryByText('Google Tasks')).toBeTruthy();
  });

  it('shows add task button', async () => {
    mockGoogleTasks.listAccounts.mockResolvedValue([{ id: 'gt-1', email: 't@g.com', displayName: 'T' }]);
    await renderTaskList();
    expect(screen.queryByText('+ Add Task')).toBeTruthy();
  });

  it('opens add task form when clicking add button', async () => {
    mockGoogleTasks.listAccounts.mockResolvedValue([{ id: 'gt-1', email: 't@g.com', displayName: 'T' }]);
    const user = userEvent.setup();
    await renderTaskList();
    await user.click(screen.getByText('+ Add Task'));
    expect(screen.getByPlaceholderText('Task title')).toBeTruthy();
  });

  it('shows error state and retry button on load failure', async () => {
    mockGoogleTasks.listTasks.mockRejectedValue(new Error('Network error'));
    await renderTaskList();
    expect(screen.queryByText('Network error')).toBeTruthy();
    expect(screen.queryByText('Retry')).toBeTruthy();
  });

  it('shows no tasks message when list is empty', async () => {
    mockGoogleTasks.listAccounts.mockResolvedValue([{ id: 'gt-1', email: 't@g.com', displayName: 'T' }]);
    await renderTaskList();
    expect(screen.queryByText('No tasks found')).toBeTruthy();
  });

  it('shows Sync button', async () => {
    mockGoogleTasks.listAccounts.mockResolvedValue([{ id: 'gt-1', email: 't@g.com', displayName: 'T' }]);
    await renderTaskList();
    expect(screen.queryByText('Sync')).toBeTruthy();
  });
});
