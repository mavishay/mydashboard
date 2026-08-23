import { contextBridge, ipcRenderer } from 'electron';

const ALLOWED_INVOKE = new Set([
  'window:minimize',
  'window:maximize',
  'window:close',
  'window:isMaximized',
  'app:quit',
  'n8n:status',
  'n8n:start',
  'n8n:stop',
] as const);

const ALLOWED_ON = new Set([
  'app:quit',
  'n8n:health',
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
  n8n: {
    status: () => gatedInvoke('n8n:status') as Promise<{ status: string }>,
    start: () => gatedInvoke('n8n:start') as Promise<{ success: boolean; error?: string }>,
    stop: () => gatedInvoke('n8n:stop') as Promise<{ success: boolean; error?: string }>,
    onHealth: (callback: (status: string) => void) => gatedOn('n8n:health', callback),
  },
});
