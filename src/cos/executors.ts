/** Real side-effect executors for approvals, shared by the CLI and the live board. Account-aware (D23). */
import type { Executors } from "./approvals.js";
import { readDraft, sendDraft } from "../mail/gmail-api.js";
import { ensureGtdLists, insertTask } from "../tasks/google-tasks.js";
import { withAccount } from "../google/auth.js";

export const realExecutors: Executors = {
  readDraft: (id, account) => withAccount(account, () => readDraft(id)),
  sendDraft: (id, account) => withAccount(account, () => sendDraft(id)),
  async createTask(title, notes) { const ids = await ensureGtdLists(); return (await insertTask(ids.inbox, { title, notes })).id; },
};
