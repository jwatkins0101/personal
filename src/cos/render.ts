/**
 * Renders the morning brief as Markdown, HTML (with audio player + speed control) and MP3 (AC-12).
 * Section order is fixed by the charter; the brief-shape gate checks it.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, rmSync } from "node:fs";
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
          <div class="cmd"><code>npm run cos -- ${verb} ${a.day_index}</code> <code>npm run cos -- skip ${a.day_index}</code>${l ? ` <a href="${l}">source</a>` : ""}</div>
          <div class="answer" data-date="${esc(a.brief_date)}" data-n="${a.day_index}" data-email="${/^gmail:/.test(a.source_ref) ? "1" : ""}" data-kind="${a.kind}">
            ${a.kind === "reply" ? `<button data-v="send">Send</button>` : ""}<button data-v="done">Done</button>${a.kind === "reply" ? "" : `<button data-v="accept">Accept</button>`}<button data-v="dismiss">Dismiss</button>${/^gmail:/.test(a.source_ref) ? `<button data-v="spam">Spam</button>` : ""}<button data-v="hold">Hold</button>
            <input class="note" placeholder="note (optional; needed for Hold, e.g. until we get money in)"><span class="said"></span></div></li>`; }).join("")}</ol>
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
.answer{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:10px}.answer button{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:999px;padding:5px 12px;font:600 13px system-ui;cursor:pointer}
.answer button:hover{border-color:var(--accent)}.answer button[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}.answer .note{flex:1;min-width:160px;border:1px solid var(--line);background:var(--bg);color:var(--ink);border-radius:8px;padding:5px 8px;font:13px system-ui}
.answer .said{font-size:13px;color:var(--accent);font-weight:600}.answer.off button,.answer.off .note{display:none}.answer-hint{font-size:13px;color:var(--muted)}.decide li.picked{background:color-mix(in srgb,var(--accent) 8%,transparent);border-radius:10px}
body.has-cart main{padding-bottom:110px}.cart{position:fixed;left:0;right:0;bottom:0;z-index:5;background:var(--card);border-top:1px solid var(--line);box-shadow:0 -6px 24px rgba(0,0,0,.12);padding:12px 16px}
.cart .in{max-width:760px;margin:0 auto;display:flex;gap:12px;align-items:center}.cart .tally{flex:1;font:600 15px system-ui}.cart .tally small{display:block;font-weight:400;font-size:13px;color:var(--muted)}
.btn-ok{background:var(--accent);color:var(--accent-ink);border:0;border-radius:10px;padding:11px 18px;font:700 15px system-ui;cursor:pointer}.btn-ok:disabled{opacity:.45;cursor:default}
.btn-q{background:none;border:1px solid var(--line);color:var(--ink);border-radius:10px;padding:10px 16px;font:600 14px system-ui;cursor:pointer}.btn-q:disabled{opacity:.45}
.sheet{position:fixed;inset:0;z-index:10;background:rgba(0,0,0,.5);overflow:auto;padding:24px 16px}.sheet[hidden]{display:none}
.order{max-width:640px;margin:0 auto;background:var(--card);color:var(--ink);border-radius:14px;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,.3)}.order h3{margin:0 0 4px;font:700 20px system-ui}.order .sub{color:var(--muted);font-size:14px;margin:0 0 14px}
.lines{list-style:none;margin:0;padding:0}.lines>li{border-top:1px solid var(--line);padding:12px 0}.lines .row{display:flex;gap:10px;align-items:baseline}.lines .row .t{flex:1;font-weight:600}
.tag{font:700 11px system-ui;letter-spacing:.06em;text-transform:uppercase;padding:3px 8px;border-radius:6px;background:var(--line);color:var(--ink);white-space:nowrap}.tag.send{background:var(--accent);color:var(--accent-ink)}.tag.spam{background:var(--crit);color:#fff}.tag.hold{background:var(--warn);color:#fff}
.lines .mail{margin-top:8px;border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:14px;background:var(--bg)}.lines .mail pre{white-space:pre-wrap;margin:8px 0 0;font:14px/1.5 ui-monospace,Menlo,monospace}
.lines .bad{color:var(--crit);font-weight:600;font-size:13px;margin-top:6px}.lines .m{color:var(--muted);font-size:13px;margin-top:4px}.lines .res{margin-top:6px;font-size:13px;font-weight:600}.lines li.ok .res{color:var(--accent)}.lines li.fail .res{color:var(--crit)}
.order .foot{display:flex;gap:10px;justify-content:flex-end;align-items:center;flex-wrap:wrap;border-top:1px solid var(--line);padding-top:14px}.order .foot .sum{flex:1;min-width:180px;color:var(--muted);font-size:14px}
</style></head><body><main><h1>Morning brief · ${esc(b.date)}</h1>${player}
${SECTION_ORDER.map((h) => `<section data-section="${esc(h)}"><h2>${esc(h)}</h2>${sec[h]}</section>`).join("\n")}
</main><script>
(function(){var a=document.getElementById('a');if(!a)return;var r=1;try{r=parseFloat(localStorage.getItem('cos-brief-speed'))||1}catch(e){}
function set(s){r=s;a.playbackRate=s;a.preservesPitch=true;document.querySelectorAll('.speed button').forEach(function(b){b.setAttribute('aria-pressed',String(parseFloat(b.dataset.s)===s))});try{localStorage.setItem('cos-brief-speed',s)}catch(e){}}
document.querySelectorAll('.speed button').forEach(function(b){b.onclick=function(){set(parseFloat(b.dataset.s))}});a.addEventListener('loadedmetadata',function(){a.playbackRate=r});set(r);})();
(function(){var T=new URLSearchParams(location.search).get('t');var bars=[].slice.call(document.querySelectorAll('.answer'));if(!bars.length)return;
if(!T||location.protocol.indexOf('http')!==0){bars.forEach(function(b){b.classList.add('off')});var h=document.querySelector('.decide');if(h){var p=document.createElement('p');p.className='answer-hint';p.textContent='To answer items here, open this brief from your board (npm run cos -- brief-url).';h.parentNode.insertBefore(p,h)}return}
function esc(x){return String(x==null?'':x).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function api(path,body){return fetch(path,{method:body?'POST':'GET',headers:Object.assign({'x-cos-token':T},body?{'content-type':'application/json'}:{}),body:body?JSON.stringify(body):undefined}).then(function(r){return r.json()})}
var L={send:'Send',done:'Done',accept:'Accept',dismiss:'Dismiss',spam:'Spam',hold:'Hold'},picks={},order=[];
function key(b){return b.dataset.date+'/'+b.dataset.n}
function title(b){return b.closest('li').querySelector('strong').textContent}
document.body.classList.add('has-cart');
var cart=document.createElement('div');cart.className='cart';cart.innerHTML='<div class="in"><div class="tally"></div><button class="btn-ok" data-c="review">Review &amp; confirm</button></div>';document.body.appendChild(cart);
var sheet=document.createElement('div');sheet.className='sheet';sheet.hidden=true;document.body.appendChild(sheet);
function tally(){var ks=Object.keys(picks),c={};ks.forEach(function(k){c[picks[k].v]=(c[picks[k].v]||0)+1});
cart.querySelector('.tally').innerHTML=ks.length?esc(ks.length+(ks.length===1?' item':' items'))+'<small>'+esc(Object.keys(c).map(function(v){return c[v]+' '+L[v].toLowerCase()}).join(' · '))+'</small>':'Nothing picked yet<small>Choose an answer on each item, then review.</small>';
cart.querySelector('[data-c=review]').disabled=!ks.length}
function mark(b){var k=key(b);b.querySelectorAll('button[data-v]').forEach(function(x){x.setAttribute('aria-pressed',String(!!picks[k]&&picks[k].v===x.dataset.v))});b.closest('li').classList.toggle('picked',!!picks[k])}
api('/api/state').then(function(s){var open={};(s.decide||[]).forEach(function(d){open[d.date+'/'+d.n]=1});bars.forEach(function(b){if(!open[key(b)]){b.classList.add('off');b.querySelector('.said').textContent='Answered'}})}).catch(function(){});
bars.forEach(function(b){b.addEventListener('click',function(e){var btn=e.target.closest('button[data-v]');if(!btn)return;var k=key(b),v=btn.dataset.v;
if(picks[k]&&picks[k].v===v)delete picks[k];else picks[k]={b:b,v:v};mark(b);if(v==='hold'&&picks[k])b.querySelector('.note').focus();tally()})});
cart.querySelector('[data-c=review]').onclick=review;
function review(){order=Object.keys(picks).sort(function(a,b){return picks[a].b.dataset.n-picks[b].b.dataset.n});var bad=0,waiting=0,sends=0;sheet.hidden=false;
sheet.innerHTML='<div class="order" role="dialog" aria-label="Review your answers"><h3>Review your answers</h3><p class="sub">Nothing happens until you click Place order.</p><ol class="lines"></ol><div class="foot"><span class="sum"></span><button class="btn-q" data-c="back">Back</button><button class="btn-ok" data-c="place">Place order</button></div></div>';
var ol=sheet.querySelector('.lines');
function gate(){var p=sheet.querySelector('[data-c=place]');if(!p)return;p.disabled=bad>0||waiting>0;p.textContent=waiting?'Loading drafts…':bad?'Fix the items marked above':'Place order ('+order.length+')';
sheet.querySelector('.sum').textContent=sends?'Sends '+sends+(sends===1?' email':' emails')+' exactly as shown.':'No email will be sent.'}
order.forEach(function(k){var p=picks[k];p.note=p.b.querySelector('.note').value.trim();var li=document.createElement('li');li.dataset.k=k;
li.innerHTML='<div class="row"><span class="tag '+p.v+'">'+L[p.v]+'</span><span class="t">#'+esc(p.b.dataset.n)+' '+esc(title(p.b))+'</span></div>'+(p.note?'<div class="m">Note: '+esc(p.note)+'</div>':'')+'<div class="x"></div>';ol.appendChild(li);
var x=li.querySelector('.x');
if(p.v==='hold'&&!p.note){x.innerHTML='<div class="bad">Hold needs a note. Go back and add one.</div>';bad++}
if(p.v==='spam')x.innerHTML='<div class="m">Moves the email to the Spam folder.</div>';
if(p.v==='send'){sends++;waiting++;x.innerHTML='<div class="m">Loading the draft from Gmail…</div>';
api('/api/approvals/'+p.b.dataset.date+'/'+p.b.dataset.n+'/preview',{}).then(function(r){waiting--;if(!r.ok){x.innerHTML='<div class="bad">'+esc(r.error)+'</div>';bad++}else{var d=r.preview;
x.innerHTML='<div class="mail"><div><b>To:</b> '+esc(d.to)+'</div><div><b>Subject:</b> '+esc(d.subject)+'</div><pre>'+esc(d.body)+'</pre></div>'+(r.placeholder?'<div class="bad">Has placeholder text ('+esc(r.placeholder)+'). Edit it in Gmail first, or change this answer.</div>':'');if(r.placeholder)bad++}gate()},function(){waiting--;bad++;x.innerHTML='<div class="bad">Could not reach the board.</div>';gate()})}});
gate()}
sheet.addEventListener('click',function(e){var c=e.target.closest('[data-c]');if(!c)return;if(c.dataset.c==='back'||c.dataset.c==='close'){sheet.hidden=true;return}if(c.dataset.c==='place')place(c)});
function place(btn){btn.disabled=true;btn.textContent='Placing…';sheet.querySelector('[data-c=back]').disabled=true;var i=0,okN=0,ks=order.slice();
function next(){if(i>=ks.length){var f=sheet.querySelector('.foot');f.innerHTML='<span class="sum">'+okN+' of '+ks.length+' done.</span><button class="btn-ok" data-c="close">Close</button>';sheet.querySelector('h3').textContent=okN===ks.length?'All done':'Done, with problems';sheet.querySelector('.sub').textContent='Receipt';tally();return}
var k=ks[i++],p=picks[k],li=sheet.querySelector('li[data-k="'+k+'"]'),base='/api/approvals/'+p.b.dataset.date+'/'+p.b.dataset.n;
var call=p.v==='send'?api(base+'/send',{confirm:true}):api(base+'/respond',{verdict:p.v,note:p.note});
call.then(function(r){li.classList.add(r.ok?'ok':'fail');li.insertAdjacentHTML('beforeend','<div class="res">'+(r.ok?'✓ ':'✗ ')+esc(r.ok?r.message:r.error)+'</div>');
if(r.ok){okN++;delete picks[k];mark(p.b);p.b.classList.add('off');p.b.querySelector('.said').textContent=r.message}},function(err){li.classList.add('fail');li.insertAdjacentHTML('beforeend','<div class="res">✗ '+esc(err)+'</div>')}).then(next)}
next()}
tally()})();
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
  writeFileSync(join(dir, `.${b.date}.brief.json`), JSON.stringify(b));
  return { md, html, mp3: mp3Out, audioError };
}

/** Re-render a saved brief's page with the current template (keeps its audio; no new audio, no ping). */
export function rerenderHtml(date: string, dir: string): string {
  const saved = join(dir, `.${date}.brief.json`);
  if (!existsSync(saved)) throw new Error(`No saved brief data for ${date} (briefs are saved from 2026-09-26 on).`);
  const b = JSON.parse(readFileSync(saved, "utf8")) as Brief;
  const html = join(dir, `${date}.html`);
  writeFileSync(html, toHtml(b, existsSync(join(dir, `${date}.mp3`)) ? `${date}.mp3` : null));
  return html;
}
