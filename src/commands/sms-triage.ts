/**
 * `sms-triage` — pull action items / things-to-do out of recent iMessage/SMS and push them
 * into Google Tasks (GTD). Reads from chat.db via MessagesClient, classifies with the unified
 * Claude classifier (best for informal texts), then captures the actionable ones (deduped).
 *
 *   npm run sms-triage            # last 7 days, capture into Tasks
 *   npm run sms-triage -- 14      # last 14 days
 *   npm run sms-triage -- 7 --dry # show what it would capture, create nothing
 */
import { MessagesClient } from "../messages/client.js";
import { classifyItems } from "../classifier/index.js";
import { messagesToClassifiable } from "../classifier/adapters.js";
import { captureTaskSpecs, type TaskSpec } from "../tasks/index.js";
import { GTD_LISTS, type GtdKey } from "../tasks/google-tasks.js";
import { loadContactIndex, nameOrHandle } from "../contacts/resolver.js";

// Categories worth turning into a task; everything else (newsletter/reference/idea) is ignored.
const ACTIONABLE = new Set(["urgent", "work", "personal", "admin", "health", "finance", "waiting-on"]);
const ACTIONABLE_PRIORITY = new Set(["P0", "P1", "P2"]);

// Strict mode: require an explicit ask/request/deadline in the message itself, and reject
// classifications whose "action" is just an acknowledgment. Filters out casual/family chatter
// ("Mommy is dropping me off") while keeping real asks ("will you join the meeting?", "box it up & ship UPS").
const ASK_SIGNAL =
  /\?|\b(can you|could you|would you|will you|are you|do you|did you|have you|please|need (you|to|your)|let me know|send (me|over)|when (can|will|are|is|do)|where (is|are)|pay|owe|due|deadline|rsvp|sign|return|ship|schedule|drop (off|it)|pick (up|it)|bring|approve|review|fill out|complete|submit|call me|text me|reply)\b/i;
const NOISE_ACTION =
  /^(acknowledge|no action|react|reply with a (thumbs|quick|simple)|confirm (you|that you|your) (know|saw|received|are aware)|let them know you|note that|be aware)/i;

// Automated business/transactional SMS (utility alerts, delivery/tracking, warranty, OTP, marketing).
// These often contain "please"/"reply" so they slip past the ask filter — drop them explicitly.
const AUTOMATED_SMS =
  /(reply stop|text stop|msg ?& ?data|message and data rates|do not reply|no-?reply|verification code|your code is|one-time|your (water use|delivery|order|warranty|account|appointment|payment|statement|balance|subscription)|tracking (number|#|link)|out for delivery|has shipped|is complete|unsubscribe|to opt ?out|view your bill|\bwarranty\b|\bcoverage\b|upgrade now|expires in \d+ days|don'?t wait|secure your|\$[\d,]+\+?\/?\s*(mo\b|month)|[\d.]+\/mo\b|pre-?approved|apply now|limited time)/i;

/** Cheap candidate gate before the LLM: drop attachments, short-code/automated senders, no-ask texts. */
function isCandidate(m: { text: string; handleId: string }): boolean {
  const t = (m.text || "").trim();
  if (t.length < 3) return false;
  if (/^[￼\s]+$/.test(t)) return false; // attachment placeholder (￼)
  const h = m.handleId || "";
  if (!h.includes("@")) {
    const digits = h.replace(/\D/g, "");
    if (digits.length > 0 && digits.length < 7) return false; // short code (Sky Zone, banks, OTP)
  }
  if (AUTOMATED_SMS.test(t)) return false; // automated business/transactional SMS
  return ASK_SIGNAL.test(t);
}

function isStrictAction(category: string, priority: string, confidence: number, text: string, action: string): boolean {
  if (!ACTIONABLE.has(category) || !ACTIONABLE_PRIORITY.has(priority) || confidence < 0.6) return false;
  if (NOISE_ACTION.test(action.trim())) return false; // action is just "acknowledge / confirm you saw it"
  if (!ASK_SIGNAL.test(text)) return false; // message contains no real ask/request/deadline
  return true;
}

function short(s: string, n: number): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? one.slice(0, n - 1) + "…" : one;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const days = parseInt(args.find((a) => /^\d+$/.test(a)) || "7", 10);
  const dryRun = args.includes("--dry") || args.includes("--dry-run");

  console.log(`Reading iMessage/SMS from the last ${days} days...`);
  const client = new MessagesClient();

  const cutoffDate = new Date(Date.now() - days * 86400 * 1000);
  let textMsgs, attrMsgs;
  try {
    // Read BOTH sources: the plain `text` column AND attributedBody-only messages (most modern
    // iMessages live there). Merge + dedupe by ROWID — without this the read sees almost nothing.
    [textMsgs, attrMsgs] = await Promise.all([
      client.searchMessages({ fromMe: false, startDate: cutoffDate, limit: 2000 }),
      client.extractRecentAttributedBodyMessages(days, 5000),
    ]);
  } catch (err) {
    console.error(
      "Could not read Messages (chat.db). Ensure your terminal has Full Disk Access in System Settings → Privacy.\n",
      err instanceof Error ? err.message : err
    );
    process.exit(1);
  }

  const byRow = new Map<number, (typeof textMsgs)[number]>();
  for (const m of [...textMsgs, ...attrMsgs]) if (!byRow.has(m.id)) byRow.set(m.id, m);
  const merged = [...byRow.values()];

  // Cheap pre-filter BEFORE the LLM: incoming, real text (not an attachment placeholder), a real
  // contact (not a short-code sender), and contains an explicit ask — so we classify a handful,
  // not hundreds. (Strict mode requires the ask anyway.)
  const candidates = merged.filter((m) => !m.isFromMe && isCandidate(m));
  // Collapse near-identical repeats from the same sender (e.g. 4× identical utility alerts).
  const dedupe = new Map<string, (typeof candidates)[number]>();
  for (const m of candidates) {
    const key = `${m.handleId}:${(m.text || "").trim().slice(0, 40).toLowerCase()}`;
    if (!dedupe.has(key)) dedupe.set(key, m);
  }
  const incoming = [...dedupe.values()];
  console.log(`${merged.length} messages read · ${incoming.length} candidate(s) with an ask. Classifying...`);

  if (incoming.length === 0) {
    console.log("Nothing to triage.");
    return;
  }

  const results = await classifyItems(messagesToClassifiable(incoming));
  const byId = new Map(incoming.map((m) => [String(m.id), m]));

  const actionItems = results.filter((r) => {
    const msg = byId.get(r.id);
    return isStrictAction(r.category, r.priority, r.confidence, msg?.text || "", r.suggested_next_action || "");
  });

  if (actionItems.length === 0) {
    console.log("No action items found in recent messages.");
    return;
  }

  // Resolve sender handles -> contact names (from macOS Contacts).
  await loadContactIndex();
  const nameFor = new Map<string, string>();
  for (const r of actionItems) {
    const h = byId.get(r.id)?.handleId || "";
    if (h && !nameFor.has(h)) nameFor.set(h, await nameOrHandle(h));
  }

  // Collapse by sender: one contact's cluster of asks becomes a single task (Uncle Chris's 6
  // messages → 1), so the board isn't fragmented by one conversation.
  const prioRank = (p: string) => ({ P0: 0, P1: 1, P2: 2, P3: 3 }[p] ?? 4);
  const groups = new Map<string, typeof actionItems>();
  for (const r of actionItems) {
    const h = byId.get(r.id)?.handleId || "unknown";
    if (!groups.has(h)) groups.set(h, []);
    groups.get(h)!.push(r);
  }

  const specs: TaskSpec[] = [];
  for (const [handle, items] of groups) {
    const who = nameFor.get(handle) || handle;
    items.sort(
      (a, b) =>
        prioRank(a.priority) - prioRank(b.priority) ||
        (byId.get(b.id)?.date.getTime() || 0) - (byId.get(a.id)?.date.getTime() || 0)
    );
    const primary = items[0];
    const action = primary.suggested_next_action?.trim() || short(byId.get(primary.id)?.text || "", 60);
    const minId = Math.min(...items.map((i) => Number(i.id)));
    const markers = items.map((i) => `[smsid:${i.id}]`).join(" ");
    const bullets = items.map((i) => `• "${short(byId.get(i.id)?.text || "", 110)}"`).join("\n");
    specs.push({
      marker: `[smsid:${minId}]`,
      title:
        items.length > 1
          ? `${short(action, 64)} (${who}, +${items.length - 1} more)`
          : `${short(action, 78)} (${who})`,
      notes: `SMS from ${who} (${primary.priority}):\n${bullets}\n${markers}`,
      // messages rarely carry explicit dates; leave undue → lands in 📥 Inbox
    });
  }

  console.log(`\nFound ${actionItems.length} action item(s) in your texts:\n`);
  actionItems.forEach((r) => {
    const msg = byId.get(r.id);
    const who = nameFor.get(msg?.handleId || "") || msg?.handleId;
    console.log(`  • [${r.priority}] ${short(r.suggested_next_action || msg?.text || "", 70)}`);
    console.log(`      from ${who}  — "${short(msg?.text || "", 60)}"`);
  });

  if (dryRun) {
    console.log(`\n(dry run — nothing written to Tasks)`);
    return;
  }

  const res = await captureTaskSpecs(specs);
  console.log(`\n→ Tasks: ${res.created} new · ${res.skipped} already captured`);
  if (res.created > 0) {
    const parts = Object.entries(res.byList).map(([k, n]) => `${GTD_LISTS[k as GtdKey]}: ${n}`);
    console.log(`  Routed → ${parts.join(" · ")}`);
  }
  console.log(`\nRun \`npm run tasks -- list\` to see the board.`);
}

main().catch((err) => {
  console.error("sms-triage failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
