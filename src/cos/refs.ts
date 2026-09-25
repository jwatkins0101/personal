/**
 * Gmail source references across accounts (D23).
 *   gmail:<id>             personal account (the original format; existing data stays valid)
 *   gmail:<account>:<id>   any other profile in cos/accounts.json
 */
import { DEFAULT_ACCOUNT } from "../google/auth.js";

export interface GmailRef { account: string; id: string }

export function gmailRef(account: string | undefined, id: string): string {
  return !account || account === DEFAULT_ACCOUNT ? `gmail:${id}` : `gmail:${account}:${id}`;
}

export function parseGmailRef(ref: string | undefined | null): GmailRef | null {
  const m = /^gmail:(?:([a-z][a-z0-9-]*):)?([A-Za-z0-9_-]+)$/.exec(ref ?? "");
  return m ? { account: m[1] ?? DEFAULT_ACCOUNT, id: m[2] } : null;
}

export const isGmailRef = (ref: string | undefined | null) => parseGmailRef(ref) !== null;

/** Gmail web link that opens in the right signed-in account. */
export function gmailWebLink(ref: string, emailFor: (account: string) => string | null = () => null): string | undefined {
  const r = parseGmailRef(ref);
  if (!r) return undefined;
  const who = r.account === DEFAULT_ACCOUNT ? null : emailFor(r.account);
  return who ? `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(who)}#all/${r.id}` : `https://mail.google.com/mail/u/0/#all/${r.id}`;
}
