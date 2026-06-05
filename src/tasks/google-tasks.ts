/**
 * Google Tasks client (shares the same Google auth as the Gmail client).
 *
 * Organized as a GTD workflow: Inbox -> Today -> Next -> Waiting On -> Someday.
 * Apple Reminders was rejected for AppleScript `whose`-filter slowness; this is pure HTTP.
 */
import { authedFetch } from "../google/auth.js";

const TAPI = "https://tasks.googleapis.com/tasks/v1";

// GTD lists, in display order. Titles include emoji for at-a-glance scanning.
export const GTD_LISTS = {
  inbox: "📥 Inbox",
  today: "🔥 Today",
  next: "⏭ Next",
  waiting: "⏳ Waiting On",
  someday: "💭 Someday",
} as const;

export type GtdKey = keyof typeof GTD_LISTS;

export interface TaskList {
  id: string;
  title: string;
}

export interface GoogleTask {
  id: string;
  title: string;
  notes?: string;
  due?: string; // RFC3339, date-only (time ignored by Google Tasks)
  status: "needsAction" | "completed";
  list?: string; // populated by listOpenTasks for convenience
}

async function tapi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await authedFetch(`${TAPI}${path}`, init);
  if (!res.ok) throw new Error(`Google Tasks ${init.method || "GET"} ${path} failed (${res.status}): ${await res.text()}`);
  return (await res.json()) as T;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export async function listTaskLists(): Promise<TaskList[]> {
  const json = await tapi<{ items?: TaskList[] }>("/users/@me/lists");
  return (json.items || []).map((l) => ({ id: l.id, title: l.title }));
}

export async function createTaskList(title: string): Promise<TaskList> {
  const l = await tapi<TaskList>("/users/@me/lists", jsonInit("POST", { title }));
  return { id: l.id, title: l.title };
}

/**
 * Ensure all five GTD lists exist; returns a map of GtdKey -> list id.
 * Idempotent: matches by exact title, creates only the missing ones.
 */
export async function ensureGtdLists(): Promise<Record<GtdKey, string>> {
  const existing = await listTaskLists();
  const byTitle = new Map(existing.map((l) => [l.title, l.id]));
  const out = {} as Record<GtdKey, string>;
  for (const key of Object.keys(GTD_LISTS) as GtdKey[]) {
    const title = GTD_LISTS[key];
    let id = byTitle.get(title);
    if (!id) id = (await createTaskList(title)).id;
    out[key] = id;
  }
  return out;
}

export async function listTasks(listId: string, includeCompleted = false): Promise<GoogleTask[]> {
  const params = new URLSearchParams({ maxResults: "100", showHidden: "false" });
  if (!includeCompleted) params.set("showCompleted", "false");
  const json = await tapi<{ items?: GoogleTask[] }>(`/lists/${listId}/tasks?${params}`);
  return json.items || [];
}

export interface NewTask {
  title: string;
  notes?: string;
  due?: string; // accepts "YYYY-MM-DD" or full RFC3339; normalized to date-only RFC3339
}

function normalizeDue(due?: string): string | undefined {
  if (!due) return undefined;
  const day = due.slice(0, 10); // YYYY-MM-DD
  return `${day}T00:00:00.000Z`;
}

export async function insertTask(listId: string, task: NewTask): Promise<GoogleTask> {
  const body: Record<string, unknown> = { title: task.title };
  if (task.notes) body.notes = task.notes;
  const due = normalizeDue(task.due);
  if (due) body.due = due;
  return tapi<GoogleTask>(`/lists/${listId}/tasks`, jsonInit("POST", body));
}

/** Read all open tasks across the GTD lists (for the daily briefing). */
export async function listOpenGtdTasks(): Promise<GoogleTask[]> {
  const ids = await ensureGtdLists();
  const out: GoogleTask[] = [];
  for (const key of Object.keys(GTD_LISTS) as GtdKey[]) {
    const tasks = await listTasks(ids[key]);
    for (const t of tasks) out.push({ ...t, list: GTD_LISTS[key] });
  }
  return out;
}
