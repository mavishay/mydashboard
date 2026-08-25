export {};

declare global {
  interface ApiKeyMeta {
    id: string;
    provider: 'openai' | 'anthropic' | 'litellm';
    label: string;
    baseUrl?: string;
    createdAt: string;
  }

  interface GoogleTask {
    id: string;
    title: string;
    body: string | null;
    status: 'needsAction' | 'completed';
    dueAt: string | null;
    source: string;
    completedAt: string | null;
    updatedAt: string;
    listId: string;
    listTitle: string;
  }

  interface GoogleTaskList {
    id: string;
    title: string;
    syncToken: string | null;
  }

  interface GoogleTasksAccount {
    id: string;
    email: string;
    displayName: string;
  }

  interface GoogleTasksSyncStatus {
    status: 'idle' | 'syncing' | 'error';
    lastSyncAt: string | null;
    error: string | null;
    accountCount: number;
  }

  interface ElectronAPI {
    window: {
      minimize: () => Promise<void>;
      maximize: () => Promise<void>;
      close: () => Promise<void>;
      isMaximized: () => Promise<boolean>;
    };
    app: {
      quit: () => Promise<void>;
      onQuit: (callback: () => void) => void;
    };
    gmail: {
      connect: () => Promise<{ id: string; email: string; displayName: string }>;
      disconnect: (accountId: string) => Promise<void>;
      listAccounts: () => Promise<
        { id: string; email: string; displayName: string }[]
      >;
      getToken: (
        accountId: string
      ) => Promise<{ accessToken: string } | null>;
    };
    n8n: {
      status: () => Promise<{ status: string }>;
      start: () => Promise<{ success: boolean; error?: string }>;
      stop: () => Promise<{ success: boolean; error?: string }>;
      onHealth: (callback: (status: string) => void) => void;
    };
    lan: {
      start: () => Promise<{ success: boolean; error?: string; url?: string }>;
      stop: () => Promise<{ success: boolean; error?: string }>;
      status: () => Promise<{ running: boolean; port: number; url: string | null }>;
      getToken: () => Promise<{ token: string }>;
      regenerateToken: () => Promise<{ token: string }>;
      getConnectedDevices: () => Promise<{ count: number }>;
      onDeviceConnected: (callback: (data: unknown) => void) => void;
      onDeviceDisconnected: (callback: (data: unknown) => void) => void;
    };
    apikey: {
      save: (data: {
        provider: 'openai' | 'anthropic' | 'litellm';
        label: string;
        apiKey: string;
        baseUrl?: string;
      }) => Promise<ApiKeyMeta>;
      list: () => Promise<ApiKeyMeta[]>;
      delete: (keyId: string) => Promise<void>;
      validate: (keyId: string) => Promise<{ valid: boolean; error?: string }>;
    };
    googleTasks: {
      connect: () => Promise<GoogleTasksAccount>;
      disconnect: (accountId: string) => Promise<void>;
      listAccounts: () => Promise<GoogleTasksAccount[]>;
      sync: (accountId: string) => Promise<{ success: boolean; error?: string }>;
      status: () => Promise<GoogleTasksSyncStatus>;
      listTasks: (accountId?: string) => Promise<GoogleTask[]>;
      createTask: (data: {
        accountId: string;
        taskListId: string;
        title: string;
        notes?: string;
      }) => Promise<GoogleTask>;
      updateTask: (data: {
        accountId: string;
        taskListId: string;
        taskId: string;
        title?: string;
        notes?: string;
        status?: 'needsAction' | 'completed';
      }) => Promise<{ success: boolean }>;
      deleteTask: (data: {
        accountId: string;
        taskListId: string;
        taskId: string;
      }) => Promise<{ success: boolean }>;
    };
  }

  interface Window {
    electronAPI: ElectronAPI;
  }
}
