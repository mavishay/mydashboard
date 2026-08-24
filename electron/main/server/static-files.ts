import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

export function createStaticFileHandler(staticDir: string) {
  // Cache the index.html content
  const indexPath = join(staticDir, 'index.html');
  let indexHtml: string | null = null;

  if (existsSync(indexPath)) {
    try {
      indexHtml = readFileSync(indexPath, 'utf8');
    } catch {
      indexHtml = null;
    }
  }

  return function handleStaticFile(
    req: IncomingMessage,
    res: ServerResponse,
    urlPath: string
  ): boolean {
    // Don't serve static files for API routes
    if (urlPath.startsWith('/api/')) {
      return false;
    }

    // Try to serve the exact file
    const filePath = join(staticDir, urlPath);

    if (existsSync(filePath)) {
      const stat = statSync(filePath);
      if (stat.isFile()) {
        const ext = extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';

        res.writeHead(200, { 'Content-Type': contentType });
        res.end(readFileSync(filePath));
        return true;
      }
    }

    // SPA fallback: serve index.html for all non-file routes
    if (indexHtml) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(indexHtml);
      return true;
    }

    return false;
  };
}
