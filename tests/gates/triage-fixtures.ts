// gate:triage-fixtures (AC-06). Dry-runs the triage rules (no tools) over labeled fixtures, twice;
// every fixture must match lane + inbox decision (and star where required) on both runs.
// TRIAGE_RULES_FILE swaps the rules text (negative validation uses sabotaged rules). TRIAGE_RUNS overrides run count.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseClaudeJsonOutput } from "../../src/claude/result.js";

interface Fixture { id: string; from: string; subject: string; snippet: string; thread_has_my_reply: boolean; received: string;
  expected: { lane: string; inbox: "keep" | "archive"; star_required: boolean }; rule: string }
interface Decision { id: string; lane: string; inbox: string; star: boolean }

const fixtures: Fixture[] = JSON.parse(readFileSync("tests/fixtures/triage/emails.json", "utf8"));
const full = readFileSync(process.env.TRIAGE_RULES_FILE ?? "prompts/gmail-triage.md", "utf8");
const start = full.indexOf("## Classification lanes");
const end = full.indexOf("## Daily heads-up draft");
const rules = start >= 0 && end > start ? full.slice(start, end) : full;

const prompt = `DRY RUN of the Gmail triage rules. You have no tools. Do not call anything.
Classify each message below exactly as the rules say. A message whose thread_has_my_reply is true is a known contact reply chain: keep it in the inbox (for school mail still apply the kid label).
Messages were received ${fixtures[0].received}.

Lanes (use exactly these values):
- school-jada, school-jackson, school (campus-wide or can't tell): any school mail, whatever the inbox decision
- action: non-school mail that stays in the inbox
- receipts, shipping, finance, newsletters, notifications: FYI lanes

Reply with ONLY a JSON array, one object per message:
[{"id":"...","lane":"...","inbox":"keep|archive","star":true|false}]

RULES:
${rules}

MESSAGES:
${JSON.stringify(fixtures.map(({ expected, rule, ...m }) => m), null, 1)}`;

const runs = Number(process.env.TRIAGE_RUNS ?? "2");
let fail = 0;
let totalCost = 0;
const report: unknown[] = [];
for (let r = 1; r <= runs; r++) {
  const res = spawnSync("claude", ["--print", "--output-format", "json", "--tools", ""], { input: prompt, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
  if (res.status !== 0) { console.log(`FAIL run ${r}: claude exited ${res.status}: ${res.stderr.slice(0, 300)}`); fail = 1; continue; }
  const out = parseClaudeJsonOutput(res.stdout);
  totalCost += out.costUsd ?? 0;
  const arr = out.text.match(/\[[\s\S]*\]/);
  let decisions: Decision[] = [];
  try { decisions = JSON.parse(arr ? arr[0] : "[]"); } catch { console.log(`FAIL run ${r}: unparseable decisions`); fail = 1; continue; }
  const byId = new Map(decisions.map((d) => [d.id, d]));
  const misses: string[] = [];
  for (const f of fixtures) {
    const d = byId.get(f.id);
    const ok = d && d.lane === f.expected.lane && d.inbox === f.expected.inbox && (!f.expected.star_required || d.star === true);
    if (!ok) misses.push(`${f.id} "${f.subject}": expected ${f.expected.lane}/${f.expected.inbox}${f.expected.star_required ? "/star" : ""}, got ${d ? `${d.lane}/${d.inbox}${d.star ? "/star" : ""}` : "nothing"} [rule: ${f.rule}]`);
  }
  const matched = fixtures.length - misses.length;
  console.log(`${misses.length ? "FAIL" : "PASS"} run ${r}: ${matched}/${fixtures.length} fixtures match`);
  for (const m of misses) console.log(`  - ${m}`);
  if (misses.length) fail = 1;
  report.push({ run: r, matched, total: fixtures.length, misses, cost_usd: out.costUsd });
}
console.log(`cost: $${totalCost.toFixed(3)} over ${runs} run(s)`);
mkdirSync("tests/.out", { recursive: true });
writeFileSync("tests/.out/triage-fixtures.json", JSON.stringify(report, null, 2));
process.exit(fail);
