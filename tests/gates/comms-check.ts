// gate: comms-check (AC-38). The check-comms linter: every tested tell regex from the research (173 pos/neg
// cases + before/after pairs) behaves the same in JS, sample drafts score as expected, the CLI exits 1 on
// high-severity tells, and /cos + the charter route drafts through comms-checker. Hermetic.
// COMMS_TELLS_PATH may point at a broken tells file for negative validation.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { checkComms, loadTells, toJsRegex, type Channel } from "../../src/comms/check-comms.ts";

let pass = 0, fail = 0;
const check = (ok: boolean, name: string) => { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}`); } };
const F = "tests/fixtures/comms";
const read = (n: string) => readFileSync(`${F}/${n}`, "utf8");

try {
  const tells = loadTells();
  const withRegex = tells.filter((t) => t.pattern);
  const compiled = new Map<string, RegExp>();
  const bad: string[] = [];
  for (const t of withRegex) { try { compiled.set(t.id, toJsRegex(t.pattern!)); } catch (e) { bad.push(`${t.id}: ${(e as Error).message}`); } }
  check(withRegex.length === 42 && bad.length === 0, `all 42 tell regexes compile in JS (${compiled.size} compiled${bad.length ? "; " + bad.join("; ") : ""})`);

  const cases: { tells: { id: string; pos: string[]; neg: string[]; before: string | null; after: string | null }[] } = JSON.parse(read("tell-cases.json"));
  const hit = (id: string, s: string) => { const r = compiled.get(id); if (!r) return null; r.lastIndex = 0; return r.test(s); };
  let n = 0, nPair = 0; const misses: string[] = [];
  for (const c of cases.tells) {
    for (const s of c.pos) { n++; if (hit(c.id, s) !== true) misses.push(`${c.id} should match: ${JSON.stringify(s)}`); }
    for (const s of c.neg) { n++; if (hit(c.id, s) !== false) misses.push(`${c.id} should not match: ${JSON.stringify(s)}`); }
    if (c.before && c.after) {
      nPair++;
      if (hit(c.id, c.before) !== true) misses.push(`${c.id} before should match`);
      if (hit(c.id, c.after) !== false) misses.push(`${c.id} after should not match`);
    }
  }
  check(n === 173 && misses.length === 0, `173 research pos/neg cases pass in JS (${n - misses.filter((m) => !m.includes("before") && !m.includes("after")).length}/${n})${misses.length ? "\n  " + misses.slice(0, 8).join("\n  ") : ""}`);
  check(nPair === 41 && !misses.some((m) => /before|after/.test(m)), `41 before/after pairs: before trips the tell, after is clean`);

  const run = (file: string, channel: Channel) => checkComms(read(file), { channel, tells });
  const ai = run("ai-email.txt", "email"), human = run("human-email.txt", "email");
  const ids = new Set(ai.findings.map((f) => f.id));
  check(ai.score < 40 && ai.high > 0 && ai.blocked, `AI-ish email scores low and is blocked (score ${ai.score})`);
  check(["chan-01", "str-06", "spec-03", "tone-01", "str-10", "str-01", "lex-04"].every((id) => ids.has(id)), "AI-ish email: subject line, bold labels, placeholder, sycophantic opener, participle tail, not-X-but-Y, hope opener all found");
  check(human.score >= 80 && human.high === 0, `clean email scores high with no high tells (score ${human.score})`);
  const li = run("ai-linkedin.txt", "linkedin"), liH = run("human-linkedin.txt", "linkedin");
  check(li.high > 0 && li.score < 60 && liH.score >= 80 && liH.high === 0, `LinkedIn: generic DM flagged (${li.score}), specific DM passes (${liH.score})`);
  const tx = run("ai-text.txt", "text"), txH = run("human-text.txt", "text");
  check(tx.findings.some((f) => f.id === "chan-07") && txH.score === 100 && tx.score < txH.score, `text: email-style text flagged (${tx.score}), real text clean (${txH.score})`);
  const dash = checkComms("running late — there in 10", { channel: "text", tells });
  check(dash.findings.some((f) => f.id === "str-03" && f.severity !== "info"), "any em dash in a text is flagged");
  const hdr = checkComms("Hi Sam,\n\n## Update\n\nThe invoice went out Monday.\n\nJermaine", { channel: "email", tells });
  check(hdr.findings.some((f) => f.id === "str-05" && f.severity === "high"), "a header in a short email is high");
  const cg = run("ai-congrats.txt", "email");
  check(cg.relational && cg.high > 0 && !cg.findings.some((f) => f.id === "spec-07"), "congratulations: relational, severities raised, no 'missing ask' nag");
  const lexOnly = checkComms("Let's delve into the data before Friday's call with Dana. Can you send the 3 files?", { channel: "email", tells });
  check(lexOnly.findings.some((f) => f.id === "lex-01"), "single AI-vocabulary word is noted");

  const cli = (args: string[], input?: string) => spawnSync("npx", ["tsx", "src/comms/check-comms.ts", ...args], { encoding: "utf8", input, env: process.env });
  const c1 = cli([`${F}/ai-email.txt`]), c2 = cli(["-", "--channel", "email"], read("human-email.txt")), c3 = cli([`${F}/ai-email.txt`, "--json"]);
  check(c1.status === 1 && /Score: \d+\/100/.test(c1.stdout) && /HIGH/.test(c1.stdout), `CLI exits 1 on a high-severity tell (exit ${c1.status})`);
  check(c2.status === 0 && /Score: 100\/100/.test(c2.stdout), `CLI reads stdin and exits 0 on a clean draft (exit ${c2.status})`);
  let js: { score?: number; findings?: unknown[] } = {}; try { js = JSON.parse(c3.stdout); } catch { /* checked below */ }
  check(typeof js.score === "number" && Array.isArray(js.findings), "CLI --json returns score and findings");

  const skill = readFileSync("cos/skills/cos/SKILL.md", "utf8"), charter = readFileSync("cos/CLAUDE.md", "utf8");
  check(/comms-checker/.test(skill) && /check-comms/.test(skill), "the /cos skill routes every draft through comms-checker before he sees it");
  check(/comms-checker/.test(charter), "the charter requires the comms check on drafts");
} catch (e) { check(false, `threw: ${(e as Error).message}`); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
