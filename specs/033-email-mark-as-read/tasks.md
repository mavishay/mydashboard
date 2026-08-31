# Tasks: Email Mark as Read (Issue #33)

## Phase 1: Gmail API Mark-Read Function (Backend Core)

### Task 1.1: Add `markEmailAsRead` function

- **File**: `electron/main/gmail/fetcher.ts`
- **Location**: After `markReadOutsideFetch` function (line 415)
- **Changes**: Add exported async function that calls Gmail API `messages.modify` to remove UNREAD label
  - Validate inputs (emailId, externalId, accountId non-empty)
  - Get `clientId` and `clientSecret` from `process.env`
  - Call `retrieveTokens(db, accountId)` — throw if null
  - Create OAuth2 client via `createOAuth2Client(clientId, clientSecret, tokens)`
  - Create Gmail API instance: `google.gmail({ version: 'v1', auth: oauth2Client })`
  - Call `gmail.users.messages.modify({ userId: 'me', id: externalId, requestBody: { removeLabelIds: ['UNREAD'] } })`
  - On success: `UPDATE emails SET is_read = 1 WHERE id = ?` (emailId)
  - Return `{ success: true }`
  - Error handling: 401 retry once, 404 mark locally only, 429 backoff 1s retry 3x, 403 throw "Gmail API quota exceeded", network error throw
- **Dependencies**: None
- **Complexity**: Medium
- **Verification**:
  - `npx vitest run tests/main/gmail/mark-read.test.ts` (after Task 6.1)
  - Manual: connect Gmail, call function, verify email marked read in Gmail inbox

### Task 1.2: Add `markEmailsAsReadBatch` function

- **File**: `electron/main/gmail/fetcher.ts`
- **Location**: After `markEmailAsRead` function
- **Changes**: Add exported async function for batch operations
  - Constants: `BATCH_CHUNK_SIZE = 10`, `BATCH_DELAY_MS = 1000`, `MAX_RETRIES = 3`
  - Process emails in chunks of 10
  - For each chunk, call `markEmailAsRead` for each email (parallel within chunk)
  - Wait 1s between chunks
  - Track failed emailIds
  - For 429 errors, wait 2s and retry up to 3 times per email
  - Wrap all DB updates in a transaction after Gmail API calls succeed
  - Return `{ success: true, marked: count, failed: failedIds }`
- **Dependencies**: Task 1.1
- **Complexity**: Medium
- **Verification**:
  - `npx vitest run tests/main/gmail/mark-read.test.ts` (after Task 6.1)
  - Manual: select 15 emails, batch mark, verify rate limiting and all marked

---

## Phase 2: IPC Handlers (Backend → Frontend Bridge)

### Task 2.1: Add `gmail.modify` scope to `GOOGLE_SCOPES`

- **File**: `electron/main/ipc/gmail-handlers.ts`
- **Location**: Line 24-28 (`GOOGLE_SCOPES` array)
- **Changes**: Add `'https://www.googleapis.com/auth/gmail.modify'` to the scopes array
- **Dependencies**: None
- **Complexity**: Low
- **Verification**:
  - TypeScript compiles without errors
  - Existing users will need re-authorization (documented in plan)

### Task 2.2: Add Zod schemas for mark-as-read

- **File**: `electron/main/ipc/gmail-handlers.ts`
- **Location**: After `GetEmailDetailSchema` (line 43-45)
- **Changes**: Add two new Zod schemas
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
- **Dependencies**: None
- **Complexity**: Low
- **Verification**:
  - TypeScript compiles without errors

### Task 2.3: Add `gmail:markAsRead` IPC handler

- **File**: `electron/main/ipc/gmail-handlers.ts`
- **Location**: Inside `registerGmailHandlers` function, after existing handlers
- **Changes**: Register new IPC handler
  - Import `markEmailAsRead` from `../gmail/fetcher`
  - Add `ipcMain.handle('gmail:markAsRead', async (_event, rawPayload) => { ... })`
  - Validate with `MarkAsReadSchema.safeParse(rawPayload)`
  - Call `markEmailAsRead(db, parsed.data.emailId, parsed.data.externalId, parsed.data.accountId)`
  - Return result
- **Dependencies**: Tasks 1.1, 2.2
- **Complexity**: Low
- **Verification**:
  - `npx vitest run tests/main/ipc/gmail-mark-read-handlers.test.ts` (after Task 6.2)
  - TypeScript compiles without errors

### Task 2.4: Add `gmail:markAsReadBatch` IPC handler

- **File**: `electron/main/ipc/gmail-handlers.ts`
- **Location**: After `gmail:markAsRead` handler
- **Changes**: Register new IPC handler
  - Import `markEmailsAsReadBatch` from `../gmail/fetcher`
  - Add `ipcMain.handle('gmail:markAsReadBatch', async (_event, rawPayload) => { ... })`
  - Validate with `MarkAsReadBatchSchema.safeParse(rawPayload)`
  - Call `markEmailsAsReadBatch(db, parsed.data.emails)`
  - Return result
- **Dependencies**: Tasks 1.2, 2.2
- **Complexity**: Low
- **Verification**:
  - `npx vitest run tests/main/ipc/gmail-mark-read-handlers.test.ts` (after Task 6.2)
  - TypeScript compiles without errors

---

## Phase 3: Preload API Exposure (Frontend Bridge)

### Task 3.1: Add channels to `ALLOWED_INVOKE`

- **File**: `electron/preload/index.ts`
- **Location**: Line 3-89 (`ALLOWED_INVOKE` Set)
- **Changes**: Add two new entries to the Set
  ```typescript
  'gmail:markAsRead',
  'gmail:markAsReadBatch',
  ```
- **Dependencies**: None
- **Complexity**: Low
- **Verification**:
  - TypeScript compiles without errors
  - `npx vitest run tests/preload/index.test.ts` passes

### Task 3.2: Add API methods to `gmail` object

- **File**: `electron/preload/index.ts`
- **Location**: Line 128-153 (inside `gmail` object on `electronAPI`)
- **Changes**: Add two new methods after `getEmailDetail`
  ```typescript
  markAsRead: (data: { emailId: string; externalId: string; accountId: string }) =>
    gatedInvoke('gmail:markAsRead', data) as Promise<{ success: boolean }>,
  markAsReadBatch: (data: { emails: Array<{ emailId: string; externalId: string; accountId: string }> }) =>
    gatedInvoke('gmail:markAsReadBatch', data) as Promise<{ success: boolean; marked: number; failed: string[] }>,
  ```
- **Dependencies**: Task 3.1
- **Complexity**: Low
- **Verification**:
  - TypeScript compiles without errors
  - `npx vitest run tests/preload/index.test.ts` passes

---

## Phase 4: UI Components (Frontend)

### Task 4.1: Add `externalId` and `isRead` fields to `Email` interface

- **File**: `src/components/EmailList.tsx`
- **Location**: Line 21-29 (`Email` interface)
- **Changes**: Add two new fields
  ```typescript
  interface Email {
    id: string;
    accountId: string;
    externalId: string;  // NEW
    subject: string | null;
    snippet: string | null;
    fromAddress: string | null;
    receivedAt: string | null;
    classification: Classification;
    isRead: number;  // NEW (0 or 1)
  }
  ```
- **Dependencies**: None
- **Complexity**: Low
- **Verification**:
  - TypeScript compiles without errors

### Task 4.2: Update `classifier.ts` to include `externalId` and `is_read`

- **File**: `electron/main/ai/classifier.ts`
- **Location**: Line 311-359 (`getClassifiedEmails` function)
- **Changes**:
  - Update return type to include `externalId: string` and `isRead: number`
  - Update SQL query (line 345-348) to SELECT `external_id` and `is_read`
  - Add these fields to the result mapping
- **Dependencies**: None
- **Complexity**: Medium
- **Verification**:
  - `npx vitest run tests/main/ai/classifier.test.ts` passes
  - TypeScript compiles without errors

### Task 4.3: Add blue dot indicator for unread emails

- **File**: `src/components/EmailList.tsx`
- **Location**: Line 587-591 (inside email row, before sender name)
- **Changes**: Add blue dot element when `!email.isRead`
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
- **Dependencies**: Tasks 4.1, 4.2
- **Complexity**: Low
- **Verification**:
  - Visual: unread emails show blue dot, read emails don't

### Task 4.4: Add bold/normal font-weight transition

- **File**: `src/components/EmailList.tsx`
- **Location**: Line 593 (subject line `<div>`)
- **Changes**: Update style to use conditional font-weight
  ```tsx
  <div style={{
    fontWeight: email.isRead ? 500 : 700,
    fontSize: '0.875rem',
    marginBottom: '0.25rem',
    transition: 'font-weight 300ms ease',
  }}>
  ```
- **Dependencies**: Tasks 4.1, 4.2
- **Complexity**: Low
- **Verification**:
  - Visual: unread subjects are bold (700), read subjects are normal (500)

### Task 4.5: Add "Mark Read" button per email row

- **File**: `src/components/EmailList.tsx`
- **Location**: Line 604-622 (after "Convert to Task" button)
- **Changes**: Add mark-read button for unread emails only
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
- **Dependencies**: Tasks 4.1, 4.2, 4.7
- **Complexity**: Low
- **Verification**:
  - Visual: "Mark Read" button appears on unread emails only

### Task 4.6: Add checkbox selection and batch toolbar

- **File**: `src/components/EmailList.tsx`
- **Location**: Line 97-122 (state declarations) + line 587 (email row) + after `SortGroupControls`
- **Changes**:
  1. Add state declarations:
     ```typescript
     const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
     const [markingIds, setMarkingIds] = useState<Set<string>>(new Set());
     const [batchProgress, setBatchProgress] = useState<string | null>(null);
     ```
  2. Add checkbox before sender name in email row:
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
  3. Add batch toolbar above email list (after `SortGroupControls`):
     ```tsx
     {selectedIds.size > 0 && (
       <div style={{
         display: 'flex', alignItems: 'center', gap: '0.75rem',
         padding: '0.5rem 0.75rem', marginBottom: '0.75rem',
         background: '#e3f2fd', borderRadius: '8px', fontSize: '0.875rem',
       }}>
         <span style={{ fontWeight: 600 }}>{selectedIds.size} selected</span>
         <button onClick={handleBatchMarkAsRead} disabled={markingIds.size > 0}
           style={{ padding: '0.375rem 0.75rem', borderRadius: '4px', border: 'none',
             background: '#1976d2', color: '#fff',
             cursor: markingIds.size > 0 ? 'not-allowed' : 'pointer',
             fontSize: '0.8125rem', fontWeight: 600 }}>
           {batchProgress ?? 'Mark as Read'}
         </button>
         <button onClick={() => setSelectedIds(new Set())}
           style={{ padding: '0.375rem 0.75rem', borderRadius: '4px',
             border: '1px solid #ccc', background: '#fff', cursor: 'pointer',
             fontSize: '0.8125rem' }}>
           Clear
         </button>
       </div>
     )}
     ```
- **Dependencies**: Tasks 4.1, 4.2, 4.5, 4.7, 4.8
- **Complexity**: Medium
- **Verification**:
  - Visual: checkboxes appear on email rows
  - Visual: batch toolbar appears when emails selected
  - Click "Mark as Read" in toolbar triggers batch operation

### Task 4.7: Implement `handleMarkAsRead` (single email)

- **File**: `src/components/EmailList.tsx`
- **Location**: Inside `EmailList` component, after other handlers
- **Changes**: Add `useCallback` handler
  ```typescript
  const handleMarkAsRead = useCallback(async (email: Email) => {
    setMarkingIds(prev => new Set(prev).add(email.id));
    try {
      await window.electronAPI.gmail.markAsRead({
        emailId: email.id,
        externalId: email.externalId,
        accountId: email.accountId,
      });
      setEmails(prev => prev.map(e =>
        e.id === email.id ? { ...e, isRead: 1 } : e
      ));
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
- **Dependencies**: Tasks 3.2, 4.1
- **Complexity**: Low
- **Verification**:
  - Click "Mark Read" on single email → email disappears after 500ms
  - Error toast appears if API call fails

### Task 4.8: Implement `handleBatchMarkAsRead`

- **File**: `src/components/EmailList.tsx`
- **Location**: Inside `EmailList` component, after `handleMarkAsRead`
- **Changes**: Add `useCallback` handler
  ```typescript
  const handleBatchMarkAsRead = useCallback(async () => {
    const emailsToMark = emails.filter(e => selectedIds.has(e.id));
    if (emailsToMark.length === 0) return;

    setBatchProgress(`Marking 0/${emailsToMark.length}...`);

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

      setTimeout(() => {
        setEmails(prev => prev.filter(e => !selectedIds.has(e.id)));
        onCountChange?.(prev => prev - result.marked);
      }, 500);
    } catch (err) {
      setError(`Batch mark as read failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
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
- **Dependencies**: Tasks 3.2, 4.1, 4.6
- **Complexity**: Medium
- **Verification**:
  - Select multiple emails, click "Mark as Read" in toolbar
  - Progress shows "Marking 0/5..."
  - All selected emails disappear after 500ms
  - Error toast shows partial success if some fail

---

## Phase 5: Tests

### Task 5.1: Unit tests for `markEmailAsRead` and `markEmailsAsReadBatch`

- **File**: `tests/main/gmail/mark-read.test.ts` (NEW)
- **Changes**: Create test file following pattern from `tests/main/gmail/fetcher.test.ts`
  - Mock `electron`, `googleapis`
  - Test DB lifecycle with `testDbPath()` and `cleanupDb()`
  - Tests:
    1. `markEmailAsRead` updates DB `is_read = 1` on success
    2. `markEmailAsRead` throws when credentials not configured
    3. `markEmailAsRead` throws when no tokens found
    4. `markEmailAsRead` handles 404 (marks locally only)
    5. `markEmailAsRead` retries on 429
    6. `markEmailsAsReadBatch` processes chunks correctly
    7. `markEmailsAsReadBatch` tracks failed emails
    8. `markEmailsAsReadBatch` respects rate limiting
- **Dependencies**: Tasks 1.1, 1.2
- **Complexity**: Medium
- **Verification**:
  - `npx vitest run tests/main/gmail/mark-read.test.ts` passes (8+ tests)

### Task 5.2: IPC handler tests

- **File**: `tests/main/ipc/gmail-mark-read-handlers.test.ts` (NEW)
- **Changes**: Create test file following pattern from `tests/main/ipc/classification-handlers.test.ts`
  - Mock `electron`, test DB lifecycle
  - Tests:
    1. `gmail:markAsRead` validates Zod schema (rejects invalid payload)
    2. `gmail:markAsRead` calls `markEmailAsRead` with correct args
    3. `gmail:markAsReadBatch` validates Zod schema
    4. `gmail:markAsReadBatch` calls `markEmailsAsReadBatch`
- **Dependencies**: Tasks 2.3, 2.4
- **Complexity**: Medium
- **Verification**:
  - `npx vitest run tests/main/ipc/gmail-mark-read-handlers.test.ts` passes (4+ tests)

### Task 5.3: UI component tests

- **File**: `tests/components/EmailList.test.tsx` (UPDATE existing if exists, or create)
- **Changes**: Add tests for mark-as-read UI
  - Mock `window.electronAPI`
  - Tests:
    1. Mark-read button renders for unread emails
    2. Mark-read button does not render for read emails
    3. Checkbox appears on email rows
    4. Batch toolbar appears when emails selected
    5. "Mark as Read" button triggers batch operation
    6. "Clear" button deselects all checkboxes
    7. Blue dot indicator renders for unread emails
    8. Subject text is bold for unread, normal for read
- **Dependencies**: Tasks 4.1-4.8
- **Complexity**: Medium
- **Verification**:
  - `npx vitest run tests/components/EmailList.test.tsx` passes (8+ tests)

---

## Phase 6: Scope Handling

### Task 6.1: Handle missing `gmail.modify` scope for existing users

- **File**: `electron/main/gmail/fetcher.ts`
- **Location**: Inside `markEmailAsRead` function, error handling
- **Changes**: Catch 403 "insufficient permissions" and throw specific error
  ```typescript
  if (err.code === 403 && err.message?.includes('insufficient permissions')) {
    throw new Error('Gmail permission needed. Please reconnect your account in Settings.');
  }
  ```
- **File**: `src/components/EmailList.tsx`
- **Location**: Inside `handleMarkAsRead` and `handleBatchMarkAsRead` catch blocks
- **Changes**: Check for specific error message and show appropriate toast
- **Dependencies**: Tasks 1.1, 4.7, 4.8
- **Complexity**: Low
- **Verification**:
  - Manual: use account without gmail.modify scope → see "Gmail permission needed" toast

---

## Execution Order

1. **Phase 1** (Tasks 1.1-1.2): Core backend functions — no dependencies
2. **Phase 2** (Tasks 2.1-2.4): IPC handlers — depends on Phase 1
3. **Phase 3** (Tasks 3.1-3.2): Preload API — depends on Phase 2
4. **Phase 4** (Tasks 4.1-4.8): UI components — depends on Phase 3
5. **Phase 5** (Tasks 5.1-5.3): Tests — depends on Phases 1-4
6. **Phase 6** (Task 6.1): Scope handling — can be done in parallel with Phase 4

## Dependencies Summary

| Task | Depends On |
|------|-----------|
| 1.1 | None |
| 1.2 | 1.1 |
| 2.1 | None |
| 2.2 | None |
| 2.3 | 1.1, 2.2 |
| 2.4 | 1.2, 2.2 |
| 3.1 | None |
| 3.2 | 3.1 |
| 4.1 | None |
| 4.2 | None |
| 4.3 | 4.1, 4.2 |
| 4.4 | 4.1, 4.2 |
| 4.5 | 4.1, 4.2, 4.7 |
| 4.6 | 4.1, 4.2, 4.5, 4.7, 4.8 |
| 4.7 | 3.2, 4.1 |
| 4.8 | 3.2, 4.1, 4.6 |
| 5.1 | 1.1, 1.2 |
| 5.2 | 2.3, 2.4 |
| 5.3 | 4.1-4.8 |
| 6.1 | 1.1, 4.7, 4.8 |

## Verification Commands

```bash
# Run all tests
npx vitest run

# Run specific test files
npx vitest run tests/main/gmail/mark-read.test.ts
npx vitest run tests/main/ipc/gmail-mark-read-handlers.test.ts
npx vitest run tests/components/EmailList.test.tsx

# TypeScript check
npx tsc --noEmit

# Lint
npm run lint
```
