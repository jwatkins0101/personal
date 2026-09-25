/**
 * Gate registry runner (Ralph 2.0). Usage:
 *   npm run gates                 run every gate: pinned-hash check, positive run, negative validation
 *   npm run gates -- --only <id>  run one gate
 *   npm run gates -- --pin        re-pin script + assertion hashes (a gate change needs renewed negative validation)
 * Evidence: evidence/<story>/<gate>.json
 */
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = resolve(ROOT, "cos/gates.json");
const PRD = resolve(ROOT, "docs/tasks/active/ai-chief-of-staff/feature.json");

interface Gate {
  id: string; story: string; tier: string; acceptance: string[];
  command: string[]; script: string; assertion_files: string[];
  negative: { env: Record<string, string>; reason: string };
  script_sha256?: string; assertion_sha256?: Record<string, string>;
}

const sha = (p: string) => createHash("sha256").update(readFileSync(resolve(ROOT, p))).digest("hex");
const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined;
const pin = args.includes("--pin");

const registry: { gates: Gate[] } = JSON.parse(readFileSync(REGISTRY, "utf8"));
if (pin) {
  for (const g of registry.gates) {
    g.script_sha256 = sha(g.script);
    g.assertion_sha256 = Object.fromEntries(g.assertion_files.map((f) => [f, sha(f)]));
  }
  writeFileSync(REGISTRY, JSON.stringify(registry, null, 2) + "\n");
  console.log(`pinned ${registry.gates.length} gates`);
  process.exit(0);
}

const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT }).toString().trim();
const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT }).toString().trim().length > 0;
const prdRevision = JSON.parse(readFileSync(PRD, "utf8")).prd_revision;
let failed = 0;

for (const g of registry.gates.filter((x) => !only || x.id === only)) {
  const problems: string[] = [];
  if (g.script_sha256 !== sha(g.script)) problems.push("script hash differs from pinned value");
  for (const f of g.assertion_files) if (g.assertion_sha256?.[f] !== sha(f)) problems.push(`assertion hash differs: ${f}`);

  const run = (env: Record<string, string>) => {
    const r = spawnSync(g.command[0], g.command.slice(1), { cwd: ROOT, env: { ...process.env, ...env }, encoding: "utf8" });
    return { exit: r.status ?? -1, output: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
  };
  const positive = run({});
  const negative = run(g.negative.env);
  if (positive.exit !== 0) problems.push(`positive run failed (exit ${positive.exit})`);
  if (negative.exit === 0) problems.push("negative validation did not fail: gate cannot detect the defect");

  const passed = problems.length === 0;
  if (!passed) failed++;
  const evidence = {
    gate: g.id, story: g.story, tier: g.tier, acceptance: g.acceptance, passed, problems,
    tested_commit: commit, worktree_dirty: dirty, prd_revision: prdRevision,
    gate_sha256: g.script_sha256, assertion_sha256: g.assertion_sha256,
    command: g.command.join(" "), exit_code: positive.exit, output: positive.output,
    negative_validation: { env: g.negative.env, reason: g.negative.reason, exit_code: negative.exit, output: negative.output },
    timestamp: new Date().toISOString(),
  };
  const out = resolve(ROOT, "evidence", g.story, `${g.id}.json`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(evidence, null, 2) + "\n");
  console.log(`${passed ? "PASS" : "FAIL"} ${g.id} [${g.acceptance.join(",")}]${problems.length ? " - " + problems.join("; ") : ""}`);
}
console.log(failed ? `\n${failed} gate(s) failed` : "\nall gates passed");
process.exit(failed ? 1 : 0);
