/**
 * Read-only mailbox analysis across every signed-in account (D23, Part B): what each inbox holds,
 * who sends it, what you actually correspond with, and which triage rules would clear it.
 * Never modifies a mailbox. `npm run cos -- analyze` writes JSON + an HTML report.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { withAccount, authedFetch } from "../google/auth.js";
import { listMessageIds, getMessagesMeta } from "../mail/gmail-api.js";
import { activeAccounts, type Account } from "./accounts.js";
import { localDate } from "./approvals.js";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";
export const ANALYSIS_DIR = join(homedir(), "Library/Application Support/assistance/analysis");
const WINDOW_DAYS = 90, SAMPLE = 1500, SENT_SAMPLE = 500;

const domainOf = (addr: string) => ((addr.match(/<([^>]+)>/)?.[1] ?? addr).split("@")[1] ?? "").toLowerCase().trim().replace(/>$/, "");
const addrsIn = (h: string) => (h.toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) ?? []);
/** Registrable-ish domain for grouping senders: mail.x.com -> x.com, shop.amazon.co.uk -> amazon.co.uk. */
export const baseDomain = (d: string) => {
  const p = d.toLowerCase().split(".").filter(Boolean);
  if (p.length <= 2) return p.join(".");
  const secondLevel = /^(co|com|org|net|edu|gov|ac)$/.test(p[p.length - 2]) && p[p.length - 1].length === 2;
  return p.slice(secondLevel ? -3 : -2).join(".");
};

interface LabelCount { id: string; name: string; type: string; total: number; unread: number }

async function labelCounts(): Promise<LabelCount[]> {
  const list = (await (await authedFetch(`${API}/labels`)).json()) as { labels: { id: string; name: string; type: string }[] };
  const out: LabelCount[] = [];
  for (const l of list.labels) {
    if (l.type === "system" && !/^(INBOX|UNREAD|STARRED|IMPORTANT|SPAM|CATEGORY_)/.test(l.id)) continue;
    const g = (await (await authedFetch(`${API}/labels/${l.id}`)).json()) as { messagesTotal?: number; messagesUnread?: number };
    out.push({ id: l.id, name: l.name, type: l.type, total: g.messagesTotal ?? 0, unread: g.messagesUnread ?? 0 });
  }
  return out;
}

export interface DomainStat { domain: string; count: number; bulk: number; inInbox: number; unread: number; youWrite: boolean; category: string }
export interface MailboxReport {
  account: string; email: string | null;
  inbox: { total: number; unread: number }; totals: { messages: number | null };
  window: { days: number; sampled: number; capped: boolean; perDay: number };
  mix: { bulk: number; categories: Record<string, number>; stillInInbox: number; unreadInInbox: number };
  forwardedIn: { domain: string; count: number }[];
  topDomains: DomainStat[];
  youWriteTo: { domain: string; count: number }[];
  userLabels: { name: string; total: number }[];
  recommendation: { archiveDomains: string[]; keepDomains: string[]; inboxClearedPct: number; notes: string[] };
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

export async function analyzeAccount(acct: Account): Promise<MailboxReport> {
  return withAccount(acct.id, async () => {
    const profile = (await (await authedFetch(`${API}/profile`)).json()) as { emailAddress?: string; messagesTotal?: number };
    const labels = await labelCounts();
    const inboxL = labels.find((l) => l.id === "INBOX");
    const ids = await listMessageIds(`newer_than:${WINDOW_DAYS}d -in:chats`, SAMPLE);
    const metas = await getMessagesMeta(ids);
    const sentIds = await listMessageIds(`in:sent newer_than:${WINDOW_DAYS}d`, SENT_SAMPLE);
    const sent = await getMessagesMeta(sentIds);
    const own = (profile.emailAddress ?? acct.email ?? "").toLowerCase();

    const writeTo = new Map<string, number>();
    for (const m of sent) for (const a of addrsIn(`${m.to} ${m.cc}`)) if (a !== own) { const d = baseDomain(a.split("@")[1]); writeTo.set(d, (writeTo.get(d) ?? 0) + 1); }

    const received = metas.filter((m) => !m.labelIds.includes("SENT") && !m.labelIds.includes("DRAFT"));
    const cats: Record<string, number> = {};
    const byDomain = new Map<string, DomainStat>();
    const fwd = new Map<string, number>();
    const ownDomain = own.split("@")[1] ?? "";
    for (const m of received) {
      const cat = (m.labelIds.find((l) => l.startsWith("CATEGORY_")) ?? "CATEGORY_NONE").replace("CATEGORY_", "").toLowerCase();
      cats[cat] = (cats[cat] ?? 0) + 1;
      const d = baseDomain(domainOf(m.from) || "unknown");
      const s = byDomain.get(d) ?? { domain: d, count: 0, bulk: 0, inInbox: 0, unread: 0, youWrite: writeTo.has(d), category: cat };
      s.count++; if (m.listUnsub) s.bulk++; if (m.labelIds.includes("INBOX")) s.inInbox++; if (m.labelIds.includes("UNREAD")) s.unread++;
      byDomain.set(d, s);
      const toDomains = addrsIn(`${m.to} ${m.cc}`).map((a) => a.split("@")[1]);
      if (toDomains.length && !toDomains.some((x) => x === ownDomain || own === "")) for (const td of new Set(toDomains.map(baseDomain))) fwd.set(td, (fwd.get(td) ?? 0) + 1);
    }
    const top = [...byDomain.values()].sort((a, b) => b.count - a.count);
    const inInbox = received.filter((m) => m.labelIds.includes("INBOX"));
    // Rules: archive senders that are mostly bulk, frequent, that you never write to; keep anyone you write to.
    const archive = top.filter((s) => !s.youWrite && s.count >= 3 && s.bulk / s.count >= 0.8).map((s) => s.domain);
    const keep = top.filter((s) => s.youWrite).slice(0, 25).map((s) => s.domain);
    const cleared = inInbox.filter((m) => archive.includes(baseDomain(domainOf(m.from) || "unknown"))).length;
    const notes: string[] = [];
    if (received.length === SAMPLE) notes.push(`Busy mailbox: the ${SAMPLE}-message sample covers less than ${WINDOW_DAYS} days.`);
    if ((inboxL?.total ?? 0) > 5000) notes.push(`Large inbox backlog (${inboxL!.total.toLocaleString()} messages): a one-time cleanup of old bulk mail would help before hourly triage.`);
    if ([...fwd.values()].reduce((a, b) => a + b, 0) > received.length * 0.2) notes.push("A lot of this mail was addressed to other domains (forwarded in): route replies accordingly.");
    return {
      account: acct.id, email: profile.emailAddress ?? acct.email,
      inbox: { total: inboxL?.total ?? 0, unread: inboxL?.unread ?? 0 }, totals: { messages: profile.messagesTotal ?? null },
      window: { days: WINDOW_DAYS, sampled: received.length, capped: metas.length >= SAMPLE, perDay: Math.round((received.length / WINDOW_DAYS) * 10) / 10 },
      mix: { bulk: pct(received.filter((m) => m.listUnsub).length, received.length), categories: Object.fromEntries(Object.entries(cats).map(([k, v]) => [k, pct(v, received.length)])),
        stillInInbox: pct(inInbox.length, received.length), unreadInInbox: pct(inInbox.filter((m) => m.labelIds.includes("UNREAD")).length, inInbox.length) },
      forwardedIn: [...fwd.entries()].map(([domain, count]) => ({ domain, count })).sort((a, b) => b.count - a.count).slice(0, 5),
      topDomains: top.slice(0, 20),
      youWriteTo: [...writeTo.entries()].map(([domain, count]) => ({ domain, count })).sort((a, b) => b.count - a.count).slice(0, 15),
      userLabels: labels.filter((l) => l.type === "user").sort((a, b) => b.total - a.total).slice(0, 15).map((l) => ({ name: l.name, total: l.total })),
      recommendation: { archiveDomains: archive.slice(0, 40), keepDomains: keep, inboxClearedPct: pct(cleared, inInbox.length), notes },
    };
  });
}

export async function analyzeAll(): Promise<{ reports: MailboxReport[]; errors: { account: string; error: string }[]; json: string; html: string }> {
  const reports: MailboxReport[] = [], errors: { account: string; error: string }[] = [];
  for (const a of activeAccounts()) {
    try { reports.push(await analyzeAccount(a)); } catch (e) { errors.push({ account: a.id, error: (e as Error).message.slice(0, 200) }); }
  }
  mkdirSync(ANALYSIS_DIR, { recursive: true });
  const date = localDate();
  const json = join(ANALYSIS_DIR, `mailboxes-${date}.json`), html = join(ANALYSIS_DIR, `mailboxes-${date}.html`);
  writeFileSync(json, JSON.stringify({ generated_at: new Date().toISOString(), reports, errors }, null, 2));
  writeFileSync(html, reportHtml(reports, errors, date));
  return { reports, errors, json, html };
}

const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function reportHtml(reports: MailboxReport[], errors: { account: string; error: string }[], date: string): string {
  const card = (r: MailboxReport) => {
    const cats = Object.entries(r.mix.categories).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span class="chip">${esc(k)} ${v}%</span>`).join("");
    const rows = r.topDomains.map((d) => `<tr><td>${esc(d.domain)}</td><td>${d.count}</td><td>${pct(d.bulk, d.count)}%</td><td>${pct(d.inInbox, d.count)}%</td><td>${d.youWrite ? "✓" : ""}</td><td>${r.recommendation.archiveDomains.includes(d.domain) ? '<span class="arch">archive</span>' : d.youWrite ? '<span class="keep">keep</span>' : ""}</td></tr>`).join("");
    return `<section><h2>${esc(r.account)} <span class="muted">${esc(r.email ?? "")}</span></h2>
<div class="kpis">
 <div><b>${r.inbox.total.toLocaleString()}</b><span>in inbox (${r.inbox.unread.toLocaleString()} unread)</span></div>
 <div><b>${r.window.perDay}</b><span>emails/day${r.window.capped ? " (sample capped)" : ""}</span></div>
 <div><b>${r.mix.bulk}%</b><span>newsletters/marketing</span></div>
 <div><b>${r.mix.stillInInbox}%</b><span>of recent mail still in inbox</span></div>
 <div class="hi"><b>~${r.recommendation.inboxClearedPct}%</b><span>of recent inbox triage would clear</span></div>
</div>
<p class="muted">Gmail tabs: ${cats || "n/a"}</p>
${r.recommendation.notes.map((n) => `<p class="note">${esc(n)}</p>`).join("")}
${r.forwardedIn.length ? `<p class="muted">Addressed to other domains: ${r.forwardedIn.map((f) => `${esc(f.domain)} (${f.count})`).join(", ")}</p>` : ""}
<details open><summary>Top senders (last ${r.window.days} days, ${r.window.sampled} received)</summary>
<div class="tw"><table><tr><th>Sender domain</th><th>Emails</th><th>Bulk</th><th>Still in inbox</th><th>You write to them</th><th>Suggested</th></tr>${rows}</table></div></details>
<p><b>You correspond with:</b> ${r.youWriteTo.map((w) => esc(w.domain)).join(", ") || "n/a"}</p>
${r.userLabels.length ? `<p class="muted">Existing labels: ${r.userLabels.map((l) => `${esc(l.name)} (${l.total})`).join(", ")}</p>` : ""}
</section>`;
  };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Mailbox Analysis</title><style>
:root{--bg:#f7f6f2;--card:#fff;--ink:#1c1b18;--muted:#6b675e;--line:#e2dfd6;--accent:#2f5d50;--warn:#9a5b12}
@media (prefers-color-scheme:dark){:root{--bg:#141412;--card:#1d1c1a;--ink:#ecebe6;--muted:#a19d93;--line:#34322d;--accent:#7fc3ab;--warn:#e2ad63}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 -apple-system,system-ui,sans-serif}main{max-width:1000px;margin:0 auto;padding:28px 16px 60px}
h1{font:600 28px Georgia,serif;margin:0 0 6px}h2{font:600 20px Georgia,serif;margin:0 0 10px}section{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin:16px 0}
.muted{color:var(--muted)}.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:8px 0}.kpis div{border:1px solid var(--line);border-radius:10px;padding:10px}
.kpis b{display:block;font-size:22px}.kpis span{font-size:12px;color:var(--muted)}.kpis .hi{border-color:var(--accent)}.kpis .hi b{color:var(--accent)}
.chip{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:1px 8px;margin:2px;font-size:12px}.note{color:var(--warn)}
.tw{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line)}
.arch{color:var(--warn);font-weight:600}.keep{color:var(--accent);font-weight:600}
</style></head><body><main><h1>Mailbox analysis</h1><p class="muted">${date} · read-only · nothing in any mailbox was changed</p>
${errors.map((e) => `<p class="note">${esc(e.account)}: ${esc(e.error)}</p>`).join("")}
${reports.map(card).join("")}
<p class="muted">"Archive" = sender domain is ≥80% bulk mail, sent at least 3 emails, and you never write to it. "Keep" = you write to that domain. Estimates are from the last ${WINDOW_DAYS} days.</p>
</main></body></html>`;
}
