// gate: respond (AC-36). Answer brief items: done / accept / dismiss / spam / hold. Hermetic.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const tmp = mkdtempSync(join(tmpdir(), "cos-respond-"));
process.env.DB_PATH = join(tmp, "db.sqlite");
let fail = 0;
const check = (ok: boolean, label: string) => { console.log(`${ok ? "PASS" : "FAIL"} ${label}`); if (!ok) fail = 1; };
try {
  const a = await import(pathToFileURL(resolve(process.env.APPROVALS_MODULE ?? "src/cos/approvals.ts")).href) as typeof import("../../src/cos/approvals.ts");
  const { getDb } = await import("../../src/storage/db.ts");
  const db = getDb();
  const d = "2026-09-25", now = new Date(2026, 8, 25, 9, 0);
  a.addApprovals(db, d, [
    { kind: "decide", title: "AACSB", risk_tier: "A1", source_ref: "gmail:m4" },
    { kind: "decide", title: "Catherine Lloyd $250k", risk_tier: "A1", source_ref: "gmail:owlthat:m6" },
    { kind: "decide", title: "Discover declined", risk_tier: "A1", source_ref: "gmail:m7" },
    { kind: "decide", title: "CSC/Clerky", risk_tier: "A1", source_ref: "gmail:owlthat:m9" },
    { kind: "reply", title: "Jenna Dropbox", risk_tier: "A3", source_ref: "gmail:m10", payload: { draft_id: "d10", to: "jenna@x.com" } },
    { kind: "task", title: "A task", risk_tier: "A2", source_ref: "task:t1" },
  ]);
  const spammed: string[] = []; const sent: string[] = [];
  const ex = { readDraft: async () => ({ to: "", subject: "", body: "" }), sendDraft: async (id: string) => { sent.push(id); return "s"; }, createTask: async () => "t", reportSpam: async (ref: string) => { spammed.push(ref); } };
  const st = (n: number) => a.listApprovals(db, d).find((x) => x.day_index === n)!;
  await a.respond(db, ex, d, 1, "done", "sent via Outlook", now);
  check(st(1).status === "approved" && /done:by you: sent via Outlook/.test(st(1).result ?? ""), "Done records it as handled, with your note");
  await a.respond(db, ex, d, 2, "spam", "", now);
  check(spammed.join() === "gmail:owlthat:m6" && st(2).status === "skipped" && /^spam/.test(st(2).result ?? ""), "Spam moves the email to Spam in the right account and closes the item");
  await a.respond(db, ex, d, 3, "dismiss", "", now);
  check(st(3).status === "skipped" && /^dismissed/.test(st(3).result ?? ""), "Dismiss closes the item");
  let err = ""; try { await a.respond(db, ex, d, 4, "hold", "", now); } catch (e) { err = (e as Error).message; }
  check(/needs a note/.test(err) && st(4).status === "pending", "Hold without a note is refused");
  await a.respond(db, ex, d, 4, "hold", "until we get money in", now);
  check(st(4).status === "held" && st(4).hold_note === "until we get money in", "Hold parks it with your note");
  err = ""; try { await a.respond(db, ex, d, 5, "accept", "", now); } catch (e) { err = (e as Error).message; }
  check(/never sends/.test(err) && sent.length === 0 && st(5).status === "pending", "Accept never sends an email (replies still need Review & send)");
  err = ""; try { await a.respond(db, ex, d, 6, "spam", "", now); } catch (e) { err = (e as Error).message; }
  check(/isn't an email/.test(err), "Spam is only offered for emails");
  a.expireApprovals(db, new Date(2026, 8, 27, 9, 0));
  check(st(4).status === "held", "held items don't expire at midnight");
  check(/Back on today's list/.test(a.resume(db, st(4).id, new Date(2026, 8, 28, 8, 0))) && st(4).status === "pending", "Resume brings a held item back");
  const { toHtml } = await import("../../src/cos/render.ts");
  const html = toHtml({ date: d, status: "WATCH", status_line: "", decide: [st(5), st(6)], critical_path: [], meetings_prep: [], replies_owed: [], waiting_on: [], deadlines: [], fyi: [], escalations: [], one_first_move: "", cost_today_usd: 0, budget_usd: 5 }, null);
  const bars = [...html.matchAll(/<div class="answer" data-date="([^"]+)" data-n="(\d+)"[^>]*>([\s\S]*?)<\/div>/g)];
  check(bars.length === 2 && !/data-v="accept"/.test(bars[0][3]) && /data-v="spam"/.test(bars[0][3]) && !/data-v="spam"/.test(bars[1][3]) && /data-v="hold"/.test(bars[1][3]), "brief shows answer buttons per item (no Accept on replies, Spam only on emails)");
  let parses = true; try { new Function(html.split("<script>")[1].split("</script>")[0]); } catch { parses = false; }
  check(parses && /\/respond',\{verdict:p\.v,note:p\.note\}/.test(html), "brief page script parses and posts answers to the board");
  const pickPart = html.slice(html.indexOf("bars.forEach(function(b){b.addEventListener('click'"), html.indexOf("cart.querySelector('[data-c=review]').onclick"));
  check(pickPart.length > 50 && !/api\(/.test(pickPart) && /className='cart'/.test(html) && /Place order/.test(html), "picking an answer only fills the cart; nothing is saved until Place order");
  check(/data-v="send"/.test(bars[0][3]) && !/data-v="send"/.test(bars[1][3]), "reply items have a Send button in the brief; other items don't");
  const sendAt = html.indexOf("'/send',{confirm:true}");
  check(/function review\(\)[\s\S]*'\/preview',\{\}\)/.test(html) && html.split("'/send'").length === 2 && sendAt > html.indexOf("function place(") && html.indexOf("function place(") > 0 && /bad>0\|\|waiting>0/.test(html), "the order summary shows each Gmail draft before sending; only Place order sends, and it is blocked while drafts load or have problems");
  check(/readDraft\(String\(pl\.draft_id \?\? ""\), pl\.account\)/.test(readFileSync("src/cos/board.ts", "utf8")), "draft preview reads from the draft's own mailbox");
  check(/heldItems\(db\)/.test(readFileSync("src/cos/morning.ts", "utf8")), "the morning brief lists items on hold");
} catch (e) { check(false, `threw: ${(e as Error).message}`); }
finally { rmSync(tmp, { recursive: true, force: true }); }
process.exit(fail);
