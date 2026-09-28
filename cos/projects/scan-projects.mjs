#!/usr/bin/env node
// Project inventory scanner for the Chief of Staff project index.
// Read-only everywhere except the output file. No dependencies beyond Node built-ins
// (uses node:sqlite, Node >= 22.5, to read the CoS work store read-only).
//
// Usage: node scan-projects.mjs [--out <path>] [--as-of YYYY-MM-DD] [--stdout]
// Defaults: --out <this dir>/inventory.json, --as-of today.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HOME = os.homedir();
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITES_SHORT = path.join(HOME, "Documents", "Sites");
const SITES_LONG = path.join(HOME, "Documents", "Documents - Jermaine’s MacBook Pro", "Sites");
const CODE_DIR = path.join(HOME, "Code");
const CLAUDE_PROJECTS = path.join(HOME, ".claude", "projects");
const COS_DB = process.env.DB_PATH || path.join(HOME, "Library", "Application Support", "assistance", "secondbrain.sqlite");
const ACTIVE_WINDOW_DAYS = 90;

// ---------- args ----------
const args = process.argv.slice(2);
const argVal = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const OUT = argVal("--out") || path.join(HERE, "inventory.json");
const AS_OF = argVal("--as-of") ? new Date(argVal("--as-of") + "T23:59:59Z") : new Date();
const CUTOFF_MS = AS_OF.getTime() - ACTIVE_WINDOW_DAYS * 86400_000;

const gaps = [];

// ---------- helpers ----------
const lstat = (p) => { try { return fs.lstatSync(p); } catch { return null; } };
const stat = (p) => { try { return fs.statSync(p); } catch { return null; } };
const real = (p) => { try { return fs.realpathSync(p); } catch { return null; } };
const readText = (p, max = 64 * 1024) => {
  try { const fd = fs.openSync(p, "r"); const buf = Buffer.alloc(max); const n = fs.readSync(fd, buf, 0, max, 0); fs.closeSync(fd); return buf.subarray(0, n).toString("utf8"); } catch { return null; }
};
const readdir = (p) => { try { return fs.readdirSync(p, { withFileTypes: true }); } catch { return null; } };

function git(dir, gitArgs) {
  try {
    return execFileSync("git", ["-C", dir, ...gitArgs], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 15000,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0" },
    }).trim();
  } catch { return null; }
}

function normRemote(url) {
  if (!url) return null;
  let u = url.trim().replace(/\.git$/, "").replace(/\/$/, "");
  const m = u.match(/^(?:ssh:\/\/)?git@([^:/]+)[:/](.+)$/);
  if (m) return `${m[1]}/${m[2]}`.toLowerCase();
  u = u.replace(/^https?:\/\/(?:[^@/]+@)?/, "");
  return u.toLowerCase();
}

function gitInfo(dir, realDir) {
  const top = git(dir, ["rev-parse", "--show-toplevel"]);
  const topReal = top ? real(top) : null;
  if (!topReal || topReal !== realDir) return { is_git: false, last_commit_iso: null, git_remote: null, worktree_of: null };
  const last = git(dir, ["log", "-1", "--format=%cI"]) || null;
  let remote = git(dir, ["config", "--get", "remote.origin.url"]);
  if (!remote) {
    const remotes = git(dir, ["remote"]);
    const first = remotes ? remotes.split("\n").filter(Boolean)[0] : null;
    remote = first ? git(dir, ["config", "--get", `remote.${first}.url`]) : null;
  }
  // Linked worktree: .git is a file pointing at <main>/.git/worktrees/<name>
  let worktree_of = null;
  const dotgit = lstat(path.join(dir, ".git"));
  if (dotgit && dotgit.isFile()) {
    const common = git(dir, ["rev-parse", "--git-common-dir"]);
    if (common) {
      const commonAbs = real(path.isAbsolute(common) ? common : path.join(dir, common));
      if (commonAbs && path.basename(commonAbs) === ".git") worktree_of = path.dirname(commonAbs);
    }
  }
  return { is_git: true, last_commit_iso: last, git_remote: remote || null, worktree_of };
}

const BOILERPLATE = [
  /^this file provides guidance to claude/i,
  /^(claude\.md|readme(\.md)?|agents\.md)$/i,
  /^(overview|project overview|about|introduction|table of contents|contents)$/i,
  /^getting started with create react app$/i,
  /^there are several ways of editing your application\.?$/i,
  /^welcome to your lovable project$/i,
];

function firstMeaningfulLine(text) {
  if (!text) return null;
  const lines = text.split(/\r?\n/);
  let inFence = false, inFront = false, inComment = false, inBoiler = false, headingFallback = null;
  for (let i = 0; i < Math.min(lines.length, 80); i++) {
    let l = lines[i].trim();
    if (i === 0 && l === "---") { inFront = true; continue; }
    if (inFront) { if (l === "---") inFront = false; continue; }
    if (l.startsWith("```")) { inFence = !inFence; continue; }
    if (inFence) continue;
    if (inBoiler) { if (!l) inBoiler = false; continue; }
    if (/^this file provides guidance to claude/i.test(l)) { inBoiler = true; continue; }
    if (inComment) { if (l.includes("-->")) inComment = false; continue; }
    if (l.startsWith("<!--")) { if (!l.includes("-->")) inComment = true; continue; }
    if (!l || /^[-=*_]{3,}$/.test(l) || l.startsWith("<") || l.startsWith("[![") || l.startsWith("![") || l.startsWith("|")) continue;
    const isHeading = /^#+\s/.test(l);
    l = l.replace(/^#+\s*/, "").replace(/^>\s*/, "").replace(/\*\*/g, "").trim();
    if (!l || BOILERPLATE.some((re) => re.test(l))) continue;
    if (isHeading) { if (!headingFallback) headingFallback = l; continue; }
    // Not descriptive: list/section lead-ins, lovable template URL lines, TODO placeholders, list items.
    if (/:$/.test(l) || /^(url|owner|todo)\s*:/i.test(l) || /^([-*+]|\d+\.)\s/.test(l)) continue;
    return l.length > 240 ? l.slice(0, 237) + "..." : l;
  }
  return headingFallback;
}

function readPackageJson(dir) {
  const t = readText(path.join(dir, "package.json"), 256 * 1024);
  if (!t) return null;
  try { return JSON.parse(t); } catch { return null; }
}

function findFile(dir, names) {
  const ents = readdir(dir);
  if (!ents) return null;
  for (const n of names) {
    const hit = ents.find((e) => e.name.toLowerCase() === n.toLowerCase() && (e.isFile() || e.isSymbolicLink()));
    if (hit) return path.join(dir, hit.name);
  }
  return null;
}

// Recursively checks whether a dir has any real file (ignoring .DS_Store), bounded.
function hasAnyFile(dir, depth = 0) {
  if (depth > 4) return true;
  const ents = readdir(dir);
  if (!ents) return false;
  for (const e of ents) {
    if (e.name === ".DS_Store") continue;
    if (e.isFile() || e.isSymbolicLink()) return true;
    if (e.isDirectory() && hasAnyFile(path.join(dir, e.name), depth + 1)) return true;
  }
  return false;
}

const encodeSeg = (s) => s.replace(/[^a-zA-Z0-9]/g, "-");

// Resolve a ~/.claude/projects dir name back to existing filesystem paths (all matches).
function decodeProjectDir(encoded) {
  const results = [];
  function walk(dir, rest, depth) {
    if (depth > 12 || results.length > 8) return;
    const ents = readdir(dir);
    if (!ents) return;
    for (const e of ents) {
      const enc = "-" + encodeSeg(e.name);
      if (rest !== enc && !rest.startsWith(enc + "-")) continue;
      const p = path.join(dir, e.name);
      const st = stat(p);
      if (!st || !st.isDirectory()) continue;
      if (rest === enc) results.push(p);
      else walk(p, rest.slice(enc.length), depth + 1);
    }
  }
  walk("/", encoded, 0);
  return results;
}

function listMdRecursive(dir, depth = 0, acc = []) {
  if (depth > 5) return acc;
  for (const e of readdir(dir) || []) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listMdRecursive(p, depth + 1, acc);
    else if (e.isFile() && e.name.toLowerCase().endsWith(".md")) acc.push(p);
  }
  return acc;
}

const SCRATCH_RE = /^(test\w*|\w*test|x{3,}|tmp|temp|scratch)$/i;
const BACKUP_RE = /(backup|\bbak\b|[-_ ]old$|[-_ ]copy$|\bcopy \d+$)/i;

// ---------- 1. same-dir check ----------
const shortL = lstat(SITES_SHORT), longL = lstat(SITES_LONG);
const shortReal = real(SITES_SHORT), longReal = real(SITES_LONG);
const shortStat = stat(SITES_SHORT), longStat = stat(SITES_LONG);
const same_dir_check = {
  a: SITES_SHORT,
  b: SITES_LONG,
  a_is_symlink: shortL ? shortL.isSymbolicLink() : null,
  a_symlink_target: shortL && shortL.isSymbolicLink() ? fs.readlinkSync(SITES_SHORT) : null,
  b_is_symlink: longL ? longL.isSymbolicLink() : null,
  a_realpath: shortReal,
  b_realpath: longReal,
  a_inode_followed: shortStat ? shortStat.ino : null,
  b_inode_followed: longStat ? longStat.ino : null,
  same_directory: !!(shortStat && longStat && shortStat.ino === longStat.ino && shortStat.dev === longStat.dev),
  scanned: null,
};
const SITES_SCAN = same_dir_check.same_directory ? (longReal || SITES_LONG) : SITES_SHORT;
same_dir_check.scanned = same_dir_check.same_directory ? [SITES_SCAN] : [SITES_SHORT, SITES_LONG];
if (!same_dir_check.same_directory) gaps.push("Sites paths are NOT the same directory; both scanned.");

// ---------- 2. enumerate candidate dirs ----------
const projectsByReal = new Map(); // realpath -> record
const skipped_dirs = [];
const loose_files = [];
let dirs_scanned = 0;
let merged_aliases = 0;

function makeRecord(name, p, rp, source) {
  return {
    name, path: p, realpath: rp, source, aliases: [],
    is_git: false, last_commit_iso: null, git_remote: null, worktree_of: null,
    has_claude_md: false, has_readme: false, short_description: null, description_source: null,
    package_name: null, memory_dirs: [], memory_last_modified: null, cos_work_mentions: 0, cos_work_ids: [], cos_work_ambiguous_ids: [],
    flags: [], active: false, active_reasons: [],
  };
}

function scanRoot(root, source, { collectLoose }) {
  const ents = readdir(root);
  if (!ents) { gaps.push(`Could not read ${root}`); return; }
  ents.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of ents) {
    const p = path.join(root, e.name);
    const st = stat(p); // follows symlinks
    const lst = lstat(p);
    if (!st) { gaps.push(`Broken entry (dangling symlink?): ${p}`); continue; }
    if (!st.isDirectory()) {
      if (collectLoose && e.name !== ".DS_Store") {
        loose_files.push({ name: e.name, path: p, ext: path.extname(e.name).toLowerCase() || null, size_bytes: st.size, modified_iso: st.mtime.toISOString() });
      }
      continue;
    }
    dirs_scanned++;
    if (e.name.startsWith(".")) { skipped_dirs.push({ name: e.name, path: p, reason: "hidden/tooling directory" }); continue; }
    const rp = real(p);
    const existing = projectsByReal.get(rp);
    if (existing) {
      existing.aliases.push(p);
      if (lst.isSymbolicLink()) existing.flags.push(`symlinked-from:${p}`);
      merged_aliases++;
      continue;
    }
    // If this entry is a symlink, record the real location as canonical path.
    const rec = makeRecord(e.name, lst.isSymbolicLink() ? rp : p, rp, source);
    if (lst.isSymbolicLink()) { rec.aliases.push(p); rec.flags.push(`symlinked-from:${p}`); }
    projectsByReal.set(rp, rec);
  }
}

// Scan ~/Code first so symlinked Sites entries merge into the ~/Code record.
scanRoot(CODE_DIR, "code", { collectLoose: false });
for (const root of same_dir_check.scanned) scanRoot(root, "sites", { collectLoose: true });

const projects = [...projectsByReal.values()];

// ---------- 3. per-project details ----------
for (const r of projects) {
  Object.assign(r, gitInfo(r.path, r.realpath));
  const claudeMd = findFile(r.path, ["CLAUDE.md"]) || findFile(path.join(r.path, ".claude"), ["CLAUDE.md"]);
  const readme = findFile(r.path, ["README.md", "README", "README.txt", "readme.md"]);
  r.has_claude_md = !!claudeMd;
  r.has_readme = !!readme;
  const pkg = readPackageJson(r.path);
  r.package_name = pkg && typeof pkg.name === "string" ? pkg.name : null;
  const candidates = [
    [claudeMd, "CLAUDE.md"],
    [readme, "README"],
  ];
  for (const [f, label] of candidates) {
    if (!f) continue;
    const d = firstMeaningfulLine(readText(f));
    if (d) { r.short_description = d; r.description_source = label; break; }
  }
  if (!r.short_description && pkg && typeof pkg.description === "string" && pkg.description.trim()) {
    r.short_description = pkg.description.trim(); r.description_source = "package.json";
  }
  // flags
  if (r.name !== r.name.trim()) r.flags.push("name-has-surrounding-whitespace");
  if (SCRATCH_RE.test(r.name.trim())) r.flags.push("scratch");
  if (BACKUP_RE.test(r.name)) r.flags.push("backup");
  if (r.name.trim().toLowerCase() === "worktrees") r.flags.push("worktree-container");
  if (!hasAnyFile(r.path)) r.flags.push("empty");
  if (!r.is_git) {
    // Container of linked worktrees?
    const kids = (readdir(r.path) || []).filter((e) => e.isDirectory());
    const wtKids = kids.filter((k) => { const g = lstat(path.join(r.path, k.name, ".git")); return g && g.isFile(); });
    if (wtKids.length && !r.flags.includes("worktree-container")) r.flags.push("worktree-container");
  }
  // Nested git repos inside a non-git folder (one level) — useful context.
  if (!r.is_git) {
    const nested = (readdir(r.path) || []).filter((e) => e.isDirectory() && lstat(path.join(r.path, e.name, ".git"))).map((e) => e.name);
    if (nested.length) r.nested_git_repos = nested;
  }
}

// worktree-of and remote duplicates
const byReal = new Map(projects.map((p) => [p.realpath, p]));
for (const r of projects) {
  if (r.worktree_of) {
    const main = byReal.get(r.worktree_of);
    r.flags.push(`worktree-of:${main ? main.name : r.worktree_of}`);
  }
}
const byRemote = new Map();
for (const r of projects) {
  const k = normRemote(r.git_remote);
  if (!k) continue;
  if (!byRemote.has(k)) byRemote.set(k, []);
  byRemote.get(k).push(r);
}
const remote_duplicate_groups = [];
for (const [k, group] of byRemote) {
  if (group.length < 2) continue;
  remote_duplicate_groups.push({ remote: k, members: group.map((g) => g.name) });
  for (const g of group) {
    for (const o of group) if (o !== g) g.flags.push(`same-remote-as:${o.name}`);
    // Mark as duplicate-of the main checkout only when this is a linked worktree of it,
    // or when the name is the other's name plus a suffix (e.g. Foo-backup, Foo-S09).
    const main = group.find((o) => o !== g && (g.worktree_of === o.realpath || (g.name.startsWith(o.name + "-") && o.name.length >= 3)));
    if (main) g.flags.push(`duplicate-of:${main.name}`);
  }
}

// ---------- 4. memory dirs ----------
const orphan_memory = [];
const non_project_memory = [];
const memEntries = (readdir(CLAUDE_PROJECTS) || []).filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
let memory_dirs_found = 0;
for (const e of memEntries) {
  const memPath = path.join(CLAUDE_PROJECTS, e.name, "memory");
  const ms = stat(memPath);
  if (!ms || !ms.isDirectory()) continue;
  memory_dirs_found++;
  const mdFiles = listMdRecursive(memPath);
  let lastMod = null;
  for (const f of mdFiles) { const s = stat(f); if (s && (!lastMod || s.mtimeMs > lastMod)) lastMod = s.mtimeMs; }
  const index = path.join(memPath, "MEMORY.md");
  const entry = {
    path: memPath, encoded_name: e.name, count: mdFiles.length,
    memory_index: stat(index) ? index : null,
    last_modified_iso: lastMod ? new Date(lastMod).toISOString() : null,
  };
  const decoded = decodeProjectDir(e.name);
  if (!decoded.length) { orphan_memory.push({ ...entry, reason: "encoded path maps to no existing folder" }); continue; }
  entry.decoded_paths = decoded;
  // Map to a project: realpath equal to project, or inside it (subfolder).
  let target = null, sub = null;
  for (const d of decoded) {
    const rd = real(d);
    for (const p of projects) {
      if (rd === p.realpath || rd.startsWith(p.realpath + path.sep)) {
        if (!target || p.realpath.length > target.realpath.length) { target = p; sub = rd === p.realpath ? null : path.relative(p.realpath, rd); }
      }
    }
  }
  if (!target) { non_project_memory.push({ ...entry, reason: "maps to an existing folder that is not a project (workspace root, home, temp, app data)" }); continue; }
  target.memory_dirs.push({ path: memPath, count: entry.count, memory_index: entry.memory_index, subfolder: sub, decoded_path: decoded[0], last_modified_iso: entry.last_modified_iso });
  if (lastMod && (!target.memory_last_modified || lastMod > Date.parse(target.memory_last_modified))) target.memory_last_modified = new Date(lastMod).toISOString();
}

// ---------- 5. CoS work mentions ----------
let cos_work = { source: COS_DB, table: "cos_work", fields_matched: ["goal", "title"], items_total: null, status: "not-read" };
try {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(COS_DB, { readOnly: true });
  const rows = db.prepare("SELECT id, goal, title FROM cos_work").all();
  db.close();
  cos_work.items_total = rows.length;
  cos_work.status = "read";
  // Names that also exist as sub-repos/subfolders inside another project (e.g. owlthat-hq/core)
  // are ambiguous: record their matches separately and do not count them toward activity.
  const nestedOwners = new Map();
  for (const p of projects) {
    const subs = new Set([...(p.nested_git_repos || []), ...p.memory_dirs.map((m) => m.subfolder).filter(Boolean).map((x) => x.split(path.sep)[0])]);
    for (const n of subs) { const k = n.toLowerCase(); if (!nestedOwners.has(k)) nestedOwners.set(k, []); nestedOwners.get(k).push(p); }
  }
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const r of projects) {
    const n = r.name.trim();
    if (n.length < 3) continue; // too short to match meaningfully
    const variants = new Set([n, n.replace(/[-_]/g, " ")]);
    const re = new RegExp(`(^|[^a-z0-9])(${[...variants].map(esc).join("|")})($|[^a-z0-9])`, "i");
    const owners = (nestedOwners.get(n.toLowerCase()) || []).filter((o) => o !== r);
    for (const w of rows) {
      if (!re.test(`${w.goal}\n${w.title}`)) continue;
      if (owners.length) {
        r.cos_work_ambiguous_ids.push(Number(w.id));
        for (const o of owners) if (!o.cos_work_ambiguous_ids.includes(Number(w.id))) o.cos_work_ambiguous_ids.push(Number(w.id));
      } else { r.cos_work_mentions++; r.cos_work_ids.push(Number(w.id)); }
    }
    if (owners.length && r.cos_work_ambiguous_ids.length) r.flags.push(`cos-name-ambiguous-with:${owners.map((o) => o.name + "/" + n).join(",")}`);
  }
  gaps.push(`cos_work_mentions is a case-insensitive whole-word match of the folder name against cos_work.goal/title (${rows.length} items); generic names (e.g. core, voice, test) can over-match and projects referred to by other names are missed. Names under 3 chars are not matched. Matches on a name that is also a sub-repo of another project (e.g. core vs owlthat-hq/core) go to cos_work_ambiguous_ids and do not count toward cos_work_mentions or active.`);
} catch (err) {
  cos_work.status = `error: ${err.message}`;
  gaps.push(`Could not read CoS work store at ${COS_DB} read-only (${err.message}); cos_work_mentions left at 0.`);
}

// ---------- 6. active ----------
for (const r of projects) {
  if (r.last_commit_iso && Date.parse(r.last_commit_iso) >= CUTOFF_MS) r.active_reasons.push("recent-commit");
  if (r.cos_work_mentions > 0) r.active_reasons.push("cos-work-mention");
  if (r.memory_last_modified && Date.parse(r.memory_last_modified) >= CUTOFF_MS) r.active_reasons.push("recent-memory");
  r.active = r.active_reasons.length > 0;
  r.flags = [...new Set(r.flags)];
}
projects.sort((a, b) => a.name.localeCompare(b.name));

// ---------- 7. gaps + counts ----------
gaps.push("Folder mtimes were not used for activity: most Sites folders show Sep 23-24 2026 mtimes, consistent with a bulk move, so they are not a reliable signal.");
gaps.push("short_description is taken verbatim from the first prose line of CLAUDE.md, then README, then package.json description; it may describe tooling rather than the product.");
gaps.push("duplicate-of is only set for linked git worktrees or name-suffix variants sharing a git remote; same-remote-as lists every other folder with the same remote without choosing a canonical one.");
const noGit = projects.filter((p) => !p.is_git).length;
if (noGit) gaps.push(`${noGit} project folders are not git repo roots; their activity depends only on memory/CoS signals.`);

const active = projects.filter((p) => p.active).length;
const counts = {
  dirs_scanned,
  projects: projects.length,
  active,
  archived: projects.length - active,
  merged_aliases,
  skipped_dirs: skipped_dirs.length,
  loose_files: loose_files.length,
  memory_dirs_found,
  memory_dirs_mapped: projects.reduce((n, p) => n + p.memory_dirs.length, 0),
  non_project_memory: non_project_memory.length,
  orphan_memory: orphan_memory.length,
  reconciles:
    dirs_scanned === projects.length + merged_aliases + skipped_dirs.length &&
    projects.length === active + (projects.length - active) &&
    memory_dirs_found === projects.reduce((n, p) => n + p.memory_dirs.length, 0) + non_project_memory.length + orphan_memory.length,
  reconcile_rule: "dirs_scanned = projects + merged_aliases + skipped_dirs; projects = active + archived; memory_dirs_found = memory_dirs_mapped + non_project_memory + orphan_memory",
};
if (!counts.reconciles) gaps.push("COUNTS DO NOT RECONCILE — investigate.");

const out = {
  generated_at: new Date().toISOString(),
  as_of: AS_OF.toISOString(),
  active_window_days: ACTIVE_WINDOW_DAYS,
  sources: {
    sites: same_dir_check.scanned,
    code: CODE_DIR,
    claude_memory: path.join(CLAUDE_PROJECTS, "*", "memory"),
    cos_work,
  },
  same_dir_check,
  projects,
  remote_duplicate_groups,
  skipped_dirs,
  loose_files,
  orphan_memory,
  non_project_memory,
  gaps,
  counts,
};

const json = JSON.stringify(out, null, 2) + "\n";
if (args.includes("--stdout")) process.stdout.write(json);
else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const tmp = OUT + ".tmp";
  fs.writeFileSync(tmp, json);
  fs.renameSync(tmp, OUT);
  console.log(`wrote ${OUT} (${Buffer.byteLength(json)} bytes) projects=${counts.projects} active=${counts.active} archived=${counts.archived} reconciles=${counts.reconciles}`);
}
