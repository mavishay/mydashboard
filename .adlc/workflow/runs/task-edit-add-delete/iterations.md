## Iteration 1 - 2026-08-29
- Files changed: `electron/main/ipc/tasks-handlers.ts` (new), `electron/main/ipc/index.ts`, `electron/preload/index.ts`, `src/components/TaskList.tsx`, `src/components/EmailList.tsx`, `tests/main/ipc/tasks-handlers.test.ts` (new), `tests/preload/index.test.ts`, `tests/components/TaskList.test.ts` (new), `tests/components/EmailList.test.ts` (new)
- Summary: Implemented full CRUD for tasks — add button with inline form, inline title edit, delete with confirmation, unified Google Tasks + TickTick display with source badges, email-to-task conversion, new IPC handlers with Zod validation, preload allowlist updated.
- Tests: 18 new tests pass, typecheck clean, lint clean, 197/303 total tests pass (106 pre-existing sqlite failures unrelated)
