/**
 * Renders the morning brief as Markdown, HTML (with audio player + speed control) and MP3 (AC-12).
 * Section order is fixed by the charter; the brief-shape gate checks it.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Approval } from "./approvals.js";
import type { Line } from "./synth.js";
import { gmailWebLink } from "./refs.js";
import { emailForAccount } from "./accounts.js";

export const SECTION_ORDER = [
  "Status", "Decide", "Critical path", "Meetings needing prep", "Replies owed",
  "Waiting on others", "Deadlines (7-14 days)", "FYI", "Escalations", "One first move", "Cost today",
] as const;

export interface Brief {
  date: string;
  status: "CLEAR" | "WATCH" | "CRITICAL";
  status_line: string;
  decide: Approval[];
  critical_path: Line[];
  meetings_prep: Line[];
  replies_owed: Line[];
  waiting_on: Line[];
  deadlines: Line[];
  fyi: Line[];
  escalations: string[];
  one_first_move: string;
  cost_today_usd: number;
  budget_usd: number;
}

const refLink = (ref?: string): string => {
  if (!ref) return "";
  const link = gmailWebLink(ref, emailForAccount);
  if (link) return link;
  return "";
};
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function decideLine(a: Approval): string {
  const verb = a.kind === "reply" ? `send ${a.day_index}` : `approve ${a.day_index}`;
  return `**${a.day_index}.** ${a.title}${a.detail ? ` - ${a.detail}` : ""} → \`${verb}\` / \`skip ${a.day_index}\` [${a.source_ref}]`;
}

export function toMarkdown(b: Brief): string {
  const list = (xs: Line[], empty = "Nothing.") => xs.length ? xs.map((x) => `- ${x.text}${x.source_ref ? ` [${x.source_ref}]` : ""}`).join("\n") : empty;
  const s: Record<(typeof SECTION_ORDER)[number], string> = {
    "Status": `**${b.status}**: ${b.status_line}`,
    "Decide": b.decide.length ? b.decide.map(decideLine).join("\n") + `\n\nUnanswered items expire at 23:59 with nothing sent.` : "Nothing needs your decision.",
    "Critical path": list(b.critical_path),
    "Meetings needing prep": list(b.meetings_prep, "None."),
    "Replies owed": list(b.replies_owed, "None."),
    "Waiting on others": list(b.waiting_on, "Nothing tracked yet."),
    "Deadlines (7-14 days)": list(b.deadlines, "None found."),
    "FYI": list(b.fyi, "None."),
    "Escalations": b.escalations.length ? b.escalations.map((e) => `- ${e}`).join("\n") : "None.",
    "One first move": b.one_first_move || "-",
    "Cost today": `$${b.cost_today_usd.toFixed(2)} of $${b.budget_usd.toFixed(2)}`,
  };
  return `# Morning brief: ${b.date}\n\n` + SECTION_ORDER.map((h) => `## ${h}\n\n${s[h]}\n`).join("\n");
}

export function toSpeech(b: Brief): string {
  const n = (x: number, one: string, many: string) => `${x} ${x === 1 ? one : many}`;
  const parts = [
    `Good morning. Here's your brief for ${new Date(b.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}.`,
    `Status: ${b.status.toLowerCase()}. ${b.status_line}`,
    b.decide.length ? `You have ${n(b.decide.length, "decision", "decisions")}. ` + b.decide.map((a) => `Number ${a.day_index}: ${a.title}.`).join(" ") : "Nothing needs your decision.",
    b.critical_path.length ? "Critical path. " + b.critical_path.map((x, i) => `${i + 1}. ${x.text}.`).join(" ") : "",
    b.meetings_prep.length ? "Meetings needing prep. " + b.meetings_prep.map((x) => `${x.text}.`).join(" ") : "",
    b.escalations.length ? `${n(b.escalations.length, "escalation", "escalations")}. ` + b.escalations.slice(0, 4).map((e) => `${e}.`).join(" ") : "",
    b.one_first_move ? `Your one first move: ${b.one_first_move}` : "",
  ];
  return parts.filter(Boolean).join("\n\n").replace(/\[[^\]]*\]/g, "").replace(/`/g, "");
}

export function toHtml(b: Brief, audioFile: string | null): string {
  const list = (xs: Line[], empty = "Nothing.") => xs.length
    ? `<ul>${xs.map((x) => { const l = refLink(x.source_ref); return `<li>${esc(x.text)}${l ? ` <a href="${l}">open</a>` : ""}</li>`; }).join("")}</ul>`
    : `<p class="muted">${empty}</p>`;
  const decide = b.decide.length
    ? `<ol class="decide">${b.decide.map((a) => { const l = refLink(a.source_ref); const verb = a.kind === "reply" ? "send" : "approve";
        return `<li value="${a.day_index}"><strong>${esc(a.title)}</strong>${a.detail ? `<br><span class="muted">${esc(a.detail)}</span>` : ""}${
          a.kind === "reply" && a.payload.draft_body ? `<details><summary>Draft reply</summary><pre>${esc(String(a.payload.draft_body))}</pre></details>` : ""}
          <div class="cmd"><code>npm run cos -- ${verb} ${a.day_index}</code> <code>npm run cos -- skip ${a.day_index}</code>${l ? ` <a href="${l}">source</a>` : ""}</div></li>`; }).join("")}</ol>
       <p class="muted">Unanswered items expire at 23:59 with nothing sent.</p>`
    : `<p class="muted">Nothing needs your decision.</p>`;
  const sec: Record<(typeof SECTION_ORDER)[number], string> = {
    "Status": `<p><span class="pill ${b.status.toLowerCase()}">${b.status}</span> ${esc(b.status_line)}</p>`,
    "Decide": decide,
    "Critical path": list(b.critical_path),
    "Meetings needing prep": list(b.meetings_prep, "None."),
    "Replies owed": list(b.replies_owed, "None."),
    "Waiting on others": list(b.waiting_on, "Nothing tracked yet."),
    "Deadlines (7-14 days)": list(b.deadlines, "None found."),
    "FYI": list(b.fyi, "None."),
    "Escalations": b.escalations.length ? `<ul class="esc">${b.escalations.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>` : `<p class="muted">None.</p>`,
    "One first move": `<p class="first">${esc(b.one_first_move || "-")}</p>`,
    "Cost today": `<p class="muted">$${b.cost_today_usd.toFixed(2)} of $${b.budget_usd.toFixed(2)}</p>`,
  };
  const player = audioFile ? `<div class="player"><audio id="a" controls preload="metadata" src="${esc(audioFile)}"></audio>
    <div class="speed">${[0.75, 1, 1.25, 1.5, 1.75, 2].map((s) => `<button data-s="${s}">${s}×</button>`).join("")}</div></div>` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Morning Brief ${b.date}</title><style>
:root{--bg:#f7f6f2;--card:#fff;--ink:#1c1b18;--muted:#6b675e;--line:#e2dfd6;--accent:#2f5d50;--accent-ink:#fff;--warn:#9a5b12;--crit:#a3312a}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#141412;--card:#1d1c1a;--ink:#ecebe6;--muted:#a19d93;--line:#34322d;--accent:#7fc3ab;--accent-ink:#0f1a16;--warn:#e2ad63;--crit:#f08b82}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 -apple-system,system-ui,sans-serif}
main{max-width:760px;margin:0 auto;padding:28px 16px 120px}h1{font:600 30px/1.2 Georgia,serif;margin:0 0 16px}
h2{font:600 13px/1 system-ui;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:30px 0 10px;padding-top:14px;border-top:1px solid var(--line)}
ul,ol{padding-left:22px}li{margin:6px 0}.muted{color:var(--muted)}a{color:var(--accent)}
.pill{display:inline-block;padding:2px 10px;border-radius:999px;font-weight:700;font-size:13px;background:var(--accent);color:var(--accent-ink)}
.pill.watch{background:var(--warn);color:#fff}.pill.critical{background:var(--crit);color:#fff}
.decide li{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin:10px 0}
.cmd{margin-top:6px;font-size:13px}code{font:12.5px ui-monospace,Menlo,monospace;background:var(--bg);border:1px solid var(--line);border-radius:5px;padding:1px 6px}
pre{white-space:pre-wrap;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:10px;font-size:14px}
.esc li{color:var(--warn)}.first{font-size:18px;font-weight:600}
.player{position:sticky;top:0;z-index:2;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px;margin:0 0 18px}
audio{width:100%}.speed{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
.speed button{border:1px solid var(--line);background:none;color:var(--ink);border-radius:8px;padding:4px 8px;font:600 12px system-ui;cursor:pointer}
.speed button[aria-pressed="true"]{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
</style></head><body><main><h1>Morning brief · ${esc(b.date)}</h1>${player}
${SECTION_ORDER.map((h) => `<section data-section="${esc(h)}"><h2>${esc(h)}</h2>${sec[h]}</section>`).join("\n")}
</main><script>
(function(){var a=document.getElementById('a');if(!a)return;var r=1;try{r=parseFloat(localStorage.getItem('cos-brief-speed'))||1}catch(e){}
function set(s){r=s;a.playbackRate=s;a.preservesPitch=true;document.querySelectorAll('.speed button').forEach(function(b){b.setAttribute('aria-pressed',String(parseFloat(b.dataset.s)===s))});try{localStorage.setItem('cos-brief-speed',s)}catch(e){}}
document.querySelectorAll('.speed button').forEach(function(b){b.onclick=function(){set(parseFloat(b.dataset.s))}});a.addEventListener('loadedmetadata',function(){a.playbackRate=r});set(r);})();
</script></body></html>`;
}

/** Writes md/html/mp3. Audio failure is non-fatal: returned as an escalation, and no mp3 is claimed. */
export function writeBrief(b: Brief, dir: string): { md: string; html: string; mp3: string | null; audioError?: string } {
  mkdirSync(dir, { recursive: true });
  const md = join(dir, `${b.date}.md`), html = join(dir, `${b.date}.html`), mp3 = join(dir, `${b.date}.mp3`);
  let audioError: string | undefined;
  let mp3Out: string | null = null;
  if (process.env.COS_NO_AUDIO !== "1") {
    const txt = join(dir, `.${b.date}.speech.txt`), aiff = join(dir, `.${b.date}.aiff`);
    writeFileSync(txt, toSpeech(b));
    const say = spawnSync("say", ["-v", process.env.COS_VOICE ?? "Samantha", "-r", "180", "-f", txt, "-o", aiff], { encoding: "utf8", timeout: 180_000 });
    const ff = say.status === 0 ? spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-i", aiff, "-ac", "1", "-b:a", "64k", mp3], { encoding: "utf8", timeout: 180_000 }) : null;
    if (ff?.status === 0 && existsSync(mp3) && statSync(mp3).size > 0) mp3Out = mp3;
    else audioError = `audio not generated: ${(say.stderr || ff?.stderr || "say/ffmpeg failed").slice(0, 160)}`;
    rmSync(txt, { force: true }); rmSync(aiff, { force: true });
  }
  if (audioError) b = { ...b, escalations: [...b.escalations, audioError] };
  writeFileSync(md, toMarkdown(b));
  writeFileSync(html, toHtml(b, mp3Out ? `${b.date}.mp3` : null));
  return { md, html, mp3: mp3Out, audioError };
}
