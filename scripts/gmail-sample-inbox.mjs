#!/usr/bin/env node
// Sample the remaining unread inbox: top sender domains + a sample of subjects.
// Creds (gws auth export --unmasked) on stdin.
import fs from "node:fs";
const creds = JSON.parse(fs.readFileSync(0, "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tok = await (async () => {
  const body = new URLSearchParams({ client_id: creds.client_id, client_secret: creds.client_secret,
    refresh_token: creds.refresh_token, grant_type: "refresh_token" });
  const j = await (await fetch("https://oauth2.googleapis.com/token", { method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" }, body })).json();
  return j.access_token;
})();
const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const H = { Authorization: `Bearer ${tok}` };
async function listIds(q) {
  let ids = [], pt = "";
  do { const u = new URL(`${API}/messages`); u.searchParams.set("q", q); u.searchParams.set("maxResults", "500");
    if (pt) u.searchParams.set("pageToken", pt);
    const j = await (await fetch(u, { headers: H })).json();
    (j.messages || []).forEach((m) => ids.push(m.id)); pt = j.nextPageToken || ""; } while (pt);
  return ids;
}
async function meta(id) {
  const u = new URL(`${API}/messages/${id}`); u.searchParams.set("format", "metadata");
  ["From", "Subject", "List-Unsubscribe"].forEach((h) => u.searchParams.append("metadataHeaders", h));
  const r = await fetch(u, { headers: H });
  if (r.status === 429 || r.status === 403) { await sleep(2000); return meta(id); }
  const j = await r.json(); const hd = {}; (j.payload?.headers || []).forEach((h) => hd[h.name.toLowerCase()] = h.value);
  return { from: hd["from"] || "", subject: hd["subject"] || "", unsub: !!hd["list-unsubscribe"] };
}
const ids = await listIds("in:inbox is:unread");
console.log(`Remaining unread inbox: ${ids.length}`);
// sample up to 120 for stats
const sample = ids.slice(0, 120);
const metas = [];
for (const id of sample) metas.push(await meta(id));
const dom = {}; let withUnsub = 0;
for (const m of metas) {
  const at = m.from.lastIndexOf("@"); const d = at === -1 ? m.from : m.from.slice(at + 1).replace(/[>\s].*/, "").toLowerCase();
  dom[d] = (dom[d] || 0) + 1; if (m.unsub) withUnsub++;
}
console.log(`\nIn a ${metas.length}-msg sample: ${withUnsub} have List-Unsubscribe (i.e. bulk/marketing that slipped into primary)`);
console.log(`\nTop sender domains in sample:`);
Object.entries(dom).sort((a, b) => b[1] - a[1]).slice(0, 18).forEach(([d, n]) => console.log(`  ${String(n).padStart(3)}  ${d}`));
console.log(`\nSample subjects:`);
metas.slice(0, 40).forEach((m) => console.log(`  ${m.unsub ? "📰" : "  "} ${m.subject.slice(0, 60).padEnd(60)} — ${m.from.slice(0, 30)}`));
