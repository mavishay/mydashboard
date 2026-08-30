import { google, type gmail_v1 } from 'googleapis';
import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { retrieveTokens } from '../auth/gmail';

export interface FetchedEmail {
  id: string;
  accountId: string;
  externalId: string;
  subject: string | null;
  snippet: string | null;
  fromAddress: string | null;
  toAddresses: string | null;
  receivedAt: string | null;
  labelIds: string[];
}

function createOAuth2Client(
  clientId: string,
  clientSecret: string,
  tokens: { access_token: string; refresh_token?: string; expiry_date: number }
): InstanceType<typeof google.auth.OAuth2> {
  const client = new google.auth.OAuth2(clientId, clientSecret);
  client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
  });
  return client;
}

function parseDateSafe(dateStr: string | null): string | null {
  if (!dateStr) return null;
  try {
    const parsed = new Date(dateStr);
    if (isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
  } catch {
    return null;
  }
}

function extractHeader(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string | null {
  if (!headers) return null;
  const header = headers.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return header?.value ?? null;
}

function parseMessage(
  msg: gmail_v1.Schema$Message,
  accountId: string
): FetchedEmail | null {
  if (!msg.id || !msg.payload) return null;

  const headers = msg.payload.headers;
  const subject = extractHeader(headers, 'Subject');
  const from = extractHeader(headers, 'From');
  const to = extractHeader(headers, 'To');
  const date = extractHeader(headers, 'Date');

  return {
    id: uuidv4(),
    accountId,
    externalId: msg.id,
    subject,
    snippet: msg.snippet ?? null,
    fromAddress: from,
    toAddresses: to,
    receivedAt: parseDateSafe(date),
    labelIds: msg.labelIds ?? [],
  };
}

function storeEmails(
  db: Database.Database,
  accountId: string,
  emails: FetchedEmail[]
): { inserted: number; updated: number; skipped: number } {
  const upsert = db.prepare(
    `INSERT INTO emails (id, account_id, external_id, subject, snippet, from_address, to_addresses, received_at, label_ids, is_read, last_synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(account_id, external_id) DO UPDATE SET
       subject = excluded.subject,
       snippet = excluded.snippet,
       from_address = excluded.from_address,
       to_addresses = excluded.to_addresses,
       received_at = excluded.received_at,
       label_ids = excluded.label_ids,
       is_read = excluded.is_read,
       last_synced_at = datetime('now')`
  );

  let inserted = 0;
  let skipped = 0;

  const transaction = db.transaction(() => {
    for (const email of emails) {
      const isRead = email.labelIds.includes('UNREAD') ? 0 : 1;
      const labelIdsJson = JSON.stringify(email.labelIds);

      const result = upsert.run(
        email.id,
        email.accountId,
        email.externalId,
        email.subject,
        email.snippet,
        email.fromAddress,
        email.toAddresses,
        email.receivedAt,
        labelIdsJson,
        isRead
      );
      if (result.changes > 0) {
        inserted++;
      } else {
        skipped++;
      }
    }
  });

  transaction();
  return { inserted, skipped };
}

export interface FetchResult {
  accountId: string;
  fetched: number;
  inserted: number;
  skipped: number;
}

export async function fetchEmailsForAccount(
  db: Database.Database,
  accountId: string,
  maxResults: number = 50
): Promise<FetchResult> {
  console.log(`[Fetcher] Fetching unread emails for account ${accountId} (max: ${maxResults})`);

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials not configured');
  }

  const tokens = retrieveTokens(db, accountId);
  if (!tokens) {
    throw new Error('No tokens found for account');
  }

  const oauth2Client = createOAuth2Client(clientId, clientSecret, tokens);
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  console.log(`[Fetcher] Calling Gmail API (unread only)...`);
  const listResponse = await gmail.users.messages.list({
    userId: 'me',
    maxResults,
    q: 'is:unread',
  });

  const messages = listResponse.data.messages ?? [];
  console.log(`[Fetcher] Gmail API returned ${messages.length} unread message references`);

  const unreadExternalIds = new Set<string>();
  const emails: FetchedEmail[] = [];
  for (const msgRef of messages) {
    if (!msgRef.id) continue;
    unreadExternalIds.add(msgRef.id);
    const msg = await gmail.users.messages.get({
      userId: 'me',
      id: msgRef.id,
      format: 'metadata',
      metadataHeaders: ['Subject', 'From', 'To', 'Date'],
    });
    const parsed = parseMessage(msg.data, accountId);
    if (parsed) {
      emails.push(parsed);
    }
  }

  console.log(`[Fetcher] Parsed ${emails.length} unread emails from Gmail`);

  const { inserted, skipped } = storeEmails(db, accountId, emails);
  console.log(`[Fetcher] Stored: ${inserted} new, ${skipped} unchanged`);

  const markedRead = markReadOutsideFetch(db, accountId, unreadExternalIds);
  if (markedRead > 0) {
    console.log(`[Fetcher] Marked ${markedRead} emails as read (no longer in Gmail unread)`);
  }

  return {
    accountId,
    fetched: emails.length,
    inserted,
    skipped,
  };
}

export async function fetchEmailsForAllAccounts(
  db: Database.Database,
  maxResults: number = 50
): Promise<FetchResult[]> {
  const accounts = db
    .prepare("SELECT id FROM accounts WHERE type = 'gmail'")
    .all() as { id: string }[];

  const results: FetchResult[] = [];
  for (const account of accounts) {
    try {
      const result = await fetchEmailsForAccount(db, account.id, maxResults);
      results.push(result);
    } catch (err) {
      console.error(`Failed to fetch emails for account ${account.id}:`, err);
      results.push({
        accountId: account.id,
        fetched: 0,
        inserted: 0,
        skipped: 0,
      });
    }
  }

  return results;
}

function markReadOutsideFetch(
  db: Database.Database,
  accountId: string,
  unreadExternalIds: Set<string>
): number {
  if (unreadExternalIds.size === 0) {
    const result = db
      .prepare(
        "UPDATE emails SET is_read = 1 WHERE account_id = ? AND is_read = 0"
      )
      .run(accountId);
    return result.changes;
  }

  const placeholders = Array.from(unreadExternalIds)
    .map(() => '?')
    .join(',');
  const result = db
    .prepare(
      `UPDATE emails SET is_read = 1
       WHERE account_id = ? AND is_read = 0
         AND external_id NOT IN (${placeholders})`
    )
    .run(accountId, ...unreadExternalIds);
  return result.changes;
}
