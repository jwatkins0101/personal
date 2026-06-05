#!/usr/bin/env node
// Quota-cheap Gmail inbox cleanup via SEARCH QUERIES (no per-message fetch).
// Creds (gws auth export --unmasked JSON) on stdin. Default DRY RUN; --apply to mutate.
//
// Strategy (cutoff 160d): every rule's query includes `in:inbox is:unread`, and every
// rule removes INBOX — so once a message is processed it can't match a later rule (auto-dedupe).
// Rules run top→bottom: protect action-items first, then specific lanes, then category catch-alls.
//   OLD (older_than:160d)   -> archive + mark read (+ lane label where known)
//   RECENT (newer_than:160d) -> archive to lane label (kept unread); PRIMARY stays in inbox
// Never deletes/trashes. Self-throttles on 403 quota (waits 60s and retries).

import fs from "node:fs";

const APPLY = process.argv.includes("--apply");
const D = "160d";
const L = { RECEIPTS: "Label_96", SHIPPING: "Label_97", FINANCE: "Label_93", NEWS: "Label_94", NOTIF: "Label_95" };

const creds = JSON.parse(fs.readFileSync(0, "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getAccessToken() {
  const body = new URLSearchParams({ client_id: creds.client_id, client_secret: creds.client_secret,
    refresh_token: creds.refresh_token, grant_type: "refresh_token" });
  const j = await (await fetch("https://oauth2.googleapis.com/token", { method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" }, body })).json();
  if (!j.access_token) throw new Error("token refresh failed: " + JSON.stringify(j));
  return j.access_token;
}
let token = await getAccessToken();
const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const auth = () => ({ Authorization: `Bearer ${token}` });

async function api(url, opts = {}, tries = 0) {
  const r = await fetch(url, { ...opts, headers: { ...auth(), ...(opts.headers || {}) } });
  if (r.status === 403 || r.status === 429) {
    if (tries > 6) throw new Error("quota retries exhausted");
    process.stderr.write(`    (quota hit; waiting 60s, retry ${tries + 1})\n`);
    await sleep(60000);
    return api(url, opts, tries + 1);
  }
  return r;
}

async function listIds(q) {
  let ids = [], pageToken = "";
  do {
    const url = new URL(`${API}/messages`);
    url.searchParams.set("q", q);
    url.searchParams.set("maxResults", "500");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const j = await (await api(url)).json();
    (j.messages || []).forEach((m) => ids.push(m.id));
    pageToken = j.nextPageToken || "";
  } while (pageToken);
  return ids;
}

async function batchModify(ids, add, remove) {
  for (let i = 0; i < ids.length; i += 1000) {
    const chunk = ids.slice(i, i + 1000);
    const r = await api(`${API}/messages/batchModify`, { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: chunk, addLabelIds: add, removeLabelIds: remove }) });
    if (!r.ok) throw new Error(`batchModify ${r.status}: ${await r.text()}`);
  }
}

const PROTECT = '-subject:"action required" -subject:"past due" -subject:"payment failed" ' +
  '-subject:"unable to process" -subject:expiring -subject:expiration -subject:overdue ' +
  '-subject:suspended -subject:"final notice" -subject:"verify your"';

const BASE = "in:inbox is:unread";
// Ordered rules. addLabelIds, removeLabelIds.
const RULES = [
  // ---- OLD: bankruptcy (archive + mark read), labeled by category for findability ----
  ["OLD promotions→Newsletters", `${BASE} older_than:${D} category:promotions`, [L.NEWS], ["INBOX", "UNREAD"]],
  ["OLD forums→Newsletters",     `${BASE} older_than:${D} category:forums`,     [L.NEWS], ["INBOX", "UNREAD"]],
  ["OLD social→Notifications",   `${BASE} older_than:${D} category:social`,     [L.NOTIF], ["INBOX", "UNREAD"]],
  ["OLD updates→Notifications",  `${BASE} older_than:${D} category:updates`,    [L.NOTIF], ["INBOX", "UNREAD"]],
  ["OLD remainder→archive+read", `${BASE} older_than:${D}`,                     [], ["INBOX", "UNREAD"]],

  // ---- RECENT: protect action-items first (these stay because they never match later rules) ----
  // (no rule needed for protected items — they simply won't be touched)

  // ---- RECENT: specific lanes (kept unread, archived to label) ----
  ["RECENT Finance",  `${BASE} newer_than:${D} (from:chase.com OR from:americanexpress.com OR from:capitalone.com OR from:paypal.com OR from:venmo.com OR from:discover.com OR from:wellsfargo.com OR from:bankofamerica.com OR from:intuit.com OR from:citi.com OR subject:statement OR subject:"payment due" OR subject:"your bill" OR subject:autopay) ${PROTECT}`, [L.FINANCE], ["INBOX"]],
  ["RECENT Shipping", `${BASE} newer_than:${D} (subject:shipped OR subject:tracking OR subject:"out for delivery" OR subject:"on its way" OR subject:delivered OR subject:"your package") ${PROTECT}`, [L.SHIPPING], ["INBOX"]],
  ["RECENT Receipts", `${BASE} newer_than:${D} (subject:receipt OR subject:"order confirmation" OR subject:"your order" OR subject:"order #" OR subject:"purchase confirmation") ${PROTECT}`, [L.RECEIPTS], ["INBOX"]],

  // ---- RECENT: category catch-alls (protected items excluded) ----
  ["RECENT promotions→Newsletters", `${BASE} newer_than:${D} category:promotions ${PROTECT}`, [L.NEWS], ["INBOX"]],
  ["RECENT forums→Newsletters",     `${BASE} newer_than:${D} category:forums ${PROTECT}`,     [L.NEWS], ["INBOX"]],
  ["RECENT social→Notifications",   `${BASE} newer_than:${D} category:social ${PROTECT}`,     [L.NOTIF], ["INBOX"]],
  ["RECENT updates→Notifications",  `${BASE} newer_than:${D} category:updates ${PROTECT}`,    [L.NOTIF], ["INBOX"]],
  // RECENT primary + protected action-items remain in inbox.
];

console.log(`\n=== Gmail cleanup ${APPLY ? "(APPLY)" : "(DRY RUN)"} cutoff ${D} ===\n`);
let total = 0;
for (const [name, q, add, remove] of RULES) {
  const ids = await listIds(q);
  total += ids.length;
  console.log(`  ${String(ids.length).padStart(6)}  ${name}`);
  if (APPLY && ids.length) await batchModify(ids, add, remove);
}
console.log(`\n  ${String(total).padStart(6)}  TOTAL ${APPLY ? "modified" : "would be modified"}`);

// Report what remains in inbox
const remain = await listIds(`${BASE}`);
console.log(`\n  Inbox unread remaining: ${remain.length}`);
if (!APPLY) console.log(`\n(DRY RUN — re-run with --apply to execute.)`);
