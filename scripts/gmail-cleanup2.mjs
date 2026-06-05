#!/usr/bin/env node
// Second-pass: archive recurring no-reply noise + promo spam out of inbox. Creds on stdin. --apply to mutate.
import fs from "node:fs";
const APPLY = process.argv.includes("--apply");
const creds = JSON.parse(fs.readFileSync(0, "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let token = await (async () => {
  const body = new URLSearchParams({ client_id: creds.client_id, client_secret: creds.client_secret,
    refresh_token: creds.refresh_token, grant_type: "refresh_token" });
  return (await (await fetch("https://oauth2.googleapis.com/token", { method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" }, body })).json()).access_token;
})();
const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const auth = () => ({ Authorization: `Bearer ${token}` });
async function apic(url, opts = {}, t = 0) {
  const r = await fetch(url, { ...opts, headers: { ...auth(), ...(opts.headers || {}) } });
  if ((r.status === 403 || r.status === 429) && t < 6) { await sleep(60000); return apic(url, opts, t + 1); }
  return r;
}
async function listIds(q) {
  let ids = [], pt = "";
  do { const u = new URL(`${API}/messages`); u.searchParams.set("q", q); u.searchParams.set("maxResults", "500");
    if (pt) u.searchParams.set("pageToken", pt);
    const j = await (await apic(u)).json(); (j.messages || []).forEach((m) => ids.push(m.id)); pt = j.nextPageToken || "";
  } while (pt); return ids;
}
async function batchModify(ids, add, remove) {
  for (let i = 0; i < ids.length; i += 1000) {
    const r = await apic(`${API}/messages/batchModify`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ids.slice(i, i + 1000), addLabelIds: add, removeLabelIds: remove }) });
    if (!r.ok) throw new Error(`batchModify ${r.status}: ${await r.text()}`);
  }
}
const NOTIF = "Label_95", NEWS = "Label_94", BASE = "in:inbox is:unread";
const RULES = [
  ["Ring→Notifications", `${BASE} from:rs.ring.com`, [NOTIF]],
  ["Blackboard→Notifications", `${BASE} from:blackboard.com`, [NOTIF]],
  ["ecobee→Notifications", `${BASE} from:ecobee.com`, [NOTIF]],
  ["EA/PlayStation→Notifications", `${BASE} (from:ea.com OR from:playstation.com)`, [NOTIF]],
  ["TomoCredit promo→Newsletters", `${BASE} from:tomocredit.com`, [NEWS]],
  ["yourguidetoassistance→Newsletters", `${BASE} from:yourguidetoassistance.com`, [NEWS]],
  ["insurance promo→Newsletters", `${BASE} (from:fastinsurance OR subject:"insurance rates")`, [NEWS]],
];
console.log(`\n=== Second pass ${APPLY ? "(APPLY)" : "(DRY RUN)"} ===\n`);
let total = 0;
for (const [name, q, add] of RULES) {
  const ids = await listIds(q); total += ids.length;
  console.log(`  ${String(ids.length).padStart(4)}  ${name}`);
  if (APPLY && ids.length) await batchModify(ids, add, ["INBOX"]);
}
console.log(`\n  ${String(total).padStart(4)}  TOTAL ${APPLY ? "archived" : "would archive"}`);
console.log(`  ${String((await listIds(BASE)).length).padStart(4)}  Inbox unread remaining`);
