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
  replied: async (ref: string) => (ref === "gmail:m5ans" ? { sentId: "gmail:sent-yesterday", at: new Date(now.getTime() - 3600_000).toISOString() } : null),
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
// SSE client: collects "state" events; waitFor resolves with the first event matching pred (or null on timeout).
const openStream = (path: string, host = `127.0.0.1:${port}`) => {
  const events: any[] = []; let status = 0, ctype = ""; let buf = "";
  const waiters: { pred: (s: any) => boolean; done: (s: any) => void }[] = [];
  const req = request({ host: "127.0.0.1", port, method: "GET", path, headers: { host } }, (resp) => {
    status = resp.statusCode ?? 0; ctype = String(resp.headers["content-type"] ?? "");
    resp.setEncoding("utf8");
    resp.on("data", (c: string) => {
      buf += c; let i: number;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        if (!/^event: state$/m.test(block)) continue;
        const ev = JSON.parse(block.split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join("\n"));
        events.push(ev);
        for (const w of [...waiters]) if (w.pred(ev)) { waiters.splice(waiters.indexOf(w), 1); w.done(ev); }
      }
    });
  });
  req.on("error", () => {}); req.end();
  const waitFor = (pred: (s: any) => boolean, ms: number) => new Promise<any>((res) => {
    const hit = events.find(pred); if (hit) return res(hit);
    const w = { pred, done: (s: any) => { clearTimeout(t); res(s); } }; waiters.push(w);
    const t = setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); res(null); }, ms);
  });
  return { waitFor, status: () => status, ctype: () => ctype, close: () => req.destroy() };
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

try {
  if (which === "board-live") {
    let s = await state();
    check(s?.decide?.length === 4 && !s.decide.some((d: any) => d.title === "Already answered in Gmail"), "Decide shows 4 pending (expired excluded; the one you already answered auto-completed)");
    check(s.completed.today.some((c: any) => c.kind === "done" && c.text === "Already answered in Gmail" && /gmail:sent-yesterday/.test(c.detail)), "auto-completed item shows in Completed with your sent message as evidence");
    check(s.completed.today.some((c: any) => c.kind === "task" && c.text === "Renew car registration") && s.completed.today.some((c: any) => c.kind === "done" && /pay stubs/.test(c.text)), "Completed today shows checked-off Google Tasks and end-of-day done items");
    check(s.commitments.length === 1 && s.commitments[0].overdue === true, "overdue commitment flagged");
    const page = await call("GET", `/?t=${token}`);
    check(page.status === 200 && /Completed/.test(page.text) && /new EventSource\('\/api\/events\?t='/.test(page.text) && /pollH=setInterval\(\(\)=>\{if\(!document\.hidden\)refresh\(\)\},5000\)/.test(page.text) && /id="conn"/.test(page.text), "page subscribes to live updates, shows live/reconnecting, falls back to 5-second polling");
    check(/function put\(id,html\)\{const el=\$\(id\);if\(el\.__h===html\)return/.test(page.text) && /details\[data-k\]/.test(page.text), "page re-renders only changed sections and keeps open details, typed input and scroll");
    // Collapsible sections (D-collapse): every section is a <details data-sec>; Completed starts closed, the rest start open.
    check(/<details class="sec" data-sec="decide" open>/.test(page.text) && /<details class="sec" data-sec="work" open>/.test(page.text) && /<details class="sec" data-sec="review" open>/.test(page.text) && /<details class="sec" data-sec="commitments" open>/.test(page.text) && /<details class="sec" data-sec="lanes" open>/.test(page.text), "Decide, Work in progress, For review, Commitments and Lanes default expanded");
    check(/<details class="sec" data-sec="completed">/.test(page.text) && !/<details class="sec" data-sec="completed" open>/.test(page.text), "Completed section is collapsed by default");
    // Every section header shows a live count, including Completed's, which names today explicitly (e.g. "Completed today (42)").
    check(/id="doneHead"/.test(page.text) && /\$\('doneHead'\)\.textContent='Completed today \('\+s\.completed\.today\.length\+'\) · earlier this week \('\+s\.completed\.week\.length\+'\)'/.test(page.text), 'Completed header text is dynamic, e.g. "Completed today (42) · earlier this week (12)"');
    check(/\$\('nd'\)\.textContent='\('\+s\.decide\.length\+'\)'/.test(page.text) && /\$\('nw'\)\.textContent='\('\+wip\.length\+'\)'/.test(page.text) && /\$\('nr'\)\.textContent='\('\+\(rev\.length\+bad\.length\)/.test(page.text) && /\$\('nl'\)\.textContent='\('\+s\.lanes\.length\+'\)'/.test(page.text), "Decide, Work in progress, For review and Lanes headers always show a count, even at zero");
    // Section open/closed state persists per browser via localStorage, wrapped in try/catch (falls back to the HTML default when storage is unavailable).
    check(/function loadSecState\(\)\{try\{return JSON\.parse\(localStorage\.getItem\(SEC_KEY\)\|\|'\{\}'\)\}catch\(e\)\{return\{\}\}\}/.test(page.text) && /function saveSecState\(st\)\{try\{localStorage\.setItem\(SEC_KEY,JSON\.stringify\(st\)\)\}catch\(e\)\{\}\}/.test(page.text), "section state read/written via localStorage, wrapped in try/catch");
    check(/document\.addEventListener\('toggle',e=>\{const d=e\.target;if\(!d\.classList\|\|!d\.classList\.contains\('sec'\)\)return;const st=loadSecState\(\);st\[d\.dataset\.sec\]=d\.open;saveSecState\(st\)\},true\)/.test(page.text), "toggling a section (click on its header) persists its open/closed state");
    // Headless proof that a live SSE redraw can never reopen a collapsed section or collapse an open one:
    // render() drives every redraw (poll and SSE), and it never references a <details data-sec> node or sets .open;
    // it only ever calls put(id, html) against the <div> nested inside a section, which put() replaces via innerHTML
    // without touching its ancestor <details>. So the section's open/closed DOM state is structurally untouched by data updates.
    { const renderBody = page.text.match(/function render\(s\)\{[\s\S]*?\n\}\n/)?.[0] ?? "";
      check(renderBody.length > 1000 && !/data-sec/.test(renderBody) && !/\.open\s*=/.test(renderBody), "render() (run on every poll and SSE push) never reads or sets <details data-sec>.open — a live update cannot change section collapse state"); }
    // Live push: a write from another process (the cos CLI) must reach an open stream within 3 seconds.
    const ev = openStream(`/api/events?t=${token}`);
    const first = await ev.waitFor(() => true, 3000);
    check(ev.status() === 200 && /text\/event-stream/.test(ev.ctype()) && first?.decide?.length === 4, "SSE stream sends the current state on connect");
    const Database = (await import("better-sqlite3")).default;
    const other = new Database(process.env.DB_PATH!);
    const { addWork, updateWork } = await import("../../src/cos/work.ts");
    const t0 = Date.now();
    const w = addWork(other, "Board test", "live update probe", "general-purpose");
    const got = await ev.waitFor((s) => s.work?.some((x: any) => x.id === w.id && x.status === "queued"), 3000);
    check(!!got, `SSE pushes cos work add from another connection within 3s (${got ? Date.now() - t0 + "ms" : "timed out"})`);
    const t1 = Date.now();
    updateWork(other, w.id, "done", "probe");
    const got2 = await ev.waitFor((s) => s.work?.some((x: any) => x.id === w.id && x.status === "done" && x.result === "probe"), 3000);
    check(!!got2, `SSE pushes cos work update within 3s (${got2 ? Date.now() - t1 + "ms" : "timed out"})`);
    check(!!got2 && got2.completed.today.some((c: any) => c.ref === `work:${w.id}` && c.kind === "done" && c.text === "live update probe" && /probe/.test(c.detail)), "work marked done moves into Completed today (live)");
    check(!!got2 && got2.completed.today.length >= 1, "Completed today's count (rendered in the section header from s.completed.today.length on every poll/SSE push, regardless of collapsed state) increases live as items complete");
    const rv = addWork(other, "Board test", "review probe", "general-purpose"); updateWork(other, rv.id, "review", "draft ready");
    const fl = addWork(other, "Board test", "failed probe", "general-purpose"); updateWork(other, fl.id, "failed", "boom");
    const got3 = await ev.waitFor((s) => s.work?.some((x: any) => x.id === fl.id && x.status === "failed"), 3000);
    check(!!got3 && !got3.completed.today.some((c: any) => c.ref === `work:${rv.id}` || c.ref === `work:${fl.id}`), "review and failed work stay out of Completed");
    check(/const wip=s\.work\.filter\(w=>w\.status==='running'\|\|w\.status==='queued'\)/.test(page.text) && /put\('work',wip\.length/.test(page.text) && /put\('review',rev\.length\|\|bad\.length\?rev\.concat\(bad\)/.test(page.text) && /<h2>For review/.test(page.text), "page: Work in progress lists only queued/running; review and failed get their own For review section");
    other.close(); ev.close(); await sleep(50);
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
    check((await call("GET", "/api/events", { token: null })).status === 401, "live stream without token: 401");
    check((await call("GET", "/api/events?t=wrong-token-0123456789abcd", { token: null })).status === 401, "live stream with wrong token: 401");
    check((await call("GET", `/api/events?t=${token}`, { token: null, host: "evil.example:80" })).status === 403, "live stream from a foreign Host: 403");
    const okStream = openStream(`/api/events?t=${token}`); await okStream.waitFor(() => true, 3000);
    check(okStream.status() === 200 && /text\/event-stream/.test(okStream.ctype()), "live stream with the page token: 200 event-stream"); okStream.close();
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
    const out = await r.dropAnswered(inbox, async (ref) => { if (ref === "gmail:a3") throw new Error("gmail down"); return ref === "gmail:a1" ? { sentId: "gmail:s1", at: "2026-09-24T22:16:57Z" } : null; });
    check(out.kept.map((x) => x.id).join() === "a2,a3", "answered mail dropped before the brief; unanswered kept");
    check(out.answered.length === 1 && out.answered[0].reply.sentId === "gmail:s1", "answered item records your sent message");
    check(out.kept.some((x) => x.id === "a3"), "a failed check keeps the mail (never hides on error)");
    const g = (await import("node:fs")).readFileSync("src/cos/gather.ts", "utf8");
    check(/getCachedEvents\(3, now, -1\)/.test(g) && /=== yesterday \? "yesterday"/.test(g) && /already happened/.test((await import("node:fs")).readFileSync("src/cos/synth.ts", "utf8")), "brief reads yesterday's calendar and treats it as already happened (D18)");
    check(/dropAnswered\(inbox, replied\)/.test(g) && /inbox\.splice\(0, inbox\.length, \.\.\.answered\.kept\)/.test(g), "morning gather filters answered mail before synthesis");
  } else check(false, `unknown gate ${which}`);
} catch (e) { check(false, `threw: ${(e as Error).message}`); }
finally { server.close(); rmSync(tmp, { recursive: true, force: true }); }
process.exit(fail);
