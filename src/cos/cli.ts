/**
 * Chief of Staff CLI: npm run cos -- <command>
 *   health   lane heartbeat report (AC-10); exits 1 when any lane is stale or failing
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { laneHealth, type LaneConfig } from "../../cos/lib/ledger.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const LANES_PATH = process.env.COS_LANES_PATH ?? resolve(REPO_ROOT, "cos/lanes.json");

function health(): number {
  const config = JSON.parse(readFileSync(LANES_PATH, "utf8")) as { lanes: LaneConfig[] };
  const now = process.env.COS_NOW ? new Date(process.env.COS_NOW) : new Date();
  const rows = laneHealth(config, now, process.env.COS_LEDGER_DIR);
  const icon = { ok: "OK   ", partial: "PART ", failing: "FAIL ", stale: "STALE" } as const;
  for (const r of rows) {
    const last = r.last_started_at ? `${r.last_started_at} (${r.last_status})` : "never";
    const extra = r.state === "stale" ? ` expected by ${r.expected_since}` : r.gaps.length ? ` gaps: ${r.gaps.join("; ")}` : "";
    console.log(`${icon[r.state]} ${r.lane.padEnd(12)} last=${last}${extra}`);
  }
  const bad = rows.filter((r) => r.state === "stale" || r.state === "failing");
  console.log(bad.length ? `\n${bad.length} lane(s) need attention` : "\nall lanes healthy");
  return bad.length ? 1 : 0;
}

const [cmd] = process.argv.slice(2);
switch (cmd) {
  case "health":
    process.exit(health());
  default:
    console.error("usage: npm run cos -- health");
    process.exit(2);
}
