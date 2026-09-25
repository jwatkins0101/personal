#!/usr/bin/env node
// @ts-check
/**
 * Appends one run record for a lane. Called by cos/bin/lane-run.sh after the lane command finishes.
 *   record-run.mjs --lane inbox --run-id ID --started ISO --exit 0 [--summary /path/summary.json]
 *                  [--artifact /abs/path ...] [--attempts N]
 * The optional summary is the lane's own JSON (items_in, items_out, findings, proposed_actions,
 * open_questions, gaps, artifacts, cost_usd). Exit code decides ok/failed unless the summary
 * says partial. Prints the stored record.
 */
import { existsSync, readFileSync } from "node:fs";
import { appendRecord } from "../lib/ledger.mjs";

const argv = process.argv.slice(2);
/** @param {string} k */
const one = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
/** @param {string} k */
const many = (k) => argv.flatMap((a, i) => (a === k ? [argv[i + 1]] : []));

const lane = one("--lane");
const exit = Number(one("--exit") ?? "1");
const summaryPath = one("--summary");

/** @type {any} */
let summary = {};
const gaps = [];
if (summaryPath && existsSync(summaryPath) && readFileSync(summaryPath, "utf8").trim()) {
  try { summary = JSON.parse(readFileSync(summaryPath, "utf8")); }
  catch (e) { gaps.push(`invalid_summary_json: ${/** @type {Error} */ (e).message}`); summary = {}; }
}
if (exit !== 0) gaps.push(`exit_code: ${exit} after ${one("--attempts") ?? "1"} attempt(s)`);

const record = {
  lane,
  run_id: one("--run-id"),
  status: exit !== 0 || gaps.length ? "failed" : summary.status === "partial" ? "partial" : "ok",
  started_at: one("--started"),
  finished_at: new Date().toISOString(),
  items_in: summary.items_in ?? null,
  items_out: summary.items_out ?? null,
  artifacts: [...(summary.artifacts ?? []), ...many("--artifact")],
  findings: summary.findings ?? [],
  proposed_actions: summary.proposed_actions ?? [],
  open_questions: summary.open_questions ?? [],
  gaps: [...(summary.gaps ?? []), ...gaps],
  cost_usd: summary.cost_usd ?? null,
};
const stored = appendRecord(record);
console.log(JSON.stringify(stored));
process.exit(stored.status === "failed" ? 3 : 0);
