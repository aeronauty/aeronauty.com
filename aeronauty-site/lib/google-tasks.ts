import { google } from "googleapis";
import { upsertAccount, type GoogleTokens } from "./token-store";
import type { Reminder, ReminderList } from "./types";

async function getClient(account: GoogleTokens) {
  const oauth2 = new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET
  );

  if (account.expiresAt - Date.now() < 5 * 60 * 1000) {
    oauth2.setCredentials({ refresh_token: account.refreshToken });
    const { credentials } = await oauth2.refreshAccessToken();
    const refreshed: GoogleTokens = {
      ...account,
      accessToken: credentials.access_token!,
      expiresAt: (credentials.expiry_date as number) ?? Date.now() + 3600 * 1000,
    };
    await upsertAccount(refreshed);
    oauth2.setCredentials(credentials);
  } else {
    oauth2.setCredentials({ access_token: account.accessToken });
  }

  return google.tasks({ version: "v1", auth: oauth2 });
}

export async function fetchGoogleTaskLists(
  account: GoogleTokens
): Promise<ReminderList[]> {
  const tasks = await getClient(account);
  const res = await tasks.tasklists.list({ maxResults: 100 });
  const lists = res.data.items ?? [];

  const result: ReminderList[] = [];
  for (const list of lists) {
    if (!list.id) continue;

    const itemsRes = await tasks.tasks.list({
      tasklist: list.id,
      maxResults: 100,
      showCompleted: true,
      showHidden: true,
    });

    const reminders: Reminder[] = (itemsRes.data.items ?? [])
      .filter((t) => t.id && t.title)
      .map((t) => ({
        id: t.id!,
        title: t.title ?? "(No title)",
        notes: t.notes ?? undefined,
        dueDate: t.due ? t.due.slice(0, 10) : undefined,
        completed: t.status === "completed",
        completedDate: t.completed ?? undefined,
        listId: list.id!,
        listName: list.title ?? "Tasks",
        source: "google" as const,
        accountEmail: account.email,
      }));

    result.push({
      id: list.id,
      name: list.title ?? "Tasks",
      source: "google",
      accountEmail: account.email,
      reminders,
    });
  }

  return result;
}

export async function createGoogleTask(
  account: GoogleTokens,
  listId: string,
  task: { title: string; notes?: string; dueDate?: string }
) {
  const tasks = await getClient(account);
  const res = await tasks.tasks.insert({
    tasklist: listId,
    requestBody: {
      title: task.title,
      notes: task.notes,
      due: task.dueDate ? new Date(task.dueDate).toISOString() : undefined,
    },
  });
  return res.data.id;
}

export async function completeGoogleTask(
  account: GoogleTokens,
  listId: string,
  taskId: string
) {
  const tasks = await getClient(account);

  // Get current status first
  const current = await tasks.tasks.get({ tasklist: listId, task: taskId });
  const isCompleted = current.data.status === "completed";

  await tasks.tasks.update({
    tasklist: listId,
    task: taskId,
    requestBody: {
      ...current.data,
      status: isCompleted ? "needsAction" : "completed",
      completed: isCompleted ? null : new Date().toISOString(),
    },
  });
}

export async function deleteGoogleTask(
  account: GoogleTokens,
  listId: string,
  taskId: string
) {
  const tasks = await getClient(account);
  await tasks.tasks.delete({ tasklist: listId, task: taskId });
}
