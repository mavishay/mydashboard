import type Database from 'better-sqlite3';
import { getOrCreateCerts } from './tls.js';
import { createLanServer, getLanUrl, type LanServer, type LanServerConfig } from './http-server.js';
import { ensureTokenExists, getConnectedDeviceCount, regenerateToken as authRegenerateToken } from './auth.js';

export interface LanServerInstance {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  status: () => LanStatus;
  getToken: () => string;
  regenerateToken: () => string;
  getConnectedDevices: () => number;
}

export interface LanStatus {
  running: boolean;
  port: number;
  url: string | null;
}

const DEFAULT_PORT = 8443;

export function createLanServerInstance(
  db: Database.Database,
  staticDir: string,
  userDataPath: string,
  port: number = DEFAULT_PORT
): LanServerInstance {
  let server: LanServer | null = null;
  const currentPort = port;
  let currentUrl: string | null = null;

  // Ensure token exists on startup
  ensureTokenExists(db);

  return {
    async start() {
      if (server) return;

      const cert = await getOrCreateCerts(userDataPath);

      const config: LanServerConfig = {
        port: currentPort,
        host: '0.0.0.0',
        cert,
        db,
        staticDir,
      };

      server = createLanServer(config);

      try {
        server.server.listen(currentPort, '0.0.0.0');
        currentUrl = getLanUrl(currentPort);
      } catch (err) {
        server = null;
        throw new Error(
          `Failed to start LAN server on port ${currentPort}: ${
            err instanceof Error ? err.message : String(err)
          }`,
          { cause: err }
        );
      }
    },

    async stop() {
      if (!server) return;
      await server.stop();
      server = null;
      currentUrl = null;
    },

    status(): LanStatus {
      return {
        running: !!server,
        port: currentPort,
        url: currentUrl,
      };
    },

    getToken(): string {
      return ensureTokenExists(db);
    },

    regenerateToken(): string {
      return authRegenerateToken(db);
    },

    getConnectedDevices(): number {
      return getConnectedDeviceCount(db);
    },
  };
}
