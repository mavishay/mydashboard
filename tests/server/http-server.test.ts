import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/test') },
}));

vi.mock('node:https', () => ({
  createServer: vi.fn(() => ({
    listen: vi.fn(),
    close: vi.fn((cb: () => void) => cb?.()),
    on: vi.fn(),
    address: vi.fn(() => ({ port: 8443 })),
  })),
}));

vi.mock('node:os', () => ({
  networkInterfaces: vi.fn(() => ({
    en0: [
      { address: '192.168.1.42', family: 'IPv4', internal: false },
    ],
  })),
}));

function createMockDb() {
  return {
    prepare: vi.fn(() => ({
      get: vi.fn(() => undefined),
      run: vi.fn(),
    })),
  } as unknown as import('better-sqlite3').Database;
}

describe('http-server', () => {
  describe('createLanServer', () => {
    it('creates an HTTPS server with TLS config', async () => {
      const { createLanServer } = await import('../../electron/main/server/http-server');

      const server = createLanServer({
        port: 8443,
        host: '0.0.0.0',
        cert: { cert: 'MOCK_CERT', key: 'MOCK_KEY' },
        db: createMockDb(),
        staticDir: '/tmp/renderer',
      });

      expect(server).toBeDefined();
      expect(server.port).toBe(8443);
      expect(server.stop).toBeInstanceOf(Function);
    });
  });

  describe('getLanUrl', () => {
    it('returns URL with local IP and port', async () => {
      const { getLanUrl } = await import('../../electron/main/server/http-server');

      const url = getLanUrl(8443);

      expect(url).toBe('https://192.168.1.42:8443');
    });

    it('works with custom port', async () => {
      const { getLanUrl } = await import('../../electron/main/server/http-server');

      const url = getLanUrl(3000);

      expect(url).toBe('https://192.168.1.42:3000');
    });
  });
});
