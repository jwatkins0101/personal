/**
 * Rules-based triage for the non-personal mailboxes (D24, AC-31/AC-32). Deterministic: sender and
 * subject rules from cos/triage-rules.json, no model. Archive only (never delete); every change gets a
 * CoS/... label and a line in an undo log. Anything no rule matches stays in the inbox; starred mail
 * and senders you've written to in the last 90 days always stay.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { GmailMeta } from "../mail/gmail-api.js";
import { baseDomain } from "./analyze.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const RULES_PATH = process.env.COS_TRIAGE_RULES ?? resolve(REPO_ROOT, "cos/triage-rules.json");
export const UNDO_DIR = process.env.COS_TRIAGE_LOG_DIR ?? join(homedir(), "Library/Application Support/assistance/triage-log");

export interface Rule { name: string; from?: string[]; from_domain?: string[]; subject?: string; bulk?: boolean; category?: string[]; action: "keep" | "keep_star" | "archive"; label?: string }
export interface AccountRules { labels: Record<string, string>; rules: Rule[]; backlog?: { older_than_days: number; include_unread: boolean }; older_than_days?: number }
export interface Decision { action: "keep" | "keep_star" | "archive"; label?: string; rule: string }

export function loadRules(): { accounts: Record<string, AccountRules>; backlog_only: Record<string, AccountRules> } {
  return JSON.parse(readFileSync(RULES_PATH, "utf8"));
}

const addrOf = (from: string) => (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();
const domainOf = (from: string) => addrOf(from).split("@")[1] ?? "";
const categoryOf = (m: GmailMeta) => (m.labelIds.find((l) => l.startsWith("CATEGORY_")) ?? "CATEGORY_NONE").replace("CATEGORY_", "").toLowerCase();

export function ruleMatches(m: GmailMeta, r: Rule): boolean {
  const d = domainOf(m.from);
  if (r.from && !r.from.map((x) => x.toLowerCase()).includes(addrOf(m.from))) return false;
  if (r.from_domain && !r.from_domain.some((x) => d === x.toLowerCase() || d.endsWith(`.${x.toLowerCase()}`))) return false;
  if (r.subject && !new RegExp(r.subject, "i").test(m.subject)) return false;
  if (r.bulk !== undefined && m.listUnsub !== r.bulk) return false;
  if (r.category && !r.category.includes(categoryOf(m))) return false;
  return true;
}

export function decide(m: GmailMeta, cfg: AccountRules, youWriteTo: Set<string>): Decision {
  if (m.labelIds.includes("STARRED")) return { action: "keep", rule: "starred" };
  const sender = baseDomain(domainOf(m.from));
  const r = cfg.rules.find((x) => ruleMatches(m, x));
  // Protective rules (keep/keep_star) always apply; otherwise people you write to stay.
  if (r && r.action !== "archive") return { action: r.action, rule: r.name };
  // A rule naming exact sender addresses (e.g. website@owlthat.com CI alerts) beats "you write to this domain".
  if (r && r.from?.length) return { action: "archive", label: r.label ? cfg.labels[r.label] : undefined, rule: r.name };
  if (sender && youWriteTo.has(sender)) return { action: "keep", rule: "you write to this sender" };
  if (r) return { action: "archive", label: r.label ? cfg.labels[r.label] : undefined, rule: r.name };
  return { action: "keep", rule: "no rule matched" };
}

export interface TriageDeps {
  listIds: (q: string, max: number) => Promise<string[]>;
  getMetas: (ids: string[]) => Promise<GmailMeta[]>;
  sentDomains: () => Promise<Set<string>>;
  ensureLabel: (name: string) => Promise<string>;
  batchModify: (ids: string[], add: string[], remove: string[]) => Promise<void>;
}

export interface TriageResult { account: string; query: string; scanned: number; kept: number; starred: number; archived: Record<string, number>; byRule: Record<string, number>; dryRun: boolean; logPath: string }

/** Classifies messages from `query` and (unless dryRun) applies the decisions, logging every change for undo. */
export async function runRulesTriage(account: string, cfg: AccountRules, query: string, deps: TriageDeps, opts: { dryRun?: boolean; max?: number; now?: Date; tag?: string; noStar?: boolean } = {}): Promise<TriageResult> {
  const now = opts.now ?? new Date();
  const ids = await deps.listIds(query, opts.max ?? 500);
  const metas = ids.length ? await deps.getMetas(ids) : [];
  const writeTo = await deps.sentDomains();
  const toArchive = new Map<string, string[]>(); const toStar: string[] = [];
  const byRule: Record<string, number> = {};
  let kept = 0;
  for (const m of metas) {
    const d = decide(m, cfg, writeTo);
    byRule[d.rule] = (byRule[d.rule] ?? 0) + 1;
    if (d.action === "archive") { const k = d.label ?? ""; toArchive.set(k, [...(toArchive.get(k) ?? []), m.id]); }
    else { kept++; if (d.action === "keep_star" && !opts.noStar && !m.labelIds.includes("STARRED")) toStar.push(m.id); }
  }
  mkdirSync(UNDO_DIR, { recursive: true });
  const logPath = join(UNDO_DIR, `${account}.jsonl`);
  const archived: Record<string, number> = {};
  for (const [label, list] of toArchive) archived[label || "(no label)"] = list.length;
  if (!opts.dryRun) {
    for (const [label, list] of toArchive) {
      const labelId = label ? await deps.ensureLabel(label) : null;
      await deps.batchModify(list, labelId ? [labelId] : [], ["INBOX"]);
      for (const id of list) appendFileSync(logPath, JSON.stringify({ at: now.toISOString(), account, id, action: "archive", label, labelId, tag: opts.tag ?? "hourly" }) + "\n");
    }
    if (toStar.length) {
      await deps.batchModify(toStar, ["STARRED"], []);
      for (const id of toStar) appendFileSync(logPath, JSON.stringify({ at: now.toISOString(), account, id, action: "star", tag: opts.tag ?? "hourly" }) + "\n");
    }
  }
  return { account, query, scanned: metas.length, kept, starred: toStar.length, archived, byRule, dryRun: !!opts.dryRun, logPath };
}

/** Removes stars this system added (logged "star" actions) at/after `sinceIso`. */
export async function unstarTriage(account: string, sinceIso: string, deps: Pick<TriageDeps, "batchModify">, opts: { tag?: string } = {}): Promise<number> {
  const logPath = join(UNDO_DIR, `${account}.jsonl`);
  if (!existsSync(logPath)) return 0;
  const ids = readFileSync(logPath, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { at: string; id: string; action: string; tag?: string })
    .filter((e) => e.action === "star" && Date.parse(e.at) >= Date.parse(sinceIso) && (!opts.tag || e.tag === opts.tag)).map((e) => e.id);
  if (ids.length) await deps.batchModify(ids, [], ["STARRED"]);
  appendFileSync(logPath, JSON.stringify({ at: new Date().toISOString(), account, action: "unstar", since: sinceIso, tag: opts.tag ?? null, count: ids.length }) + "\n");
  return ids.length;
}

/** Puts archived messages back in the inbox (and removes the CoS label) for changes at/after `sinceIso`. */
export async function undoTriage(account: string, sinceIso: string, deps: Pick<TriageDeps, "batchModify">, opts: { tag?: string } = {}): Promise<number> {
  const logPath = join(UNDO_DIR, `${account}.jsonl`);
  if (!existsSync(logPath)) return 0;
  const entries = readFileSync(logPath, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { at: string; id: string; action: string; labelId?: string | null; tag?: string })
    .filter((e) => e.action === "archive" && Date.parse(e.at) >= Date.parse(sinceIso) && (!opts.tag || e.tag === opts.tag));
  const byLabel = new Map<string, string[]>();
  for (const e of entries) byLabel.set(e.labelId ?? "", [...(byLabel.get(e.labelId ?? "") ?? []), e.id]);
  for (const [labelId, ids] of byLabel) await deps.batchModify(ids, ["INBOX"], labelId ? [labelId] : []);
  appendFileSync(logPath, JSON.stringify({ at: new Date().toISOString(), account, action: "undo", since: sinceIso, tag: opts.tag ?? null, count: entries.length }) + "\n");
  return entries.length;
}
