// gates: triage-rules (AC-31), triage-apply (AC-32). Hermetic: fixture messages, stubbed Gmail.
// COS_TRIAGE_RULES swaps the rules file (negative: a rule set that archives everything).
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const which = process.argv[2];
const tmp = mkdtempSync(join(tmpdir(), "cos-triage-"));
process.env.COS_TRIAGE_LOG_DIR = join(tmp, "log");
let fail = 0;
const check = (ok: boolean, label: string) => { console.log(`${ok ? "PASS" : "FAIL"} ${label}`); if (!ok) fail = 1; };
const msg = (id: string, from: string, subject: string, o: { bulk?: boolean; cat?: string; labels?: string[] } = {}) =>
  ({ id, threadId: `t-${id}`, labelIds: ["INBOX", ...(o.cat ? [`CATEGORY_${o.cat.toUpperCase()}`] : []), ...(o.labels ?? [])], snippet: "", from, to: "", cc: "", subject, date: "", listUnsub: !!o.bulk });

try {
  const t = await import("../../src/cos/rules-triage.ts");
  const rules = t.loadRules();
  const writeTo = new Set(["majmundarllc.com", "keyhorse.vc"]);
  const owl = rules.accounts.owlthat, tu = rules.accounts.techunify;
  if (which === "triage-rules") {
    const cases: [ReturnType<typeof msg>, "keep" | "keep_star" | "archive", string | undefined, string][] = [
      [msg("1", "OwlThat CI <website@owlthat.com>", "[owlthat ci] checks.yml on main is RED"), "archive", "CoS/CI", "CI alert (RED) archived to CoS/CI (the brief tracks CI status)"],
      [msg("2", "PitchBook <news@pitchbook.com>", "The Daily Pitch", { bulk: true }), "archive", "CoS/Newsletters", "PitchBook newsletter archived"],
      [msg("3", "Brex <no-reply@brex.com>", "Your card payment failed"), "keep_star", undefined, "failed Brex payment kept and starred"],
      [msg("4", "Stripe <receipts@stripe.com>", "Your receipt from OwlThat"), "archive", "CoS/Notifications", "Stripe receipt archived to notifications"],
      [msg("5", "CSC <notices@cscglobal.com>", "Service of process received"), "keep", undefined, "legal notice (CSC) kept"],
      [msg("6", "Canva <apps@canva.com>", "APPS-54285 approved for release"), "keep", undefined, "Canva app review kept"],
      [msg("7", "Google <no-reply@accounts.google.com>", "Security alert: new sign-in"), "keep", undefined, "security alert kept"],
      [msg("8", "Priya Majmundar <priya@majmundarllc.com>", "Re: advisory statement"), "keep", undefined, "client you write to kept"],
      [msg("9", "Someone New <sam@newco.io>", "Intro"), "keep", undefined, "unknown person kept (no rule matched)"],
      [msg("10", "PitchBook <news@pitchbook.com>", "Starred digest", { bulk: true, labels: ["STARRED"] }), "keep", undefined, "starred mail never archived"],
    ];
    for (const [m, action, label, name] of cases) { const d = t.decide(m as never, owl, writeTo); check(d.action === action && d.label === label, `owlthat: ${name}`); }
    const tcases: [ReturnType<typeof msg>, "keep" | "archive", string | undefined, string][] = [
      [msg("t1", "Nextdoor <reply@rs.email.nextdoor.com>", "12 new posts near you"), "archive", "CoS/Social", "Nextdoor archived to social"],
      [msg("t2", "Kroger <kroger@krogermail.com>", "Weekly ad", { bulk: true }), "archive", "CoS/Newsletters", "Kroger bulk archived"],
      [msg("t3", "Stella's Venue <hello@stellasvenue.com>", "Fall events", { bulk: true }), "archive", "CoS/Newsletters", "Stella's Venue newsletter archived"],
      [msg("t4", "A Person <pat@someco.com>", "Question about the venue"), "keep", undefined, "unknown person kept"],
      [msg("t5", "Shop <deals@shop.com>", "Sale", { cat: "promotions" }), "archive", "CoS/Newsletters", "promotions tab archived"],
    ];
    for (const [m, action, label, name] of tcases) { const d = t.decide(m as never, tu, new Set()); check(d.action === action && d.label === label, `techunify: ${name}`); }
  } else if (which === "triage-apply") {
    const inbox = [msg("1", "OwlThat CI <website@owlthat.com>", "[owlthat ci] checks.yml on main is RED"), msg("2", "PitchBook <news@pitchbook.com>", "Daily", { bulk: true }),
      msg("3", "Brex <no-reply@brex.com>", "Your card payment failed"), msg("9", "Someone New <sam@newco.io>", "Intro"), msg("10", "Stripe <x@stripe.com>", "Receipt", { labels: ["STARRED"] })];
    const calls: { ids: string[]; add: string[]; remove: string[] }[] = []; const labels: string[] = [];
    const deps = { listIds: async () => inbox.map((m) => m.id), getMetas: async () => inbox as never, sentDomains: async () => new Set<string>(),
      ensureLabel: async (n: string) => { labels.push(n); return `L-${n}`; }, batchModify: async (ids: string[], add: string[], remove: string[]) => { calls.push({ ids, add, remove }); } };
    const dry = await t.runRulesTriage("owlthat", owl, "in:inbox", deps, { dryRun: true });
    check(calls.length === 0 && dry.scanned === 5 && dry.archived["CoS/CI"] === 1, "dry run counts but changes nothing");
    const r = await t.runRulesTriage("owlthat", owl, "in:inbox", deps, { now: new Date("2026-09-25T12:00:00Z"), tag: "hourly" });
    const archivedIds = calls.filter((c) => c.remove.includes("INBOX")).flatMap((c) => c.ids).sort();
    check(archivedIds.join() === "1,2" && calls.some((c) => c.ids.join() === "1" && c.add.join() === "L-CoS/CI") && calls.some((c) => c.ids.join() === "2" && c.add.join() === "L-CoS/Newsletters"), "archives by label group (CI, Newsletters) with the CoS label added");
    check(calls.some((c) => c.ids.join() === "3" && c.add.join() === "STARRED" && c.remove.length === 0), "failed payment starred, left in inbox");
    check(!archivedIds.includes("9") && !archivedIds.includes("10") && r.kept === 3, "unknown sender and starred mail untouched");
    const log = readFileSync(r.logPath, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    check(log.filter((e) => e.action === "archive").length === 2 && log.every((e) => e.at && e.id && e.tag === "hourly"), "every change is written to the undo log");
    calls.length = 0;
    const n = await t.undoTriage("owlthat", "2026-09-25T00:00:00Z", deps as never);
    check(n === 2 && calls.every((c) => c.add.includes("INBOX")) && calls.flatMap((c) => c.ids).sort().join() === "1,2" && calls.some((c) => c.remove.join() === "L-CoS/CI"), "undo puts both back in the inbox and removes the CoS labels");
    const wrote = await t.runRulesTriage("owlthat", owl, "in:inbox", { ...deps, sentDomains: async () => new Set(["newco.io", "pitchbook.com"]) }, { dryRun: true });
    check(!wrote.archived["CoS/Newsletters"] && wrote.byRule["you write to this sender"] >= 1, "a sender you write to is kept even when a rule would archive it");
    const cli = readFileSync("src/cos/rules-triage-run.ts", "utf8");
    check(/in:inbox after:\$\{since\}/.test(cli) && !/newer_than:\d+m/.test(cli), "hourly window is an epoch (never newer_than minutes)");
  } else if (which === "ci-status") {
    const { ciStatus, ciEscalations } = await import("../../src/cos/ci-status.ts");
    const cfg = (rules as unknown as { ci_status?: never }).ci_status;
    check(!!cfg, "CI status source is configured (owlthat CI alerts)");
    const at = (h: number) => new Date(Date.UTC(2026, 8, 24, h)).toUTCString();
    const metas = [
      { ...msg("c1", "OwlThat CI <website@owlthat.com>", "[owlthat ci] checks.yml on main is RED"), date: at(8) },
      { ...msg("c2", "OwlThat CI <website@owlthat.com>", "[owlthat ci] checks.yml on main is green again"), date: at(9) },
      { ...msg("c3", "OwlThat CI <website@owlthat.com>", "[owlthat ci] build-images.yml on main is RED"), date: at(10) },
      { ...msg("c4", "Someone <x@y.com>", "not a CI mail"), date: at(11) },
    ];
    const states = cfg ? ciStatus(metas as never, cfg) : [];
    const byWf = Object.fromEntries(states.map((x) => [x.workflow, x.state]));
    check(byWf["checks.yml"] === "green" && byWf["build-images.yml"] === "red", "latest result per workflow wins (checks.yml recovered; build-images still RED)");
    const esc = ciEscalations(states);
    check(esc.length === 1 && /CI RED: build-images\.yml on main/.test(esc[0]) && /\[gmail:owlthat:c3\]/.test(esc[0]), "only the still-RED workflow escalates, linking its alert");
    const g = readFileSync("src/cos/gather.ts", "utf8"), mo = readFileSync("src/cos/morning.ts", "utf8");
    check(/ciStatus\(/.test(g) && /ciEscalations\(inputs\.ci/.test(mo), "the brief reads CI status and escalates RED builds");
  } else check(false, `unknown gate ${which}`);
} catch (e) { check(false, `threw: ${(e as Error).message}`); }
finally { rmSync(tmp, { recursive: true, force: true }); }
process.exit(fail);
