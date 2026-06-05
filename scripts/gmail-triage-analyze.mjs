#!/usr/bin/env node
// Reads gws-exported creds from stdin: {client_id, client_secret, refresh_token, type}
// Lists all unread inbox messages, fetches metadata, classifies into triage lanes.
// READ-ONLY: performs no mutations. Writes a plan JSON to the path in argv[2].

import fs from "node:fs";

const planPath = process.argv[2] || "/tmp/gmail-triage-plan.json";

const LANES = {
  ACTION: { label: null, name: "ACTION (stay in inbox)" },
  RECEIPTS: { label: "Label_96", name: "📥 Receipts" },
  SHIPPING: { label: "Label_97", name: "📦 Shipping" },
  FINANCE: { label: "Label_93", name: "💰 Finance" },
  NEWSLETTERS: { label: "Label_94", name: "📰 Newsletters" },
  NOTIFICATIONS: { label: "Label_95", name: "🔔 Notifications" },
};

const creds = JSON.parse(fs.readFileSync(0, "utf8"));

async function getAccessToken() {
  const body = new URLSearchParams({
    client_id: creds.client_id,
    client_secret: creds.client_secret,
    refresh_token: creds.refresh_token,
    grant_type: "refresh_token",
  });
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("token refresh failed: " + JSON.stringify(j));
  return j.access_token;
}

const token = await getAccessToken();
const H = { Authorization: `Bearer ${token}` };
const API = "https://gmail.googleapis.com/gmail/v1/users/me";

async function listAllUnreadInbox() {
  let ids = [], pageToken = "";
  do {
    const url = new URL(`${API}/messages`);
    url.searchParams.set("q", "in:inbox is:unread");
    url.searchParams.set("maxResults", "500");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const j = await (await fetch(url, { headers: H })).json();
    (j.messages || []).forEach((m) => ids.push(m.id));
    pageToken = j.nextPageToken || "";
  } while (pageToken);
  return ids;
}

async function getMeta(id) {
  const url = new URL(`${API}/messages/${id}`);
  url.searchParams.set("format", "metadata");
  ["From", "Subject", "Date", "List-Unsubscribe"].forEach((h) =>
    url.searchParams.append("metadataHeaders", h)
  );
  const j = await (await fetch(url, { headers: H })).json();
  const hdr = {};
  (j.payload?.headers || []).forEach((h) => (hdr[h.name.toLowerCase()] = h.value));
  return {
    id,
    threadId: j.threadId,
    labelIds: j.labelIds || [],
    from: hdr["from"] || "",
    subject: hdr["subject"] || "",
    date: hdr["date"] || "",
    listUnsub: !!hdr["list-unsubscribe"],
  };
}

// concurrency pool
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const idx = i++;
        try { out[idx] = await fn(items[idx]); }
        catch { out[idx] = null; }
      }
    })
  );
  return out.filter(Boolean);
}

function domainOf(from) {
  const m = from.match(/@([^>\s]+)/);
  return (m ? m[1] : "").toLowerCase();
}

function classify(m) {
  const d = domainOf(m.from);
  const s = m.subject.toLowerCase();
  const from = m.from.toLowerCase();
  const cat = m.labelIds;

  const has = (...words) => words.some((w) => s.includes(w));

  // NOTIFICATIONS — social/app/dev notifications
  const notifDomains = ["linkedin.com", "github.com", "notifications.google.com",
    "facebookmail.com", "mail.instagram.com", "x.com", "twitter.com", "slack.com",
    "discord.com", "reddit.com", "medium.com", "youtube.com", "quora.com", "nextdoor.com",
    "trello.com", "notion.so", "atlassian.net", "figma.com", "zoom.us", "calendly.com"];
  if (notifDomains.some((nd) => d.endsWith(nd)) || cat.includes("CATEGORY_SOCIAL"))
    return "NOTIFICATIONS";

  // SHIPPING
  if (has("shipped", "tracking", "out for delivery", "on its way", "has been delivered",
      "your delivery", "package", "arriving", "in transit") ||
      /(ups|fedex|usps|dhl|shipment)/.test(from) || /(ups|fedex|usps|dhl)/.test(d))
    return "SHIPPING";

  // RECEIPTS
  if (has("receipt", "order confirmation", "your order", "thank you for your order",
      "thanks for your purchase", "order #", "order number", "confirmation of your",
      "payment received", "your invoice", "purchase confirmation"))
    return "RECEIPTS";

  // FINANCE
  const finDomains = ["chase.com", "americanexpress.com", "capitalone.com", "bankofamerica.com",
    "wellsfargo.com", "paypal.com", "venmo.com", "intuit.com", "discover.com", "citi.com",
    "fidelity.com", "schwab.com", "ally.com", "sofi.com", "creditkarma.com", "robinhood.com",
    "coinbase.com", "stripe.com", "mint.com"];
  if (finDomains.some((fd) => d.endsWith(fd)) ||
      has("statement", "payment due", "your bill", "balance", "autopay", "subscription renew",
        "renewal", "your payment", "invoice due", "past due", "minimum payment", "account alert"))
    return "FINANCE";

  // NEWSLETTERS — has unsubscribe or is promotions category, and not caught above
  if (m.listUnsub || cat.includes("CATEGORY_PROMOTIONS") || cat.includes("CATEGORY_FORUMS") ||
      has("% off", "sale", "deal", "save ", "newsletter", "weekly", "digest", "unsubscribe",
        "limited time", "new arrivals", "shop now", "webinar", "this week", "ends soon"))
    return "NEWSLETTERS";

  return "ACTION";
}

const ids = await listAllUnreadInbox();
const metas = await pool(ids, 12, getMeta);

const plan = [];
const counts = {};
const senderTally = {};
for (const m of metas) {
  const lane = classify(m);
  counts[lane] = (counts[lane] || 0) + 1;
  const d = domainOf(m.from) || m.from;
  senderTally[d] = (senderTally[d] || 0) + 1;
  plan.push({ id: m.id, threadId: m.threadId, from: m.from, subject: m.subject, lane,
    label: LANES[lane].label });
}

fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));

console.log(`\nTotal unread in inbox: ${metas.length}\n`);
console.log("Proposed breakdown by lane:");
for (const [k, v] of Object.entries(LANES)) {
  console.log(`  ${String(counts[k] || 0).padStart(4)}  ${v.name}`);
}
console.log("\nTop sender domains:");
Object.entries(senderTally).sort((a, b) => b[1] - a[1]).slice(0, 15)
  .forEach(([d, n]) => console.log(`  ${String(n).padStart(3)}  ${d}`));

console.log("\nSample ACTION items (staying in inbox):");
plan.filter((p) => p.lane === "ACTION").slice(0, 15)
  .forEach((p) => console.log(`  • ${p.subject.slice(0, 60)}  —  ${p.from.slice(0, 40)}`));
console.log(`\nPlan written to ${planPath}`);
