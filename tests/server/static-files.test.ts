import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'node:path';

const mockFiles: Record<string, string> = {};

vi.mock('node:fs', () => ({
  readFileSync: vi.fn((p: string) => {
    const filePath = String(p);
    if (mockFiles[filePath]) return mockFiles[filePath];
    throw new Error(`ENOENT: no such file or directory ${filePath}`);
  }),
  existsSync: vi.fn((p: string) => {
    return String(p) in mockFiles;
  }),
  statSync: vi.fn(() => {
    return { isFile: () => true } as import('node:fs').Stats;
  }),
}));

function createMockReq(url: string) {
  return { url } as import('node:http').IncomingMessage;
}

function createMockRes() {
  let writtenData: string | Buffer | null = null;
  let statusCode = 0;
  let headers: Record<string, string> = {};

  const res = {
    writeHead: vi.fn((status: number, h?: Record<string, string>) => {
      statusCode = status;
      if (h) headers = h;
    }),
    end: vi.fn((data: string | Buffer) => {
      writtenData = data;
    }),
    _getStatusCode: () => statusCode,
    _getWrittenData: () => writtenData,
    _getHeaders: () => headers,
  } as unknown as import('node:http').ServerResponse;

  return res;
}

describe('static-files', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockFiles).forEach((k) => delete mockFiles[k]);
  });

  describe('createStaticFileHandler', () => {
    it('serves index.html with correct content type', async () => {
      const { createStaticFileHandler } = await import('../../electron/main/server/static-files');

      const staticDir = '/dist/renderer';
      mockFiles[join(staticDir, 'index.html')] = '<!DOCTYPE html><html></html>';

      const handler = createStaticFileHandler(staticDir);
      const req = createMockReq('/');
      const res = createMockRes();

      const result = handler(req, res, '/index.html');

      expect(result).toBe(true);
      expect(res._getStatusCode()).toBe(200);
      expect(res._getHeaders()['Content-Type']).toContain('text/html');
    });

    it('serves JS files with correct content type', async () => {
      const { createStaticFileHandler } = await import('../../electron/main/server/static-files');

      const staticDir = '/dist/renderer';
      mockFiles[join(staticDir, 'app.js')] = 'console.log("hello")';

      const handler = createStaticFileHandler(staticDir);
      const req = createMockReq('/app.js');
      const res = createMockRes();

      const result = handler(req, res, '/app.js');

      expect(result).toBe(true);
      expect(res._getHeaders()['Content-Type']).toContain('javascript');
    });

    it('serves CSS files with correct content type', async () => {
      const { createStaticFileHandler } = await import('../../electron/main/server/static-files');

      const staticDir = '/dist/renderer';
      mockFiles[join(staticDir, 'styles.css')] = 'body { color: red; }';

      const handler = createStaticFileHandler(staticDir);
      const req = createMockReq('/styles.css');
      const res = createMockRes();

      const result = handler(req, res, '/styles.css');

      expect(result).toBe(true);
      expect(res._getHeaders()['Content-Type']).toContain('text/css');
    });

    it('falls back to index.html for SPA routes', async () => {
      const { createStaticFileHandler } = await import('../../electron/main/server/static-files');

      const staticDir = '/dist/renderer';
      mockFiles[join(staticDir, 'index.html')] = '<!DOCTYPE html><html></html>';

      const handler = createStaticFileHandler(staticDir);
      const req = createMockReq('/dashboard/inbox');
      const res = createMockRes();

      const result = handler(req, res, '/dashboard/inbox');

      expect(result).toBe(true);
      expect(res._getStatusCode()).toBe(200);
      expect(res._getHeaders()['Content-Type']).toContain('text/html');
    });

    it('returns false for API routes', async () => {
      const { createStaticFileHandler } = await import('../../electron/main/server/static-files');

      const staticDir = '/dist/renderer';
      mockFiles[join(staticDir, 'index.html')] = '<!DOCTYPE html><html></html>';

      const handler = createStaticFileHandler(staticDir);
      const req = createMockReq('/api/health');
      const res = createMockRes();

      const result = handler(req, res, '/api/health');

      expect(result).toBe(false);
    });

    it('returns false when no index.html and no matching file', async () => {
      const { createStaticFileHandler } = await import('../../electron/main/server/static-files');

      const staticDir = '/dist/renderer';

      const handler = createStaticFileHandler(staticDir);
      const req = createMockReq('/nonexistent');
      const res = createMockRes();

      const result = handler(req, res, '/nonexistent');

      expect(result).toBe(false);
    });
  });
});
