import { useState, useEffect, useCallback, Component, type ReactNode } from 'react';

const GOOGLE_BLUE = '#4285F4';
const TICKTICK_BLUE = '#3C8DFF';

interface TaskItem {
  id: string;
  title: string;
  body: string | null;
  status: 'needsAction' | 'completed' | '0' | '1';
  dueAt: string | null;
  source: string;
  completedAt: string | null;
  updatedAt: string;
  listId: string;
  listTitle: string;
  accountId?: string;
  // extra fields for TickTick
  projectId?: string;
  projectTitle?: string;
}

interface SyncStatus {
  status: 'idle' | 'syncing' | 'error';
  lastSyncAt: string | null;
  error: string | null;
  accountCount: number;
}

interface Account {
  id: string;
  email: string;
  displayName: string;
  color: string | null;
}

interface ListItem {
  id: string;
  title: string;
  source: 'google-tasks' | 'ticktick';
  accountId: string;
}

class ErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

function TaskListInner() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsColorMap, setAccountsColorMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [newTaskListId, setNewTaskListId] = useState('');
  const [availableLists, setAvailableLists] = useState<ListItem[]>([]);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [gtTasks, gtStatus, gtAccounts, ttTasks, ttStatus, ttAccounts, gmailAccounts] = await Promise.all([
        window.electronAPI.googleTasks.listTasks(),
        window.electronAPI.googleTasks.status(),
        window.electronAPI.googleTasks.listAccounts(),
        window.electronAPI.ticktick.listTasks(),
        window.electronAPI.ticktick.status(),
        window.electronAPI.ticktick.listAccounts(),
        window.electronAPI.gmail.listAccounts(),
      ]);
      // Normalize statuses to a common shape
      const normalizedGtTasks: TaskItem[] = gtTasks.map((t) => ({
        id: t.id,
        title: t.title,
        body: t.notes,
        status: t.status,
        dueAt: t.due,
        source: 'Google Tasks',
        completedAt: t.completedAt,
        updatedAt: t.updatedAt,
        listId: t.listId,
        listTitle: t.listTitle ?? '',
        accountId: t.accountId,
      }));
      const normalizedTtTasks: TaskItem[] = ttTasks.map((t) => ({
        id: t.id,
        title: t.title,
        body: t.content,
        status: t.status,
        dueAt: t.dueDate,
        source: 'TickTick',
        completedAt: t.completedAt,
        updatedAt: t.updatedAt,
        listId: t.projectId,
        listTitle: t.projectTitle ?? '',
        projectId: t.projectId,
        projectTitle: t.projectTitle,
      }));
      const merged = [...normalizedGtTasks, ...normalizedTtTasks].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      setTasks(merged);
      // Use first account for sync status (simplified)
      setSyncStatus({
        status: gtStatus.status === 'syncing' || ttStatus.status === 'syncing' ? 'syncing' : 'idle',
        lastSyncAt: gtStatus.lastSyncAt ?? ttStatus.lastSyncAt,
        error: gtStatus.error ?? ttStatus.error,
        accountCount: gtAccounts.length + ttAccounts.length,
      });
      setAccounts([...gtAccounts.map(a => ({ ...a, source: 'google-tasks' })), ...ttAccounts.map(a => ({ ...a, source: 'ticktick' }))]);
      const colorMap: Record<string, string> = {};
      for (const a of gmailAccounts) {
        if (a.color) colorMap[a.email] = a.color;
      }
      setAccountsColorMap(colorMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadAvailableLists = useCallback(async () => {
    try {
      const [gtAccounts, ttAccounts] = await Promise.all([
        window.electronAPI.googleTasks.listAccounts(),
        window.electronAPI.ticktick.listAccounts(),
      ]);
      const lists: ListItem[] = [];
      for (const acc of gtAccounts) {
        const gtLists = await window.electronAPI.googleTasks.listLists(acc.id);
        for (const l of gtLists) {
          lists.push({ id: l.id, title: l.title, source: 'google-tasks', accountId: acc.id });
        }
      }
      for (const acc of ttAccounts) {
        const ttProjects = await window.electronAPI.ticktick.listProjects(acc.id);
        for (const p of ttProjects) {
          lists.push({ id: p.id, title: p.name, source: 'ticktick', accountId: acc.id });
        }
      }
      setAvailableLists(lists);
      if (lists.length > 0 && !newTaskListId) {
        setNewTaskListId(lists[0].id);
      }
    } catch (err) {
      console.error('Failed to load lists:', err);
    }
  }, [newTaskListId]);

  useEffect(() => {
    if (showAddForm) {
      loadAvailableLists();
    }
  }, [showAddForm, loadAvailableLists]);

  const handleSync = async () => {
    // Sync both providers (simplified: sync first account of each)
    try {
      const [gtAccounts, ttAccounts] = await Promise.all([
        window.electronAPI.googleTasks.listAccounts(),
        window.electronAPI.ticktick.listAccounts(),
      ]);
      if (gtAccounts.length > 0) {
        await window.electronAPI.googleTasks.sync(gtAccounts[0].id);
      }
      if (ttAccounts.length > 0) {
        await window.electronAPI.ticktick.sync(ttAccounts[0].id);
      }
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    }
  };

  const handleConnect = async () => {
    // Placeholder: should open connection flow
    try {
      // For now, just reload
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    }
  };

  const handleToggleComplete = async (task: TaskItem) => {
    // Optimistic update
    const newStatus = task.source === 'Google Tasks'
      ? (task.status === 'completed' ? 'needsAction' : 'completed')
      : (task.status === '1' ? '0' : '1');
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t))
    );
    try {
      if (task.source === 'Google Tasks') {
        const accountId = task.accountId || accounts.find(a => a.source === 'google-tasks')?.id;
        if (!accountId) throw new Error('No Google Tasks account');
        await window.electronAPI.googleTasks.updateTask({
          accountId,
          taskListId: task.listId,
          taskId: task.id,
          status: newStatus as 'needsAction' | 'completed',
        });
      } else {
        const accountId = accounts.find(a => a.source === 'ticktick')?.id;
        if (!accountId) throw new Error('No TickTick account');
        await window.electronAPI.ticktick.updateTask({
          accountId,
          projectId: task.listId,
          taskId: task.id,
          status: newStatus as '0' | '1',
        });
      }
    } catch (err) {
      // Revert
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t))
      );
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  };

  const handleDelete = async (task: TaskItem) => {
    if (!window.confirm(`Delete "${task.title}"?`)) return;
    // Optimistic removal
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    try {
      if (task.source === 'Google Tasks') {
        const accountId = task.accountId || accounts.find(a => a.source === 'google-tasks')?.id;
        if (!accountId) throw new Error('No Google Tasks account');
        await window.electronAPI.googleTasks.deleteTask({
          accountId,
          taskListId: task.listId,
          taskId: task.id,
        });
      } else {
        const accountId = accounts.find(a => a.source === 'ticktick')?.id;
        if (!accountId) throw new Error('No TickTick account');
        await window.electronAPI.ticktick.deleteTask({
          accountId,
          projectId: task.listId,
          taskId: task.id,
        });
      }
    } catch (err) {
      // Re-add task (we lost original position, but that's okay)
      setTasks((prev) => [...prev, task].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) {
      setError('Title is required');
      return;
    }
    const listItem = availableLists.find((l) => l.id === newTaskListId);
    if (!listItem) {
      setError('Please select a list');
      return;
    }
    // Optimistic add
    const optimisticTask: TaskItem = {
      id: `temp-${Date.now()}`,
      title: newTaskTitle.trim(),
      body: null,
      status: listItem.source === 'google-tasks' ? 'needsAction' : '0',
      dueAt: newTaskDueDate || null,
      source: listItem.source === 'google-tasks' ? 'Google Tasks' : 'TickTick',
      completedAt: null,
      updatedAt: new Date().toISOString(),
      listId: listItem.id,
      listTitle: listItem.title,
    };
    setTasks((prev) => [optimisticTask, ...prev]);
    setShowAddForm(false);
    setNewTaskTitle('');
    setNewTaskDueDate('');
    try {
      if (listItem.source === 'google-tasks') {
        const result = await window.electronAPI.googleTasks.createTask({
          accountId: listItem.accountId,
          taskListId: listItem.id,
          title: newTaskTitle.trim(),
          notes: newTaskDueDate || undefined,
        });
        // Replace optimistic task with real task
        setTasks((prev) =>
          prev.map((t) =>
            t.id === optimisticTask.id
              ? {
                  id: result.id,
                  title: result.title,
                  body: result.notes,
                  status: result.status,
                  dueAt: result.due ?? null,
                  source: 'Google Tasks',
                  completedAt: result.completedAt,
                  updatedAt: result.updatedAt,
                  listId: result.listId,
                  listTitle: result.listTitle ?? '',
                }
              : t
          )
        );
      } else {
        const result = await window.electronAPI.ticktick.createTask({
          accountId: listItem.accountId,
          projectId: listItem.id,
          title: newTaskTitle.trim(),
          dueDate: newTaskDueDate || undefined,
        });
        // Replace optimistic task with real task
        setTasks((prev) =>
          prev.map((t) =>
            t.id === optimisticTask.id
              ? {
                  id: result.id,
                  title: result.title,
                  body: result.content,
                  status: result.status,
                  dueAt: result.dueDate ?? null,
                  source: 'TickTick',
                  completedAt: result.completedAt,
                  updatedAt: result.updatedAt,
                  listId: result.projectId,
                  listTitle: result.projectTitle ?? '',
                  projectId: result.projectId,
                  projectTitle: result.projectTitle,
                }
              : t
          )
        );
      }
    } catch (err) {
      // Remove optimistic task
      setTasks((prev) => prev.filter((t) => t.id !== optimisticTask.id));
      setError(err instanceof Error ? err.message : 'Failed to create task');
    }
  };

  const handleEditStart = (task: TaskItem) => {
    setEditingTaskId(task.id);
    setEditTitle(task.title);
  };

  const handleEditSave = async (task: TaskItem) => {
    if (!editTitle.trim()) {
      setEditingTaskId(null);
      return;
    }
    const newTitle = editTitle.trim();
    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, title: newTitle } : t))
    );
    setEditingTaskId(null);
    try {
      if (task.source === 'Google Tasks') {
        const accountId = task.accountId || accounts.find(a => a.source === 'google-tasks')?.id;
        if (!accountId) throw new Error('No Google Tasks account');
        await window.electronAPI.googleTasks.updateTask({
          accountId,
          taskListId: task.listId,
          taskId: task.id,
          title: newTitle,
        });
      } else {
        const accountId = accounts.find(a => a.source === 'ticktick')?.id;
        if (!accountId) throw new Error('No TickTick account');
        await window.electronAPI.ticktick.updateTask({
          accountId,
          projectId: task.listId,
          taskId: task.id,
          title: newTitle,
        });
      }
    } catch (err) {
      // Revert
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, title: task.title } : t))
      );
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    }
  };

  const handleEditCancel = () => {
    setEditingTaskId(null);
    setEditTitle('');
  };

  if (loading) {
    return <p className="text-muted-foreground">Loading tasks...</p>;
  }

  if (error) {
    return (
      <div>
        <p className="text-destructive">{error}</p>
        <button onClick={loadData} className="px-3 py-1.5 rounded border border-border bg-secondary cursor-pointer text-sm mt-2">Retry</button>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div>
        <p className="text-muted-foreground">No task accounts connected</p>
        <button onClick={handleConnect} className="px-3 py-1.5 rounded border-none bg-[#4285F4] text-white cursor-pointer text-sm mt-2">
          Connect Task Account
        </button>
      </div>
    );
  }

  const activeTasks = tasks.filter((t) => t.status === 'needsAction' || t.status === '0');
  const completedTasks = tasks.filter((t) => t.status === 'completed' || t.status === '1');
  const visibleTasks = showCompleted ? tasks : activeTasks;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex justify-between items-center mb-3 shrink-0">
        <span className="text-xs text-muted-foreground">
          {syncStatus?.lastSyncAt
            ? `Last sync: ${new Date(syncStatus.lastSyncAt).toLocaleTimeString()}`
            : 'Not yet synced'}
          {syncStatus?.status === 'syncing' && ' (syncing...)'}
        </span>
        <div className="flex gap-2 items-center">
          {completedTasks.length > 0 && (
            <button
              onClick={() => setShowCompleted(!showCompleted)}
              className="px-3 py-1.5 rounded border border-border bg-secondary cursor-pointer text-xs"
            >
              {showCompleted ? 'Hide' : 'Show'} Done ({completedTasks.length})
            </button>
          )}
          <button
            onClick={handleSync}
            disabled={syncStatus?.status === 'syncing'}
            className={`px-3 py-1.5 rounded border border-border bg-secondary cursor-pointer text-xs ${syncStatus?.status === 'syncing' ? 'opacity-50' : ''}`}
          >
            Sync
          </button>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-3 py-1.5 rounded border-none bg-emerald-500 text-white cursor-pointer text-xs"
          >
            + Add Task
          </button>
        </div>
      </div>
      {showAddForm && (
        <div className="mb-4 p-3 border border-border rounded-lg bg-secondary/50">
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              placeholder="Task title"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              className="flex-1 p-2 rounded border border-border"
            />
            <input
              type="date"
              value={newTaskDueDate}
              onChange={(e) => setNewTaskDueDate(e.target.value)}
              className="p-2 rounded border border-border"
            />
          </div>
          <div className="flex gap-2 items-center">
            <select
              value={newTaskListId}
              onChange={(e) => setNewTaskListId(e.target.value)}
              className="flex-1 p-2 rounded border border-border"
            >
              {availableLists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.source === 'google-tasks' ? '🟢 ' : '🔵 '}{list.title}
                </option>
              ))}
            </select>
            <button onClick={handleAddTask} className="px-3 py-1.5 rounded border-none bg-emerald-500 text-white cursor-pointer text-sm">
              Save
            </button>
            <button onClick={() => setShowAddForm(false)} className="px-3 py-1.5 rounded border border-border bg-secondary cursor-pointer text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}
      {visibleTasks.length === 0 ? (
        <p className="text-muted-foreground">{tasks.length === 0 ? 'No tasks found' : 'All tasks completed!'}</p>
      ) : (
        <ul className="list-none p-0 m-0 overflow-auto flex-1">
          {visibleTasks.map((task) => {
            const taskAccount = accounts.find((a) => a.id === task.source || a.email === task.source);
            const taskColor = (taskAccount && accountsColorMap[taskAccount.email]) || GOOGLE_BLUE;
            return (
            <li
              key={task.id}
              className="flex items-center gap-2 py-2 border-b border-border pl-2"
              style={{ borderLeftWidth: '3px', borderLeftColor: taskColor }}
            >
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-white"
                style={{ background: task.source === 'Google Tasks' ? GOOGLE_BLUE : TICKTICK_BLUE }}
                title={task.source}
                aria-label={task.source}
              >
                <span aria-hidden="true">{task.source}</span>
              </span>
              <input
                type="checkbox"
                checked={task.status === 'completed' || task.status === '1'}
                onChange={() => handleToggleComplete(task)}
                aria-label={`Mark "${task.title}" as ${task.status === 'completed' || task.status === '1' ? 'incomplete' : 'complete'}`}
                className="shrink-0"
              />
              {editingTaskId === task.id ? (
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={() => handleEditSave(task)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleEditSave(task);
                    if (e.key === 'Escape') handleEditCancel();
                  }}
                  autoFocus
                  className="flex-1 p-1 text-sm"
                />
              ) : (
                <span
                  className={`flex-1 text-sm cursor-pointer ${
                    task.status === 'completed' || task.status === '1'
                      ? 'line-through text-muted-foreground'
                      : 'text-foreground'
                  }`}
                  onClick={() => handleEditStart(task)}
                  title="Click to edit"
                >
                  {task.title}
                </span>
              )}
              {task.dueAt && (
                <span className="text-xs text-muted-foreground">
                  {new Date(task.dueAt).toLocaleDateString()}
                </span>
              )}
              <button
                onClick={() => handleDelete(task)}
                className="text-destructive border-none p-0.5 px-1 cursor-pointer text-xs bg-transparent"
                aria-label={`Delete "${task.title}"`}
              >
                ×
              </button>
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function TaskList() {
  return (
    <ErrorBoundary fallback={<p>Failed to load tasks</p>}>
      <TaskListInner />
    </ErrorBoundary>
  );
}