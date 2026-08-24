export {};

declare global {
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
  }

  interface Window {
    electronAPI: ElectronAPI;
  }
}
