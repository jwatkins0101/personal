// gates: board-live (AC-24), board-security (AC-25). Hermetic: temp DB/dirs, stub executors, random local port.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { AddressInfo } from "node:net";

const which = process.argv[2];
const tmp = mkdtempSync(join(tmpdir(), "cos-board-"));
Object.assign(process.env, { DB_PATH: join(tmp, "db.sqlite"), COS_LEDGER_DIR: join(tmp, "ledger"), COS_EOD_DIR: join(tmp, "eod"), COS_BRIEF_DIR: join(tmp, "briefs") });
let fail = 0;
const check = (ok: boolean, label: string) => { console.log(`${ok ? "PASS" : "FAIL"} ${label}`); if (!ok) fail = 1; };
const board = await import(pathToFileURL(resolve(process.env.BOARD_MODULE ?? "src/cos/board.ts")).href) as typeof import("../../src/cos/board.ts");
const { getDb } = await import("../../src/storage/db.ts");
const { addApprovals, localDate } = await import("../../src/cos/approvals.ts");
const { upsertCommitment } = await import("../../src/cos/commitments.ts");

const db = getDb();
const now = new Date();
const today = localDate(now);
const sent: string[] = [];
let draft = { to: "jenna@guardianowldigital.com", subject: "Re: Dropbox", body: "Hi Jenna,\n\nThanks. Send a screenshot of the Canva error and I'll look.\n\nJermaine" };
addApprovals(db, today, [
  { kind: "reply", title: "Reply to Jenna", risk_tier: "A3", source_ref: "gmail:m1", payload: { draft_id: "d1", to: "jenna@guardianowldigital.com", draft_body: draft.body } },
  { kind: "decide", title: "Pay Ecotech?", risk_tier: "A1", source_ref: "gmail:m2" },
  { kind: "reply", title: "AACSB status", risk_tier: "A3", source_ref: "gmail:m3", payload: { draft_id: "d3", to: "andrew.wright@louisville.edu", draft_body: "My status is [SA/PA]" } },
  { kind: "reply", title: "Swapped", risk_tier: "A3", source_ref: "gmail:m4", payload: { draft_id: "d4", to: "friend@x.com" } },
]);
addApprovals(db, today, [{ kind: "decide", title: "Already answered in Gmail", risk_tier: "A1", source_ref: "gmail:m5ans" }]);
addApprovals(db, "2020-01-01", [{ kind: "reply", title: "Old expired", risk_tier: "A3", source_ref: "gmail:old", payload: { draft_id: "d9", to: "x@y.com" } }]);
const past = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3);
const cm = upsertCommitment(db, { owner: "me", counterparty: "Jason", what: "Send the deck", due_quote: `${past.getMonth() + 1}/${past.getDate()}`, source_ref: "gmail:s1", source_date: new Date(past.getTime() - 86400_000 * 2) }).commitment;
mkdirSync(join(tmp, "eod"), { recursive: true });
writeFileSync(join(tmp, "eod", `${today}.json`), JSON.stringify({ date: today, generated_at: now.toISOString(), done: [{ text: "Sent Terrica the pay stubs", source_ref: "gmail:s2" }] }));

const token = "test-token-0123456789abcdef";
const deps = {
  db, lanes: [{ lane: "inbox", schedule: { days: [1, 2, 3, 4, 5, 6, 7], times: ["07:00"] }, grace_minutes: 30 }],
  executors: { readDraft: async () => draft, sendDraft: async (id: string) => { sent.push(id); return `sent-${id}`; }, createTask: async () => "t" },
  checker: async (ev: string) => ev === "gmail:sent-deck",
  tasksCompletedSince: async () => [{ id: "gt1", title: "Renew car registration", completed: new Date().toISOString(), list: "📥 Inbox" }],
  replied: async (id: string) => (id === "m5ans" ? { sentId: "sent-yesterday", at: new Date(now.getTime() - 3600_000).toISOString() } : null),
};
const server = board.createBoardServer(deps as never, token, 0);
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const port = (server.address() as AddressInfo).port;
const call = (method: string, path: string, opts: { token?: string | null; host?: string; body?: unknown; ctype?: string } = {}) =>
  new Promise<{ status: number; body: any; text: string }>((res, rej) => {
    const headers: Record<string, string> = { host: opts.host ?? `127.0.0.1:${port}` };
    if (opts.token !== null) headers["x-cos-token"] = opts.token ?? token;
    const payload = opts.body !== undefined ? JSON.stringify(opts.body) : undefined;
    if (payload !== undefined) headers["content-type"] = opts.ctype ?? "application/json";
    const r = request({ host: "127.0.0.1", port, method, path, headers }, (resp) => {
      let t = ""; resp.on("data", (c) => (t += c)); resp.on("end", () => { let b: any = null; try { b = JSON.parse(t); } catch { /* html */ } res({ status: resp.statusCode ?? 0, body: b, text: t }); });
    });
    r.on("error", rej); if (payload) r.write(payload); r.end();
  });
const state = async () => (await call("GET", "/api/state")).body;

try {
  if (which === "board-live") {
    let s = await state();
    check(s?.decide?.length === 4 && !s.decide.some((d: any) => d.title === "Already answered in Gmail"), "Decide shows 4 pending (expired excluded; the one you already answered auto-completed)");
    check(s.completed.today.some((c: any) => c.kind === "done" && c.text === "Already answered in Gmail" && /gmail:sent-yesterday/.test(c.detail)), "auto-completed item shows in Completed with your sent message as evidence");
    check(s.completed.today.some((c: any) => c.kind === "task" && c.text === "Renew car registration") && s.completed.today.some((c: any) => c.kind === "done" && /pay stubs/.test(c.text)), "Completed today shows checked-off Google Tasks and end-of-day done items");
    check(s.commitments.length === 1 && s.commitments[0].overdue === true, "overdue commitment flagged");
    const page = await call("GET", `/?t=${token}`);
    check(page.status === 200 && /Completed/.test(page.text) && /setInterval\(\(\)=>\{if\(!document\.hidden\)refresh\(\)\},5000\)/.test(page.text), "page renders and polls every 5 seconds");
    check((await call("POST", `/api/approvals/${today}/2/approve`, { body: {} })).body?.ok === true, "approve from the board");
    s = await state();
    check(s.decide.length === 3 && s.completed.today.some((c: any) => c.kind === "approved" && c.text === "Pay Ecotech?"), "next poll: item moved from Decide to Completed");
    const pv = await call("POST", `/api/approvals/${today}/1/preview`, { body: {} });
    check(pv.body?.ok && pv.body.preview.to === "jenna@guardianowldigital.com" && /Canva/.test(pv.body.preview.body), "send preview shows exact recipient and body");
    check((await call("POST", `/api/approvals/${today}/1/send`, { body: {} })).status === 400 && sent.length === 0, "send without explicit confirm is refused");
    check((await call("POST", `/api/approvals/${today}/1/send`, { body: { confirm: true } })).body?.ok === true && sent.join() === "d1", "confirmed send sends exactly that draft");
    s = await state();
    check(s.completed.today.some((c: any) => c.kind === "sent" && c.text === "Reply to Jenna"), "next poll: sent reply shows in Completed");
    check((await call("POST", `/api/approvals/${today}/4/done`, { body: {} })).body?.ok === true, "Done already from the board");
    s = await state();
    check(!s.decide.some((d: any) => d.n === 4) && s.completed.today.some((c: any) => c.kind === "done" && c.text === "Swapped" && c.detail === "marked done by you"), "next poll: manually done item in Completed");
    check((await call("POST", `/api/commitments/${cm.id}/close`, { body: { evidence: "gmail:sent-deck" } })).body?.ok === true, "mark a commitment kept with evidence");
    s = await state();
    check(s.commitments.length === 0 && s.completed.today.some((c: any) => c.kind === "closed" && /Send the deck/.test(c.text)), "next poll: commitment moved to Completed");
  } else if (which === "board-security") {
    check((await call("GET", "/api/state", { token: null })).status === 401, "no token: 401");
    check((await call("GET", "/api/state", { token: "wrong-token-0123456789abcd" })).status === 401, "wrong token: 401");
    check((await call("GET", "/", { token: null })).status === 401, "page without ?t= token: 401");
    check((await call("GET", "/api/state", { host: "evil.example:80" })).status === 403, "foreign Host header (DNS rebinding): 403");
    check((await call("POST", `/api/approvals/${today}/2/approve`, { body: {}, ctype: "text/plain" })).status === 415, "non-JSON post (cross-site form): refused");
    check((await call("POST", `/api/approvals/${today}/3/send`, { body: { confirm: true } })).body?.ok === false && sent.length === 0, "placeholder draft refused from the board");
    draft = { to: "attacker@evil.com", subject: "Re", body: "hi" };
    check((await call("POST", `/api/approvals/${today}/4/send`, { body: { confirm: true } })).body?.ok === false && sent.length === 0, "recipient swap refused from the board");
    check((await call("POST", `/api/approvals/2020-01-01/1/send`, { body: { confirm: true } })).body?.ok === false && sent.length === 0, "expired item refused from the board");
    check((await call("POST", `/api/commitments/${cm.id}/close`, { body: { evidence: "trust me" } })).body?.ok === false, "commitment close without evidence refused");
    check((server.address() as AddressInfo).address === "127.0.0.1", "listens on 127.0.0.1 only");
    const cli = (await import("node:fs")).readFileSync("src/cos/cli.ts", "utf8");
    check(/server\.listen\(BOARD_PORT, "127\.0\.0\.1"/.test(cli), "production server binds 127.0.0.1");
  } else if (which === "answered-mail") {
    const r = await import(pathToFileURL(resolve(process.env.REPLIED_MODULE ?? "src/cos/replied.ts")).href) as typeof import("../../src/cos/replied.ts");
    const inbox = [{ id: "a1", subject: "you answered" }, { id: "a2", subject: "still owed" }, { id: "a3", subject: "check failed" }];
    const out = await r.dropAnswered(inbox, async (id) => { if (id === "a3") throw new Error("gmail down"); return id === "a1" ? { sentId: "s1", at: "2026-09-24T22:16:57Z" } : null; });
    check(out.kept.map((x) => x.id).join() === "a2,a3", "answered mail dropped before the brief; unanswered kept");
    check(out.answered.length === 1 && out.answered[0].reply.sentId === "s1", "answered item records your sent message");
    check(out.kept.some((x) => x.id === "a3"), "a failed check keeps the mail (never hides on error)");
    const g = (await import("node:fs")).readFileSync("src/cos/gather.ts", "utf8");
    check(/getCachedEvents\(3, now, -1\)/.test(g) && /=== yesterday \? "yesterday"/.test(g) && /already happened/.test((await import("node:fs")).readFileSync("src/cos/synth.ts", "utf8")), "brief reads yesterday's calendar and treats it as already happened (D18)");
    check(/dropAnswered\(inbox, replied\)/.test(g) && /inbox\.splice\(0, inbox\.length, \.\.\.answered\.kept\)/.test(g), "morning gather filters answered mail before synthesis");
  } else check(false, `unknown gate ${which}`);
} catch (e) { check(false, `threw: ${(e as Error).message}`); }
finally { server.close(); rmSync(tmp, { recursive: true, force: true }); }
process.exit(fail);
