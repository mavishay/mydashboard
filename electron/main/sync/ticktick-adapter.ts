// electron/main/sync/ticktick-adapter.ts

import type {
  TaskAdapter,
  Project,
  Task,
  CreateTaskPayload,
  UpdateTaskPayload,
} from './task-adapter';

const DEFAULT_BASE_URL = 'https://api.ticktick.com/open/v1';

export class TickTickAdapter implements TaskAdapter {
  readonly provider = 'ticktick';

  private baseUrl: string;

  constructor(
    private accessToken: string,
    baseUrl?: string
  ) {
    this.baseUrl = baseUrl ?? DEFAULT_BASE_URL;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  async listProjects(): Promise<Project[]> {
    const response = await fetch(`${this.baseUrl}/project`, {
      headers: this.headers(),
    });
    if (!response.ok) {
      throw new Error(`Failed to list projects: ${response.status}`);
    }
    const data = (await response.json()) as Array<{
      id: string;
      name: string;
      kind: string;
    }>;
    return data.map((p) => ({
      id: p.id,
      name: p.name,
      kind: p.kind,
    }));
  }

  async listTasks(projectId: string): Promise<Task[]> {
    const response = await fetch(`${this.baseUrl}/project/${projectId}/data`, {
      headers: this.headers(),
    });
    if (!response.ok) {
      throw new Error(`Failed to list tasks: ${response.status}`);
    }
    const data = (await response.json()) as {
      tasks: Array<{
        id: string;
        projectId: string;
        title: string;
        content?: string;
        dueDate?: string;
        status: number;
        sortOrder?: number;
        createdAt: string;
        updatedAt: string;
      }>;
    };
    return (data.tasks ?? []).map((t) => ({
      id: t.id,
      projectId: t.projectId,
      title: t.title,
      content: t.content ?? null,
      dueDate: t.dueDate ?? null,
      status: t.status as 0 | 1,
      sortOrder: t.sortOrder ?? 0,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      completedAt: t.status === 1 ? t.updatedAt : null,
    }));
  }

  async getTask(taskId: string): Promise<Task | null> {
    const response = await fetch(`${this.baseUrl}/task/${taskId}`, {
      headers: this.headers(),
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Failed to get task: ${response.status}`);
    }
    const t = (await response.json()) as {
      id: string;
      projectId: string;
      title: string;
      content?: string;
      dueDate?: string;
      status: number;
      sortOrder?: number;
      createdAt: string;
      updatedAt: string;
    };
    return {
      id: t.id,
      projectId: t.projectId,
      title: t.title,
      content: t.content ?? null,
      dueDate: t.dueDate ?? null,
      status: t.status as 0 | 1,
      sortOrder: t.sortOrder ?? 0,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      completedAt: t.status === 1 ? t.updatedAt : null,
    };
  }

  async createTask(
    projectId: string,
    payload: CreateTaskPayload
  ): Promise<Task> {
    const response = await fetch(`${this.baseUrl}/task`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        projectId,
        title: payload.title,
        content: payload.content,
        dueDate: payload.dueDate,
        sortOrder: payload.sortOrder,
      }),
    });
    if (!response.ok) {
      throw new Error(`Failed to create task: ${response.status}`);
    }
    const t = (await response.json()) as {
      id: string;
      projectId: string;
      title: string;
      content?: string;
      dueDate?: string;
      status: number;
      sortOrder?: number;
      createdAt: string;
      updatedAt: string;
    };
    return {
      id: t.id,
      projectId: t.projectId,
      title: t.title,
      content: t.content ?? null,
      dueDate: t.dueDate ?? null,
      status: t.status as 0 | 1,
      sortOrder: t.sortOrder ?? 0,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      completedAt: t.status === 1 ? t.updatedAt : null,
    };
  }

  async updateTask(
    taskId: string,
    updates: UpdateTaskPayload
  ): Promise<Task> {
    const response = await fetch(`${this.baseUrl}/task`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ id: taskId, ...updates }),
    });
    if (!response.ok) {
      throw new Error(`Failed to update task: ${response.status}`);
    }
    const t = (await response.json()) as {
      id: string;
      projectId: string;
      title: string;
      content?: string;
      dueDate?: string;
      status: number;
      sortOrder?: number;
      createdAt: string;
      updatedAt: string;
    };
    return {
      id: t.id,
      projectId: t.projectId,
      title: t.title,
      content: t.content ?? null,
      dueDate: t.dueDate ?? null,
      status: t.status as 0 | 1,
      sortOrder: t.sortOrder ?? 0,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      completedAt: t.status === 1 ? t.updatedAt : null,
    };
  }

  async deleteTask(taskId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/task/${taskId}`, {
      method: 'DELETE',
      headers: this.headers(),
    });
    if (!response.ok) {
      throw new Error(`Failed to delete task: ${response.status}`);
    }
  }
}
