// gate: multi-account (AC-30). Hermetic: fake gws, temp DB/dirs, stubbed Gmail. COS_ACCOUNTS_PATH swaps the profile list (negative).
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, resolve } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "cos-acct-"));
Object.assign(process.env, { DB_PATH: join(tmp, "db.sqlite"), COS_LEDGER_DIR: join(tmp, "ledger"), COS_EOD_DIR: join(tmp, "eod"), COS_BRIEF_DIR: join(tmp, "briefs"),
  COS_NO_PING: "1", COS_NO_AUDIO: "1", COS_SYNTH_FIXTURE: resolve("tests/fixtures/cos/synthesis-multi.json") });
// Fake gws: "exports" credentials naming the profile dir it was pointed at.
writeFileSync(join(tmp, "gws"), '#!/bin/bash\necho "Using keyring backend: keyring"\necho "{\\"client_id\\":\\"${GOOGLE_WORKSPACE_CLI_CONFIG_DIR:-default}\\",\\"client_secret\\":\\"s\\",\\"refresh_token\\":\\"r\\"}"\n');
chmodSync(join(tmp, "gws"), 0o755);
process.env.PATH = `${tmp}:${process.env.PATH}`;
let fail = 0;
const check = (ok: boolean, label: string) => { console.log(`${ok ? "PASS" : "FAIL"} ${label}`); if (!ok) fail = 1; };

try {
  const refs = await import("../../src/cos/refs.ts");
  check(JSON.stringify(refs.parseGmailRef("gmail:abc123")) === '{"account":"personal","id":"abc123"}', "old gmail:<id> refs still mean the personal account");
  check(refs.gmailRef("owlthat", "o1") === "gmail:owlthat:o1" && refs.parseGmailRef("gmail:owlthat:o1")?.account === "owlthat" && refs.gmailRef("personal", "x") === "gmail:x", "account refs round-trip; personal keeps the short form");
  check(refs.parseGmailRef("gmail:") === null && refs.parseGmailRef("task:1") === null, "malformed or non-gmail refs are rejected");
  check(refs.gmailWebLink("gmail:owlthat:o1", () => "jwatkins@owlthat.com") === "https://mail.google.com/mail/u/?authuser=jwatkins%40owlthat.com#all/o1", "Gmail links open in the right signed-in account");

  const auth = await import("../../src/google/auth.ts");
  const own = (await auth.credsFor("owlthat")).client_id, per = (await auth.credsFor("personal")).client_id;
  check(own === join(homedir(), ".config/gws-owlthat") && per === "default", "each account loads credentials from its own gws profile");
  const seen = await Promise.all(["owlthat", "veryhealth", "personal"].map((a) => auth.withAccount(a, async () => { await new Promise((r) => setTimeout(r, 20)); return auth.currentAccount(); })));
  check(seen.join() === "owlthat,veryhealth,personal", "concurrent calls keep their own account");

  const { runMorning } = await import("../../src/cos/morning.ts");
  const { listApprovals, send } = await import("../../src/cos/approvals.ts");
  const { getDb } = await import("../../src/storage/db.ts");
  const inputs = { ...JSON.parse(readFileSync("tests/fixtures/cos/inputs.json", "utf8")) };
  inputs.inbox = [...inputs.inbox.map((m: { id: string }) => ({ ...m, ref: `gmail:${m.id}`, account: "personal" })),
    { id: "o1", ref: "gmail:owlthat:o1", account: "owlthat", from: "Priya <priya@owlclient.com>", subject: "Proposal", snippet: "Can you look?", date: "", starred: false }];
  const src: Record<string, unknown> = {
    "gmail:m1": { from: "Dana Client <dana@clientco.com>", subject: "SOW", snippet: "", threadId: "t1", to: "jermainewatkins@gmail.com", cc: "" },
    "gmail:owlthat:o1": { from: "Priya <priya@owlclient.com>", subject: "Proposal", snippet: "", threadId: "t9", to: "jwatkins@owlthat.com", cc: "" },
  };
  const draftedAs: Record<string, string> = {};
  await runMorning(new Date(2026, 8, 25, 7, 30), { gather: async () => inputs, fetcher: () => async (r: string) => (src[r] as never) ?? null,
    draft: async (o: { to: string }) => { draftedAs[o.to] = auth.currentAccount(); return `d-${o.to}`; } });
  check(draftedAs["priya@owlclient.com"] === "owlthat" && draftedAs["dana@clientco.com"] === "personal", "brief drafts each reply in the account the email came to");
  const q = listApprovals(getDb(), "2026-09-25"), owl = q.find((a) => a.source_ref === "gmail:owlthat:o1")!;
  check(owl.kind === "reply" && owl.payload.account === "owlthat", "the queued owlthat reply remembers its account");
  const sentVia: string[] = [];
  const ex = { readDraft: async (_: string, a?: string) => { sentVia.push(`read:${a}`); return { to: "priya@owlclient.com", subject: "Re: Proposal", body: "Hi Priya,\n\nThanks, I'll take a look today.\n\nJermaine" }; },
    sendDraft: async (_: string, a?: string) => { sentVia.push(`send:${a}`); return "s1"; }, createTask: async () => "t" };
  await send(getDb(), ex, "2026-09-25", owl.day_index, new Date(2026, 8, 25, 9, 0), () => {});
  check(sentVia.join() === "read:owlthat,send:owlthat" && listApprovals(getDb(), "2026-09-25").find((a) => a.id === owl.id)!.result === "gmail:owlthat:s1", "send reads and sends from owlthat; result ref names the account");

  const agent = await import("../../src/cos/agent.ts");
  const env = agent.agentEnv("owlthat");
  check(env.GOOGLE_WORKSPACE_CLI_CONFIG_DIR === join(homedir(), ".config/gws-owlthat") && agent.agentEnv("personal").GOOGLE_WORKSPACE_CLI_CONFIG_DIR === undefined, "agent's gws points at the item's mailbox");
  const { addApprovals } = await import("../../src/cos/approvals.ts");
  addApprovals(getDb(), "2026-09-26", [{ kind: "decide", title: "Owl ask", risk_tier: "A1", source_ref: "gmail:owlthat:o1" }]);
  const job = agent.createJob(getDb(), "2026-09-26", 1, "", new Date(2026, 8, 26, 9, 0));
  let ranAs = "", draftAcct = "";
  const r = await agent.runJob(getDb(), job.id, {
    runClaude: (_p, _b, a) => { ranAs = a ?? ""; return { text: JSON.stringify({ summary: "Priya wants feedback.", findings: [{ claim: "asked Monday", source_ref: "gmail:o1" }], needs_from_you: [], gaps: [], draft: { body: "Hi Priya,\n\nLooks good.\n\nJermaine" } }), cost_usd: 0.1 }; },
    fetchSource: async (ref) => src[ref] as never, messageIdHeader: async () => "", createReplyDraft: async (o) => { draftAcct = o.account ?? ""; return "dx"; },
  }, () => new Date(2026, 8, 26, 9, 1));
  check(ranAs === "owlthat" && draftAcct === "owlthat" && r.result!.findings[0].source_ref === "gmail:owlthat:o1", "agent reads, drafts and cites in the owlthat mailbox");
} catch (e) { check(false, `threw: ${(e as Error).message}`); }
finally { rmSync(tmp, { recursive: true, force: true }); }
process.exit(fail);
