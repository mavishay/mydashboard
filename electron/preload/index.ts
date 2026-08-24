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
] as const);

const ALLOWED_SEND = new Set([] as const);

const ALLOWED_ON = new Set([
  'app:quit',
] as const);

function gatedInvoke(channel: string, ...args: unknown[]): Promise<unknown> {
  if (!ALLOWED_INVOKE.has(channel as typeof ALLOWED_INVOKE extends Set<infer T> ? T : never)) {
    throw new Error(`Blocked IPC invoke: ${channel}`);
  }
  return ipcRenderer.invoke(channel, ...args);
}

function gatedSend(channel: string, ...args: unknown[]): void {
  if (!ALLOWED_SEND.has(channel as typeof ALLOWED_SEND extends Set<infer T> ? T : never)) {
    throw new Error(`Blocked IPC send: ${channel}`);
  }
  ipcRenderer.send(channel, ...args);
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
});
