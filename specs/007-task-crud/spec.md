# Feature Specification: Task CRUD (Issue #31)

## 1. Requirements

### 1.1 Add Task
- **User Story**: As a user, I can add a new task via a "+" button, specifying title, optional due date, and list selector (Google Tasks list or TickTick project).
- **Acceptance Criteria**:
  - A "+" button is visible in the task list header.
  - Clicking "+" opens an inline form or modal with fields: title (required), due date (optional), list/project selector (dropdown).
  - Submitting the form calls the appropriate IPC handler (`google-tasks:createTask` or `ticktick:createTask`) based on selected list.
  - On success, the new task appears in the list immediately (optimistic UI).
  - On failure, a toast/alert error is shown and the task is not added.
- **Measurable SC**: Task creation latency < 500ms (optimistic update visible within 100ms).

### 1.2 Edit Task Inline
- **User Story**: As a user, I can edit a task title by clicking on it, entering a new title, and saving/canceling.
- **Acceptance Criteria**:
  - Clicking on a task title switches it to an editable input field.
  - Pressing Enter or clicking Save commits the change via `google-tasks:updateTask` or `ticktick:updateTask`.
  - Pressing Escape or clicking Cancel reverts to original title.
  - Optimistic update: title updates immediately, reverted on error.
  - Only title editing is required; other fields (due date, notes) can be added later.
- **Measurable SC**: Edit save latency < 300ms.

### 1.3 Toggle Complete/Incomplete
- **User Story**: As a user, I can toggle a task's completion status via a checkbox.
- **Acceptance Criteria**:
  - Checkbox reflects current status (checked for completed).
  - Toggling sends update with `status: 'completed'` or `status: 'needsAction'` (Google Tasks) or `status: '1'`/`'0'` (TickTick).
  - Optimistic UI: checkbox toggles immediately, strikethrough style applied.
  - Error handling: revert on failure.
- **Measurable SC**: Toggle latency < 200ms.

### 1.4 Delete Task with Confirmation
- **User Story**: As a user, I can delete a task with a confirmation prompt.
- **Acceptance Criteria**:
  - Delete button (×) present on each task row.
  - Clicking delete shows a confirmation dialog (browser confirm or custom modal).
  - Confirming sends `google-tasks:deleteTask` or `ticktick:deleteTask`.
  - Task removed from list immediately (optimistic).
  - On error, task reappears with error toast.
- **Measurable SC**: Delete latency < 300ms.

### 1.5 Display Both Google Tasks and TickTick Tasks
- **User Story**: As a user, I see tasks from both Google Tasks and TickTick in a unified list.
- **Acceptance Criteria**:
  - Task list merges tasks from both sources.
  - Each task shows a source badge ("Google Tasks" or "TickTick").
  - Tasks are sorted by `updatedAt` descending (newest first).
  - Filtering by source is optional (can be added later).
- **Measurable SC**: Unified list loads within 1 second.

### 1.6 Email-to-Task Conversion
- **User Story**: As a user, I can convert an email to a task with one click, pre-filling title and description from email subject/snippet.
- **Acceptance Criteria**:
  - Each email row has a "Convert to Task" button.
  - Clicking opens the add-task form with title = email subject, description = email snippet.
  - User can select target list/project before saving.
  - After creation, a toast confirms success.
- **Measurable SC**: Conversion flow completes within 2 clicks.

### 1.7 Optimistic UI Updates
- **All CRUD operations** must update the UI immediately before server confirmation.
- On failure, revert the UI and show error toast.

### 1.8 Error Handling
- All IPC errors must be caught and displayed as toast/alert.
- No unhandled promise rejections.

## 2. UI Component Changes

### 2.1 TaskList.tsx (`src/components/TaskList.tsx`)
**Current state**: Read-only list, only Google Tasks, no add/edit/delete UI.

**Changes**:
1. **Add Task Button**: Add a "+" button in the header (line ~162) that toggles an inline add-task form.
2. **Inline Edit**: Make task title clickable; on click, replace `<span>` with `<input>` (line ~227). Save/cancel handlers.
3. **Delete Confirmation**: Replace direct `handleDelete` call with confirmation dialog (line ~242). Use `window.confirm` or custom modal.
4. **Unified Task Source**: Load both Google Tasks and TickTick tasks via `Promise.all` (line ~64). Merge and sort by `updatedAt`.
5. **Source Badge**: Already shows "Google Tasks" badge; add similar for TickTick.
6. **List/Project Selector**: For add-task form, fetch Google Tasks lists via `google-tasks:listLists` (new IPC?) and TickTick projects via `ticktick:listProjects` (existing? need to check). Actually, we have `listProjects` in TaskAdapter but not exposed via IPC. We'll need to add IPC for listing projects/lists. However, the issue says "Do NOT implement adapters". The adapter pattern exists; we can use existing handlers? The google-tasks-handlers doesn't have listLists. We'll need to add a new IPC handler `google-tasks:listLists` and `ticktick:listProjects`. But the issue says "IPC Handlers: Verify existing handlers, add tasks:createFromEmail". Might be out of scope? The requirement says "list selector". We'll assume we can add minimal IPC for listing lists/projects. We'll note that in spec.

**File modifications**:
- `src/components/TaskList.tsx`: Major refactor.

### 2.2 EmailList.tsx (`src/components/EmailList.tsx`)
**Current state**: Email list with sync/classify buttons.

**Changes**:
1. **Convert to Task Button**: Add a button per email row (line ~248) that calls a new IPC handler `tasks:createFromEmail` or directly calls task creation with pre-filled data.
2. **Pre-fill**: Pass email subject and snippet to add-task form (or directly create task after list selection).

**File modifications**:
- `src/components/EmailList.tsx`: Add button and handler.

## 3. IPC Additions/Modifications

### 3.1 New IPC Channels
- `tasks:createFromEmail` — Creates a task from email data (subject, snippet, optional listId). This handler will call the appropriate task adapter based on user's default list or selection.
- `google-tasks:listLists` — Returns available task lists for an account.
- `ticktick:listProjects` — Returns available projects for an account.

### 3.2 Existing Handler Verification
- `google-tasks:createTask`, `updateTask`, `deleteTask` — Already exist and work.
- `ticktick:createTask`, `updateTask`, `deleteTask` — Already exist and work.
- Ensure they follow Zod validation pattern (they do).

### 3.3 Preload Additions
- Add `tasks.createFromEmail`, `googleTasks.listLists`, `ticktick.listProjects` to `ALLOWED_INVOKE` set and expose via `electronAPI`.

## 4. Data Flow Diagrams

### 4.1 Add Task Flow
```
User clicks "+"
→ UI shows add-task form (title, due date, list selector)
→ User fills form, clicks Save
→ UI calls electronAPI.tasks.createTask({ listType, listId, title, dueDate })
→ Preload gates IPC invoke
→ Main process receives 'tasks:createTask'
→ Handler validates with Zod schema
→ Depending on listType:
   - Google Tasks: google-tasks:createTask handler → Google Tasks API → insert local DB
   - TickTick: ticktick:createTask handler → TickTick API → insert local DB
→ Returns new task object
→ UI adds task to list (optimistic already applied)
→ On error: UI reverts, shows toast
```

### 4.2 Edit Task Flow
```
User clicks task title
→ UI replaces span with input (pre-filled)
→ User edits, presses Enter
→ UI calls electronAPI.tasks.updateTask({ listType, taskId, title })
→ IPC invoke → handler → adapter → remote API → local DB update
→ UI updates title (optimistic)
→ On error: revert, toast
```

### 4.3 Delete Task Flow
```
User clicks "×"
→ UI shows confirmation dialog
→ User confirms
→ UI calls electronAPI.tasks.deleteTask({ listType, taskId })
→ IPC invoke → handler → adapter → remote API delete → local DB delete
→ UI removes task (optimistic)
→ On error: re-add task, toast
```

### 4.4 Email-to-Task Flow
```
User clicks "Convert to Task" on email
→ UI opens add-task form with title = email.subject, description = email.snippet
→ User selects list, clicks Save
→ Same as Add Task flow but with pre-filled data.
```

## 5. Error Handling Matrix

| Operation | Error Type | UI Behavior | User Message |
|-----------|-----------|-------------|--------------|
| Add Task | Network error | Revert optimistic add, show toast | "Failed to create task. Please try again." |
| Add Task | Validation error (empty title) | Disable submit, show inline error | "Title is required" |
| Edit Task | Network error | Revert title, show toast | "Failed to save changes. Please try again." |
| Toggle Complete | Network error | Revert checkbox, show toast | "Failed to update task status." |
| Delete Task | Network error | Re-add task, show toast | "Failed to delete task. Please try again." |
| Load Tasks | Network error | Show error message with retry button | "Failed to load tasks." |
| Email-to-Task | IPC error | Show toast, keep form open | "Failed to create task from email." |

## 6. Testing Strategy

### 6.1 Unit Tests (Vitest)
- **TaskList.test.tsx**: Test add task form rendering, inline edit, delete confirmation, optimistic updates, error handling.
- **EmailList.test.tsx**: Test "Convert to Task" button rendering, pre-fill logic.
- **IPC handlers**: Mock electron, test Zod validation, test adapter calls (using vi.mock).
- **Preload**: Test allowlist includes new channels.

### 6.2 Integration Tests
- Test full flow: add task → appears in list → edit → delete.
- Test email conversion flow.

### 6.3 Mocking Strategy
- Mock `window.electronAPI` for component tests.
- Mock `ipcMain` and adapter for handler tests.
- Use `vi.mock('electron')` for preload tests.

### 6.4 Coverage Requirements
- All new components: 80% line coverage.
- All new IPC handlers: 100% branch coverage.

## 7. Definition of Done

- [ ] All acceptance criteria met.
- [ ] Unit tests written and passing (Vitest).
- [ ] No TypeScript errors (`npm run typecheck` passes).
- [ ] No lint errors (`npm run lint` passes).
- [ ] Manual testing: add, edit, toggle, delete, email conversion works.
- [ ] Optimistic UI updates for all CRUD operations.
- [ ] Error toasts displayed on failure.
- [ ] Both Google Tasks and TickTick tasks displayed in unified list.
- [ ] Preload allowlist updated with new IPC channels.
- [ ] Zod schemas defined for all new IPC payloads.
- [ ] No regression in existing functionality.

## 8. Source Reference Analysis

### 8.1 Patterns to Adopt
- **IPC Handler Registration**: Follow `registerGoogleTasksHandlers` pattern (line 153-364) with Zod validation.
- **Preload Allowlist**: Add new channels to `ALLOWED_INVOKE` set (line 3-69) and expose via `electronAPI`.
- **Optimistic UI**: Current `handleToggleComplete` (line 103-116) updates state then calls IPC; replicate for add/edit/delete.
- **Error Handling**: Current pattern of `try/catch` with `setError` (line 72-74) and retry button.

### 8.2 Patterns NOT to Adopt
- Do not create new adapter implementations; use existing `TaskAdapter` interface.
- Do not change backend sync logic.
- Do not add new database tables.

### 8.3 Key File References
- `src/components/TaskList.tsx:52-255` — Current read-only task list.
- `electron/main/sync/task-adapter.ts:1-46` — TaskAdapter interface.
- `electron/preload/index.ts:1-246` — Preload with allowlist.
- `electron/main/ipc/google-tasks-handlers.ts:1-364` — Google Tasks IPC handlers.
- `electron/main/ipc/ticktick-handlers.ts:1-369` — TickTick IPC handlers.
- `src/components/EmailList.tsx:1-284` — Email list component.