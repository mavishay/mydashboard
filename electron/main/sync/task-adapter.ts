// electron/main/sync/task-adapter.ts

export interface TaskAdapter {
  readonly provider: string;

  listProjects(): Promise<Project[]>;
  listTasks(projectId: string): Promise<Task[]>;
  getTask(taskId: string): Promise<Task | null>;
  createTask(projectId: string, task: CreateTaskPayload): Promise<Task>;
  updateTask(taskId: string, updates: UpdateTaskPayload): Promise<Task>;
  deleteTask(taskId: string): Promise<void>;
}

export interface Project {
  id: string;
  name: string;
  kind: string;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  content: string | null;
  dueDate: string | null;
  status: 0 | 1;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface CreateTaskPayload {
  title: string;
  content?: string;
  dueDate?: string;
  sortOrder?: number;
}

export interface UpdateTaskPayload {
  title?: string;
  content?: string;
  dueDate?: string;
  status?: 0 | 1;
  sortOrder?: number;
}
