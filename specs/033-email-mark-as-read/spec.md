# Feature Specification: Email Mark as Read (Issue #33)

**Issue**: #33
**Wave**: 4-improvements
**Status**: Draft

---

## Summary

Allow users to mark emails as read from the dashboard, which syncs to Gmail inbox by removing the UNREAD label via `messages.modify`. Supports single mark, batch mark via checkboxes, and optimistic UI updates with error handling.

---

## Source Reference Analysis

| File | Line(s) | Pattern to Adopt | Notes |
|------|---------|-------------------|-------|
| `electron/main/gmail/fetcher.ts` | 18-30 | `createOAuth2Client` + `retrieveTokens` pattern | Reuse for Gmail API modify calls |
| `electron/main/gmail/fetcher.ts` | 98 | `labelIds.includes('UNREAD')` → `isRead` mapping | Existing read-status logic in upsert |
| `electron/main/ipc/gmail-handlers.ts` | 54-58 | `registerGmailHandlers(ipcMain, db, getWindow)` | Add new handler in same file |
| `electron/main/ipc/gmail-handlers.ts` | 24-28 | `GOOGLE_SCOPES` array | Must add `gmail.modify` scope |
| `electron/preload/index.ts` | 3-89 | `ALLOWED_INVOKE` Set + `gatedInvoke` | Add `gmail:markAsRead` channel |
| `electron/preload/index.ts` | 128-153 | `gmail` API object on `electronAPI` | Add `markAsRead` method |
| `src/components/EmailList.tsx` | 97-704 | `EmailList` component, email cards | Add mark-as-read button + batch checkboxes |
| `electron/main/ai/classifier.ts` | 328 | `is_read = 0` filter in `getClassifiedEmails` | Emails disappear from list when marked read |
| `electron/main/auth/gmail.ts` | 70-96 | `retrieveTokens` returns decrypted tokens | Reuse for API auth |
| `electron/main/db/migrations/018-email-cleanup.sql` | 2 | `is_read` column exists on emails table | No migration needed |

---

## Requirements

### REQ-033a: Single Email Mark as Read

**User Story**: As a user, I can mark a single email as read via a button on the email row, which syncs to my Gmail inbox.

**Acceptance Criteria**:
- Each unread email row shows a "Mark Read" button (visible on hover or always visible)
- Clicking the button calls `gmail:markAsRead` with the email's `externalId` and `accountId`
- Gmail API removes `UNREAD` label via `messages.modify`
- Local `emails.is_read` is set to `1`
- Email disappears from the unread list (filtered by `is_read = 0`)
- Optimistic UI: email visually transitions (bold→normal) immediately, reverts on error
- Error toast shown if Gmail API call fails (token expired, network error)

**Measurable SC**: Mark-as-read latency < 500ms (optimistic update visible within 100ms).

### REQ-033b: Batch Mark as Read

**User Story**: As a user, I can select multiple emails via checkboxes and mark them all as read with a single toolbar button.

**Acceptance Criteria**:
- Checkboxes appear on each email row (only when emails are present)
- A toolbar above the email list shows "Mark X as Read" button when 1+ emails are selected
- Clicking the button calls `gmail:markAsReadBatch` with array of `{ externalId, accountId }`
- Each email's Gmail UNREAD label is removed via `messages.modify`
- Rate limiting: max 10 Gmail API calls per second (batch processes in chunks of 10 with 1s delay between chunks)
- All selected emails are marked read in local DB (`is_read = 1`)
- Optimistic UI: all selected emails transition immediately
- Progress indicator during batch (e.g., "Marking 3/10...")
- Error handling: if individual email fails, show toast for that email; continue with others
- After batch completes, checkboxes are cleared

**Measurable SC**: Batch of 10 emails completes within 2 seconds.

### REQ-033c: Visual Read State

**User Story**: As a user, I can visually distinguish read vs unread emails.

**Acceptance Criteria**:
- Unread emails: bold subject text, blue dot indicator (●) next to sender name
- Read emails: normal weight subject, no blue dot
- Transition from unread→read animates smoothly (CSS transition on font-weight and opacity)
- Blue dot is `#1976d2` (primary blue), 6px circle, positioned left of sender name

**Measurable SC**: Visual transition completes within 300ms.

---

## Gmail API Integration

### Endpoint

```
POST https://gmail.googleapis.com/gmail/v1/users/me/messages/{id}/modify
```

### Required Scope

Add `https://www.googleapis.com/auth/gmail.modify` to `GOOGLE_SCOPES` in `electron/main/ipc/gmail-handlers.ts:24`.

### Request Body

```json
{
  "removeLabelIds": ["UNREAD"]
}
```

### Error Handling

| Error | HTTP Status | User Action |
|-------|------------|-------------|
| Token expired | 401 | Auto-refresh token (existing pattern), retry once. If still fails, show "Session expired, please reconnect" toast |
| Network error | 0/timeout | Show "Network error, please check connection" toast |
| Rate limit (429) | 429 | Back off 1s, retry. Max 3 retries |
| Message not found | 404 | Mark as read locally only (email may have been deleted from Gmail) |
| Quota exceeded | 403 | Show "Gmail API quota exceeded, try again later" toast |

### Token Refresh

Reuse existing pattern from `electron/main/gmail/fetcher.ts:18-30`:
1. `createOAuth2Client(clientId, clientSecret, tokens)`
2. `google.gmail({ version: 'v1', auth: oauth2Client })`
3. Call `gmail.users.messages.modify()`

---

## IPC Channel Specification

### New Channels

| Channel | Direction | Payload | Response |
|---------|-----------|---------|----------|
| `gmail:markAsRead` | invoke | `{ emailId: string; externalId: string; accountId: string }` | `{ success: boolean }` |
| `gmail:markAsReadBatch` | invoke | `{ emails: Array<{ emailId: string; externalId: string; accountId: string }> }` | `{ success: boolean; marked: number; failed: string[] }` |

### Zod Validation Schemas

```typescript
const MarkAsReadSchema = z.object({
  emailId: z.string().min(1),
  externalId: z.string().min(1),
  accountId: z.string().min(1),
});

const MarkAsReadBatchSchema = z.object({
  emails: z.array(MarkAsReadSchema).min(1).max(50),
});
```

### Response Types

```typescript
interface MarkAsReadResult {
  success: boolean;
}

interface MarkAsReadBatchResult {
  success: boolean;
  marked: number;
  failed: string[]; // emailIds that failed
}
```

---

## File Changes

### Modified Files

| File | Changes |
|------|---------|
| `electron/main/ipc/gmail-handlers.ts` | Add `gmail.modify` to `GOOGLE_SCOPES`. Add `MarkAsReadSchema` and `MarkAsReadBatchSchema` Zod schemas. Add `gmail:markAsRead` and `gmail:markAsReadBatch` IPC handlers |
| `electron/main/gmail/fetcher.ts` | Export `markEmailAsRead(db, emailId, externalId, accountId)` function for local DB update. Export `markEmailsAsReadBatch(db, emails)` for batch local update |
| `electron/preload/index.ts` | Add `gmail:markAsRead` and `gmail:markAsReadBatch` to `ALLOWED_INVOKE`. Add `markAsRead` and `markAsReadBatch` methods to `gmail` API object |
| `src/components/EmailList.tsx` | Add `isRead` field to `Email` interface. Add checkboxes to email rows. Add "Mark Read" button per row. Add batch toolbar with "Mark as Read" button. Add blue dot indicator for unread. Add bold/normal font-weight transition |

### New Files

| File | Purpose |
|------|---------|
| `electron/main/gmail/mark-read.ts` | Gmail API `messages.modify` calls and local DB update logic (extracted from fetcher for clarity) |
| `src/components/email/MarkReadButton.tsx` | Reusable mark-as-read button component |
| `src/components/email/BatchToolbar.tsx` | Batch action toolbar (appears when emails selected) |

---

## Database Changes

### Local Update

```sql
UPDATE emails SET is_read = 1 WHERE id = ?
```

- Run after successful Gmail API call (not before, to allow rollback on error)
- For batch: wrap in transaction

### No Migration Needed

`is_read` column already exists (migration 018). No schema changes required.

---

## UI Design

### Email Row (Unread)

```
┌─────────────────────────────────────────┐
│ ☐ ● John Doe              Urgent  2m ago│
│   Meeting tomorrow                      │
│   Hey, can we reschedule...    [Mark Read]│
└─────────────────────────────────────────┘
```

- `☐` = checkbox (unchecked)
- `●` = blue dot (unread indicator)
- Subject text: `font-weight: 700` (bold)
- `[Mark Read]` button: small, secondary style

### Email Row (Read, after marking)

```
┌─────────────────────────────────────────┐
│ ☐   John Doe              Urgent  2m ago│
│   Meeting tomorrow                      │
│   Hey, can we reschedule...    [Mark Read]│
└─────────────────────────────────────────┘
```

- Blue dot removed
- Subject text: `font-weight: 500` (normal)

### Batch Toolbar (when 1+ selected)

```
┌─────────────────────────────────────────┐
│ ☑ 3 selected    [Mark as Read] [Clear]  │
└─────────────────────────────────────────┘
```

- Appears above email list when checkboxes are checked
- Shows count of selected emails
- "Mark as Read" button triggers batch operation
- "Clear" deselects all checkboxes

### Toast Notifications

```
Success: "Marked 3 emails as read"
Partial: "Marked 7 of 10 emails as read. 3 failed."
Error:   "Failed to mark email as read: Token expired. Please reconnect Gmail."
```

---

## Rate Limiting Strategy

For batch operations (`gmail:markAsReadBatch`):

1. Chunk emails into groups of 10
2. Process each chunk sequentially
3. Wait 1 second between chunks
4. If any call in a chunk returns 429, wait 2 seconds before retrying that chunk
5. Max 3 retries per email before marking as failed

```typescript
const BATCH_CHUNK_SIZE = 10;
const BATCH_DELAY_MS = 1000;
const MAX_RETRIES = 3;
```

---

## Testing Strategy

### Unit Tests (Vitest 3)

| Test File | Tests |
|-----------|-------|
| `electron/main/gmail/mark-read.test.ts` | `markEmailAsRead` updates DB correctly; handles missing email; handles missing tokens |
| `electron/main/ipc/gmail-handlers.test.ts` | `gmail:markAsRead` validates Zod schema; calls Gmail API; handles errors; `gmail:markAsReadBatch` processes chunks; rate limits correctly |
| `src/components/EmailList.test.tsx` | Mark-read button renders for unread emails; checkbox selection works; batch toolbar appears; optimistic UI updates; error reverts |

### Integration Tests

- Mark single email as read → verify DB `is_read = 1` → verify Gmail API called with `removeLabelIds: ['UNREAD']`
- Batch mark 15 emails → verify chunking (2 API calls with delay) → verify all marked in DB
- Mark email when token expired → verify token refresh → verify retry
- Mark email when network error → verify toast shown → verify DB not updated

### Manual QA

- Connect Gmail account, fetch unread emails
- Mark one email as read → verify it disappears from list → verify in Gmail inbox
- Select 5 emails, batch mark → verify all disappear → verify in Gmail inbox
- Disconnect network, try mark → verify error toast
- Check rate limiting: mark 20 emails → verify no 429 errors

---

## Non-Goals

- **Mark as unread**: Only mark-as-read is implemented. Mark-as-unread is a future enhancement.
- **Keyboard shortcuts**: No keyboard shortcut for mark-as-read in this iteration.
- **Push notifications for read status**: No real-time sync for read status changes.
- **Change fetch/sync behavior**: Existing `getClassifiedEmails` already filters `is_read = 0`. Read emails naturally disappear on next fetch.

---

## Dependencies

- **Blocked by**: None
- **Blocks**: None
- **Related**: Issue #28 (Unread-only fetch + delete read after 3 days) — mark-as-read feeds into the cleanup pipeline
- **Related**: Issue #27 (Automated email fetch & classify cron job) — cron job respects `is_read = 0` filter

---

## Labels

`enhancement`, `wave: 4-improvements`
