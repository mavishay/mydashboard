import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateState,
  validateState,
  encryptToken,
  decryptToken,
  storeTokens,
  retrieveTokens,
  createAccount,
  listAccounts,
  deleteAccount,
} from '../../../electron/main/auth/gmail';

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn().mockReturnValue(true),
    encryptString: vi.fn((str: string) => Buffer.from(str, 'utf-8')),
    decryptString: vi.fn((buf: Buffer) => buf.toString('utf-8')),
  },
}));

describe('Gmail Auth', () => {
  describe('generateState', () => {
    it('generates a random state string', () => {
      const state = generateState();
      expect(state).toMatch(/^[a-f0-9]{64}$/);
    });

    it('generates unique states', () => {
      const state1 = generateState();
      const state2 = generateState();
      expect(state1).not.toBe(state2);
    });
  });

  describe('validateState', () => {
    it('returns true for matching states', () => {
      const state = generateState();
      expect(validateState(state, state)).toBe(true);
    });

    it('returns false for non-matching states', () => {
      const state1 = generateState();
      const state2 = generateState();
      expect(validateState(state1, state2)).toBe(false);
    });
  });

  describe('encryptToken / decryptToken', () => {
    it('encrypts and decrypts a token', () => {
      const token = 'test-access-token-12345';
      const encrypted = encryptToken(token);
      const decrypted = decryptToken(encrypted);
      expect(decrypted).toBe(token);
    });

    it('returns buffer when encrypting', () => {
      const token = 'test-token';
      const encrypted = encryptToken(token);
      expect(encrypted).toBeInstanceOf(Buffer);
    });
  });
});

describe('Gmail Database Operations', () => {
  let mockDb: {
    prepare: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = {
      prepare: vi.fn().mockReturnValue({
        run: vi.fn(),
        get: vi.fn(),
        all: vi.fn().mockReturnValue([]),
      }),
    };
  });

  describe('createAccount', () => {
    it('creates a gmail account', () => {
      const result = createAccount(
        mockDb as any,
        'test@gmail.com',
        'Test User'
      );
      expect(result).toHaveProperty('id');
      expect(result.email).toBe('test@gmail.com');
      expect(result.display_name).toBe('Test User');
    });
  });

  describe('listAccounts', () => {
    it('returns empty array when no accounts', () => {
      const result = listAccounts(mockDb as any);
      expect(result).toEqual([]);
    });
  });

  describe('deleteAccount', () => {
    it('deletes account and tokens', () => {
      deleteAccount(mockDb as any, 'account-123');
      expect(mockDb.prepare).toHaveBeenCalled();
    });
  });

  describe('storeTokens', () => {
    it('stores tokens with encryption', () => {
      const mockRun = vi.fn();
      mockDb.prepare.mockReturnValue({ run: mockRun });
      const tokens = {
        access_token: 'access123',
        refresh_token: 'refresh456',
        expiry_date: Date.now() + 3600000,
        scope: 'email',
      };
      storeTokens(mockDb as any, 'account-1', tokens);
      expect(mockDb.prepare).toHaveBeenCalled();
      expect(mockRun).toHaveBeenCalled();
      const args = mockRun.mock.calls[0];
      // args[0] is uuid, args[1] is accountId
      expect(args[1]).toBe('account-1');
      // args[2] is encrypted access token (Buffer)
      expect(args[2]).toBeInstanceOf(Buffer);
      // args[3] is encrypted refresh token (Buffer)
      expect(args[3]).toBeInstanceOf(Buffer);
    });

    it('stores null refresh token when not provided', () => {
      const mockRun = vi.fn();
      mockDb.prepare.mockReturnValue({ run: mockRun });
      const tokens = {
        access_token: 'access123',
        expiry_date: Date.now() + 3600000,
        scope: 'email',
      };
      storeTokens(mockDb as any, 'account-2', tokens);
      const args = mockRun.mock.calls[0];
      expect(args[3]).toBeNull();
    });
  });

  describe('retrieveTokens', () => {
    it('retrieves and decrypts tokens', () => {
      const mockGet = vi.fn();
      const accessToken = Buffer.from('access123', 'utf-8');
      const refreshToken = Buffer.from('refresh456', 'utf-8');
      mockGet.mockReturnValue({
        encrypted_access_token: accessToken,
        encrypted_refresh_token: refreshToken,
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        scope: 'email',
      });
      mockDb.prepare.mockReturnValue({ get: mockGet });
      const result = retrieveTokens(mockDb as any, 'account-1');
      expect(result).not.toBeNull();
      expect(result?.access_token).toBe('access123');
      expect(result?.refresh_token).toBe('refresh456');
      expect(result?.scope).toBe('email');
    });

    it('returns null when no tokens found', () => {
      const mockGet = vi.fn().mockReturnValue(undefined);
      mockDb.prepare.mockReturnValue({ get: mockGet });
      const result = retrieveTokens(mockDb as any, 'nonexistent');
      expect(result).toBeNull();
    });

    it('handles null refresh token', () => {
      const mockGet = vi.fn();
      const accessToken = Buffer.from('access123', 'utf-8');
      mockGet.mockReturnValue({
        encrypted_access_token: accessToken,
        encrypted_refresh_token: null,
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        scope: 'email',
      });
      mockDb.prepare.mockReturnValue({ get: mockGet });
      const result = retrieveTokens(mockDb as any, 'account-3');
      expect(result?.refresh_token).toBeUndefined();
    });
  });
});
