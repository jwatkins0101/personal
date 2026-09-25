/**
 * Source-or-silence verification (AC-13). Before a proposed action reaches the Decide bucket,
 * its source is re-fetched. The claimed sender must match the source's From header, and any
 * quoted date/deadline text must appear verbatim in the source subject or snippet.
 * Anything that fails goes to Escalations, never to Decide.
 */
export interface Proposal {
  kind: "reply" | "decide" | "task";
  title: string;
  detail?: string;
  source_ref: string;            // gmail:<id> | task:<id> | cal:<title>@<start>
  claimed_from?: string;         // sender name or address the synthesis says it came from
  due_quote?: string;            // exact text from the source that states a date/deadline
  draft_body?: string;           // reply only
}

export interface SourceView { from: string; subject: string; snippet: string; threadId?: string; messageIdHeader?: string }

export type Fetcher = (ref: string) => Promise<SourceView | null>;

export interface Verified { ok: Proposal[]; escalations: { proposal: Proposal; reason: string }[] }

const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

export async function verifyProposals(proposals: Proposal[], fetch: Fetcher): Promise<Verified> {
  const out: Verified = { ok: [], escalations: [] };
  for (const p of proposals) {
    let src: SourceView | null = null;
    try { src = await fetch(p.source_ref); } catch (e) { src = null; }
    if (!src) { out.escalations.push({ proposal: p, reason: `could not re-fetch ${p.source_ref}` }); continue; }
    if (p.claimed_from) {
      const from = norm(src.from);
      const tokens = norm(p.claimed_from).split(/[\s<>"@,]+/).filter((t) => t.length > 2);
      if (!tokens.length || !tokens.some((t) => from.includes(t))) {
        out.escalations.push({ proposal: p, reason: `sender mismatch: said "${p.claimed_from}", source From is "${src.from}"` });
        continue;
      }
    }
    if (p.due_quote) {
      const hay = norm(`${src.subject} ${src.snippet}`);
      if (!hay.includes(norm(p.due_quote))) {
        out.escalations.push({ proposal: p, reason: `date not in source: "${p.due_quote}" does not appear in ${p.source_ref}` });
        continue;
      }
    }
    out.ok.push(p);
  }
  return out;
}
