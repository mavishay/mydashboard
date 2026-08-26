import { app, BrowserWindow, shell } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import dotenv from 'dotenv';
import type Database from 'better-sqlite3';

dotenv.config({ path: '.env.local' });
import { initializeDatabase } from './db';
import { registerIpcHandlers } from './ipc';
import { composeUp, composeDown } from './docker/compose';
import { startHealthPoller } from './docker/health';
import { createLanServerInstance, type LanServerInstance } from './server';
import { listAccounts } from './auth/google-tasks';
import { GoogleTasksSync } from './sync/google-tasks-sync';
import { listAccounts as listTickTickAccounts } from './auth/ticktick';
import { TickTickSync } from './sync/ticktick-sync';
import { TickTickAdapter } from './sync/ticktick-adapter';
import { getAccessToken as getTickTickAccessToken } from './auth/ticktick';
import { recordTelemetryEvent } from './telemetry';

app.disableHardwareAcceleration();

let mainWindow: BrowserWindow | null = null;
let db: Database.Database | null = null;
let healthPoller: NodeJS.Timeout | null = null;
let isQuitting = false;
let lanServer: LanServerInstance | null = null;
const googleTasksSyncs = new Map<string, GoogleTasksSync>();
const ticktickSyncs = new Map<string, TickTickSync>();

function getComposeDir(): string {
  if (is.dev) {
    return join(__dirname, '../..');
  }
  const appPath = app.getAppPath();
  return join(appPath, '..');
}

async function startGoogleTasksSyncers(database: Database.Database): Promise<void> {
  const accounts = listAccounts(database);
  for (const account of accounts) {
    const existing = googleTasksSyncs.get(account.id);
    if (existing) continue;

    const sync = new GoogleTasksSync(database, account.id);
    sync.onSyncStatus((state) => {
      mainWindow?.webContents.send('google-tasks:sync-health', state);
    });

    googleTasksSyncs.set(account.id, sync);

    try {
      await sync.start();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('No tokens found') || message.includes('No refresh token')) {
        mainWindow?.webContents.send('google-tasks:sync-health', {
          status: 'error',
          lastSyncAt: null,
          error: 'Re-authentication required',
        });
      } else {
        console.error(`Failed to start Google Tasks sync for account ${account.id}:`, err);
      }
      googleTasksSyncs.delete(account.id);
    }
  }
}

function stopGoogleTasksSyncers(): void {
  for (const [id, sync] of googleTasksSyncs) {
    sync.stop();
    googleTasksSyncs.delete(id);
  }
}

async function startTickTickSyncers(database: Database.Database): Promise<void> {
  const accounts = listTickTickAccounts(database);
  for (const account of accounts) {
    const existing = ticktickSyncs.get(account.id);
    if (existing) continue;

    try {
      const accessToken = getTickTickAccessToken(database, account.id);
      const adapter = new TickTickAdapter(accessToken);
      const sync = new TickTickSync(database, account.id, adapter);
      sync.onSyncStatus((state) => {
        mainWindow?.webContents.send('ticktick:sync-health', state);
      });

      ticktickSyncs.set(account.id, sync);
      await sync.start();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('No tokens found')) {
        mainWindow?.webContents.send('ticktick:sync-health', {
          status: 'error',
          lastSyncAt: null,
          error: 'Re-authentication required',
        });
      } else {
        console.error(`Failed to start TickTick sync for account ${account.id}:`, err);
      }
      ticktickSyncs.delete(account.id);
    }
  }
}

function stopTickTickSyncers(): void {
  for (const [id, sync] of ticktickSyncs) {
    sync.stop();
    ticktickSyncs.delete(id);
  }
}

function createWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(`<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { display: flex; justify-content: center; align-items: center; height: 100vh;
         background: #fafafa; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
  .loader { text-align: center; }
  .spinner { width: 32px; height: 32px; border: 3px solid #e0e0e0; border-top-color: #1976d2;
             border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 12px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  p { color: #666; font-size: 14px; }
</style></head><body><div class="loader"><div class="spinner"></div><p>Loading...</p></div></body></html>`)}`
  );

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return mainWindow;
}

app.whenReady().then(async () => {
  db = initializeDatabase();
  const composeDir = getComposeDir();

  recordTelemetryEvent(db, 'app_start', {
    platform: process.platform,
    arch: process.arch,
    electronVersion: process.versions.electron,
  });

  lanServer = createLanServerInstance(
    db,
    is.dev ? join(__dirname, '../../dist/renderer') : join(__dirname, '../renderer'),
    app.getPath('userData')
  );

  registerIpcHandlers(db, () => mainWindow, () => app.quit(), composeDir, lanServer);

  try {
    await composeUp(composeDir);
    healthPoller = startHealthPoller((status) => {
      mainWindow?.webContents.send('n8n:health', status);
    });
  } catch (err) {
    console.error('Failed to start n8n sidecar:', err);
  }

  try {
    await lanServer.start();
  } catch (err) {
    console.error('Failed to start LAN server:', err);
  }

  createWindow();

  await startGoogleTasksSyncers(db);
  await startTickTickSyncers(db);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', (e) => {
  if (!isQuitting) {
    e.preventDefault();
    return;
  }

  stopGoogleTasksSyncers();
  stopTickTickSyncers();

  if (healthPoller) {
    clearInterval(healthPoller);
    healthPoller = null;
  }

  const composeDir = getComposeDir();
  composeDown(composeDir).catch((err) => {
    console.error('Failed to stop n8n sidecar:', err);
  });

  if (lanServer) {
    lanServer.stop().catch((err) => {
      console.error('Failed to stop LAN server:', err);
    });
    lanServer = null;
  }

  if (db) {
    db.close();
    db = null;
  }
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
