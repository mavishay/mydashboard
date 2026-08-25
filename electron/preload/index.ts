import { contextBridge, ipcRenderer } from 'electron';

const ALLOWED_INVOKE = new Set([
  'window:minimize',
  'window:maximize',
  'window:close',
  'window:isMaximized',
  'app:quit',
  'gmail:connect',
  'gmail:disconnect',
  'gmail:listAccounts',
  'gmail:getToken',
  'n8n:status',
  'n8n:start',
  'n8n:stop',
  'lan:start',
  'lan:stop',
  'lan:status',
  'lan:getToken',
  'lan:regenerateToken',
  'lan:getConnectedDevices',
  'apikey:save',
  'apikey:list',
  'apikey:delete',
  'apikey:validate',
  'google-tasks:connect',
  'google-tasks:disconnect',
  'google-tasks:listAccounts',
  'google-tasks:sync',
  'google-tasks:status',
  'google-tasks:listTasks',
  'google-tasks:createTask',
  'google-tasks:updateTask',
  'google-tasks:deleteTask',
] as const);

const ALLOWED_ON = new Set([
  'app:quit',
  'n8n:health',
  'lan:deviceConnected',
  'lan:deviceDisconnected',
  'google-tasks:sync-health',
] as const);

function gatedInvoke(channel: string, ...args: unknown[]): Promise<unknown> {
  if (!ALLOWED_INVOKE.has(channel as typeof ALLOWED_INVOKE extends Set<infer T> ? T : never)) {
    throw new Error(`Blocked IPC invoke: ${channel}`);
  }
  return ipcRenderer.invoke(channel, ...args);
}

function gatedOn(channel: string, callback: (...args: unknown[]) => void): void {
  if (!ALLOWED_ON.has(channel as typeof ALLOWED_ON extends Set<infer T> ? T : never)) {
    throw new Error(`Blocked IPC on: ${channel}`);
  }
  ipcRenderer.on(channel, (_event, ...args) => callback(...args));
}

contextBridge.exposeInMainWorld('electronAPI', {
  window: {
    minimize: () => gatedInvoke('window:minimize'),
    maximize: () => gatedInvoke('window:maximize'),
    close: () => gatedInvoke('window:close'),
    isMaximized: () => gatedInvoke('window:isMaximized') as Promise<boolean>,
  },
  app: {
    quit: () => gatedInvoke('app:quit'),
    onQuit: (callback: () => void) => gatedOn('app:quit', callback),
  },
  gmail: {
    connect: () => gatedInvoke('gmail:connect'),
    disconnect: (accountId: string) =>
      gatedInvoke('gmail:disconnect', accountId),
    listAccounts: () => gatedInvoke('gmail:listAccounts'),
    getToken: (accountId: string) =>
      gatedInvoke('gmail:getToken', accountId),
  },
  n8n: {
    status: () => gatedInvoke('n8n:status') as Promise<{ status: string }>,
    start: () => gatedInvoke('n8n:start') as Promise<{ success: boolean; error?: string }>,
    stop: () => gatedInvoke('n8n:stop') as Promise<{ success: boolean; error?: string }>,
    onHealth: (callback: (status: string) => void) => gatedOn('n8n:health', callback),
  },
  lan: {
    start: () => gatedInvoke('lan:start') as Promise<{ success: boolean; error?: string; url?: string }>,
    stop: () => gatedInvoke('lan:stop') as Promise<{ success: boolean; error?: string }>,
    status: () => gatedInvoke('lan:status') as Promise<{ running: boolean; port: number; url: string | null }>,
    getToken: () => gatedInvoke('lan:getToken') as Promise<{ token: string }>,
    regenerateToken: () => gatedInvoke('lan:regenerateToken') as Promise<{ token: string }>,
    getConnectedDevices: () => gatedInvoke('lan:getConnectedDevices') as Promise<{ count: number }>,
    onDeviceConnected: (callback: (data: unknown) => void) => gatedOn('lan:deviceConnected', callback),
    onDeviceDisconnected: (callback: (data: unknown) => void) => gatedOn('lan:deviceDisconnected', callback),
  },
  apikey: {
    save: (data: { provider: string; label: string; apiKey: string; baseUrl?: string }) =>
      gatedInvoke('apikey:save', data) as Promise<{ id: string; provider: string; label: string; baseUrl?: string; createdAt: string }>,
    list: () =>
      gatedInvoke('apikey:list') as Promise<{ id: string; provider: string; label: string; baseUrl?: string; createdAt: string }[]>,
    delete: (keyId: string) =>
      gatedInvoke('apikey:delete', { keyId }),
    validate: (keyId: string) =>
      gatedInvoke('apikey:validate', { keyId }) as Promise<{ valid: boolean; error?: string }>,
  },
  googleTasks: {
    connect: () =>
      gatedInvoke('google-tasks:connect') as Promise<GoogleTasksAccount>,
    disconnect: (accountId: string) =>
      gatedInvoke('google-tasks:disconnect', { accountId }),
    listAccounts: () =>
      gatedInvoke('google-tasks:listAccounts') as Promise<GoogleTasksAccount[]>,
    sync: (accountId: string) =>
      gatedInvoke('google-tasks:sync', { accountId }) as Promise<{ success: boolean; error?: string }>,
    status: () =>
      gatedInvoke('google-tasks:status') as Promise<GoogleTasksSyncStatus>,
    listTasks: (accountId?: string) =>
      gatedInvoke('google-tasks:listTasks', accountId ? { accountId } : undefined) as Promise<GoogleTask[]>,
    createTask: (data: { accountId: string; taskListId: string; title: string; notes?: string }) =>
      gatedInvoke('google-tasks:createTask', data) as Promise<GoogleTask>,
    updateTask: (data: { accountId: string; taskListId: string; taskId: string; title?: string; notes?: string; status?: 'needsAction' | 'completed' }) =>
      gatedInvoke('google-tasks:updateTask', data) as Promise<{ success: boolean }>,
    deleteTask: (data: { accountId: string; taskListId: string; taskId: string }) =>
      gatedInvoke('google-tasks:deleteTask', data) as Promise<{ success: boolean }>,
    onSyncHealth: (callback: (state: { status: string; lastSyncAt: string | null; error: string | null }) => void) =>
      gatedOn('google-tasks:sync-health', callback),
  },
});
