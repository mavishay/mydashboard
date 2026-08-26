import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn().mockReturnValue(true),
    encryptString: vi.fn((str: string) => Buffer.from(str, 'utf-8')),
    decryptString: vi.fn((buf: Buffer) => buf.toString('utf-8')),
  },
  shell: { openExternal: vi.fn() },
}));

vi.mock('../../../electron/main/auth/gmail', () => ({
  storeTokens: vi.fn(),
  retrieveTokens: vi.fn(),
}));

describe('Google Tasks Auth', () => {
  let mockDb: { prepare: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockDb = {
      prepare: vi.fn().mockReturnValue({
        run: vi.fn(),
        get: vi.fn(),
        all: vi.fn().mockReturnValue([]),
      }),
    };
  });

  describe('getGoogleTasksClientId', () => {
    it('returns client ID from environment', async () => {
      process.env.GOOGLE_TASKS_CLIENT_ID = 'test-client-id';
      const { getGoogleTasksClientId } = await import(
        '../../../electron/main/auth/google-tasks'
      );
      expect(getGoogleTasksClientId()).toBe('test-client-id');
      delete process.env.GOOGLE_TASKS_CLIENT_ID;
    });

    it('throws when env var is missing', async () => {
      delete process.env.GOOGLE_TASKS_CLIENT_ID;
      const { getGoogleTasksClientId } = await import(
        '../../../electron/main/auth/google-tasks'
      );
      expect(() => getGoogleTasksClientId()).toThrow(
        'GOOGLE_TASKS_CLIENT_ID or GOOGLE_CLIENT_ID environment variable is required'
      );
    });
  });

  describe('createAccount', () => {
    it('inserts account into database', async () => {
      const { createAccount } = await import(
        '../../../electron/main/auth/google-tasks'
      );
      const result = createAccount(
        mockDb as any,
        'test@gmail.com',
        'Test User'
      );
      expect(result).toHaveProperty('id');
      expect(result.email).toBe('test@gmail.com');
      expect(result.display_name).toBe('Test User');
      expect(mockDb.prepare).toHaveBeenCalled();
    });
  });

  describe('listAccounts', () => {
    it('returns accounts from database', async () => {
      mockDb.prepare.mockReturnValue({
        all: vi.fn().mockReturnValue([
          { id: 'a1', email: 'user@test.com', display_name: 'User' },
        ]),
        run: vi.fn(),
        get: vi.fn(),
      });
      const { listAccounts } = await import(
        '../../../electron/main/auth/google-tasks'
      );
      const result = listAccounts(mockDb as any);
      expect(result).toHaveLength(1);
      expect(result[0].email).toBe('user@test.com');
    });

    it('returns empty array when no accounts', async () => {
      const { listAccounts } = await import(
        '../../../electron/main/auth/google-tasks'
      );
      const result = listAccounts(mockDb as any);
      expect(result).toEqual([]);
    });
  });

  describe('deleteAccount', () => {
    it('deletes tokens and account from database', async () => {
      const mockRun = vi.fn();
      mockDb.prepare.mockReturnValue({
        run: mockRun,
        get: vi.fn(),
        all: vi.fn(),
      });
      const { deleteAccount } = await import(
        '../../../electron/main/auth/google-tasks'
      );
      deleteAccount(mockDb as any, 'account-1');
      expect(mockRun).toHaveBeenCalledTimes(2);
    });
  });

  describe('isTokenExpired', () => {
    it('returns false when token is valid', async () => {
      const { isTokenExpired } = await import(
        '../../../electron/main/auth/google-tasks'
      );
      const tokens = {
        access_token: 'abc',
        expiry_date: Date.now() + 3600000,
        scope: 'tasks.readonly',
      };
      expect(isTokenExpired(tokens)).toBe(false);
    });

    it('returns true when token is expired', async () => {
      const { isTokenExpired } = await import(
        '../../../electron/main/auth/google-tasks'
      );
      const tokens = {
        access_token: 'abc',
        expiry_date: Date.now() - 1000,
        scope: 'tasks.readonly',
      };
      expect(isTokenExpired(tokens)).toBe(true);
    });

    it('returns true when token is near expiry (within buffer)', async () => {
      const { isTokenExpired } = await import(
        '../../../electron/main/auth/google-tasks'
      );
      const tokens = {
        access_token: 'abc',
        expiry_date: Date.now() + 2 * 60 * 1000, // 2 minutes from now
        scope: 'tasks.readonly',
      };
      expect(isTokenExpired(tokens)).toBe(true);
    });
  });

  describe('getValidAccessToken', () => {
    it('returns access token when valid', async () => {
      const { retrieveTokens } = await import(
        '../../../electron/main/auth/gmail'
      );
      (retrieveTokens as ReturnType<typeof vi.fn>).mockReturnValue({
        access_token: 'valid-token',
        expiry_date: Date.now() + 3600000,
        scope: 'tasks.readonly',
      });

      const { getValidAccessToken } = await import(
        '../../../electron/main/auth/google-tasks'
      );
      const result = await getValidAccessToken(mockDb as any, 'acct-1');
      expect(result).toBe('valid-token');
    });

    it('throws when no tokens found', async () => {
      const { retrieveTokens } = await import(
        '../../../electron/main/auth/gmail'
      );
      (retrieveTokens as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const { getValidAccessToken } = await import(
        '../../../electron/main/auth/google-tasks'
      );
      await expect(
        getValidAccessToken(mockDb as any, 'acct-1')
      ).rejects.toThrow('No tokens found for account');
    });

    it('throws when no refresh token available', async () => {
      const { retrieveTokens } = await import(
        '../../../electron/main/auth/gmail'
      );
      (retrieveTokens as ReturnType<typeof vi.fn>).mockReturnValue({
        access_token: 'expired-token',
        expiry_date: Date.now() - 1000,
        scope: 'tasks.readonly',
      });

      const { getValidAccessToken } = await import(
        '../../../electron/main/auth/google-tasks'
      );
      await expect(
        getValidAccessToken(mockDb as any, 'acct-1')
      ).rejects.toThrow('No refresh token available');
    });

    it('refreshes token when expired and refresh token available', async () => {
      const { retrieveTokens, storeTokens } = await import(
        '../../../electron/main/auth/gmail'
      );
      (retrieveTokens as ReturnType<typeof vi.fn>).mockReturnValue({
        access_token: 'expired-token',
        refresh_token: 'refresh-token',
        expiry_date: Date.now() - 1000,
        scope: 'tasks.readonly',
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'new-token',
            expires_in: 3600,
            scope: 'tasks.readonly',
          }),
      });
      vi.stubGlobal('fetch', mockFetch);
      process.env.GOOGLE_TASKS_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_TASKS_CLIENT_SECRET = 'test-client-secret';

      const { getValidAccessToken } = await import(
        '../../../electron/main/auth/google-tasks'
      );
      const result = await getValidAccessToken(mockDb as any, 'acct-1');

      expect(result).toBe('new-token');
      expect(storeTokens).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        expect.objectContaining({ method: 'POST' })
      );

      delete process.env.GOOGLE_TASKS_CLIENT_ID;
      delete process.env.GOOGLE_TASKS_CLIENT_SECRET;
      vi.unstubAllGlobals();
    });
  });

  describe('storeGoogleTasksTokens', () => {
    it('delegates to gmail storeTokens', async () => {
      const { storeTokens } = await import(
        '../../../electron/main/auth/gmail'
      );
      const { storeGoogleTasksTokens } = await import(
        '../../../electron/main/auth/google-tasks'
      );
      const tokens = {
        access_token: 'abc',
        refresh_token: 'def',
        expiry_date: Date.now() + 3600000,
        scope: 'tasks.readonly',
      };

      storeGoogleTasksTokens(mockDb as any, 'acct-1', tokens);
      expect(storeTokens).toHaveBeenCalledWith(mockDb, 'acct-1', tokens);
    });
  });

  describe('getGoogleTasksTokens', () => {
    it('delegates to gmail retrieveTokens', async () => {
      const { retrieveTokens } = await import(
        '../../../electron/main/auth/gmail'
      );
      (retrieveTokens as ReturnType<typeof vi.fn>).mockReturnValue({
        access_token: 'abc',
        scope: 'tasks.readonly',
      });

      const { getGoogleTasksTokens } = await import(
        '../../../electron/main/auth/google-tasks'
      );
      const result = getGoogleTasksTokens(mockDb as any, 'acct-1');
      expect(result?.access_token).toBe('abc');
    });

    it('returns null when no tokens', async () => {
      const { retrieveTokens } = await import(
        '../../../electron/main/auth/gmail'
      );
      (retrieveTokens as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const { getGoogleTasksTokens } = await import(
        '../../../electron/main/auth/google-tasks'
      );
      const result = getGoogleTasksTokens(mockDb as any, 'acct-1');
      expect(result).toBeNull();
    });
  });
});
