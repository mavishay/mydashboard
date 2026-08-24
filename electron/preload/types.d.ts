export {};

declare global {
  interface ApiKeyMeta {
    id: string;
    provider: 'openai' | 'anthropic' | 'litellm';
    label: string;
    baseUrl?: string;
    createdAt: string;
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
  }

  interface Window {
    electronAPI: ElectronAPI;
  }
}
