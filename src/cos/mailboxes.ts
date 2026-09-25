/**
 * Mail that is forwarded into Gmail but must be answered from its own mailbox (D22).
 * UofL mail arrives in personal Gmail, but replies belong in Outlook: a reply drafted in Gmail
 * would go out from the Gmail address. The rule lives in cos/accounts.json (reply_elsewhere).
 */
import { loadAccounts } from "./accounts.js";

export interface ReplyElsewhere { domain: string; name: string; app: string; link: string }

export function replyElsewhereRules(): ReplyElsewhere[] {
  try { return (loadAccounts() as unknown as { reply_elsewhere?: ReplyElsewhere[] }).reply_elsewhere ?? []; } catch { return []; }
}

/** The rule that applies when any of the original To/Cc addresses is in a reply-elsewhere domain. */
export function replyElsewhere(recipients: string, rules = replyElsewhereRules()): ReplyElsewhere | null {
  const addrs = (recipients.toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) ?? []);
  return rules.find((r) => addrs.some((a) => a.endsWith(`@${r.domain.toLowerCase()}`) || a.endsWith(`.${r.domain.toLowerCase()}`))) ?? null;
}

export function elsewhereDetail(r: ReplyElsewhere): string {
  return `Sent to your ${r.name} address: reply from ${r.app} (a Gmail reply would come from your Gmail address).`;
}
