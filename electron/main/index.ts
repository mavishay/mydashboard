import { app, BrowserWindow, shell, ipcMain } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import dotenv from 'dotenv';
import type Database from 'better-sqlite3';

dotenv.config({ path: '.env.local' });
import { initializeDatabase } from './db';
import { registerIpcHandlers } from './ipc';
import { createLanServerInstance, type LanServerInstance } from './server';
import { recordTelemetryEvent } from './telemetry';
import { recordSetupEvent, hasSetupStarted } from './onboarding/setup-tracker';
import { ServiceRegistry } from './services/service-registry';
import { CronService } from './services/cron-service';
import { GoogleTasksSyncService } from './services/google-tasks-service';
import { TickTickSyncService } from './services/ticktick-service';
import { registerServiceHandlers } from './ipc/service-handlers';
import { existsSync } from 'fs';

app.disableHardwareAcceleration();

let mainWindow: BrowserWindow | null = null;
let db: Database.Database | null = null;
let isQuitting = false;
let lanServer: LanServerInstance | null = null;
const serviceRegistry = new ServiceRegistry();

function createWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#fafafa',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error(`[Renderer] Failed to load: ${code} ${desc}`);
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

  recordTelemetryEvent(db, 'app_start', {
    platform: process.platform,
    arch: process.arch,
    electronVersion: process.versions.electron,
  });

  if (!hasSetupStarted(db)) {
    recordSetupEvent(db, { eventType: 'setup_started' });
  }

  lanServer = createLanServerInstance(
    db,
    is.dev ? join(__dirname, '../../dist/renderer') : join(__dirname, '../renderer'),
    app.getPath('userData')
  );

  const { cronScheduler } = registerIpcHandlers(db, () => mainWindow, () => app.quit(), lanServer);

  const cronService = new CronService(cronScheduler);
  serviceRegistry.register(cronService);

  const googleTasksService = new GoogleTasksSyncService(db);
  serviceRegistry.register(googleTasksService);

  const ticktickService = new TickTickSyncService(db);
  serviceRegistry.register(ticktickService);

  await serviceRegistry.startAll();
  registerServiceHandlers(ipcMain, serviceRegistry);

  // Migration: log info if docker-compose.yml exists
  const composeDir = is.dev ? join(__dirname, '../..') : join(app.getAppPath(), '..');
  const composePath = join(composeDir, 'docker-compose.yml');
  if (existsSync(composePath)) {
    console.log('[Migration] Docker sidecar is no longer required. Background services now run in-app.');
  }

  try {
    await lanServer.start();
  } catch (err) {
    console.error('Failed to start LAN server:', err);
  }

  createWindow();

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

  serviceRegistry.stopAll();

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
