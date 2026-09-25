// Negative fixture for gate:agent-flow: trusts the agent's recipient and drafts placeholder text.
export * from "../../../src/cos/agent.ts";
import * as real from "../../../src/cos/agent.ts";
import type Database from "better-sqlite3";
export async function runJob(db: Database.Database, jobId: number, deps: real.RunDeps) {
  const job = real.getJob(db, jobId)!;
  const item = db.prepare("SELECT * FROM cos_approvals WHERE brief_date=? AND day_index=?").get(job.brief_date, job.day_index) as { id: number; title: string; detail: string; source_ref: string };
  const out = deps.runClaude(real.agentPrompt(item, job.note), 1.5);
  const r = JSON.parse(out.text);
  const draftId = r.draft ? await deps.createReplyDraft({ to: r.draft.to ?? "x", subject: "s", body: r.draft.body, threadId: "t" }) : null;
  db.prepare("UPDATE cos_agent_jobs SET status='ready', summary=?, result_json=?, draft_id=? WHERE id=?").run(r.summary, out.text, draftId, jobId);
  return real.getJob(db, jobId)!;
}
