# Home Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign home page with Urgent/Action email tabs and UI improvements across all components

**Architecture:** Add email tabs, redesign dashboard layout, improve component styling

**Tech Stack:** TypeScript, React, Tailwind CSS, shadcn/ui

---

## File Structure

| File | Purpose |
|------|---------|
| `src/components/Dashboard.tsx` | Layout redesign, new grid |
| `src/components/EmailList.tsx` | Add tabs, filter by classification |
| `src/components/TodayCalendar.tsx` | UI improvements |
| `src/components/TaskList.tsx` | UI improvements |
| `src/components/Sidebar.tsx` | UI improvements |
| `electron/main/ipc/email-handlers.ts` | Add getByClassification handler |
| `electron/preload/index.ts` | Add new IPC channel |

---

### Task 1: Add Backend Handler for Email Classification

**Files:**
- Modify: `electron/main/ipc/email-handlers.ts:1-30`

- [ ] **Step 1: Add `getByClassification` handler**

```typescript
// In email-handlers.ts
ipcMain.handle('email:getByClassification', async (_, classification: string) => {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM emails 
    WHERE classification = ? 
      AND is_read = 0 
    ORDER BY received_at DESC
  `).all(classification);
});
```

- [ ] **Step 2: Update preload to expose new channel**

```typescript
// In electron/preload/index.ts
email: {
  // ... existing handlers
  getByClassification: (classification: string) => 
    ipcRenderer.invoke('email:getByClassification', classification),
},
```

- [ ] **Step 3: Test handler**

Run: `pnpm test -- --grep "email"`
Expected: Tests pass

- [ ] **Step 4: Commit**

```bash
git add electron/main/ipc/email-handlers.ts electron/preload/index.ts
git commit -m "feat(email): add handler for classification filtering"
```

---

### Task 2: Add Email Tabs Component

**Files:**
- Modify: `src/components/EmailList.tsx:1-50`

- [ ] **Step 1: Add tab state and types**

```typescript
// In EmailList component
type EmailTab = 'urgent' | 'action';

const [activeTab, setActiveTab] = useState<EmailTab>('urgent');
const [urgentEmails, setUrgentEmails] = useState<Email[]>([]);
const [actionEmails, setActionEmails] = useState<Email[]>([]);
```

- [ ] **Step 2: Add tab switching logic**

```typescript
// In EmailList component
const loadEmails = async (tab: EmailTab) => {
  try {
    const emails = await window.electronAPI.email.getByClassification(tab);
    if (tab === 'urgent') {
      setUrgentEmails(emails);
    } else {
      setActionEmails(emails);
    }
  } catch (err) {
    console.error('Failed to load emails:', err);
  }
};

useEffect(() => {
  loadEmails('urgent');
  loadEmails('action');
}, []);
```

- [ ] **Step 3: Add tab UI**

```tsx
// In EmailList component render
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

<Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as EmailTab)}>
  <TabsList>
    <TabsTrigger value="urgent">
      Urgent ({urgentEmails.length})
    </TabsTrigger>
    <TabsTrigger value="action">
      Action ({actionEmails.length})
    </TabsTrigger>
  </TabsList>
</Tabs>
```

- [ ] **Step 4: Filter emails by tab**

```typescript
// In EmailList component
const displayEmails = activeTab === 'urgent' ? urgentEmails : actionEmails;
```

- [ ] **Step 5: Test tabs**

Run: `pnpm dev`
Expected: Tabs switch between urgent and action emails

- [ ] **Step 6: Commit**

```bash
git add src/components/EmailList.tsx
git commit -m "feat(email): add Urgent/Action tabs"
```

---

### Task 3: Redesign Dashboard Layout

**Files:**
- Modify: `src/components/Dashboard.tsx:1-50`

- [ ] **Step 1: Update grid layout**

```tsx
// In Dashboard component
<div className="grid grid-cols-[3fr_2fr] gap-6 h-[calc(100vh-120px)]">
  {/* Left column - Email */}
  <div className="space-y-4">
    <EmailList onCountChange={setEmailCount} />
  </div>
  
  {/* Right column - Calendar + Tasks */}
  <div className="space-y-4">
    <TodayCalendar />
    <TaskList />
  </div>
</div>
```

- [ ] **Step 2: Update header spacing**

```tsx
// In Dashboard component
<header className="flex justify-between items-center mb-6">
  <h1 className="text-2xl font-bold">Focus Board</h1>
  <div className="flex items-center gap-4">
    <StatusBar services={services} />
    <Button variant="outline" size="icon" onClick={() => navigate('/settings')}>
      <Settings className="h-4 w-4" />
    </Button>
  </div>
</header>
```

- [ ] **Step 3: Test layout**

Run: `pnpm dev`
Expected: 60/40 column split works

- [ ] **Step 4: Commit**

```bash
git add src/components/Dashboard.tsx
git commit -m "feat(dashboard): redesign layout with 60/40 split"
```

---

### Task 4: Improve EmailList Component Styling

**Files:**
- Modify: `src/components/EmailList.tsx:50-150`

- [ ] **Step 1: Add email card styling**

```tsx
// In EmailList component
<div className="space-y-2">
  {displayEmails.map((email) => (
    <Card key={email.id} className="p-4 hover:bg-accent transition-colors cursor-pointer">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant={getVariantFromClassification(email.classification)}>
              {email.classification}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {formatTimeAgo(email.received_at)}
            </span>
          </div>
          <h3 className={`font-medium truncate ${!email.is_read ? 'font-bold' : ''}`}>
            {email.subject}
          </h3>
          <p className="text-sm text-muted-foreground truncate">
            {email.from_address}
          </p>
        </div>
      </div>
    </Card>
  ))}
</div>
```

- [ ] **Step 2: Add classification badge colors**

```typescript
// In EmailList component
const getVariantFromClassification = (classification: string) => {
  switch (classification) {
    case 'urgent': return 'destructive';
    case 'action': return 'default';
    case 'fyi': return 'secondary';
    case 'noise': return 'outline';
    default: return 'default';
  }
};
```

- [ ] **Step 3: Add time ago formatter**

```typescript
// In EmailList component
const formatTimeAgo = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
  
  if (diffInHours < 1) return 'Just now';
  if (diffInHours < 24) return `${diffInHours}h ago`;
  return `${Math.floor(diffInHours / 24)}d ago`;
};
```

- [ ] **Step 4: Test styling**

Run: `pnpm dev`
Expected: Emails show with proper styling

- [ ] **Step 5: Commit**

```bash
git add src/components/EmailList.tsx
git commit -m "feat(email): improve email card styling"
```

---

### Task 5: Improve Calendar Component Styling

**Files:**
- Modify: `src/components/TodayCalendar.tsx:100-150`

- [ ] **Step 1: Add duration display**

```typescript
// In TodayCalendar component
const formatDuration = (startTime: string, endTime: string) => {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const diffInMinutes = Math.floor((end.getTime() - start.getTime()) / (1000 * 60));
  
  if (diffInMinutes < 60) return `${diffInMinutes}m`;
  const hours = Math.floor(diffInMinutes / 60);
  const minutes = diffInMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
};
```

- [ ] **Step 2: Update event card**

```tsx
// In TodayCalendar component
<div className="flex items-center justify-between">
  <div className="flex-1 min-w-0">
    <h4 className="font-medium truncate">{event.title}</h4>
    <p className="text-sm text-muted-foreground">
      {formatTime(event.startTime)} - {formatTime(event.endTime)}
    </p>
  </div>
  <span className="text-sm text-muted-foreground">
    {formatDuration(event.startTime, event.endTime)}
  </span>
</div>
```

- [ ] **Step 3: Test duration display**

Run: `pnpm dev`
Expected: Events show duration

- [ ] **Step 4: Commit**

```bash
git add src/components/TodayCalendar.tsx
git commit -m "feat(calendar): add duration display"
```

---

### Task 6: Improve TaskList Component Styling

**Files:**
- Modify: `src/components/TaskList.tsx:1-50`

- [ ] **Step 1: Add priority indicators**

```typescript
// In TaskList component
const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'high': return 'text-red-500';
    case 'medium': return 'text-yellow-500';
    case 'low': return 'text-green-500';
    default: return 'text-gray-500';
  }
};
```

- [ ] **Step 2: Update task card**

```tsx
// In TaskList component
<div className="flex items-center gap-2">
  <Circle className={`h-3 w-3 ${getPriorityColor(task.priority)}`} />
  <span className="flex-1 truncate">{task.title}</span>
  {task.due && (
    <span className={`text-sm ${isOverdue(task.due) ? 'text-red-500' : 'text-muted-foreground'}`}>
      {formatDueDate(task.due)}
    </span>
  )}
</div>
```

- [ ] **Step 3: Test styling**

Run: `pnpm dev`
Expected: Tasks show with priority indicators

- [ ] **Step 4: Commit**

```bash
git add src/components/TaskList.tsx
git commit -m "feat(tasks): add priority indicators"
```

---

### Task 7: Improve Sidebar Styling

**Files:**
- Modify: `src/components/Sidebar.tsx:1-50`

- [ ] **Step 1: Add active state highlighting**

```tsx
// In Sidebar component
<NavLink
  to="/"
  className={({ isActive }) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
      isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-accent'
    }`
  }
>
  <Home className="h-4 w-4" />
  <span>Dashboard</span>
</NavLink>
```

- [ ] **Step 2: Test active state**

Run: `pnpm dev`
Expected: Active page highlights in sidebar

- [ ] **Step 3: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat(sidebar): add active state highlighting"
```

---

### Task 8: Add Responsive Design

**Files:**
- Modify: `src/components/Dashboard.tsx:50-100`

- [ ] **Step 1: Add responsive grid**

```tsx
// In Dashboard component
<div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-6 h-[calc(100vh-120px)]">
```

- [ ] **Step 2: Test responsive design**

Run: `pnpm dev`
Expected: Layout stacks on mobile

- [ ] **Step 3: Commit**

```bash
git add src/components/Dashboard.tsx
git commit -m "feat(dashboard): add responsive design"
```

---

### Task 9: Verify and Test

**Files:**
- None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `pnpm test`
Expected: All tests pass

- [ ] **Step 2: Manual testing checklist**

- [ ] Urgent emails show by default
- [ ] Tabs switch between Urgent and Action emails
- [ ] Tab badges show email counts
- [ ] All components have improved UI
- [ ] Responsive design works on mobile
- [ ] Layout uses 60/40 column split

- [ ] **Step 3: Commit (if any fixes needed)**

```bash
git add .
git commit -m "fix(dashboard): resolve test failures"
```

---

## Acceptance Criteria

- [ ] Urgent emails show by default
- [ ] Tabs switch between Urgent and Action emails
- [ ] Tab badges show email counts
- [ ] All components have improved UI
- [ ] Responsive design works on mobile
- [ ] Layout uses 60/40 column split

## Dependencies

This plan depends on the Calendar Component Fix plan being completed first for calendar UI improvements.
