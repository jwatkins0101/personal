/**
 * `tasks` CLI — Google Tasks (GTD) integration.
 *   npm run tasks                 # capture action items from inbox into GTD lists
 *   npm run tasks -- list         # print the GTD board (open tasks by list)
 *   npm run tasks -- capture 30   # capture, scanning the last 30 days
 */
import { captureFromInbox } from "../tasks/index.js";
import { listOpenGtdTasks, ensureGtdLists, GTD_LISTS, type GtdKey } from "../tasks/google-tasks.js";

function fmtDue(due?: string): string {
  if (!due) return "";
  const d = due.slice(0, 10);
  const todayISO = new Date().toISOString().slice(0, 10);
  if (d < todayISO) return ` ⚠️ overdue ${d}`;
  if (d === todayISO) return ` 📅 today`;
  return ` 📅 ${d}`;
}

async function printBoard(): Promise<void> {
  const tasks = await listOpenGtdTasks();
  const order = Object.values(GTD_LISTS);
  const byList = new Map<string, typeof tasks>();
  for (const t of tasks) {
    const k = t.list || "(other)";
    if (!byList.has(k)) byList.set(k, []);
    byList.get(k)!.push(t);
  }
  console.log(`\n=== Google Tasks — GTD board (${tasks.length} open) ===`);
  for (const listTitle of order) {
    const items = byList.get(listTitle) || [];
    console.log(`\n${listTitle}  (${items.length})`);
    items
      .sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"))
      .forEach((t) => console.log(`   • ${t.title}${fmtDue(t.due)}`));
  }
  console.log("");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0] || "capture";

  if (cmd === "list" || cmd === "board") {
    await printBoard();
    return;
  }

  if (cmd === "setup") {
    const ids = await ensureGtdLists();
    console.log("GTD lists ready:");
    for (const key of Object.keys(GTD_LISTS) as GtdKey[]) console.log(`  ${GTD_LISTS[key]}  (${ids[key]})`);
    return;
  }

  // default / "capture"
  const days = parseInt(args[1] || "21", 10);
  console.log(`Capturing action items from the last ${days} days of unread inbox...`);
  const r = await captureFromInbox(days);
  console.log(`\nScanned ${r.scanned} unread · ${r.actionable} actionable · ${r.created} new tasks · ${r.skipped} already captured`);
  if (r.created > 0) {
    const parts = Object.entries(r.byList).map(([k, n]) => `${GTD_LISTS[k as GtdKey]}: ${n}`);
    console.log(`Routed → ${parts.join(" · ")}`);
  }
  console.log(`\nRun \`npm run tasks -- list\` to see the board.`);
}

main().catch((err) => {
  console.error("tasks command failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
