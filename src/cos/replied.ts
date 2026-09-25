/**
 * "Did Jermaine already answer this?" (D17, AC-26). A message counts as answered when its thread
 * holds a message he SENT (not a draft) after it. Used by the brief (skip answered mail) and the
 * board (auto-complete items he handled outside the system). Works across accounts (D23).
 */
import { getThreadMessages, getMessageMeta } from "../mail/gmail-api.js";
import { withAccount } from "../google/auth.js";
import { gmailRef, parseGmailRef } from "./refs.js";

export interface Reply { sentId: string; at: string }   // sentId is a full gmail ref
export type RepliedFn = (ref: string) => Promise<Reply | null>;

export const repliedAfter: RepliedFn = async (ref) => {
  const r = parseGmailRef(ref);
  if (!r) return null;
  return withAccount(r.account, async () => {
    const meta = await getMessageMeta(r.id);
    const msgs = await getThreadMessages(meta.threadId);
    const src = msgs.find((m) => m.id === r.id);
    if (!src) return null;
    const sent = msgs.filter((m) => m.labelIds.includes("SENT") && !m.labelIds.includes("DRAFT") && m.internalDate > src.internalDate)
      .sort((a, b) => b.internalDate - a.internalDate)[0];
    return sent ? { sentId: gmailRef(r.account, sent.id), at: new Date(sent.internalDate).toISOString() } : null;
  });
};

/** Removes inbox items already answered; failures keep the item (never hide mail on an error). */
export async function dropAnswered<T extends { id: string; ref?: string }>(items: T[], replied: RepliedFn): Promise<{ kept: T[]; answered: { item: T; reply: Reply }[] }> {
  const kept: T[] = [], answered: { item: T; reply: Reply }[] = [];
  for (const it of items) {
    let r: Reply | null = null;
    try { r = await replied(it.ref ?? `gmail:${it.id}`); } catch { r = null; }
    if (r) answered.push({ item: it, reply: r }); else kept.push(it);
  }
  return { kept, answered };
}
