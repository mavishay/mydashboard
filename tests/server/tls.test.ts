import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockWriteFileSync = vi.mocked(writeFileSync);

describe('tls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getOrCreateCerts', () => {
    it('loads existing certs from disk when present', async () => {
      const { getOrCreateCerts } = await import('../../electron/main/server/tls');

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockImplementation((path) => {
        const p = String(path);
        if (p.endsWith('.crt')) return '-----BEGIN CERTIFICATE-----\nMOCK\n-----END CERTIFICATE-----';
        if (p.endsWith('.key')) return '-----BEGIN PRIVATE KEY-----\nMOCK\n-----END PRIVATE KEY-----';
        throw new Error(`Unexpected path: ${p}`);
      });

      const result = await getOrCreateCerts('/tmp/test-userdata');

      expect(result.cert).toContain('BEGIN CERTIFICATE');
      expect(result.key).toContain('BEGIN PRIVATE KEY');
      expect(mockMkdirSync).not.toHaveBeenCalled();
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });

    it('generates and saves certs when not present', async () => {
      const { getOrCreateCerts } = await import('../../electron/main/server/tls');

      mockExistsSync.mockReturnValue(false);

      const result = await getOrCreateCerts('/tmp/test-userdata');

      expect(result.cert).toContain('BEGIN CERTIFICATE');
      expect(result.key).toContain('BEGIN PRIVATE KEY');
      expect(mockMkdirSync).toHaveBeenCalledWith(
        join('/tmp/test-userdata', 'certs'),
        { recursive: true }
      );
      expect(mockWriteFileSync).toHaveBeenCalledTimes(2);
    });

    it('generates valid RSA 2048-bit cert', async () => {
      const { getOrCreateCerts } = await import('../../electron/main/server/tls');

      mockExistsSync.mockReturnValue(false);

      const result = await getOrCreateCerts('/tmp/test-userdata');

      expect(result.cert).toMatch(/-----BEGIN CERTIFICATE-----/);
      expect(result.key).toMatch(/-----BEGIN PRIVATE KEY-----/);
    });
  });
});
