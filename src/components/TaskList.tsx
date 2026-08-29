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
        const accountId = accounts.find(a => a.source === 'google-tasks')?.id;
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
        const accountId = accounts.find(a => a.source === 'google-tasks')?.id;
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
        const accountId = accounts.find(a => a.source === 'google-tasks')?.id;
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
    return <p>Loading tasks...</p>;
  }

  if (error) {
    return (
      <div>
        <p style={{ color: '#dc2626' }}>{error}</p>
        <button onClick={loadData} style={buttonStyle}>Retry</button>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div>
        <p>No task accounts connected</p>
        <button onClick={handleConnect} style={{ ...buttonStyle, background: GOOGLE_BLUE, color: '#fff' }}>
          Connect Task Account
        </button>
      </div>
    );
  }

  const activeTasks = tasks.filter((t) => t.status === 'needsAction' || t.status === '0');
  const completedTasks = tasks.filter((t) => t.status === 'completed' || t.status === '1');
  const visibleTasks = showCompleted ? tasks : activeTasks;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexShrink: 0 }}>
        <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
          {syncStatus?.lastSyncAt
            ? `Last sync: ${new Date(syncStatus.lastSyncAt).toLocaleTimeString()}`
            : 'Not yet synced'}
          {syncStatus?.status === 'syncing' && ' (syncing...)'}
        </span>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {completedTasks.length > 0 && (
            <button
              onClick={() => setShowCompleted(!showCompleted)}
              style={{ ...buttonStyle, fontSize: '0.75rem' }}
            >
              {showCompleted ? 'Hide' : 'Show'} Done ({completedTasks.length})
            </button>
          )}
          <button
            onClick={handleSync}
            disabled={syncStatus?.status === 'syncing'}
            style={{ ...buttonStyle, fontSize: '0.75rem', opacity: syncStatus?.status === 'syncing' ? 0.5 : 1 }}
          >
            Sync
          </button>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            style={{ ...buttonStyle, fontSize: '0.75rem', background: '#10b981', color: '#fff', border: 'none' }}
          >
            + Add Task
          </button>
        </div>
      </div>
      {showAddForm && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem', border: '1px solid #e5e7eb', borderRadius: '8px', background: '#f9fafb' }}>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <input
              type="text"
              placeholder="Task title"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              style={{ flex: 1, padding: '0.5rem', borderRadius: '4px', border: '1px solid #d1d5db' }}
            />
            <input
              type="date"
              value={newTaskDueDate}
              onChange={(e) => setNewTaskDueDate(e.target.value)}
              style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #d1d5db' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <select
              value={newTaskListId}
              onChange={(e) => setNewTaskListId(e.target.value)}
              style={{ flex: 1, padding: '0.5rem', borderRadius: '4px', border: '1px solid #d1d5db' }}
            >
              {availableLists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.source === 'google-tasks' ? '🟢 ' : '🔵 '}{list.title}
                </option>
              ))}
            </select>
            <button onClick={handleAddTask} style={{ ...buttonStyle, background: '#10b981', color: '#fff', border: 'none' }}>
              Save
            </button>
            <button onClick={() => setShowAddForm(false)} style={buttonStyle}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {visibleTasks.length === 0 ? (
        <p>{tasks.length === 0 ? 'No tasks found' : 'All tasks completed!'}</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, overflow: 'auto', flex: 1 }}>
          {visibleTasks.map((task) => {
            const taskAccount = accounts.find((a) => a.id === task.source || a.email === task.source);
            const taskColor = (taskAccount && accountsColorMap[taskAccount.email]) || GOOGLE_BLUE;
            return (
            <li
              key={task.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 0',
                borderBottom: '1px solid #e5e7eb',
                borderLeft: `3px solid ${taskColor}`,
                paddingLeft: '0.5rem',
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  background: task.source === 'Google Tasks' ? GOOGLE_BLUE : TICKTICK_BLUE,
                  color: '#fff',
                  borderRadius: '9999px',
                  padding: '0.125rem 0.5rem',
                  fontSize: '0.625rem',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
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
                style={{ flexShrink: 0 }}
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
                  style={{ flex: 1, padding: '0.25rem', fontSize: '0.875rem' }}
                />
              ) : (
                <span
                  style={{
                    flex: 1,
                    textDecoration: task.status === 'completed' || task.status === '1' ? 'line-through' : 'none',
                    color: task.status === 'completed' || task.status === '1' ? '#9ca3af' : '#111827',
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                  }}
                  onClick={() => handleEditStart(task)}
                  title="Click to edit"
                >
                  {task.title}
                </span>
              )}
              {task.dueAt && (
                <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                  {new Date(task.dueAt).toLocaleDateString()}
                </span>
              )}
              <button
                onClick={() => handleDelete(task)}
                style={{ ...buttonStyle, fontSize: '0.75rem', color: '#dc2626', border: 'none', padding: '0.125rem 0.25rem' }}
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

const buttonStyle: React.CSSProperties = {
  padding: '0.375rem 0.75rem',
  borderRadius: '4px',
  border: '1px solid #d1d5db',
  background: '#f9fafb',
  cursor: 'pointer',
  fontSize: '0.875rem',
};

export function TaskList() {
  return (
    <ErrorBoundary fallback={<p>Failed to load tasks</p>}>
      <TaskListInner />
    </ErrorBoundary>
  );
}