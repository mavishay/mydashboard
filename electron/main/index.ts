import { app, BrowserWindow, shell } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import type Database from 'better-sqlite3';
import { initializeDatabase } from './db';
import { registerIpcHandlers } from './ipc';
import { composeUp, composeDown } from './docker/compose';
import { startHealthPoller } from './docker/health';

let mainWindow: BrowserWindow | null = null;
let db: Database.Database | null = null;
let healthPoller: NodeJS.Timeout | null = null;

const COMPOSE_DIR = join(__dirname, '../../..');

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
  registerIpcHandlers(db, () => mainWindow, () => app.quit());

  try {
    await composeUp(COMPOSE_DIR);
    healthPoller = startHealthPoller((status) => {
      mainWindow?.webContents.send('n8n:health', status);
    });
  } catch (err) {
    console.error('Failed to start n8n sidecar:', err);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('will-quit', async () => {
  if (healthPoller) {
    clearInterval(healthPoller);
    healthPoller = null;
  }

  try {
    await composeDown(COMPOSE_DIR);
  } catch (err) {
    console.error('Failed to stop n8n sidecar:', err);
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
