import { createServer, type Server } from 'http';
import { URL } from 'url';

export interface OAuthCallback {
  code: string;
  state: string;
}

export interface OAuthServer {
  port: number;
  waitForCallback(timeoutMs?: number): Promise<OAuthCallback>;
  close(): Promise<void>;
}

export function createOAuthServer(): Promise<OAuthServer> {
  return new Promise((resolve, reject) => {
    let callbackResolve: ((value: OAuthCallback) => void) | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const server: Server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost`);

      if (url.pathname === '/callback') {
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const error = url.searchParams.get('error');

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`<h1>Authorization Failed</h1><p>${error}</p>`);
          if (callbackResolve) {
            callbackResolve({ code: '', state: '' });
          }
          return;
        }

        if (code && state) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body>
                <h1>Authorization Successful!</h1>
                <p>You can close this window and return to the app.</p>
                <script>window.close()</script>
              </body>
            </html>
          `);
          if (callbackResolve) {
            callbackResolve({ code, state });
          }
        } else {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<h1>Missing parameters</h1>');
        }
      } else {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>Not Found</h1>');
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        resolve({
          port: addr.port,
          waitForCallback: (timeoutMs = 300000) =>
            new Promise<OAuthCallback>((res, rej) => {
              callbackResolve = res;
              timeoutId = setTimeout(() => {
                rej(new Error('OAuth callback timeout'));
              }, timeoutMs);
            }),
          close: () =>
            new Promise<void>((res) => {
              if (timeoutId) clearTimeout(timeoutId);
              server.close(() => res());
            }),
        });
      } else {
        reject(new Error('Failed to get server address'));
      }
    });

    server.on('error', reject);
  });
}

export function buildAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  scopes: string[];
}): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', params.scopes.join(' '));
  url.searchParams.set('state', params.state);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  return url.toString();
}
