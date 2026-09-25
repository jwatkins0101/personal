// gate:charter-wired (AC-05). COS_CHARTER_PATH may point elsewhere for negative validation.
import { readFileSync } from "node:fs";
import { buildCosClaudeArgs, CHARTER_PATH } from "../../src/cos/claude.js";

let fail = 0;
const check = (ok: boolean, label: string) => { console.log(`${ok ? "PASS" : "FAIL"} ${label}`); if (!ok) fail = 1; };
try {
  const args = buildCosClaudeArgs({ maxBudgetUsd: 1 });
  const i = args.indexOf("--append-system-prompt-file");
  check(i >= 0 && args[i + 1] === CHARTER_PATH, "args append the charter file");
  check(args.includes("--max-budget-usd"), "args carry a budget ceiling");
  const text = readFileSync(CHARTER_PATH, "utf8");
  check(/## Autonomy matrix/.test(text), "charter has the autonomy matrix");
  check(/## Never/.test(text), "charter has the never-list");
  check(/newer_than/.test(text) && /months/.test(text), "charter states the Gmail months rule");
  let threw = false; try { buildCosClaudeArgs({ maxBudgetUsd: 0 }); } catch { threw = true; }
  check(threw, "zero budget is refused");
} catch (e) {
  check(false, `builder failed: ${(e as Error).message}`);
}
process.exit(fail);
