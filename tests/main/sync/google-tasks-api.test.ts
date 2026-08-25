import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockTasklists = {
  list: vi.fn(),
};

const mockTasks = {
  list: vi.fn(),
  insert: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

const mockAuth = {
  setCredentials: vi.fn(),
};

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: vi.fn(() => mockAuth),
    },
    tasks: vi.fn(() => ({
      tasklists: mockTasklists,
      tasks: mockTasks,
    })),
  },
}));

describe('Google Tasks API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listTaskLists', () => {
    it('returns task lists', async () => {
      const { listTaskLists } = await import(
        '../../../electron/main/sync/google-tasks-api'
      );
      mockTasklists.list.mockResolvedValue({
        data: { items: [{ id: 'list-1', title: 'My Tasks' }] },
      });

      const result = await listTaskLists('token-abc');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('list-1');
      expect(mockAuth.setCredentials).toHaveBeenCalledWith({
        access_token: 'token-abc',
      });
    });

    it('returns empty array when no items', async () => {
      const { listTaskLists } = await import(
        '../../../electron/main/sync/google-tasks-api'
      );
      mockTasklists.list.mockResolvedValue({ data: {} });

      const result = await listTaskLists('token-abc');
      expect(result).toEqual([]);
    });
  });

  describe('listTasks', () => {
    it('returns tasks with sync token', async () => {
      const { listTasks } = await import(
        '../../../electron/main/sync/google-tasks-api'
      );
      mockTasks.list.mockResolvedValue({
        data: {
          items: [{ id: 'task-1', title: 'Buy milk', status: 'needsAction' }],
          nextSyncToken: 'sync-token-123',
        },
      });

      const result = await listTasks('token', 'list-1', 'old-token');
      expect(result.items).toHaveLength(1);
      expect(result.syncToken).toBe('sync-token-123');
      expect(result.nextPageToken).toBeUndefined();
    });

    it('passes sync token for incremental sync', async () => {
      const { listTasks } = await import(
        '../../../electron/main/sync/google-tasks-api'
      );
      mockTasks.list.mockResolvedValue({
        data: { items: [] },
      });

      await listTasks('token', 'list-1', 'inc-token');
      expect(mockTasks.list).toHaveBeenCalledWith(
        expect.objectContaining({ syncToken: 'inc-token' })
      );
    });

    it('shows completed tasks on full sync', async () => {
      const { listTasks } = await import(
        '../../../electron/main/sync/google-tasks-api'
      );
      mockTasks.list.mockResolvedValue({
        data: { items: [] },
      });

      await listTasks('token', 'list-1');
      expect(mockTasks.list).toHaveBeenCalledWith(
        expect.objectContaining({ showCompleted: true, showHidden: true })
      );
    });
  });

  describe('insertTask', () => {
    it('inserts a task and returns it', async () => {
      const { insertTask } = await import(
        '../../../electron/main/sync/google-tasks-api'
      );
      mockTasks.insert.mockResolvedValue({
        data: { id: 'new-1', title: 'New task', status: 'needsAction' },
      });

      const result = await insertTask('token', 'list-1', 'New task', 'notes');
      expect(result.id).toBe('new-1');
      expect(result.title).toBe('New task');
      expect(mockTasks.insert).toHaveBeenCalledWith({
        tasklist: 'list-1',
        requestBody: { title: 'New task', notes: 'notes' },
      });
    });
  });

  describe('updateTask', () => {
    it('patches a task', async () => {
      const { updateTask } = await import(
        '../../../electron/main/sync/google-tasks-api'
      );
      mockTasks.patch.mockResolvedValue({
        data: { id: 'task-1', title: 'Updated', status: 'completed' },
      });

      const result = await updateTask('token', 'list-1', 'task-1', {
        title: 'Updated',
        status: 'completed',
      });
      expect(result.status).toBe('completed');
      expect(mockTasks.patch).toHaveBeenCalledWith({
        tasklist: 'list-1',
        task: 'task-1',
        requestBody: { title: 'Updated', status: 'completed' },
      });
    });
  });

  describe('deleteTask', () => {
    it('deletes a task', async () => {
      const { deleteTask } = await import(
        '../../../electron/main/sync/google-tasks-api'
      );
      mockTasks.delete.mockResolvedValue({});

      await deleteTask('token', 'list-1', 'task-1');
      expect(mockTasks.delete).toHaveBeenCalledWith({
        tasklist: 'list-1',
        task: 'task-1',
      });
    });
  });
});
