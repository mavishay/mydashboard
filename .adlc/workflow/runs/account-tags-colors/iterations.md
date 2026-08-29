## Iteration 0 - 2026-08-28

- Files changed:
  - `electron/main/db/migrations/013-account-colors.sql` (created)
  - `electron/main/db/index.ts` (version bump, migration import, default color assignment)
  - `electron/main/ipc/account-color-handlers.ts` (created)
  - `electron/main/ipc/index.ts` (register account color handlers)
  - `electron/main/auth/gmail.ts` (add color to GmailAccount interface)
  - `electron/main/ipc/gmail-handlers.ts` (add color to AccountResponse)
  - `electron/preload/index.ts` (add accounts:updateColor to allowlist)
  - `src/components/Settings.tsx` (Account Colors section with picker)
  - `src/components/EmailList.tsx` (color indicators, custom dropdown)
  - `src/components/TaskList.tsx` (color indicators)
- Summary: Implemented account tags/labels with color settings — DB migration, IPC handlers, preload bridge, Settings UI with 10-color preset palette + hex input, email/task color indicators, default color assignment on app load.
- Tests: `npx tsc --noEmit` passes clean
