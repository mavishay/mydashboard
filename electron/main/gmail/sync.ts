import type Database from 'better-sqlite3';
import type { BrowserWindow } from 'electron';
import { fetchEmailsForAccount } from './fetcher';
import { classifyUnclassifiedEmails } from '../ai/classifier';

export interface SyncStatus {
  accountId: string;
  status: 'syncing' | 'idle' | 'error';
  lastSyncAt: string | null;
  error: string | null;
  fetched: number;
  classified: number;
}

export interface SyncCallbacks {
  onStatusChange: (status: SyncStatus) => void;
}

export class GmailSync {
  private db: Database.Database;
  private accountId: string;
  private callbacks: SyncCallbacks;
  private syncing = false;
  private lastStatus: SyncStatus;

  constructor(
    db: Database.Database,
    accountId: string,
    callbacks: SyncCallbacks
  ) {
    this.db = db;
    this.accountId = accountId;
    this.callbacks = callbacks;
    this.lastStatus = {
      accountId,
      status: 'idle',
      lastSyncAt: null,
      error: null,
      fetched: 0,
      classified: 0,
    };
  }

  getStatus(): SyncStatus {
    return { ...this.lastStatus };
  }

  isSyncing(): boolean {
    return this.syncing;
  }

  async sync(maxResults: number = 50): Promise<SyncStatus> {
    if (this.syncing) {
      console.log(`[GmailSync] Account ${this.accountId} already syncing, skipping`);
      return this.lastStatus;
    }

    this.syncing = true;
    this.updateStatus({ status: 'syncing', error: null });
    console.log(`[GmailSync] Starting sync for account ${this.accountId}`);

    try {
      const fetchResult = await fetchEmailsForAccount(
        this.db,
        this.accountId,
        maxResults
      );
      console.log(`[GmailSync] Fetched ${fetchResult.fetched} emails (${fetchResult.inserted} new, ${fetchResult.skipped} skipped)`);

      let classified = 0;
      if (fetchResult.inserted > 0) {
        console.log(`[GmailSync] Classifying ${fetchResult.inserted} new emails...`);
        const classificationResults = await classifyUnclassifiedEmails(
          this.db,
          this.accountId,
          fetchResult.inserted
        );
        classified = classificationResults.length;
        console.log(`[GmailSync] Classified ${classified} emails`);
      }

      const now = new Date().toISOString();
      this.updateStatus({
        status: 'idle',
        lastSyncAt: now,
        fetched: fetchResult.fetched,
        classified,
      });
      console.log(`[GmailSync] Sync complete for account ${this.accountId}`);

      return this.lastStatus;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[GmailSync] Sync failed for account ${this.accountId}:`, message);
      this.updateStatus({
        status: 'error',
        error: message,
        fetched: 0,
        classified: 0,
      });
      return this.lastStatus;
    } finally {
      this.syncing = false;
    }
  }

  private updateStatus(partial: Partial<Omit<SyncStatus, 'accountId'>>): void {
    this.lastStatus = { ...this.lastStatus, ...partial };
    this.callbacks.onStatusChange(this.lastStatus);
  }
}

export class GmailSyncManager {
  private db: Database.Database;
  private getWindow: () => BrowserWindow | null;
  private syncs = new Map<string, GmailSync>();

  constructor(
    db: Database.Database,
    getWindow: () => BrowserWindow | null
  ) {
    this.db = db;
    this.getWindow = getWindow;
  }

  startForAccount(accountId: string): void {
    if (this.syncs.has(accountId)) return;

    const sync = new GmailSync(this.db, accountId, {
      onStatusChange: (status) => {
        this.getWindow()?.webContents.send('gmail:sync-health', status);
      },
    });

    this.syncs.set(accountId, sync);
  }

  stopForAccount(accountId: string): void {
    this.syncs.delete(accountId);
  }

  async syncAccount(accountId: string, maxResults?: number): Promise<SyncStatus> {
    let sync = this.syncs.get(accountId);
    if (!sync) {
      sync = new GmailSync(this.db, accountId, {
        onStatusChange: (status) => {
          this.getWindow()?.webContents.send('gmail:sync-health', status);
        },
      });
      this.syncs.set(accountId, sync);
    }

    return sync.sync(maxResults);
  }

  async syncAll(): Promise<SyncStatus[]> {
    const accounts = this.db
      .prepare("SELECT id FROM accounts WHERE type = 'gmail'")
      .all() as { id: string }[];

    const results: SyncStatus[] = [];
    for (const account of accounts) {
      this.startForAccount(account.id);
      const status = await this.syncAccount(account.id);
      results.push(status);
    }

    return results;
  }

  getStatuses(): SyncStatus[] {
    return Array.from(this.syncs.values()).map((s) => s.getStatus());
  }

  stopAll(): void {
    this.syncs.clear();
  }
}
