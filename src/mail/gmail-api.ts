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
  ["From", "To", "Subject", "Date", "List-Unsubscribe"].forEach((h) => params.append("metadataHeaders", h));
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
