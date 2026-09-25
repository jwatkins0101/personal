/**
 * Low-level Gmail API helper.
 *
 * Auth reuses the `gws` CLI (Google Workspace CLI) the user is already logged into:
 * `gws auth export --unmasked` yields {client_id, client_secret, refresh_token}, which we
 * exchange for a short-lived access token (cached in-process). This avoids AppleScript on
 * Apple Mail, which times out on large mailboxes (`AppleEvent timed out -1712`).
 *
 * Quota note: Gmail allows 15,000 units/min/user. messages.get = 5 units; prefer
 * messages.list + batchModify (<=1000 ids/call, 50 units) for bulk work.
 */
import { authedFetch, isAuthed } from "../google/auth.js";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

export { isAuthed };

/** fetch() against the Gmail API with auth + transparent 429/403-quota backoff. */
function gapi(path: string, init: RequestInit = {}): Promise<Response> {
  return authedFetch(`${API}${path}`, init);
}

export interface GmailMeta {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  from: string;
  to: string;
  cc: string;
  subject: string;
  date: string;
  listUnsub: boolean; // has a List-Unsubscribe header => bulk/marketing, not a personal action
}

/** List message IDs matching a Gmail search query (paginated up to `max`). */
export async function listMessageIds(query: string, max = Infinity): Promise<string[]> {
  const ids: string[] = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({ q: query, maxResults: "500" });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await gapi(`/messages?${params}`);
    if (!res.ok) throw new Error(`Gmail list failed (${res.status}): ${await res.text()}`);
    const json = (await res.json()) as { messages?: { id: string }[]; nextPageToken?: string };
    for (const m of json.messages || []) {
      ids.push(m.id);
      if (ids.length >= max) return ids;
    }
    pageToken = json.nextPageToken || "";
  } while (pageToken);
  return ids;
}

/** Fetch header metadata + snippet for one message. */
export async function getMessageMeta(id: string): Promise<GmailMeta> {
  const params = new URLSearchParams({ format: "metadata" });
  ["From", "To", "Cc", "Subject", "Date", "List-Unsubscribe"].forEach((h) => params.append("metadataHeaders", h));
  const res = await gapi(`/messages/${id}?${params}`);
  if (!res.ok) throw new Error(`Gmail get failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as {
    id: string;
    threadId: string;
    labelIds?: string[];
    snippet?: string;
    payload?: { headers?: { name: string; value: string }[] };
  };
  const hdr: Record<string, string> = {};
  for (const h of json.payload?.headers || []) hdr[h.name.toLowerCase()] = h.value;
  return {
    id: json.id,
    threadId: json.threadId,
    labelIds: json.labelIds || [],
    snippet: json.snippet || "",
    from: hdr["from"] || "",
    to: hdr["to"] || "",
    cc: hdr["cc"] || "",
    subject: hdr["subject"] || "",
    date: hdr["date"] || "",
    listUnsub: !!hdr["list-unsubscribe"],
  };
}

/** Fetch metadata for many IDs with bounded concurrency. */
export async function getMessagesMeta(ids: string[], concurrency = 10): Promise<GmailMeta[]> {
  const out: GmailMeta[] = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, ids.length) }, async () => {
      while (i < ids.length) {
        const id = ids[i++];
        try {
          out.push(await getMessageMeta(id));
        } catch {
          /* skip individual failures */
        }
      }
    })
  );
  return out;
}

/** Add/remove labels on a single message. */
export async function modifyMessage(
  id: string,
  addLabelIds: string[] = [],
  removeLabelIds: string[] = []
): Promise<void> {
  const res = await gapi(`/messages/${id}/modify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ addLabelIds, removeLabelIds }),
  });
  if (!res.ok) throw new Error(`Gmail modify failed (${res.status}): ${await res.text()}`);
}

/** Add/remove labels on up to 1000 messages per call. */
export async function batchModify(
  ids: string[],
  addLabelIds: string[] = [],
  removeLabelIds: string[] = []
): Promise<void> {
  for (let i = 0; i < ids.length; i += 1000) {
    const chunk = ids.slice(i, i + 1000);
    const res = await gapi(`/messages/batchModify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: chunk, addLabelIds, removeLabelIds }),
    });
    if (!res.ok) throw new Error(`Gmail batchModify failed (${res.status}): ${await res.text()}`);
  }
}

// ---- Drafts (ai-chief-of-staff: reply drafts are A2; sending is A3 and happens only via `cos send N`) ----

/** Reads the RFC 822 Message-ID header of a message (for reply threading). */
export async function getMessageIdHeader(id: string): Promise<string> {
  const params = new URLSearchParams({ format: "metadata" });
  params.append("metadataHeaders", "Message-ID");
  const res = await gapi(`/messages/${id}?${params}`);
  if (!res.ok) throw new Error(`Gmail get failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { payload?: { headers?: { name: string; value: string }[] } };
  return json.payload?.headers?.find((h) => h.name.toLowerCase() === "message-id")?.value ?? "";
}

const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Creates a draft (in a thread when threadId is given). Returns the draft id. */
export async function createDraft(opts: { to: string; subject: string; body: string; threadId?: string; inReplyTo?: string }): Promise<string> {
  const headers = [`To: ${opts.to}`, `Subject: ${opts.subject}`, "Content-Type: text/plain; charset=UTF-8", "MIME-Version: 1.0"];
  if (opts.inReplyTo) headers.push(`In-Reply-To: ${opts.inReplyTo}`, `References: ${opts.inReplyTo}`);
  const raw = b64url(`${headers.join("\r\n")}\r\n\r\n${opts.body}`);
  const message: Record<string, string> = { raw };
  if (opts.threadId) message.threadId = opts.threadId;
  const res = await gapi(`/drafts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error(`Gmail draft create failed (${res.status}): ${await res.text()}`);
  return ((await res.json()) as { id: string }).id;
}

/** Creates a reply draft in the original thread. Returns the draft id. */
export async function createReplyDraft(opts: { to: string; subject: string; body: string; threadId: string; inReplyTo?: string }): Promise<string> {
  const subject = /^re:/i.test(opts.subject) ? opts.subject : `Re: ${opts.subject}`;
  return createDraft({ ...opts, subject });
}

/** Reads a draft's recipients, subject and plain-text body. */
export async function readDraft(draftId: string): Promise<{ to: string; subject: string; body: string }> {
  const res = await gapi(`/drafts/${draftId}?format=full`);
  if (!res.ok) throw new Error(`Gmail draft get failed (${res.status}): ${await res.text()}`);
  type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[]; headers?: { name: string; value: string }[] };
  const json = (await res.json()) as { message: { payload: Part } };
  const p = json.message.payload;
  const hdr = (n: string) => p.headers?.find((h) => h.name.toLowerCase() === n)?.value ?? "";
  const findText = (part: Part): string => {
    if (part.mimeType === "text/plain" && part.body?.data) return Buffer.from(part.body.data, "base64url").toString("utf8");
    for (const c of part.parts ?? []) { const t = findText(c); if (t) return t; }
    return part.body?.data ? Buffer.from(part.body.data, "base64url").toString("utf8") : "";
  };
  return { to: hdr("to"), subject: hdr("subject"), body: findText(p) };
}

/** Sends an existing draft. Returns the sent message id. */
export async function sendDraft(draftId: string): Promise<string> {
  const res = await gapi(`/drafts/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: draftId }),
  });
  if (!res.ok) throw new Error(`Gmail draft send failed (${res.status}): ${await res.text()}`);
  return ((await res.json()) as { id: string }).id;
}

/** Messages in a thread (ids, labels, internal timestamps) for reply detection. */
export async function getThreadMessages(threadId: string): Promise<{ id: string; labelIds: string[]; internalDate: number }[]> {
  const res = await gapi(`/threads/${threadId}?format=minimal`);
  if (!res.ok) throw new Error(`Gmail thread get failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { messages?: { id: string; labelIds?: string[]; internalDate: string }[] };
  return (json.messages ?? []).map((m) => ({ id: m.id, labelIds: m.labelIds ?? [], internalDate: Number(m.internalDate) }));
}
