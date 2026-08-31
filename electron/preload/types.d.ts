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

  interface TickTickTask {
    id: string;
    title: string;
    content: string | null;
    status: '0' | '1';
    dueDate: string | null;
    source: string;
    completedAt: string | null;
    updatedAt: string;
    projectId: string;
    projectTitle: string | null;
  }

  interface TickTickAccount {
    id: string;
    email: string;
    displayName: string;
  }

  interface TickTickSyncStatus {
    status: 'idle' | 'syncing' | 'error';
    lastSyncAt: string | null;
    error: string | null;
    accountCount: number;
  }

  interface TelemetryEvent {
    id: string;
    eventType: string;
    payload: string;
    createdAt: string;
  }

  interface ClassificationRuleCondition {
    field: 'from' | 'to' | 'subject' | 'body' | 'domain' | 'date';
    operator: 'contains' | 'equals' | 'starts_with' | 'ends_with' | 'matches_regex';
    value: string;
  }

  interface ClassificationRule {
    id: string;
    name: string;
    enabled: boolean;
    priority: number;
    conditions: ClassificationRuleCondition[];
    action: 'classify' | 'skip_llm';
    classification: 'urgent' | 'action' | 'fyi' | 'noise' | null;
    createdAt: string;
    updatedAt: string;
  }

  interface EmailAttachment {
    filename: string;
    mimeType: string;
    size: number;
  }

  interface EmailDetail {
    id: string;
    accountId: string;
    externalId: string;
    subject: string | null;
    fromAddress: string | null;
    receivedAt: string | null;
    bodyHtml: string | null;
    snippet: string | null;
    attachments: EmailAttachment[];
    accountIndex: number;
  }

  interface CalendarEventResponse {
    id: string;
    accountId: string;
    title: string;
    startTime: string;
    endTime: string;
    allDay: boolean;
    location: string | null;
    description: string | null;
    htmlLink: string | null;
    calendarName: string | null;
    accountEmail: string;
    accountColor: string | null;
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
        { id: string; email: string; displayName: string; color: string | null }[]
      >;
      getToken: (
        accountId: string
      ) => Promise<{ accessToken: string } | null>;
      getEmailDetail: (emailId: string) => Promise<EmailDetail | null>;
    };
    accounts: {
      updateColor: (accountId: string, color: string | null) => Promise<{ success: boolean }>;
    };
    n8n: {
      status: () => Promise<{ status: string }>;
      start: () => Promise<{ success: boolean; error?: string }>;
      stop: () => Promise<{ success: boolean; error?: string }>;
      dockerStatus: () => Promise<{ available: boolean; error?: string }>;
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
    ticktick: {
      connect: (data: { token: string; email: string; displayName: string }) => Promise<TickTickAccount>;
      disconnect: (accountId: string) => Promise<void>;
      listAccounts: () => Promise<TickTickAccount[]>;
      sync: (accountId: string) => Promise<{ success: boolean; error?: string }>;
      status: () => Promise<TickTickSyncStatus>;
      listTasks: (accountId?: string) => Promise<TickTickTask[]>;
      createTask: (data: { accountId: string; projectId: string; title: string; content?: string; dueDate?: string }) => Promise<TickTickTask>;
      updateTask: (data: { accountId: string; projectId: string; taskId: string; title?: string; content?: string; dueDate?: string; status?: '0' | '1'; sortOrder?: number }) => Promise<{ success: boolean }>;
      deleteTask: (data: { accountId: string; projectId: string; taskId: string }) => Promise<{ success: boolean }>;
      onSyncHealth: (callback: (state: { status: string; lastSyncAt: string | null; error: string | null }) => void) => void;
    };
    telemetry: {
      getSettings: () => Promise<{ optedIn: boolean; consentedAt: string | null }>;
      setOptIn: (optedIn: boolean) => Promise<void>;
      getEvents: (limit?: number) => Promise<TelemetryEvent[]>;
      clearEvents: () => Promise<void>;
    };
    aiConsent: {
      getSettings: () => Promise<{ consented: boolean; policyVersion: string; consentedAt: string | null; revokedAt: string | null }>;
      setConsent: (consented: boolean) => Promise<{ success: boolean }>;
    };
    onboarding: {
      getStatus: () => Promise<{ dockerCheckComplete: boolean; n8nHealthComplete: boolean; apiKeyComplete: boolean; accountConnected: boolean; setupCompletedAt: string | null }>;
      setStepComplete: (stepId: string) => Promise<void>;
      recordSetupEvent: (eventType: string, stepId?: string, metadata?: Record<string, unknown>) => Promise<void>;
      startTracking: () => Promise<void>;
    };
    notification: {
      getQuietHours: () => Promise<{ enabled: boolean; startHour: number; startMinute: number; endHour: number; endMinute: number }>;
      setQuietHours: (data: { enabled: boolean; startHour: number; startMinute: number; endHour: number; endMinute: number }) => Promise<{ success: boolean }>;
      getDndStatus: () => Promise<{ enabled: boolean }>;
      setDnd: (data: { enabled: boolean }) => Promise<{ success: boolean }>;
      getPreferences: () => Promise<{ notificationTimeoutMs: number; maxConcurrent: number }>;
      feedback: (data: { notificationId: string; emailId: string; classification: 'urgent'; feedback: 'thumbs_up' | 'thumbs_down' }) => Promise<{ success: boolean }>;
      onFocusEmail: (callback: (data: { emailId: string }) => void) => void;
    };
    rules: {
      getAll: () => Promise<ClassificationRule[]>;
      create: (rule: { name: string; enabled: boolean; priority: number; conditions: ClassificationRuleCondition[]; action: string; classification: string | null }) => Promise<ClassificationRule>;
      update: (id: string, updates: { name?: string; enabled?: boolean; priority?: number; conditions?: ClassificationRuleCondition[]; action?: string; classification?: string | null }) => Promise<ClassificationRule>;
      delete: (id: string) => Promise<void>;
      test: (conditions: ClassificationRuleCondition[], email: { from?: string | null; to?: string | null; subject?: string | null; body?: string | null; date?: string | null }) => Promise<{ matched: boolean }>;
    };
    emailCleanup: {
      getSettings: () => Promise<{ retentionDays: number }>;
      setRetentionDays: (days: number) => Promise<{ retentionDays: number }>;
      runCleanup: () => Promise<{ deleted: number; eligibleCount: number }>;
      getEligibleCount: () => Promise<{ count: number }>;
    };
    shell: {
      openExternal: (url: string) => Promise<void>;
    };
    calendar: {
      sync: (accountId: string) => Promise<{ accountId: string; status: string; lastSyncAt: string | null; error?: string; fetched: number }>;
      syncAll: () => Promise<Array<{ accountId: string; status: string; lastSyncAt: string | null; error?: string; fetched: number }>>;
      getTodayEvents: () => Promise<CalendarEventResponse[]>;
      status: () => Promise<Array<{ accountId: string; status: string; lastSyncAt: string | null; error: string | null; fetched: number }>>;
    };
  }

  interface Window {
    electronAPI: ElectronAPI;
  }
}
