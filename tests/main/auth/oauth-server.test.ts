import { describe, it, expect } from 'vitest';
import { buildAuthUrl } from '../../../electron/main/auth/oauth-server';

describe('OAuth Server', () => {
  describe('buildAuthUrl', () => {
    it('builds a valid Google OAuth URL', () => {
      const url = buildAuthUrl({
        clientId: 'test-client-id',
        redirectUri: 'http://127.0.0.1:3000/callback',
        state: 'test-state-123',
        scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
      });

      expect(url).toContain('accounts.google.com/o/oauth2/v2/auth');
      expect(url).toContain('client_id=test-client-id');
      expect(url).toContain('redirect_uri=');
      expect(url).toContain('state=test-state-123');
      expect(url).toContain('response_type=code');
      expect(url).toContain('access_type=offline');
      expect(url).toContain('prompt=consent');
    });

    it('includes multiple scopes separated by spaces', () => {
      const url = buildAuthUrl({
        clientId: 'test-client-id',
        redirectUri: 'http://127.0.0.1:3000/callback',
        state: 'test-state',
        scopes: [
          'https://www.googleapis.com/auth/gmail.readonly',
          'https://www.googleapis.com/auth/gmail.labels',
        ],
      });

      expect(url).toContain('scope=');
      expect(url).toContain('gmail.readonly');
      expect(url).toContain('gmail.labels');
    });
  });
});
