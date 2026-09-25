/**
 * Daily cost ceiling (D7, AC-16). Spend = sum of cost_usd over every lane record started today (local).
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_LEDGER_DIR } from "../../cos/lib/ledger.mjs";

export const DAILY_BUDGET_USD = Number(process.env.COS_DAILY_BUDGET_USD ?? "5");

export function spentToday(now = new Date(), dir = process.env.COS_LEDGER_DIR ?? DEFAULT_LEDGER_DIR): number {
  if (!existsSync(dir)) return 0;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  let total = 0;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".jsonl"))) {
    for (const line of readFileSync(join(dir, f), "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line) as { started_at?: string; cost_usd?: number | null };
        if (r.started_at && new Date(r.started_at).getTime() >= start && typeof r.cost_usd === "number") total += r.cost_usd;
      } catch { /* a bad line is ignored here; the ledger gate covers schema */ }
    }
  }
  return total;
}

export function remainingBudget(now = new Date(), dir?: string): number {
  return Math.max(0, DAILY_BUDGET_USD - spentToday(now, dir));
}
