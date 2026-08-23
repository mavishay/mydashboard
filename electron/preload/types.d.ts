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
    n8n: {
      status: () => Promise<{ status: string }>;
      start: () => Promise<{ success: boolean }>;
      stop: () => Promise<{ success: boolean }>;
      onHealth: (callback: (status: string) => void) => void;
    };
  }

  interface Window {
    electronAPI: ElectronAPI;
  }
}
