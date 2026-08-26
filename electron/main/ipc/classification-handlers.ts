import type { IpcMain } from 'electron';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import {
  classifyEmail,
  classifyUnclassifiedEmails,
  getClassifiedEmails,
  type Classification,
} from '../ai/classifier';
import { fetchEmailsForAccount, fetchEmailsForAllAccounts } from '../gmail/fetcher';

const ClassifyEmailSchema = z.object({
  emailId: z.string().min(1),
});

const ClassifyAccountSchema = z.object({
  accountId: z.string().min(1),
  limit: z.number().int().min(1).max(100).optional(),
});

const FetchEmailsSchema = z.object({
  accountId: z.string().min(1),
  maxResults: z.number().int().min(1).max(100).optional(),
});

const GetEmailsSchema = z.object({
  accountId: z.string().min(1).optional(),
  classification: z.enum(['urgent', 'action', 'fyi', 'noise']).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
});

type ClassifyEmailPayload = z.infer<typeof ClassifyEmailSchema>;
type ClassifyAccountPayload = z.infer<typeof ClassifyAccountSchema>;
type FetchEmailsPayload = z.infer<typeof FetchEmailsSchema>;
type GetEmailsPayload = z.infer<typeof GetEmailsSchema>;

export interface EmailResponse {
  id: string;
  accountId: string;
  subject: string | null;
  snippet: string | null;
  fromAddress: string | null;
  receivedAt: string | null;
  classification: Classification;
}

export function registerClassificationHandlers(
  ipcMain: IpcMain,
  db: Database.Database
): void {
  ipcMain.handle(
    'classification:classify',
    async (_event, payload: ClassifyEmailPayload) => {
      const parsed = ClassifyEmailSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(`Invalid payload: ${parsed.error.message}`);
      }

      const result = await classifyEmail(db, parsed.data.emailId);
      if (!result) {
        throw new Error('Email not found');
      }

      return result;
    }
  );

  ipcMain.handle(
    'classification:classifyAccount',
    async (_event, payload: ClassifyAccountPayload) => {
      const parsed = ClassifyAccountSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(`Invalid payload: ${parsed.error.message}`);
      }

      const results = await classifyUnclassifiedEmails(
        db,
        parsed.data.accountId,
        parsed.data.limit
      );

      return {
        classified: results.length,
        results,
      };
    }
  );

  ipcMain.handle(
    'classification:fetchEmails',
    async (_event, payload: FetchEmailsPayload) => {
      const parsed = FetchEmailsSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(`Invalid payload: ${parsed.error.message}`);
      }

      const result = await fetchEmailsForAccount(
        db,
        parsed.data.accountId,
        parsed.data.maxResults
      );

      return result;
    }
  );

  ipcMain.handle(
    'classification:fetchEmailsAll',
    async () => {
      const results = await fetchEmailsForAllAccounts(db);
      return results;
    }
  );

  ipcMain.handle(
    'classification:getEmails',
    async (_event, payload: GetEmailsPayload) => {
      const parsed = GetEmailsSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(`Invalid payload: ${parsed.error.message}`);
      }

      const emails = getClassifiedEmails(db, {
        accountId: parsed.data.accountId,
        classification: parsed.data.classification,
        limit: parsed.data.limit,
        offset: parsed.data.offset,
      });

      return emails;
    }
  );
}
