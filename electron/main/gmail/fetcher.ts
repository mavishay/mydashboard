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

export interface EmailAttachment {
  filename: string;
  mimeType: string;
  size: number;
}

export interface EmailDetail {
  id: string;
  accountId: string;
  externalId: string;
  subject: string | null;
  fromAddress: string | null;
  receivedAt: string | null;
  bodyHtml: string | null;
  snippet: string | null;
  attachments: EmailAttachment[];
  accountIndex: number;
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf-8');
}

function extractHtmlBody(payload: gmail_v1.Schema$MessagePart | undefined): string | null {
  if (!payload) return null;

  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      const result = extractHtmlBody(part);
      if (result) return result;
    }
  }

  return null;
}

function extractAttachments(payload: gmail_v1.Schema$MessagePart | undefined): EmailAttachment[] {
  if (!payload) return [];

  const attachments: EmailAttachment[] = [];

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.filename && part.body?.size) {
        attachments.push({
          filename: part.filename,
          mimeType: part.mimeType ?? 'application/octet-stream',
          size: part.body.size,
        });
      }
      attachments.push(...extractAttachments(part));
    }
  }

  return attachments;
}

export async function getEmailDetail(
  db: Database.Database,
  emailId: string
): Promise<EmailDetail | null> {
  const email = db
    .prepare(
      `SELECT id, account_id, external_id, subject, from_address, received_at, body_html, snippet, attachments
       FROM emails WHERE id = ?`
    )
    .get(emailId) as {
    id: string;
    account_id: string;
    external_id: string;
    subject: string | null;
    from_address: string | null;
    received_at: string | null;
    body_html: string | null;
    snippet: string | null;
    attachments: string | null;
  } | undefined;

  if (!email) return null;

  // Get account index for Gmail URL
  const account = db
    .prepare('SELECT id FROM accounts WHERE id = ?')
    .get(email.account_id) as { id: string } | undefined;
  
  const accountIndex = account
    ? (db.prepare('SELECT COUNT(*) as count FROM accounts WHERE id <= ?').get(email.account_id) as { count: number }).count - 1
    : 0;

  // Parse cached attachments
  const cachedAttachments: EmailAttachment[] = email.attachments
    ? JSON.parse(email.attachments)
    : [];

  if (email.body_html !== null) {
    return {
      id: email.id,
      accountId: email.account_id,
      externalId: email.external_id,
      subject: email.subject,
      fromAddress: email.from_address,
      receivedAt: email.received_at,
      bodyHtml: email.body_html,
      snippet: email.snippet,
      attachments: cachedAttachments,
      accountIndex,
    };
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials not configured');
  }

  const tokens = retrieveTokens(db, email.account_id);
  if (!tokens) {
    throw new Error('No tokens found for account');
  }

  const oauth2Client = createOAuth2Client(clientId, clientSecret, tokens);
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  let message: gmail_v1.Schema$Message;
  try {
    const response = await gmail.users.messages.get({
      userId: 'me',
      id: email.external_id,
      format: 'full',
    });
    message = response.data;
  } catch (err) {
    console.error(`[Fetcher] Failed to fetch email detail for ${email.external_id}:`, err);
    throw err;
  }

  const bodyHtml = extractHtmlBody(message.payload);
  const attachments = extractAttachments(message.payload);

  // Cache body and attachments
  if (bodyHtml !== null || attachments.length > 0) {
    db.prepare('UPDATE emails SET body_html = ?, attachments = ? WHERE id = ?')
      .run(bodyHtml, JSON.stringify(attachments), email.id);
  }

  return {
    id: email.id,
    accountId: email.account_id,
    externalId: email.external_id,
    subject: email.subject,
    fromAddress: email.from_address,
    receivedAt: email.received_at,
    bodyHtml,
    snippet: email.snippet,
    attachments,
    accountIndex,
  };
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

export interface MarkAsReadResult {
  success: boolean;
}

export async function markEmailAsRead(
  db: Database.Database,
  emailId: string,
  externalId: string,
  accountId: string
): Promise<MarkAsReadResult> {
  if (!emailId || !externalId || !accountId) {
    throw new Error('emailId, externalId, and accountId are required');
  }

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
  const gmailApi = google.gmail({ version: 'v1', auth: oauth2Client });

  let retries = 0;
  const maxRetries = 3;

  while (true) {
    try {
      await gmailApi.users.messages.modify({
        userId: 'me',
        id: externalId,
        requestBody: { removeLabelIds: ['UNREAD'] },
      });

      db.prepare('UPDATE emails SET is_read = 1 WHERE id = ?').run(emailId);
      return { success: true };
    } catch (err: unknown) {
      const error = err as { code?: number; message?: string };

      if (error.code === 401) {
        throw new Error('Gmail authentication expired. Please reconnect your account.', { cause: err });
      }

      if (error.code === 404) {
        db.prepare('UPDATE emails SET is_read = 1 WHERE id = ?').run(emailId);
        return { success: true };
      }

      if (error.code === 429 && retries < maxRetries) {
        retries++;
        await new Promise((resolve) => setTimeout(resolve, retries * 1000));
        continue;
      }

      if (error.code === 403 && error.message?.includes('insufficient permissions')) {
        throw new Error('Gmail permission needed. Please reconnect your account in Settings.', { cause: err });
      }

      if (error.code === 403) {
        throw new Error('Gmail API quota exceeded', { cause: err });
      }

      throw new Error(`Failed to mark email as read: ${error.message ?? 'Unknown error'}`, { cause: err });
    }
  }
}

export interface MarkAsReadBatchResult {
  success: boolean;
  marked: number;
  failed: string[];
}

export async function markEmailsAsReadBatch(
  db: Database.Database,
  emails: Array<{ emailId: string; externalId: string; accountId: string }>
): Promise<MarkAsReadBatchResult> {
  const BATCH_CHUNK_SIZE = 10;
  const BATCH_DELAY_MS = 1000;
  const MAX_RETRIES = 3;

  let marked = 0;
  const failed: string[] = [];

  for (let i = 0; i < emails.length; i += BATCH_CHUNK_SIZE) {
    const chunk = emails.slice(i, i + BATCH_CHUNK_SIZE);

    const results = await Promise.allSettled(
      chunk.map(async (email) => {
        let retries = 0;
        while (true) {
          try {
            await markEmailAsRead(db, email.emailId, email.externalId, email.accountId);
            return email.emailId;
          } catch (err: unknown) {
            const error = err as { code?: number };
            if (error.code === 429 && retries < MAX_RETRIES) {
              retries++;
              await new Promise((resolve) => setTimeout(resolve, 2000));
              continue;
            }
            throw err;
          }
        }
      })
    );

    for (let j = 0; j < results.length; j++) {
      if (results[j].status === 'fulfilled') {
        marked++;
      } else {
        failed.push(chunk[j].emailId);
      }
    }

    if (i + BATCH_CHUNK_SIZE < emails.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  return { success: true, marked, failed };
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
