import type { IpcMain } from 'electron';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import {
  classifyEmail,
  classifyUnclassifiedEmails,
  getClassifiedEmails,
} from '../ai/classifier';
import { fetchEmailsForAccount, fetchEmailsForAllAccounts } from '../gmail/fetcher';
import type { NotificationService } from '../services/notification-service';

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

function getEmailForNotification(
  db: Database.Database,
  emailId: string,
): { subject: string; sender: string } {
  const email = db
    .prepare('SELECT subject, from_address FROM emails WHERE id = ?')
    .get(emailId) as { subject: string | null; from_address: string | null } | undefined;
  return {
    subject: email?.subject ?? '(no subject)',
    sender: email?.from_address ?? 'unknown',
  };
}

export function registerClassificationHandlers(
  ipcMain: IpcMain,
  db: Database.Database,
  notificationService?: NotificationService
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

      if (result.classification === 'urgent') {
        if (notificationService) {
          const { subject, sender } = getEmailForNotification(db, parsed.data.emailId);
          notificationService.send({
            emailId: parsed.data.emailId,
            subject,
            sender,
            classification: 'urgent',
          });
        } else {
          console.warn('[classification] notificationService not available — urgent email notification skipped');
        }
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

      const result = await classifyUnclassifiedEmails(
        db,
        parsed.data.accountId,
        parsed.data.limit
      );

      if (notificationService) {
        for (const classified of result.classified) {
          if (classified.classification === 'urgent') {
            const { subject, sender } = getEmailForNotification(db, classified.emailId);
            notificationService.send({
              emailId: classified.emailId,
              subject,
              sender,
              classification: 'urgent',
            });
          }
        }
      } else if (result.classified.some(c => c.classification === 'urgent')) {
        console.warn('[classification] notificationService not available — urgent email notifications skipped');
      }

      return {
        classified: result.classified.length,
        errors: result.errors,
        results: result.classified,
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
