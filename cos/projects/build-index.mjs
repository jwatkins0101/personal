#!/usr/bin/env node
// Builds INDEX.md for the Chief of Staff project index.
// Inputs:  inventory.json (from scan-projects.mjs) + overrides.json (manual layer), and
//          optionally the CoS work store (read-only) to date the last alias-matched CoS item.
// Output:  INDEX.md only. Cards in cards/ are read (for the one-line "what") but never written.
// No dependencies beyond Node built-ins (node:sqlite for the optional CoS read, Node >= 22.5).
//
// Usage: node build-index.mjs [--stdout]

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOME = os.homedir();
const INVENTORY = path.join(HERE, "inventory.json");
const OVERRIDES = path.join(HERE, "overrides.json");
const CARDS_DIR = path.join(HERE, "cards");
const OUT = path.join(HERE, "INDEX.md");
const COS_DB = process.env.DB_PATH || path.join(HOME, "Library", "Application Support", "assistance", "secondbrain.sqlite");

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const inv = readJson(INVENTORY);
const ov = fs.existsSync(OVERRIDES) ? readJson(OVERRIDES) : {};
const include = new Set(ov.include || []);
const exclude = new Set(ov.exclude || []);
const aliases = ov.aliases || {};
const notes = ov.notes || {};
const parents = ov.parents || {};

const tilde = (p) => (p && p.startsWith(HOME) ? "~" + p.slice(HOME.length) : p);
const day = (iso) => (iso ? iso.slice(0, 10) : null);
const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
const clip = (s, n) => (s && s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

// Sanity: overrides must name real projects.
const names = new Set(inv.projects.map((p) => p.name));
const unknownOverride = [...include, ...exclude, ...Object.keys(aliases), ...Object.keys(parents), ...Object.values(parents).map((v) => v.parent)].filter((n) => !names.has(n));
const conflicting = [...include].filter((n) => exclude.has(n));

// ---------- active set ----------
const isActive = (p) => !exclude.has(p.name) && (p.active || include.has(p.name));
const active = inv.projects.filter(isActive);
const archived = inv.projects.filter((p) => !isActive(p));

// ---------- cards (read-only) ----------
const cardPath = (name) => path.join(CARDS_DIR, `${name}.md`);
function cardWhat(name) {
  let t;
  try { t = fs.readFileSync(cardPath(name), "utf8"); } catch { return null; }
  const m = t.match(/^## What it is\s*\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
  if (!m) return null;
  const para = m[1].split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("_")).join(" ");
  const first = para.replace(/\s*\(source[^)]*\)|\s*\([^)]*\.md[^)]*\)/gi, "").match(/^.*?[.!?](?=\s|$)/);
  return first ? first[0] : para || null;
}
const cardFiles = fs.existsSync(CARDS_DIR) ? fs.readdirSync(CARDS_DIR).filter((f) => f.endsWith(".md")) : [];
const cardNames = new Set(cardFiles.map((f) => f.slice(0, -3)));
const missingCards = active.filter((p) => !cardNames.has(p.name)).map((p) => p.name);
const orphanCards = [...cardNames].filter((n) => !active.some((p) => p.name === n));

// ---------- optional: latest CoS item matching a project's name or aliases ----------
let cosNote = "CoS work store not read.";
const cosLast = new Map(); // name -> { date, ids }
try {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(COS_DB, { readOnly: true });
  const rows = db.prepare("SELECT id, goal, title, COALESCE(result,'') AS result, updated_at FROM cos_work").all();
  db.close();
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const p of active) {
    const terms = [...(aliases[p.name] || [])].filter((t) => t.length >= 3);
    if (!terms.length) continue;
    const re = new RegExp(`(^|[^a-z0-9])(${terms.map(esc).join("|")})($|[^a-z0-9])`, "i");
    const hits = rows.filter((r) => re.test(`${r.goal}\n${r.title}\n${r.result}`));
    if (!hits.length) continue;
    const date = hits.map((r) => r.updated_at).sort().pop();
    cosLast.set(p.name, { date: date.slice(0, 10), ids: hits.map((r) => Number(r.id)) });
  }
  cosNote = `CoS items matched on aliases against cos_work goal/title/result (${rows.length} items, read-only).`;
} catch (err) {
  cosNote = `CoS work store not read (${err.message}); alias-matched CoS dates omitted.`;
}

function lastActivity(p) {
  const parts = [];
  if (p.last_commit_iso) parts.push(`commit ${day(p.last_commit_iso)}`);
  if (p.memory_last_modified) parts.push(`memory ${day(p.memory_last_modified)}`);
  if (p.cos_work_ids.length) parts.push(`CoS name-match #${p.cos_work_ids.join(", #")}`);
  const c = cosLast.get(p.name);
  if (c) parts.push(`CoS alias-match ${c.date} (#${c.ids.join(", #")})`);
  return parts.join("; ") || "no dated signal";
}

// ---------- render ----------
const L = [];
const today = new Date().toISOString().slice(0, 10);
L.push("# Project index (Chief of Staff)");
L.push("");
L.push(`_Generated ${today} by \`build-index.mjs\` from \`inventory.json\` (scanned ${day(inv.generated_at)}) + \`overrides.json\`. Do not hand-edit: change overrides.json or the cards, then re-run \`node build-index.mjs\`. Refresh the scan with \`node scan-projects.mjs\`._`);
L.push("");
L.push("## How CoS uses this");
L.push("");
L.push(
  "When Jermaine gives a goal, match it to a project by folder name or by any alias in the table below (aliases live in `overrides.json` and are only terms sourced from that project's docs, memory, or CoS work items). " +
  "Open the matched card in `cards/` and put three things into every sub-agent brief: the card path, the project's CLAUDE.md path, and its memory folder(s) with MEMORY.md, all listed in the card's Paths section, so the sub-agent reads them first instead of starting cold. " +
  "If the matched project has a parent (shown as ↳ under it), open the parent's card too and include its paths: the child is client or sub-work of the parent. " +
  "If a goal matches no row, check the Archived list before creating anything new, and ask Jermaine rather than guessing. " +
  "Cards are hand-maintained; treat their Gaps section as unknowns to confirm, not facts. " +
  "Active = a commit or memory edit in the last " + inv.active_window_days + " days, a CoS work item naming the folder, or forced by `overrides.json` include; `exclude` forces archived."
);
L.push("");
L.push(`## Active projects (${active.length})`);
L.push("");
L.push("| Project | What | Aliases | Card | Last activity |");
L.push("|---|---|---|---|---|");
const activeNames = new Set(active.map((p) => p.name));
const isChild = (p) => parents[p.name] && activeNames.has(parents[p.name].parent);
const ordered = [];
for (const p of active) {
  if (isChild(p)) continue;
  ordered.push(p);
  for (const c of active) if (isChild(c) && parents[c.name].parent === p.name) ordered.push(c);
}
for (const p of ordered) {
  const what = clip(cardWhat(p.name) || p.short_description || "no description found", 160);
  const al = (aliases[p.name] || []).join(", ") || "—";
  const card = cardNames.has(p.name) ? `[cards/${p.name}.md](cards/${encodeURIComponent(p.name)}.md)` : "**MISSING**";
  const why = include.has(p.name) && !p.active ? " (forced active)" : "";
  const nm = isChild(p) ? `↳ ${p.name} (${parents[p.name].relation.split(" (")[0].split(" —")[0]})` : p.name;
  L.push(`| ${cell(nm)}${why} | ${cell(what)} | ${cell(al)} | ${card} | ${cell(lastActivity(p))} |`);
}
L.push("");
L.push(`_${cosNote}_`);
L.push("");
if (missingCards.length) { L.push(`**Active projects missing a card:** ${missingCards.join(", ")}`); L.push(""); }
else { L.push("All active projects have a card."); L.push(""); }
if (orphanCards.length) { L.push(`**Cards for projects no longer active:** ${orphanCards.join(", ")}`); L.push(""); }
const noteKeys = Object.keys(notes);
if (noteKeys.length) {
  L.push("### Override notes");
  L.push("");
  for (const k of noteKeys) L.push(`- **${k}**: ${notes[k]}`);
  L.push("");
}
if (unknownOverride.length || conflicting.length) {
  L.push("### Override problems");
  L.push("");
  for (const n of unknownOverride) L.push(`- \`${n}\` is in overrides.json but not in inventory.json.`);
  for (const n of conflicting) L.push(`- \`${n}\` is in both include and exclude (exclude wins).`);
  L.push("");
}

L.push(`## Archived (${archived.length})`);
L.push("");
L.push("_No card. One line each: description (first prose line of CLAUDE.md/README/package.json, may be template text) or flags. Last commit shown when known._");
L.push("");
for (const p of archived) {
  const desc = p.short_description && !/^use lovable$/i.test(p.short_description.trim()) ? clip(p.short_description, 110) : null;
  const bits = [];
  bits.push(desc || (/^use lovable$/i.test((p.short_description || "").trim()) ? "Lovable template README, no real description" : "no description found"));
  if (p.last_commit_iso) bits.push(`last commit ${day(p.last_commit_iso)}`);
  else if (!p.is_git) bits.push("not git");
  const fl = p.flags.filter((f) => !f.startsWith("same-remote-as:") && !f.startsWith("symlinked-from:"));
  if (fl.length) bits.push(`flags: ${fl.join(", ")}`);
  if (exclude.has(p.name)) bits.push("forced archived by overrides.json");
  L.push(`- **${p.name.trim() === p.name ? p.name : JSON.stringify(p.name)}** — ${bits.join("; ")}`);
}
L.push("");

L.push(`## Loose files (${inv.loose_files.length})`);
L.push("");
L.push("_Files sitting directly in the Sites folder, not in any project._");
L.push("");
for (const f of inv.loose_files) L.push(`- ${f.name} — ${(f.size_bytes / 1024).toFixed(0)} KB, modified ${day(f.modified_iso)}`);
L.push("");

L.push(`## Orphan memory (${inv.orphan_memory.length})`);
L.push("");
L.push("_Claude memory folders whose encoded path matches no existing folder (project was moved or renamed). Still readable; cards cite them where relevant._");
L.push("");
for (const m of inv.orphan_memory) L.push(`- ${tilde(m.path)} — ${m.count} files, last modified ${day(m.last_modified_iso) || "n/a"}`);
L.push("");
L.push(`### Non-project memory (${inv.non_project_memory.length})`);
L.push("");
L.push("_Memory for folders that are not projects (workspace root, home, app data). Workspace-level ones often hold cross-project facts._");
L.push("");
for (const m of inv.non_project_memory) L.push(`- ${tilde(m.path)} — ${m.count} files${m.count ? `, last modified ${day(m.last_modified_iso)}` : ""}`);
L.push("");

L.push("## Duplicates / clutter (info only)");
L.push("");
const dc = [];
for (const g of inv.remote_duplicate_groups) dc.push(`- Same git remote \`${g.remote}\`: ${g.members.join(", ")}`);
for (const p of inv.projects) {
  const wt = p.flags.find((f) => f.startsWith("worktree-of:"));
  if (wt) dc.push(`- ${p.name}: linked git worktree of ${wt.slice("worktree-of:".length)}`);
}
for (const p of inv.projects) if (p.aliases.length) dc.push(`- ${p.name}: canonical at ${tilde(p.path)}; also reachable via ${p.aliases.map(tilde).join(", ")} (symlink)`);
for (const p of inv.projects) {
  if (!p.nested_git_repos || !p.flags.includes("worktree-container")) continue;
  const wts = p.nested_git_repos.filter((n) => fs.existsSync(path.join(p.path, n, ".git")) && fs.lstatSync(path.join(p.path, n, ".git")).isFile());
  if (wts.length) dc.push(`- ${p.name}: holds ${wts.length} linked worktree folders (${wts.join(", ")})`);
}
for (const p of inv.projects) {
  const fl = p.flags.filter((f) => ["scratch", "backup", "empty", "worktree-container", "name-has-surrounding-whitespace"].includes(f));
  if (fl.length && !(p.nested_git_repos && p.flags.includes("worktree-container") && fl.length === 1)) dc.push(`- ${JSON.stringify(p.name)}: ${fl.join(", ")}`);
}
for (const p of inv.projects) if (p.is_git && !p.last_commit_iso) dc.push(`- ${p.name}: git repo with no commits (or unreadable log)`);
for (const s of inv.skipped_dirs) dc.push(`- skipped ${s.name}: ${s.reason}`);
L.push(...dc);
L.push("");
L.push("## Scanner caveats");
L.push("");
for (const g of inv.gaps) L.push(`- ${g}`);
L.push("");

const md = L.join("\n");
if (process.argv.includes("--stdout")) process.stdout.write(md);
else {
  const tmp = OUT + ".tmp";
  fs.writeFileSync(tmp, md);
  fs.renameSync(tmp, OUT);
  console.log(`wrote ${OUT} (${Buffer.byteLength(md)} bytes) active=${active.length} archived=${archived.length} cards=${cardNames.size} missing_cards=${missingCards.length}${missingCards.length ? " [" + missingCards.join(", ") + "]" : ""}`);
}
