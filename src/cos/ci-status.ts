/**
 * CI status from owlthat's CI alert emails (D24, AC-33). Triage archives the alerts; the brief reads the
 * latest one per workflow instead, so a RED build stays an escalation until "green again" arrives.
 */
import type { GmailMeta } from "../mail/gmail-api.js";
import { gmailRef } from "./refs.js";

export interface CiConfig { account: string; from: string; subject: string; lookback_days: number }
export interface CiState { workflow: string; branch: string; state: "red" | "green"; at: string; ref: string }

export function ciStatus(metas: GmailMeta[], cfg: CiConfig): CiState[] {
  const re = new RegExp(cfg.subject, "i");
  const latest = new Map<string, CiState & { t: number }>();
  for (const m of metas) {
    const x = re.exec(m.subject);
    if (!x) continue;
    const t = Date.parse(m.date) || 0;
    const key = `${x[1]}@${x[2]}`;
    const cur = latest.get(key);
    if (!cur || t > cur.t) latest.set(key, { workflow: x[1], branch: x[2], state: /red/i.test(x[3]) ? "red" : "green", at: new Date(t).toISOString(), ref: gmailRef(cfg.account, m.id), t });
  }
  return [...latest.values()].map(({ t: _t, ...s }) => s).sort((a, b) => a.workflow.localeCompare(b.workflow));
}

export const ciEscalations = (states: CiState[]) =>
  states.filter((s) => s.state === "red").map((s) => `CI RED: ${s.workflow} on ${s.branch} since ${s.at} (owlthat) [${s.ref}]`);
