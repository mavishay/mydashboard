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
  'gmail:sync',
  'gmail:syncAll',
  'gmail:syncStatus',
  'n8n:status',
  'n8n:start',
  'n8n:stop',
  'n8n:docker-status',
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
  'ticktick:connect',
  'ticktick:disconnect',
  'ticktick:listAccounts',
  'ticktick:sync',
  'ticktick:status',
  'ticktick:listTasks',
  'ticktick:createTask',
  'ticktick:updateTask',
  'ticktick:deleteTask',
  'google-tasks:listLists',
  'ticktick:listProjects',
  'tasks:createFromEmail',
  'telemetry:getSettings',
  'telemetry:setOptIn',
  'telemetry:getEvents',
  'telemetry:clearEvents',
  'onboarding:getStatus',
  'onboarding:setStepComplete',
  'onboarding:recordSetupEvent',
  'onboarding:startTracking',
  'classification:classify',
  'classification:classifyAccount',
  'classification:fetchEmails',
  'classification:fetchEmailsAll',
  'classification:getEmails',
  'ai-consent:getSettings',
  'ai-consent:setConsent',
  'notification:get-quiet-hours',
  'notification:set-quiet-hours',
  'notification:get-dnd-status',
  'notification:set-dnd',
  'notification:get-preferences',
  'notification:feedback',
  'rules:getAll',
  'rules:create',
  'rules:update',
  'rules:delete',
  'rules:test',
  'cron:start',
  'cron:stop',
  'cron:status',
  'cron:update-config',
  'cron:run-now',
  'accounts:updateColor',
  'emailCleanup:getSettings',
  'emailCleanup:setRetentionDays',
  'emailCleanup:runCleanup',
  'emailCleanup:getEligibleCount',
] as const);

const ALLOWED_ON = new Set([
  'app:quit',
  'n8n:health',
  'lan:deviceConnected',
  'lan:deviceDisconnected',
  'google-tasks:sync-health',
  'ticktick:sync-health',
  'gmail:sync-health',
  'notification:focus-email',
  'cron:status-update',
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
    sync: (accountId: string, maxResults?: number) =>
      gatedInvoke('gmail:sync', { accountId, maxResults }) as Promise<{ accountId: string; status: string; fetched: number; classified: number; error?: string }>,
    syncAll: () =>
      gatedInvoke('gmail:syncAll') as Promise<Array<{ accountId: string; status: string; fetched: number; classified: number; error?: string }>>,
    syncStatus: () =>
      gatedInvoke('gmail:syncStatus') as Promise<Array<{ accountId: string; status: string; lastSyncAt: string | null; error: string | null }>>,
    onSyncHealth: (callback: (status: unknown) => void) => gatedOn('gmail:sync-health', callback),
  },
  n8n: {
    status: () => gatedInvoke('n8n:status') as Promise<{ status: string }>,
    start: () => gatedInvoke('n8n:start') as Promise<{ success: boolean; error?: string }>,
    stop: () => gatedInvoke('n8n:stop') as Promise<{ success: boolean; error?: string }>,
    dockerStatus: () => gatedInvoke('n8n:docker-status') as Promise<{ available: boolean; error?: string }>,
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
    listLists: (accountId: string) =>
      gatedInvoke('google-tasks:listLists', { accountId }) as Promise<Array<{ id: string; title: string }>>,
    createTask: (data: { accountId: string; taskListId: string; title: string; notes?: string }) =>
      gatedInvoke('google-tasks:createTask', data) as Promise<GoogleTask>,
    updateTask: (data: { accountId: string; taskListId: string; taskId: string; title?: string; notes?: string; status?: 'needsAction' | 'completed' }) =>
      gatedInvoke('google-tasks:updateTask', data) as Promise<{ success: boolean }>,
    deleteTask: (data: { accountId: string; taskListId: string; taskId: string }) =>
      gatedInvoke('google-tasks:deleteTask', data) as Promise<{ success: boolean }>,
    onSyncHealth: (callback: (state: { status: string; lastSyncAt: string | null; error: string | null }) => void) =>
      gatedOn('google-tasks:sync-health', callback),
  },
  ticktick: {
    connect: (data: { token: string; email: string; displayName: string }) =>
      gatedInvoke('ticktick:connect', data) as Promise<TickTickAccount>,
    disconnect: (accountId: string) =>
      gatedInvoke('ticktick:disconnect', { accountId }),
    listAccounts: () =>
      gatedInvoke('ticktick:listAccounts') as Promise<TickTickAccount[]>,
    sync: (accountId: string) =>
      gatedInvoke('ticktick:sync', { accountId }) as Promise<{ success: boolean; error?: string }>,
    status: () =>
      gatedInvoke('ticktick:status') as Promise<TickTickSyncStatus>,
    listTasks: (accountId?: string) =>
      gatedInvoke('ticktick:listTasks', accountId ? { accountId } : undefined) as Promise<TickTickTask[]>,
    listProjects: (accountId: string) =>
      gatedInvoke('ticktick:listProjects', { accountId }) as Promise<Array<{ id: string; name: string; kind: string }>>,
    createTask: (data: { accountId: string; projectId: string; title: string; content?: string; dueDate?: string }) =>
      gatedInvoke('ticktick:createTask', data) as Promise<TickTickTask>,
    updateTask: (data: { accountId: string; projectId: string; taskId: string; title?: string; content?: string; dueDate?: string; status?: '0' | '1'; sortOrder?: number }) =>
      gatedInvoke('ticktick:updateTask', data) as Promise<{ success: boolean }>,
    deleteTask: (data: { accountId: string; projectId: string; taskId: string }) =>
      gatedInvoke('ticktick:deleteTask', data) as Promise<{ success: boolean }>,
    onSyncHealth: (callback: (state: { status: string; lastSyncAt: string | null; error: string | null }) => void) =>
      gatedOn('ticktick:sync-health', callback),
  },
  tasks: {
    createFromEmail: (data: { listType: 'google-tasks' | 'ticktick'; accountId: string; listId: string; title: string; description?: string }) =>
      gatedInvoke('tasks:createFromEmail', data) as Promise<{ success: boolean; taskId?: string; error?: string }>,
  },
  telemetry: {
    getSettings: () =>
      gatedInvoke('telemetry:getSettings') as Promise<{ optedIn: boolean; consentedAt: string | null }>,
    setOptIn: (optedIn: boolean) =>
      gatedInvoke('telemetry:setOptIn', { optedIn }),
    getEvents: (limit?: number) =>
      gatedInvoke('telemetry:getEvents', { limit }) as Promise<TelemetryEvent[]>,
    clearEvents: () =>
      gatedInvoke('telemetry:clearEvents'),
  },
  classification: {
    classify: (emailId: string) =>
      gatedInvoke('classification:classify', { emailId }) as Promise<{ emailId: string; classification: string; confidence: number; reasoning: string } | { error: string }>,
    classifyAccount: (accountId: string, limit?: number) =>
      gatedInvoke('classification:classifyAccount', { accountId, limit }) as Promise<{ classified: number; results: Array<{ emailId: string; classification: string; confidence: number; reasoning: string }>; error?: string }>,
    fetchEmails: (accountId: string, maxResults?: number) =>
      gatedInvoke('classification:fetchEmails', { accountId, maxResults }) as Promise<{ accountId: string; fetched: number; inserted: number; skipped: number }>,
    fetchEmailsAll: () =>
      gatedInvoke('classification:fetchEmailsAll') as Promise<Array<{ accountId: string; fetched: number; inserted: number; skipped: number }>>,
    getEmails: (options?: { accountId?: string; classification?: string; limit?: number; offset?: number }) =>
      gatedInvoke('classification:getEmails', options ?? {}) as Promise<Array<{ id: string; accountId: string; subject: string | null; snippet: string | null; fromAddress: string | null; receivedAt: string | null; classification: string }>>,
  },
  aiConsent: {
    getSettings: () =>
      gatedInvoke('ai-consent:getSettings') as Promise<{ consented: boolean; policyVersion: string; consentedAt: string | null; revokedAt: string | null }>,
    setConsent: (consented: boolean) =>
      gatedInvoke('ai-consent:setConsent', { consented }),
  },
  onboarding: {
    getStatus: () =>
      gatedInvoke('onboarding:getStatus') as Promise<{ dockerCheckComplete: boolean; n8nHealthComplete: boolean; apiKeyComplete: boolean; accountConnected: boolean; setupCompletedAt: string | null }>,
    setStepComplete: (stepId: string) =>
      gatedInvoke('onboarding:setStepComplete', { stepId }),
    recordSetupEvent: (eventType: string, stepId?: string, metadata?: Record<string, unknown>) =>
      gatedInvoke('onboarding:recordSetupEvent', { eventType, stepId, metadata }),
    startTracking: () =>
      gatedInvoke('onboarding:startTracking'),
  },
  notification: {
    getQuietHours: () =>
      gatedInvoke('notification:get-quiet-hours') as Promise<{ enabled: boolean; startHour: number; startMinute: number; endHour: number; endMinute: number }>,
    setQuietHours: (data: { enabled: boolean; startHour: number; startMinute: number; endHour: number; endMinute: number }) =>
      gatedInvoke('notification:set-quiet-hours', data) as Promise<{ success: boolean }>,
    getDndStatus: () =>
      gatedInvoke('notification:get-dnd-status') as Promise<{ enabled: boolean }>,
    setDnd: (data: { enabled: boolean }) =>
      gatedInvoke('notification:set-dnd', data) as Promise<{ success: boolean }>,
    getPreferences: () =>
      gatedInvoke('notification:get-preferences') as Promise<{ notificationTimeoutMs: number; maxConcurrent: number }>,
    feedback: (data: { notificationId: string; emailId: string; classification: 'urgent'; feedback: 'thumbs_up' | 'thumbs_down' }) =>
      gatedInvoke('notification:feedback', data) as Promise<{ success: boolean }>,
    onFocusEmail: (callback: (data: { emailId: string }) => void) => gatedOn('notification:focus-email', callback),
  },
  rules: {
    getAll: () =>
      gatedInvoke('rules:getAll') as Promise<ClassificationRule[]>,
    create: (rule: { name: string; enabled: boolean; priority: number; conditions: Array<{ field: string; operator: string; value: string }>; action: string; classification: string | null }) =>
      gatedInvoke('rules:create', rule) as Promise<ClassificationRule>,
    update: (id: string, updates: { name?: string; enabled?: boolean; priority?: number; conditions?: Array<{ field: string; operator: string; value: string }>; action?: string; classification?: string | null }) =>
      gatedInvoke('rules:update', { id, ...updates }) as Promise<ClassificationRule>,
    delete: (id: string) =>
      gatedInvoke('rules:delete', { id }),
    test: (conditions: Array<{ field: string; operator: string; value: string }>, email: { from?: string | null; to?: string | null; subject?: string | null; body?: string | null; date?: string | null }) =>
      gatedInvoke('rules:test', { conditions, email }) as Promise<{ matched: boolean }>,
  },
  cron: {
    start: () => gatedInvoke('cron:start') as Promise<import('../main/cron/cron-scheduler').CronStatus>,
    stop: () => gatedInvoke('cron:stop') as Promise<import('../main/cron/cron-scheduler').CronStatus>,
    status: () => gatedInvoke('cron:status') as Promise<import('../main/cron/cron-scheduler').CronStatus>,
    updateConfig: (data: Partial<import('../main/cron/cron-scheduler').CronConfig>) =>
      gatedInvoke('cron:update-config', data) as Promise<import('../main/cron/cron-scheduler').CronStatus>,
    runNow: () => gatedInvoke('cron:run-now') as Promise<import('../main/cron/cron-scheduler').CronStatus>,
    onStatusUpdate: (callback: (status: import('../main/cron/cron-scheduler').CronStatus) => void) =>
      gatedOn('cron:status-update', callback),
  },
  accounts: {
    updateColor: (accountId: string, color: string | null) =>
      gatedInvoke('accounts:updateColor', { accountId, color }) as Promise<{ success: boolean }>,
  },
  emailCleanup: {
    getSettings: () =>
      gatedInvoke('emailCleanup:getSettings') as Promise<{ retentionDays: number }>,
    setRetentionDays: (days: number) =>
      gatedInvoke('emailCleanup:setRetentionDays', { days }) as Promise<{ retentionDays: number }>,
    runCleanup: () =>
      gatedInvoke('emailCleanup:runCleanup') as Promise<{ deleted: number; eligibleCount: number }>,
    getEligibleCount: () =>
      gatedInvoke('emailCleanup:getEligibleCount') as Promise<{ count: number }>,
  },
});
