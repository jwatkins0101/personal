// gate: work (AC-37). /cos work tracking: add, update, list, board state, skill rules. Hermetic.
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";

const MOD = process.env.WORK_MODULE ?? "../../src/cos/work.ts";
let pass = 0, fail = 0;
const check = (ok: boolean, name: string) => { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}`); } };

try {
  const db = new Database(":memory:");
  (await import("../../src/storage/migrations/009_work.ts")).up(db);
  const W = await import(MOD);
  const a = W.addWork(db, "Sort out Brex", "Research Brex limit options", "perplexity-researcher");
  const b = W.addWork(db, "Sort out Brex", "Draft note to Brex support");
  check(a.id > 0 && a.status === "queued" && b.agent === "cos", "work is added as queued, default agent cos");
  let threw = false; try { W.addWork(db, "", "x"); } catch { threw = true; }
  check(threw, "work needs a goal");
  W.updateWork(db, a.id, "running");
  threw = false; try { W.updateWork(db, a.id, "done"); } catch { threw = true; }
  check(threw, "closing work without a result is refused");
  threw = false; try { W.updateWork(db, a.id, "finished"); } catch { threw = true; }
  check(threw, "unknown status is refused");
  W.updateWork(db, a.id, "done", "notes in ~/Desktop/brex.md");
  W.updateWork(db, b.id, "review", "draft in Gmail");
  const open = W.listWork(db, new Date(Date.now() + 3600_000).toISOString());
  check(open.length === 1 && open[0].id === b.id, "list shows open work (review first), not old closed work");
  const today = W.listWork(db, new Date(Date.now() - 3600_000).toISOString());
  check(today.length === 2 && today[0].status === "review" && today[1].result === "notes in ~/Desktop/brex.md", "list includes work closed today, with its result");
  const board = readFileSync("src/cos/board.ts", "utf8");
  check(/listWork\(db, todayStart/.test(board) && /Work in progress/.test(board), "board shows work in progress");
  const skill = readFileSync("cos/skills/cos/SKILL.md", "utf8");
  check(/^name: cos$/m.test(skill) && /cos work add/.test(skill) && /cos work update <id> done/.test(skill), "the /cos skill registers and closes every task");
  check(/Restate it in one line and wait/.test(skill) && /Prepare only\. Do not send email/.test(skill) && /Co-Authored-By/.test(skill) && /exact content and get his explicit yes/.test(skill), "the /cos skill keeps his rules: confirm first, sub-agents prepare only, no sends without his yes");
} catch (e) { check(false, `threw: ${(e as Error).message}`); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
