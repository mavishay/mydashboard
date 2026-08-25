import { createServer as createHttpsServer, type Server as HttpsServer } from 'node:https';
import type Database from 'better-sqlite3';
import type { CertPair } from './tls.js';
import { getSessionToken, setSessionCookie } from './session.js';
import { validateToken, validateSession } from './auth.js';
import { createStaticFileHandler } from './static-files.js';
import { URL } from 'node:url';
import { networkInterfaces } from 'node:os';

export interface LanServerConfig {
  port: number;
  cert: CertPair;
  db: Database.Database;
  staticDir: string;
}

export interface LanServer {
  server: HttpsServer | HttpServer;
  port: number;
  stop: () => Promise<void>;
}

function getLocalIpAddress(): string {
  const interfaces = networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

function parseJsonBody(req: import('node:http').IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(
  res: import('node:http').ServerResponse,
  status: number,
  data: unknown
): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function getClientIp(req: import('node:http').IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress ?? '0.0.0.0';
}

export function createLanServer(config: LanServerConfig): LanServer {
  const { port, cert, db, staticDir } = config;
  const handleStatic = createStaticFileHandler(staticDir);

  const requestHandler: import('node:http').RequestListener = async (req, res) => {
    const url = new URL(req.url ?? '/', `https://${req.headers.host ?? 'localhost'}`);
    const pathname = url.pathname;
    const method = req.method ?? 'GET';

    // Health check
    if (pathname === '/api/health' && method === 'GET') {
      sendJson(res, 200, { status: 'ok' });
      return;
    }

    // Auth: check if session is valid
    if (pathname === '/api/auth/check' && method === 'GET') {
      const sessionToken = getSessionToken(req);
      if (sessionToken && validateSession(db, sessionToken)) {
        sendJson(res, 200, { authenticated: true });
      } else {
        sendJson(res, 401, { authenticated: false });
      }
      return;
    }

    // Pair: validate token and create session
    if (pathname === '/api/auth/pair' && method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        // Support token from POST body or query parameter
        const token = body.token ?? url.searchParams.get('token');
        if (typeof token !== 'string' || token.length === 0) {
          sendJson(res, 400, { error: 'token_required' });
          return;
        }

        const ip = getClientIp(req);
        const result = validateToken(db, token, ip);

        if (!result.success) {
          const status = result.error === 'rate_limited' ? 429 : 401;
          sendJson(res, status, { error: result.error });
          return;
        }

        setSessionCookie(res, result.sessionToken!);
        sendJson(res, 200, { success: true });
      } catch {
        sendJson(res, 400, { error: 'invalid_json' });
      }
      return;
    }

    // All other routes: require valid session
    const sessionToken = getSessionToken(req);
    if (!sessionToken || !validateSession(db, sessionToken)) {
      sendJson(res, 401, { error: 'token_required' });
      return;
    }

    // Serve static files
    if (!handleStatic(req, res, pathname)) {
      sendJson(res, 404, { error: 'not_found' });
    }
  };

  const server = createHttpsServer(
    {
      cert: cert.cert,
      key: cert.key,
      minVersion: 'TLSv1.2',
    },
    requestHandler
  );

  return {
    server,
    port,
    stop: async () => {
      // CDR-2026-061: Immediate close - destroy all sockets
      const sockets = new Set<import('node:net').Socket>();
      server.on('connection', (socket) => sockets.add(socket));
      server.on('close', () => sockets.clear());

      for (const socket of sockets) {
        socket.destroy();
      }
      sockets.clear();

      return new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    },
  };
}

export function getLanUrl(port: number): string {
  const ip = getLocalIpAddress();
  return `https://${ip}:${port}`;
}
