#!/usr/bin/env node
// Inbox bankruptcy + recent triage via Gmail API.
// Creds (gws auth export --unmasked JSON) on stdin. Cutoff days in --days (default 160).
// Default = DRY RUN (analyze + print plan). Pass --apply to mutate.
//
// OLD  (older than cutoff): add lane label (if any) + remove INBOX + remove UNREAD  -> bankruptcy
// RECENT (within cutoff):
//    FYI lanes  -> add lane label + remove INBOX (kept UNREAD)
//    ACTION     -> left untouched in inbox
//
// Never deletes/trashes. Uses messages.batchModify (<=1000 ids/call).

import fs from "node:fs";

const APPLY = process.argv.includes("--apply");
const daysArg = process.argv.find((a) => a.startsWith("--days="));
const CUTOFF_DAYS = daysArg ? parseInt(daysArg.split("=")[1], 10) : 160;
const planPath = "/tmp/gmail-bankruptcy-plan.json";

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
    client_id: creds.client_id, client_secret: creds.client_secret,
    refresh_token: creds.refresh_token, grant_type: "refresh_token",
  });
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("token refresh failed: " + JSON.stringify(j));
  return j.access_token;
}

const token = await getAccessToken();
const H = { Authorization: `Bearer ${token}` };
const JH = { ...H, "Content-Type": "application/json" };
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
  ["From", "Subject", "List-Unsubscribe"].forEach((h) => url.searchParams.append("metadataHeaders", h));
  const r = await fetch(url, { headers: H });
  if (r.status === 429 || r.status === 503) { await sleep(500 + Math.floor(performance.now() % 500)); return getMeta(id); }
  const j = await r.json();
  const hdr = {};
  (j.payload?.headers || []).forEach((h) => (hdr[h.name.toLowerCase()] = h.value));
  return {
    id, internalDate: Number(j.internalDate || 0), labelIds: j.labelIds || [],
    from: hdr["from"] || "", subject: hdr["subject"] || "", listUnsub: !!hdr["list-unsubscribe"],
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const idx = i++; try { out[idx] = await fn(items[idx]); } catch { out[idx] = null; } }
  }));
  return out.filter(Boolean);
}

function domainOf(from) {
  const at = from.lastIndexOf("@");
  if (at === -1) return "";
  return from.slice(at + 1).replace(/[>\s].*$/, "").toLowerCase().trim();
}

function classify(m) {
  const d = domainOf(m.from);
  const s = m.subject.toLowerCase();
  const from = m.from.toLowerCase();
  const cat = m.labelIds;
  const has = (...w) => w.some((x) => s.includes(x));
  const automated = /(no-?reply|do-?not-?reply|donotreply|notification|notify|mailer|bounce|alerts?@|updates?@|info@|news@|hello@|team@|support@)/.test(from);

  // ACTION override: money/account problems that need a human even if from a no-reply
  if (has("action required", "past due", "payment failed", "unable to process", "payment declined",
      "suspended", "expiring", "expired", "expiration", "verify your", "confirm your", "overdue",
      "final notice", "will be cancelled", "will be canceled", "renew now"))
    return "ACTION_ATTN";

  const notifDomains = ["linkedin.com", "github.com", "notifications.google.com", "facebookmail.com",
    "mail.instagram.com", "x.com", "twitter.com", "slack.com", "discord.com", "reddit.com", "medium.com",
    "youtube.com", "quora.com", "nextdoor.com", "trello.com", "notion.so", "atlassian.net", "figma.com",
    "zoom.us", "calendly.com", "ring.com", "nest.com", "google.com", "accounts.google.com"];
  if (notifDomains.some((nd) => d.endsWith(nd)) || cat.includes("CATEGORY_SOCIAL")) return "NOTIFICATIONS";

  if (has("shipped", "tracking", "out for delivery", "on its way", "has been delivered", "your delivery",
      "package", "arriving", "in transit") || /(ups|fedex|usps|dhl)/.test(d)) return "SHIPPING";

  if (has("receipt", "order confirmation", "your order", "thank you for your order", "thanks for your purchase",
      "order #", "order number", "purchase confirmation", "your invoice")) return "RECEIPTS";

  const finDomains = ["chase.com", "americanexpress.com", "capitalone.com", "bankofamerica.com", "wellsfargo.com",
    "paypal.com", "venmo.com", "intuit.com", "discover.com", "citi.com", "fidelity.com", "schwab.com", "ally.com",
    "sofi.com", "creditkarma.com", "robinhood.com", "coinbase.com", "stripe.com", "mint.com", "tomocredit.com"];
  if (finDomains.some((fd) => d.endsWith(fd)) || has("statement", "payment due", "your bill", "balance",
      "autopay", "subscription renew", "renewal", "your payment", "invoice", "minimum payment", "account alert"))
    return "FINANCE";

  if (m.listUnsub || cat.includes("CATEGORY_PROMOTIONS") || cat.includes("CATEGORY_FORUMS") ||
      has("% off", "sale", "deal", "save ", "newsletter", "weekly", "digest", "unsubscribe", "limited time",
        "new arrivals", "shop now", "webinar", "ends soon")) return "NEWSLETTERS";

  if (automated) return "NOTIFICATIONS";
  return "ACTION";
}

// ---- analyze ----
const ids = await listAllUnreadInbox();
const metas = await pool(ids, 12, getMeta);
const now = Date.now();
const cutoffMs = now - CUTOFF_DAYS * 86400 * 1000;

const plan = metas.map((m) => {
  let lane = classify(m);
  const attn = lane === "ACTION_ATTN";
  if (attn) lane = "ACTION";
  return { id: m.id, internalDate: m.internalDate, lane, label: LANES[lane].label,
    old: m.internalDate < cutoffMs, attn, from: m.from, subject: m.subject };
});
fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));

const old = plan.filter((p) => p.old);
const recent = plan.filter((p) => !p.old);
function laneCounts(arr) { const c = {}; arr.forEach((p) => (c[p.lane] = (c[p.lane] || 0) + 1)); return c; }

console.log(`\n=== Gmail bankruptcy plan (cutoff ${CUTOFF_DAYS} days) ===`);
console.log(`Total unread analyzed: ${plan.length}`);
console.log(`\nOLD (>${CUTOFF_DAYS}d) — will archive + label + mark read: ${old.length}`);
for (const [k, v] of Object.entries(laneCounts(old))) console.log(`    ${String(v).padStart(5)}  ${LANES[k].name}`);
console.log(`\nRECENT (<=${CUTOFF_DAYS}d) — triage: ${recent.length}`);
for (const [k, v] of Object.entries(laneCounts(recent))) console.log(`    ${String(v).padStart(5)}  ${LANES[k].name}`);
const recentAction = recent.filter((p) => p.lane === "ACTION");
console.log(`\nRecent ACTION staying in inbox: ${recentAction.length} (incl. ${recent.filter(p=>p.attn).length} flagged needs-attention)`);
recentAction.slice(0, 25).forEach((p) => console.log(`    ${p.attn ? "★" : "•"} ${p.subject.slice(0, 58).padEnd(58)} — ${p.from.slice(0, 34)}`));

// ---- apply ----
async function batchModify(ids, add, remove) {
  for (let i = 0; i < ids.length; i += 1000) {
    const chunk = ids.slice(i, i + 1000);
    const r = await fetch(`${API}/messages/batchModify`, {
      method: "POST", headers: JH,
      body: JSON.stringify({ ids: chunk, addLabelIds: add, removeLabelIds: remove }),
    });
    if (!r.ok) { console.log(`  ! batchModify failed (${r.status}): ${await r.text()}`); }
    else { console.log(`  ✓ ${chunk.length} msgs  +[${add.join(",")||"-"}] -[${remove.join(",")||"-"}]`); }
  }
}

if (!APPLY) { console.log(`\n(DRY RUN — re-run with --apply to execute. Plan saved to ${planPath})`); process.exit(0); }

console.log(`\n=== APPLYING ===`);
// OLD: group by lane, remove INBOX+UNREAD, add lane label if any
const oldByLane = {};
old.forEach((p) => ((oldByLane[p.lane] ||= []).push(p.id)));
for (const [lane, lids] of Object.entries(oldByLane)) {
  const add = LANES[lane].label ? [LANES[lane].label] : [];
  await batchModify(lids, add, ["INBOX", "UNREAD"]);
}
// RECENT FYI lanes: add label, remove INBOX (keep unread). ACTION untouched.
const recentByLane = {};
recent.filter((p) => p.lane !== "ACTION").forEach((p) => ((recentByLane[p.lane] ||= []).push(p.id)));
for (const [lane, lids] of Object.entries(recentByLane)) {
  await batchModify(lids, [LANES[lane].label], ["INBOX"]);
}
console.log(`\nDone. Recent ACTION left in inbox: ${recentAction.length}`);
