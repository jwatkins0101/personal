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

// Categories worth turning into a task; everything else (newsletter/reference/idea) is ignored.
const ACTIONABLE = new Set(["urgent", "work", "personal", "admin", "health", "finance", "waiting-on"]);
const ACTIONABLE_PRIORITY = new Set(["P0", "P1", "P2"]);

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

  let recent;
  try {
    recent = await client.getRecentMessages(400);
  } catch (err) {
    console.error(
      "Could not read Messages (chat.db). Ensure your terminal has Full Disk Access in System Settings → Privacy.\n",
      err instanceof Error ? err.message : err
    );
    process.exit(1);
  }

  const cutoff = Date.now() - days * 86400 * 1000;
  // Incoming messages only (things others sent you), within the window, with real text.
  const incoming = recent.filter(
    (m) => !m.isFromMe && m.date.getTime() >= cutoff && m.text && m.text.trim().length > 1
  );
  console.log(`${incoming.length} incoming messages in window. Classifying...`);

  if (incoming.length === 0) {
    console.log("Nothing to triage.");
    return;
  }

  const results = await classifyItems(messagesToClassifiable(incoming));
  const byId = new Map(incoming.map((m) => [String(m.id), m]));

  const actionItems = results.filter(
    (r) => ACTIONABLE.has(r.category) && ACTIONABLE_PRIORITY.has(r.priority) && r.confidence >= 0.5
  );

  if (actionItems.length === 0) {
    console.log("No action items found in recent messages.");
    return;
  }

  const specs: TaskSpec[] = actionItems.map((r) => {
    const msg = byId.get(r.id);
    const contact = msg?.handleId || "unknown";
    const action = r.suggested_next_action?.trim() || short(msg?.text || "", 60);
    return {
      marker: `[smsid:${r.id}]`,
      title: short(action, 90),
      notes: `SMS from ${contact} (${r.priority}/${r.category}): "${short(msg?.text || "", 160)}"`,
      // messages rarely carry explicit dates; leave undue → lands in 📥 Inbox
    };
  });

  console.log(`\nFound ${actionItems.length} action item(s) in your texts:\n`);
  actionItems.forEach((r) => {
    const msg = byId.get(r.id);
    console.log(`  • [${r.priority}] ${short(r.suggested_next_action || msg?.text || "", 70)}`);
    console.log(`      from ${msg?.handleId}  — "${short(msg?.text || "", 60)}"`);
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
