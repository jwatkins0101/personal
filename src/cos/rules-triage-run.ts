/** Real (account-aware) dependencies and entry points for rules triage (D24). */
import { withAccount } from "../google/auth.js";
import { listMessageIds, getMessagesMeta, batchModify, ensureLabel } from "../mail/gmail-api.js";
import { baseDomain } from "./analyze.js";
import { loadRules, runRulesTriage, undoTriage, unstarTriage, type TriageDeps, type TriageResult } from "./rules-triage.js";
import { writeLaneSummary } from "./summary.js";

export function realDeps(account: string): TriageDeps {
  let sent: Set<string> | null = null;
  const run = <T>(f: () => Promise<T>) => withAccount(account, f);
  return {
    listIds: (q, max) => run(() => listMessageIds(q, max)),
    getMetas: (ids) => run(() => getMessagesMeta(ids)),
    ensureLabel: (name) => run(() => ensureLabel(name)),
    batchModify: (ids, add, remove) => run(() => batchModify(ids, add, remove)),
    sentDomains: async () => {
      if (sent) return sent;
      const metas = await run(async () => getMessagesMeta(await listMessageIds("in:sent newer_than:90d", 500)));
      sent = new Set(metas.flatMap((m) => `${m.to} ${m.cc}`.toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) ?? []).map((a) => baseDomain(a.split("@")[1])));
      return sent;
    },
  };
}

export async function hourly(account: string, now = new Date(), dryRun = false): Promise<TriageResult> {
  const cfg = loadRules().accounts[account];
  if (!cfg) throw new Error(`No triage rules for "${account}" in cos/triage-rules.json.`);
  const since = Math.floor(now.getTime() / 1000) - 90 * 60;   // epoch window (Gmail's newer_than "m" means months)
  const r = await runRulesTriage(account, cfg, `in:inbox after:${since}`, realDeps(account), { dryRun, now, tag: "hourly" });
  const out: Record<string, number> = { kept: r.kept };
  for (const [k, v] of Object.entries(r.archived)) out[`archived ${k}`] = v;
  writeLaneSummary({ items_in: r.scanned, items_out: out });
  return r;
}

export async function backlog(account: string, dryRun: boolean, max: number): Promise<TriageResult> {
  const all = loadRules();
  const cfg = all.accounts[account] ?? all.backlog_only[account];
  if (!cfg) throw new Error(`No backlog rules for "${account}".`);
  const days = cfg.backlog?.older_than_days ?? cfg.older_than_days ?? 30;
  return runRulesTriage(account, cfg, days > 0 ? `in:inbox older_than:${days}d` : "in:inbox", realDeps(account), { dryRun, max, tag: "backlog", noStar: true, onProgress: (d, t) => console.log(`  progress ${d}/${t}`) });
}

export const undo = (account: string, since: string, tag?: string) => undoTriage(account, since, realDeps(account), { tag });
export const unstar = (account: string, since: string, tag?: string) => unstarTriage(account, since, realDeps(account), { tag });
