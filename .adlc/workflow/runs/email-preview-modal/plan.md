# Email Preview Modal - Implementation Plan

## Issue: #37

---

### Task 1: Add `body_html` column to emails table via migration

**Files to create/modify:**
- `electron/main/db/migrations/018-email-body.sql` (new)

**Details:**
Create migration `018-email-body.sql` that adds a `body_html TEXT` column to the `emails` table to cache the full HTML body for offline viewing.

```sql
-- 018-email-body.sql
ALTER TABLE emails ADD COLUMN body_html TEXT;
```

**Acceptance Criteria:**
- [ ] Migration file exists at `electron/main/db/migrations/018-email-body.sql`
- [ ] SQL is valid ALTER TABLE statement
- [ ] Column type is TEXT (nullable, no default)

---

### Task 2: Add `getEmailDetail` function to Gmail fetcher

**Files to create/modify:**
- `electron/main/gmail/fetcher.ts` (modify)

**Details:**
Add a new exported function `getEmailDetail` that:
1. Takes `(db, emailId)` where `emailId` is the internal DB id
2. Looks up the email's `external_id` and `account_id` from the DB
3. Retrieves OAuth tokens for the account
4. Calls Gmail API `users.messages.get` with `format: 'full'`
5. Extracts the HTML body from the message payload (recursively navigate `payload.parts` to find `text/html` part, decode base64)
6. Caches the body in the `body_html` column of the `emails` table
7. Returns `{ id, subject, fromAddress, receivedAt, bodyHtml, cached }` or null if not found

Also add a `getCachedEmailDetail` function that checks the DB cache first before hitting the API.

**Interface:**
```typescript
export interface EmailDetail {
  id: string;
  accountId: string;
  subject: string | null;
  fromAddress: string | null;
  receivedAt: string | null;
  bodyHtml: string | null;
  snippet: string | null;
}

export async function getEmailDetail(
  db: Database.Database,
  emailId: string
): Promise<EmailDetail | null>
```

**Acceptance Criteria:**
- [ ] `getEmailDetail` function exported from `fetcher.ts`
- [ ] Recursively traverses Gmail message payload to find HTML body
- [ ] Base64url decodes the body content
- [ ] Caches body in `body_html` column after first fetch
- [ ] Returns cached body on subsequent calls (reads from DB first)
- [ ] Returns null if email not found in DB
- [ ] Handles errors gracefully (API failures, missing tokens)

---

### Task 3: Register `gmail:getEmailDetail` IPC handler

**Files to create/modify:**
- `electron/main/ipc/gmail-handlers.ts` (modify)

**Details:**
Add a new IPC handler `gmail:getEmailDetail` that:
1. Validates the payload with Zod: `{ emailId: string }`
2. Calls `getEmailDetail(db, emailId)`
3. Returns the email detail or throws if not found

**Schema:**
```typescript
const GetEmailDetailSchema = z.object({
  emailId: z.string().min(1),
});
```

**Acceptance Criteria:**
- [ ] New handler registered in `registerGmailHandlers`
- [ ] Zod schema validates input
- [ ] Returns `EmailDetail` object or throws
- [ ] Handler is in the same file as other gmail handlers

---

### Task 4: Add IPC channel to preload allowlist and expose API

**Files to create/modify:**
- `electron/preload/index.ts` (modify)
- `electron/preload/types.d.ts` (modify)

**Details:**
1. Add `'gmail:getEmailDetail'` to the `ALLOWED_INVOKE` set in `preload/index.ts`
2. Add `getEmailDetail` method to the `gmail` namespace in `ElectronAPI` interface in `preload/types.d.ts`
3. Expose the method via `contextBridge.exposeInMainWorld` in the `gmail` namespace

**Type definition:**
```typescript
// In ElectronAPI.gmail:
getEmailDetail: (emailId: string) => Promise<{
  id: string;
  accountId: string;
  subject: string | null;
  fromAddress: string | null;
  receivedAt: string | null;
  bodyHtml: string | null;
  snippet: string | null;
} | null>;
```

**Acceptance Criteria:**
- [ ] `'gmail:getEmailDetail'` added to `ALLOWED_INVOKE`
- [ ] Type definition added to `types.d.ts`
- [ ] Method exposed in `contextBridge` under `gmail` namespace
- [ ] Return type matches `EmailDetail` interface

---

### Task 5: Create `EmailPreviewModal` React component

**Files to create/modify:**
- `src/components/EmailPreviewModal.tsx` (new)

**Details:**
Create a new modal component following the existing patterns (HealthCheckWizard, convert-to-task modal):

**Props interface:**
```typescript
interface EmailPreviewModalProps {
  emailId: string;
  accountId: string;
  onClose: () => void;
}
```

**Component behavior:**
1. On mount, calls `window.electronAPI.gmail.getEmailDetail(emailId)`
2. Shows loading spinner while fetching
3. Displays: subject, sender (from address), received date, body HTML in sandboxed iframe
4. Shows account badge with color (fetch account color from accounts list or pass as prop)
5. Shows "Open in Gmail" button that opens `https://mail.google.com/mail/u/0/#inbox/{externalId}` in system browser via `shell.openExternal`
6. Shows attachment names/sizes if available
7. Escape key closes modal
8. Click outside modal closes it

**Sandboxed iframe:**
```html
<iframe
  srcDoc={bodyHtml}
  sandbox=""  // Empty sandbox = no scripts, no forms, no same-origin
  style={{ width: '100%', height: '100%', border: 'none' }}
/>
```

**Styling:** Follow existing patterns:
- Fixed overlay with `rgba(0, 0, 0, 0.5)` background
- White card with `borderRadius: '8px'`, `padding: '1.5rem'`
- Close button with `×` character
- Max width `720px`, max height `85vh`

**Acceptance Criteria:**
- [ ] Component exported from `EmailPreviewModal.tsx`
- [ ] Shows loading state while fetching
- [ ] Displays subject, sender, date, body
- [ ] HTML body renders in sandboxed iframe (no script execution)
- [ ] "Open in Gmail" button works
- [ ] Account badge with color displayed
- [ ] Escape key closes modal
- [ ] Click outside closes modal
- [ ] Responsive layout within max constraints

---

### Task 6: Integrate modal into `EmailList` component

**Files to create/modify:**
- `src/components/EmailList.tsx` (modify)

**Details:**
1. Import `EmailPreviewModal`
2. Add state: `previewEmailId: string | null` and `previewAccountId: string | null`
3. Make email rows clickable (add `cursor: pointer` and `onClick` handler)
4. When email row clicked, set `previewEmailId` and `previewAccountId`
5. Render `<EmailPreviewModal>` when `previewEmailId` is set
6. The existing "Convert to Task" button should stop propagation to avoid opening preview

**Acceptance Criteria:**
- [ ] Email rows are clickable
- [ ] Clicking opens the preview modal
- [ ] Convert to Task button click doesn't also open preview
- [ ] Modal closes when `onClose` is called
- [ ] Works for emails from all connected accounts

---

### Task 7: Verify end-to-end functionality

**Acceptance Criteria:**
- [ ] Click email opens preview modal with full content
- [ ] Modal shows subject, sender, date, body
- [ ] HTML email body renders correctly in sandboxed iframe
- [ ] Open in Gmail button opens email in system browser
- [ ] Modal shows account badge with color
- [ ] Escape key closes modal
- [ ] Loading state while fetching email detail
- [ ] Body HTML is sandboxed (no script execution)
- [ ] Works for emails from all connected accounts
- [ ] First open caches body for offline viewing
