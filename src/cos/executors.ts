/** Real side-effect executors for approvals, shared by the CLI and the live board. */
import type { Executors } from "./approvals.js";
import { readDraft, sendDraft } from "../mail/gmail-api.js";
import { ensureGtdLists, insertTask } from "../tasks/google-tasks.js";

export const realExecutors: Executors = {
  readDraft,
  sendDraft,
  async createTask(title, notes) { const ids = await ensureGtdLists(); return (await insertTask(ids.inbox, { title, notes })).id; },
};
