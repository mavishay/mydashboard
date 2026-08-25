import { useState, useEffect, useCallback, Component, type ReactNode } from 'react';

const GOOGLE_BLUE = '#4285F4';

interface TaskItem {
  id: string;
  title: string;
  body: string | null;
  status: 'needsAction' | 'completed';
  dueAt: string | null;
  source: string;
  completedAt: string | null;
  updatedAt: string;
  listId: string;
  listTitle: string;
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [taskList, status, accountList] = await Promise.all([
        window.electronAPI.googleTasks.listTasks(),
        window.electronAPI.googleTasks.status(),
        window.electronAPI.googleTasks.listAccounts(),
      ]);
      setTasks(taskList);
      setSyncStatus(status);
      setAccounts(accountList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSync = async () => {
    if (accounts.length === 0) return;
    try {
      setSyncStatus((prev) => (prev ? { ...prev, syncing: true } : prev));
      await window.electronAPI.googleTasks.sync(accounts[0].id);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    }
  };

  const handleConnect = async () => {
    try {
      await window.electronAPI.googleTasks.connect();
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    }
  };

  const handleToggleComplete = async (task: TaskItem) => {
    if (accounts.length === 0) return;
    try {
      await window.electronAPI.googleTasks.updateTask({
        accountId: accounts[0].id,
        taskListId: task.listId,
        taskId: task.id,
        status: task.status === 'completed' ? 'needsAction' : 'completed',
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  };

  const handleDelete = async (task: TaskItem) => {
    if (accounts.length === 0) return;
    try {
      await window.electronAPI.googleTasks.deleteTask({
        accountId: accounts[0].id,
        taskListId: task.listId,
        taskId: task.id,
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
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
        <p>No Google Tasks account connected</p>
        <button onClick={handleConnect} style={{ ...buttonStyle, background: GOOGLE_BLUE, color: '#fff' }}>
          Connect Google Tasks
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
          {syncStatus?.lastSyncAt
            ? `Last sync: ${new Date(syncStatus.lastSyncAt).toLocaleTimeString()}`
            : 'Not yet synced'}
          {syncStatus?.status === 'syncing' && ' (syncing...)'}
        </span>
        <button
          onClick={handleSync}
          disabled={syncStatus?.status === 'syncing'}
          style={{ ...buttonStyle, fontSize: '0.75rem', opacity: syncStatus?.status === 'syncing' ? 0.5 : 1 }}
        >
          Sync
        </button>
      </div>
      {tasks.length === 0 ? (
        <p>No tasks found</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {tasks.map((task) => (
            <li
              key={task.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 0',
                borderBottom: '1px solid #e5e7eb',
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  background: GOOGLE_BLUE,
                  color: '#fff',
                  borderRadius: '9999px',
                  padding: '0.125rem 0.5rem',
                  fontSize: '0.625rem',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
                title="Google Tasks"
                aria-label="Google Tasks"
              >
                <span aria-hidden="true">Google Tasks</span>
              </span>
              <input
                type="checkbox"
                checked={task.status === 'completed'}
                onChange={() => handleToggleComplete(task)}
                aria-label={`Mark "${task.title}" as ${task.status === 'completed' ? 'incomplete' : 'complete'}`}
                style={{ flexShrink: 0 }}
              />
              <span
                style={{
                  flex: 1,
                  textDecoration: task.status === 'completed' ? 'line-through' : 'none',
                  color: task.status === 'completed' ? '#9ca3af' : '#111827',
                  fontSize: '0.875rem',
                }}
              >
                {task.title}
              </span>
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
          ))}
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
