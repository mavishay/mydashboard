# Implementation Plan: Email Mark as Read (Issue #33)

## Source Reference Analysis

### Existing Patterns to Follow

| Pattern | Source File | Key Details |
|---------|------------|-------------|
| Gmail API auth | `electron/main/gmail/fetcher.ts:18-30` | `createOAuth2Client` + `retrieveTokens` pattern |
| IPC handler registration | `electron/main/ipc/gmail-handlers.ts:54-58` | `registerGmailHandlers(ipcMain, db, getWindow)` |
| Zod validation | `electron/main/ipc/gmail-handlers.ts:30-45` | Schema per handler, `safeParse` with error throw |
| Preload allowlist | `electron/preload/index.ts:3-89` | `ALLOWED_INVOKE` Set + `gatedInvoke` |
| Preload API exposure | `electron/preload/index.ts:128-153` | Typed methods on `electronAPI` object |
| Email row UI | `src/components/EmailList.tsx:568-626` | Inline styles, card layout, hover interactions |
| Read status logic | `electron/main/gmail/fetcher.ts:98` | `labelIds.includes('UNREAD') ? 0 : 1` |
| DB schema | `electron/main/db/migrations/018-email-cleanup.sql` | `is_read` column already exists |
| Test patterns | `tests/main/gmail/fetcher.test.ts` | `vi.mock('electron')`, test DB lifecycle |

### Files to Modify

| File | Changes |
|------|---------|
| `electron/main/gmail/fetcher.ts` | Add `markEmailAsRead` and `markEmailsAsReadBatch` functions |
| `electron/main/ipc/gmail-handlers.ts` | Add `gmail.modify` scope, Zod schemas, IPC handlers |
| `electron/preload/index.ts` | Add channels to `ALLOWED_INVOKE`, add API methods |
| `src/components/EmailList.tsx` | Add `isRead` field, checkboxes, mark-read button, batch toolbar, blue dot |

### New Files

| File | Purpose |
|------|---------|
| `tests/main/gmail/mark-read.test.ts` | Unit tests for mark-read functions |
| `tests/main/ipc/gmail-mark-read-handlers.test.ts` | IPC handler tests |

---

## Phase 1: Gmail API Mark-Read Function (Backend Core)

**Goal**: Create the core function that calls Gmail API `messages.modify` to remove UNREAD label.

### Task 1.1: Add `markEmailAsRead` to `electron/main/gmail/fetcher.ts`

Add the following function after the existing `markReadOutsideFetch` function (~line 415):

```typescript
export async function markEmailAsRead(
  db: Database.Database,
  emailId: string,
  externalId: string,
  accountId: string
): Promise<{ success: boolean }> {
```

**Implementation details**:
1. Validate inputs (emailId, externalId, accountId non-empty)
2. Get `clientId` and `clientSecret` from `process.env`
3. Call `retrieveTokens(db, accountId)` — throw if null
4. Create OAuth2 client via `createOAuth2Client(clientId, clientSecret, tokens)`
5. Create Gmail API instance: `google.gmail({ version: 'v1', auth: oauth2Client })`
6. Call `gmail.users.messages.modify({ userId: 'me', id: externalId, requestBody: { removeLabelIds: ['UNREAD'] } })`
7. On success: `UPDATE emails SET is_read = 1 WHERE id = ?` (emailId)
8. Return `{ success: true }`
9. Error handling:
   - 401: Auto-refresh (googleapis handles this), retry once; if still fails, throw "Session expired"
   - 404: Mark locally only (email may be deleted from Gmail), return success
   - 429: Back off 1s, retry up to 3 times
   - 403: Throw "Gmail API quota exceeded"
   - Network error: Throw with message for caller to handle

**Dependencies**: None — pure backend function.

### Task 1.2: Add `markEmailsAsReadBatch` to `electron/main/gmail/fetcher.ts`

```typescript
export async function markEmailsAsReadBatch(
  db: Database.Database,
  emails: Array<{ emailId: string; externalId: string; accountId: string }>
): Promise<{ success: boolean; marked: number; failed: string[] }> {
```

**Implementation details**:
1. Constants: `BATCH_CHUNK_SIZE = 10`, `BATCH_DELAY_MS = 1000`, `MAX_RETRIES = 3`
2. Process emails in chunks of 10
3. For each chunk, call `markEmailAsRead` for each email (parallel within chunk)
4. Wait 1s between chunks
5. Track failed emailIds
6. For 429 errors, wait 2s and retry up to 3 times per email
7. Wrap all DB updates in a transaction after Gmail API calls succeed
8. Return `{ success: true, marked: count, failed: failedIds }`

**Dependencies**: Task 1.1

---

## Phase 2: IPC Handlers (Backend → Frontend Bridge)

**Goal**: Register IPC channels that the renderer can invoke.

### Task 2.1: Add `gmail.modify` scope to `GOOGLE_SCOPES`

In `electron/main/ipc/gmail-handlers.ts:24-28`, add:

```typescript
'https://www.googleapis.com/auth/gmail.modify',
```

**Note**: Existing users will need to re-authorize to get the new scope. This should be documented but is acceptable for this feature.

### Task 2.2: Add Zod schemas

Add after existing schemas (~line 45):

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

### Task 2.3: Add `gmail:markAsRead` IPC handler

```typescript
ipcMain.handle(
  'gmail:markAsRead',
  async (_event, rawPayload: { emailId: string; externalId: string; accountId: string }) => {
    const parsed = MarkAsReadSchema.safeParse(rawPayload);
    if (!parsed.success) {
      throw new Error(`Invalid payload: ${parsed.error.message}`);
    }
    // Import from fetcher
    const result = await markEmailAsRead(
      db,
      parsed.data.emailId,
      parsed.data.externalId,
      parsed.data.accountId
    );
    return result;
  }
);
```

### Task 2.4: Add `gmail:markAsReadBatch` IPC handler

```typescript
ipcMain.handle(
  'gmail:markAsReadBatch',
  async (_event, rawPayload: { emails: Array<{ emailId: string; externalId: string; accountId: string }> }) => {
    const parsed = MarkAsReadBatchSchema.safeParse(rawPayload);
    if (!parsed.success) {
      throw new Error(`Invalid payload: ${parsed.error.message}`);
    }
    const result = await markEmailsAsReadBatch(db, parsed.data.emails);
    return result;
  }
);
```

**Dependencies**: Phase 1

---

## Phase 3: Preload API Exposure (Frontend Bridge)

**Goal**: Expose new IPC channels to the renderer via contextBridge.

### Task 3.1: Add channels to `ALLOWED_INVOKE`

In `electron/preload/index.ts:3-89`, add to the Set:

```typescript
'gmail:markAsRead',
'gmail:markAsReadBatch',
```

### Task 3.2: Add API methods to `gmail` object

In `electron/preload/index.ts:128-153`, add after `getEmailDetail`:

```typescript
markAsRead: (data: { emailId: string; externalId: string; accountId: string }) =>
  gatedInvoke('gmail:markAsRead', data) as Promise<{ success: boolean }>,
markAsReadBatch: (data: { emails: Array<{ emailId: string; externalId: string; accountId: string }> }) =>
  gatedInvoke('gmail:markAsReadBatch', data) as Promise<{ success: boolean; marked: number; failed: string[] }>,
```

**Dependencies**: Phase 2

---

## Phase 4: UI Components (Frontend)

**Goal**: Add visual indicators and interaction for mark-as-read.

### Task 4.1: Add `isRead` field to `Email` interface

In `src/components/EmailList.tsx:21-29`, add:

```typescript
interface Email {
  id: string;
  accountId: string;
  externalId: string;  // Add this
  subject: string | null;
  snippet: string | null;
  fromAddress: string | null;
  receivedAt: string | null;
  classification: Classification;
  isRead: number;  // Add this (0 or 1)
}
```

**Note**: Need to check if `externalId` is returned from `classification:getEmails`. If not, the backend query in `classifier.ts` needs to include it.

### Task 4.2: Update `classifier.ts` to include `externalId` and `is_read`

In `electron/main/ai/classifier.ts`, the `getClassifiedEmails` query needs to SELECT `external_id` and `is_read`:

```sql
SELECT id, account_id, external_id, subject, snippet, from_address, received_at, classification, is_read
FROM emails WHERE is_read = 0 ...
```

And add these fields to the return type/interface.

### Task 4.3: Add blue dot indicator for unread emails

In the email row renderer (~line 587-591), add a blue dot before the sender name when unread:

```tsx
{!email.isRead && (
  <span style={{
    display: 'inline-block',
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: '#1976d2',
    flexShrink: 0,
  }} />
)}
```

### Task 4.4: Add bold/normal font-weight transition

For the subject line (~line 593), use:

```tsx
<div style={{
  fontWeight: email.isRead ? 500 : 700,
  fontSize: '0.875rem',
  marginBottom: '0.25rem',
  transition: 'font-weight 300ms ease',
}}>
```

### Task 4.5: Add "Mark Read" button per email row

Add a button below the "Convert to Task" button (~line 604-622), only for unread emails:

```tsx
{!email.isRead && (
  <button
    onClick={(e) => {
      e.stopPropagation();
      handleMarkAsRead(email);
    }}
    disabled={markingIds.has(email.id)}
    style={{
      padding: '0.25rem 0.5rem',
      borderRadius: '4px',
      border: '1px solid #757575',
      background: markingIds.has(email.id) ? '#f5f5f5' : 'transparent',
      color: '#757575',
      cursor: markingIds.has(email.id) ? 'not-allowed' : 'pointer',
      fontSize: '0.75rem',
      fontWeight: 600,
    }}
  >
    {markingIds.has(email.id) ? 'Marking...' : 'Mark Read'}
  </button>
)}
```

### Task 4.6: Add checkbox selection and batch toolbar

**State additions**:
```typescript
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
const [markingIds, setMarkingIds] = useState<Set<string>>(new Set());
const [batchProgress, setBatchProgress] = useState<string | null>(null);
```

**Checkbox per email row** (add before sender name, ~line 587):
```tsx
<input
  type="checkbox"
  checked={selectedIds.has(email.id)}
  onChange={(e) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(email.id)) next.delete(email.id);
      else next.add(email.id);
      return next;
    });
  }}
  onClick={(e) => e.stopPropagation()}
  style={{ flexShrink: 0, cursor: 'pointer' }}
/>
```

**Batch toolbar** (add above email list, after SortGroupControls):
```tsx
{selectedIds.size > 0 && (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.5rem 0.75rem',
    marginBottom: '0.75rem',
    background: '#e3f2fd',
    borderRadius: '8px',
    fontSize: '0.875rem',
  }}>
    <span style={{ fontWeight: 600 }}>{selectedIds.size} selected</span>
    <button
      onClick={handleBatchMarkAsRead}
      disabled={markingIds.size > 0}
      style={{
        padding: '0.375rem 0.75rem',
        borderRadius: '4px',
        border: 'none',
        background: '#1976d2',
        color: '#fff',
        cursor: markingIds.size > 0 ? 'not-allowed' : 'pointer',
        fontSize: '0.8125rem',
        fontWeight: 600,
      }}
    >
      {batchProgress ?? 'Mark as Read'}
    </button>
    <button
      onClick={() => setSelectedIds(new Set())}
      style={{
        padding: '0.375rem 0.75rem',
        borderRadius: '4px',
        border: '1px solid #ccc',
        background: '#fff',
        cursor: 'pointer',
        fontSize: '0.8125rem',
      }}
    >
      Clear
    </button>
  </div>
)}
```

### Task 4.7: Implement `handleMarkAsRead` (single email)

```typescript
const handleMarkAsRead = useCallback(async (email: Email) => {
  setMarkingIds(prev => new Set(prev).add(email.id));
  try {
    await window.electronAPI.gmail.markAsRead({
      emailId: email.id,
      externalId: email.externalId,
      accountId: email.accountId,
    });
    // Optimistic: update local state
    setEmails(prev => prev.map(e =>
      e.id === email.id ? { ...e, isRead: 1 } : e
    ));
    // Remove from list after short delay (list filters is_read = 0)
    setTimeout(() => {
      setEmails(prev => prev.filter(e => e.id !== email.id));
      onCountChange?.(prev => prev - 1);
    }, 500);
  } catch (err) {
    setError(`Failed to mark as read: ${err instanceof Error ? err.message : 'Unknown error'}`);
  } finally {
    setMarkingIds(prev => {
      const next = new Set(prev);
      next.delete(email.id);
      return next;
    });
  }
}, [onCountChange]);
```

### Task 4.8: Implement `handleBatchMarkAsRead`

```typescript
const handleBatchMarkAsRead = useCallback(async () => {
  const emailsToMark = emails.filter(e => selectedIds.has(e.id));
  if (emailsToMark.length === 0) return;

  setBatchProgress(`Marking 0/${emailsToMark.length}...`);

  // Optimistic: update all selected
  setEmails(prev => prev.map(e =>
    selectedIds.has(e.id) ? { ...e, isRead: 1 } : e
  ));

  try {
    const result = await window.electronAPI.gmail.markAsReadBatch({
      emails: emailsToMark.map(e => ({
        emailId: e.id,
        externalId: e.externalId,
        accountId: e.accountId,
      })),
    });

    if (result.failed.length > 0) {
      setError(`Marked ${result.marked} emails as read. ${result.failed.length} failed.`);
    }

    // Remove marked emails from list
    setTimeout(() => {
      setEmails(prev => prev.filter(e => !selectedIds.has(e.id)));
      onCountChange?.(prev => prev - result.marked);
    }, 500);
  } catch (err) {
    setError(`Batch mark as read failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    // Revert optimistic update
    setEmails(prev => prev.map(e =>
      selectedIds.has(e.id) ? { ...e, isRead: 0 } : e
    ));
  } finally {
    setSelectedIds(new Set());
    setBatchProgress(null);
    setMarkingIds(new Set());
  }
}, [emails, selectedIds, onCountChange]);
```

**Dependencies**: Phase 3

---

## Phase 5: Batch Operations with Rate Limiting

This is already covered in Phase 1 Task 1.2 (rate limiting in `markEmailsAsReadBatch`) and Phase 4 Task 4.8 (UI progress).

**Key implementation details**:
- Chunk size: 10 emails per batch
- Delay between chunks: 1000ms
- 429 retry: 2000ms backoff, max 3 retries per email
- Progress updates via `setBatchProgress`

**Dependencies**: Phases 1-4

---

## Phase 6: Tests

### Task 6.1: Unit tests for `markEmailAsRead` and `markEmailsAsReadBatch`

Create `tests/main/gmail/mark-read.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rmSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
```

**Tests**:
- `markEmailAsRead` updates DB `is_read = 1` on success
- `markEmailAsRead` throws when credentials not configured
- `markEmailAsRead` throws when no tokens found
- `markEmailAsRead` handles 404 (marks locally only)
- `markEmailAsRead` retries on 429
- `markEmailsAsReadBatch` processes chunks correctly
- `markEmailsAsReadBatch` tracks failed emails
- `markEmailsAsReadBatch` respects rate limiting

**Follow pattern from**: `tests/main/gmail/fetcher.test.ts` (mock electron, test DB lifecycle)

### Task 6.2: IPC handler tests

Create `tests/main/ipc/gmail-mark-read-handlers.test.ts`:

**Tests**:
- `gmail:markAsRead` validates Zod schema (rejects invalid payload)
- `gmail:markAsRead` calls `markEmailAsRead` with correct args
- `gmail:markAsReadBatch` validates Zod schema
- `gmail:markAsReadBatch` calls `markEmailsAsReadBatch`

**Follow pattern from**: `tests/main/ipc/classification-handlers.test.ts`

### Task 6.3: UI component tests

Update `tests/components/EmailList.test.tsx`:

**Tests**:
- Mark-read button renders for unread emails
- Mark-read button does not render for read emails
- Checkbox appears on email rows
- Batch toolbar appears when emails selected
- "Mark as Read" button triggers batch operation
- "Clear" button deselects all checkboxes
- Blue dot indicator renders for unread emails
- Subject text is bold for unread, normal for read

**Follow pattern from**: Existing `EmailList.test.tsx` (mock `window.electronAPI`)

**Dependencies**: Phases 1-5

---

## Phase 7: Scope Update for Existing Users

### Task 7.1: Handle missing `gmail.modify` scope

When existing users try to mark as read, they may get a 401/403 because their stored tokens don't have the `gmail.modify` scope. Two options:

**Option A (Recommended)**: Catch the error and show a toast prompting re-authorization:
- In `markEmailAsRead`, if API returns 403 with "insufficient permissions" message, throw a specific error
- In UI, catch this error and show: "Gmail permission needed. Please reconnect your account in Settings."

**Option B**: Auto-trigger re-authorization flow. This is more complex and can be a follow-up.

For this implementation, use Option A.

---

## Execution Order

1. **Phase 1** (Tasks 1.1-1.2): Core backend functions — no dependencies
2. **Phase 2** (Tasks 2.1-2.4): IPC handlers — depends on Phase 1
3. **Phase 3** (Tasks 3.1-3.2): Preload API — depends on Phase 2
4. **Phase 4** (Tasks 4.1-4.8): UI components — depends on Phase 3
5. **Phase 5**: Rate limiting — already in Phase 1/4
6. **Phase 6** (Tasks 6.1-6.3): Tests — depends on Phases 1-5
7. **Phase 7**: Scope handling — can be done in parallel with Phase 4

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Missing `gmail.modify` scope for existing users | High | Medium | Option A: Show re-auth prompt |
| Rate limiting (429) from Gmail API | Medium | Low | Implement exponential backoff |
| Optimistic UI out of sync with backend | Low | Medium | Revert on error, re-fetch on next sync |
| Batch operation partial failure | Medium | Medium | Track failed IDs, show partial success toast |
| `externalId` not in `getClassifiedEmails` query | High | High | Must update classifier query (Task 4.2) |

---

## Testing Strategy

### Unit Tests
- `tests/main/gmail/mark-read.test.ts`: 8-10 tests for core functions
- `tests/main/ipc/gmail-mark-read-handlers.test.ts`: 4-6 tests for IPC validation

### Integration Tests
- Single mark-as-read → verify DB update → verify Gmail API call
- Batch mark-as-read → verify chunking → verify rate limiting
- Error scenarios → verify error handling and UI feedback

### Manual QA
- Connect Gmail account, fetch unread emails
- Mark one email as read → verify disappears → verify in Gmail inbox
- Select 5 emails, batch mark → verify all disappear
- Disconnect network → verify error toast
- Check rate limiting with 20+ emails

---

## Confidence Self-Estimation

**HIGH** — The codebase has clear patterns for Gmail API calls, IPC handlers, preload exposure, and UI components. All required infrastructure exists (OAuth, Zod validation, contextBridge). The main uncertainty is whether `externalId` is available in the `getClassifiedEmails` query (Task 4.2), but this is a straightforward fix.
