/**
 * Builds the argument list for every headless Chief of Staff `claude -p` call.
 * The charter (cos/CLAUDE.md) is always appended to the system prompt (AC-05),
 * and the daily budget ceiling (D7) is passed through as --max-budget-usd.
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const CHARTER_PATH = process.env.COS_CHARTER_PATH ?? resolve(REPO_ROOT, "cos/CLAUDE.md");

export interface CosClaudeOptions {
  /** Remaining budget for this call in USD; must be > 0. */
  maxBudgetUsd: number;
  /** Extra settings file (e.g. hook wiring) for this call. */
  settingsPath?: string;
  allowedTools?: string[];
  model?: string;
}

export function buildCosClaudeArgs(opts: CosClaudeOptions): string[] {
  if (!existsSync(CHARTER_PATH)) {
    throw new Error(`Chief of Staff charter missing: ${CHARTER_PATH}`);
  }
  if (!(opts.maxBudgetUsd > 0)) {
    throw new Error(`maxBudgetUsd must be > 0 (got ${opts.maxBudgetUsd})`);
  }
  const args = [
    "--print",
    "--output-format", "json",
    "--append-system-prompt-file", CHARTER_PATH,
    "--max-budget-usd", opts.maxBudgetUsd.toFixed(2),
  ];
  if (opts.settingsPath) args.push("--settings", opts.settingsPath);
  if (opts.allowedTools?.length) args.push("--allowedTools", opts.allowedTools.join(","));
  if (opts.model) args.push("--model", opts.model);
  return args;
}
