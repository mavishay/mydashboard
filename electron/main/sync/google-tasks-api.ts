import { google, type tasks_v1 } from 'googleapis';

type Tasks = tasks_v1.Tasks;

function createClient(accessToken: string): Tasks {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.tasks({ version: 'v1', auth });
}

export interface TaskListEntry {
  kind: string;
  id: string;
  title: string;
  updated: string;
  selfLink: string;
}

export interface TaskEntry {
  kind: string;
  id: string;
  title: string;
  notes?: string;
  status: string;
  updated: string;
  selfLink: string;
  position: string;
  parent?: string;
  links?: Array<{ description: string; link: string; title: string }>;
}

export async function listTaskLists(
  accessToken: string
): Promise<TaskListEntry[]> {
  const tasks = createClient(accessToken);
  const response = await tasks.tasklists.list();
  return (response.data.items ?? []) as TaskListEntry[];
}

export async function listTasks(
  accessToken: string,
  taskListId: string,
  syncToken?: string
): Promise<{ items: TaskEntry[]; nextPageToken?: string; syncToken?: string }> {
  const tasks = createClient(accessToken);
  const params: Tasks.Params$Resource$Tasks$List = {
    tasklist: taskListId,
    maxResults: 100,
  };

  if (syncToken) {
    params.syncToken = syncToken;
  } else {
    params.showCompleted = true;
    params.showHidden = true;
  }

  const response = await tasks.tasks.list(params);
  const items = (response.data.items ?? []) as TaskEntry[];

  return {
    items,
    nextPageToken: response.data.nextPageToken ?? undefined,
    syncToken: response.data.nextSyncToken ?? undefined,
  };
}

export async function insertTask(
  accessToken: string,
  taskListId: string,
  title: string,
  notes?: string
): Promise<TaskEntry> {
  const tasks = createClient(accessToken);
  const response = await tasks.tasks.insert({
    tasklist: taskListId,
    requestBody: {
      title,
      notes,
    },
  });
  return response.data as TaskEntry;
}

export async function updateTask(
  accessToken: string,
  taskListId: string,
  taskId: string,
  updates: { title?: string; notes?: string; status?: string }
): Promise<TaskEntry> {
  const tasks = createClient(accessToken);
  const response = await tasks.tasks.patch({
    tasklist: taskListId,
    task: taskId,
    requestBody: updates,
  });
  return response.data as TaskEntry;
}

export async function deleteTask(
  accessToken: string,
  taskListId: string,
  taskId: string
): Promise<void> {
  const tasks = createClient(accessToken);
  await tasks.tasks.delete({
    tasklist: taskListId,
    task: taskId,
  });
}

export async function getSyncToken(
  accessToken: string,
  taskListId: string
): Promise<string> {
  const tasks = createClient(accessToken);
  const response = await tasks.tasks.list({
    tasklist: taskListId,
    maxResults: 1,
  });
  const syncToken = response.data.nextSyncToken;
  if (!syncToken) {
    throw new Error('No sync token returned from Google Tasks API');
  }
  return syncToken;
}
