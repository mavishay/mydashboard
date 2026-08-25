// tests/main/sync/ticktick-adapter.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TickTickAdapter } from '../../../electron/main/sync/ticktick-adapter';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('TickTickAdapter', () => {
  let adapter: TickTickAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new TickTickAdapter('test-token');
  });

  describe('listProjects', () => {
    it('returns projects from API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: 'p1', name: 'Project 1', kind: 'TASK' },
          { id: 'p2', name: 'Project 2', kind: 'NOTE' },
        ],
      });

      const projects = await adapter.listProjects();

      expect(projects).toHaveLength(2);
      expect(projects[0]).toEqual({
        id: 'p1',
        name: 'Project 1',
        kind: 'TASK',
      });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.ticktick.com/open/v1/project',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      );
    });

    it('throws on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
      await expect(adapter.listProjects()).rejects.toThrow(
        'Failed to list projects: 401'
      );
    });
  });

  describe('listTasks', () => {
    it('returns tasks for a project', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tasks: [
            {
              id: 't1',
              projectId: 'p1',
              title: 'Task 1',
              content: 'desc',
              status: 0,
              sortOrder: 1,
              createdAt: '2026-01-01T00:00:00Z',
              updatedAt: '2026-01-02T00:00:00Z',
            },
          ],
        }),
      });

      const tasks = await adapter.listTasks('p1');

      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Task 1');
      expect(tasks[0].status).toBe(0);
    });
  });

  describe('createTask', () => {
    it('creates a task via POST', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 't-new',
          projectId: 'p1',
          title: 'New Task',
          status: 0,
          sortOrder: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        }),
      });

      const task = await adapter.createTask('p1', { title: 'New Task' });

      expect(task.id).toBe('t-new');
      expect(task.title).toBe('New Task');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.ticktick.com/open/v1/task',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('deleteTask', () => {
    it('deletes a task via DELETE', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await adapter.deleteTask('t1');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.ticktick.com/open/v1/task/t1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });
});
