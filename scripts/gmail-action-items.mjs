#!/usr/bin/env node
// List genuine action-items: primary, unread, in inbox — with snippet + thread reply info. Read-only. Creds on stdin.
import fs from "node:fs";
const creds = JSON.parse(fs.readFileSync(0, "utf8"));
const tok = await (async () => {
  const body = new URLSearchParams({ client_id: creds.client_id, client_secret: creds.client_secret,
    refresh_token: creds.refresh_token, grant_type: "refresh_token" });
  return (await (await fetch("https://oauth2.googleapis.com/token", { method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" }, body })).json()).access_token;
})();
const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const H = { Authorization: `Bearer ${tok}` };
async function listIds(q) {
  let ids = [], pt = "";
  do { const u = new URL(`${API}/messages`); u.searchParams.set("q", q); u.searchParams.set("maxResults", "200");
    if (pt) u.searchParams.set("pageToken", pt);
    const j = await (await fetch(u, { headers: H })).json(); (j.messages || []).forEach((m) => ids.push(m.id)); pt = j.nextPageToken || "";
  } while (pt); return ids;
}
async function meta(id) {
  const u = new URL(`${API}/messages/${id}`); u.searchParams.set("format", "metadata");
  ["From", "Subject", "Date"].forEach((h) => u.searchParams.append("metadataHeaders", h));
  const j = await (await fetch(u, { headers: H })).json(); const hd = {};
  (j.payload?.headers || []).forEach((h) => hd[h.name.toLowerCase()] = h.value);
  return { id, threadId: j.threadId, internalDate: Number(j.internalDate || 0), snippet: j.snippet || "",
    from: hd["from"] || "", subject: hd["subject"] || "", date: hd["date"] || "" };
}
const ids = await listIds("in:inbox is:unread category:primary");
const metas = [];
let i = 0;
await Promise.all(Array.from({ length: 10 }, async () => { while (i < ids.length) { const id = ids[i++]; try { metas.push(await meta(id)); } catch {} } }));
metas.sort((a, b) => b.internalDate - a.internalDate);
console.log(`Primary unread (action candidates): ${metas.length}\n`);
for (const m of metas) {
  const who = m.from.replace(/<.*/, "").replace(/"/g, "").trim() || m.from;
  console.log(`• ${m.subject.slice(0, 62)}`);
  console.log(`    from: ${who.slice(0, 40)}  | ${m.date.slice(0, 22)}`);
  console.log(`    ${m.snippet.slice(0, 110)}`);
}
