# iCloud-only files in old owlthat-hq (CoS #223, 2026-10-01 08:46)

Read-only. Method: stat and path names, plus git metadata only. No file contents read, no downloads triggered, nothing copied.
Full list: `icloud-only-2026-10-01.tsv` (26,524 rows: repo, path, class, bytes, old_mtime, note; the note starts with `tier=`).

## Key finding: the old .git dirs are NOT dataless
0 dataless files inside any old `.git` (cortex 4,159 files, core 3,473, website 4,527, mobile 761, docs 669, sensei-console 124, .github 29). So old git metadata was readable (`GIT_OPTIONAL_LOCKS=0`, no `git status`):
- All **141 old local branches** (cortex 87, core 33, mobile 12, website 4, docs 3, sensei-console 1, .github 1) have their tip commit on a GitHub branch in the new clones. The 4 cortex gatefix branches are on origin; the old main 7400cec4 is on `origin/main-local-backup`.
- **0 stashes** in any repo.
- So no unpushed committed work exists. The only risk is uncommitted or ignored working files, listed below.
- (#199 covered only the Smart-Calltime repos. It is not relevant to owlthat-hq.)

## Counts per class (dataless files, excluding node_modules/.git)
| repo | SAME_SIZE | SIZE_DIFFERS | OTHER_BRANCH_ONLY | NOT_TRACKED | total |
|---|---|---|---|---|---|
| cortex | 13,704 | 62 | 1 | 2,518 | 16,285 |
| core | 223 | 2 | 0 | 334 | 559 |
| website | 2,165 | 1 | 0 | 2,234 | 4,400 |
| mobile | 65 | 0 | 0 | 5,097 | 5,162 |
| docs | 78 | 0 | 0 | 1 | 79 |
| sensei-console | 39 | 0 | 0 | 0 | 39 |
| .github | 0 | 0 | 0 | 0 | 0 |
| **total** | **16,274** | **65** | **1** | **10,184** | **26,524** |

Cortex: 12,441 of its 16,285 files are in the 10 agent worktrees under `.claude/worktrees/`. Each was classified against its own branch and its worktree index.

Tracked-file proof: all 16,274 SAME_SIZE files, and 64 of the 65 SIZE_DIFFERS files, match the old git index stat exactly (size and mtime), and that blob exists in the GitHub clone. So the content is in git. The SIZE_DIFFERS files are older committed versions; the clone's commits are newer (Sep 29 to Oct 1).
**The one exception** is `website/docs/brand/owlthat-brand-guidelines.pdf`: it is stat-dirty, 1,494,450 bytes locally against 161,197 on GitHub, with an mtime of 2026-09-23. That is an uncommitted local edit. MUST PULL.
The OTHER_BRANCH_ONLY file (a worktree test file) is on origin/main at the same size, so it is safe.

## NOT_TRACKED groups
| group | files | bytes | already copied |
|---|---|---|---|
| .env* (cortex .env 1,223 B, cortex .env.bak-before-compose-stack 334 B, core .env 71 B, website backend/.env 30 B) | 4 | 1,658 | 0 (rebuilt cortex .env is 803 B, so the original has more) |
| backups/, certbot/ | 0 | 0 | the old dirs are EMPTY (certbot has only empty conf/ and www/) |
| website/video/public | 37 | 199,279,499 | 0 |
| website/video/out | 19 | 22,258,261 | 0 |
| website/video/.auth (secret, browser login) | 243 | 6,360,432 | 0 |
| build output (.next, dist, build, coverage) | 6,641 | 942,828,806 | n/a (regenerable) |
| other: mobile .derived (Xcode DerivedData) | 2,931 | 250,915,991 | regenerable |
| other: core infra/cdk.out + website backend/cdk.out | 274 | 92,868,539 | regenerable |
| other: worktree tsconfig.tsbuildinfo x7, next-env.d.ts | 8 | 2,441,614 | regenerable |
| other: small local files (.claude, .idea, docs, override.yml, worker workspaces) | 27 | 125,496 | 0 (the size-only matches are noted in the TSV) |

ALREADY_COPIED is 0. The 87 media files #213 copied were not dataless, so they aren't in this set. The 301-path #213 list is a strict subset: all 301 are still dataless and all are NOT_TRACKED.

## Must-pull list: 48 files, 200.8 MB (only 11 files, 1.5 MB, without the video media)
- `cortex/.env`, `cortex/.env.bak-before-compose-stack`, `cortex/docker-compose.override.yml` (48 B)
- `core/.env`, `website/backend/.env`
- `website/docs/brand/owlthat-brand-guidelines.pdf` (1.49 MB, uncommitted edit)
- `docs/_dan/research/customer-discovery-questions-2026-09-16.md` (an .html sibling is in git; the .md is not)
- `cortex/docs/tasks/active/interview-room/evidence/S00/{package.json,agent.mjs}`
- `cortex/.claude/agents/design-system-enforcer.md` (19.6 KB, no copy anywhere in ~/Code or the harness), `core/.claude/CLAUDE.md` (265 B)
- `website/video/public/**`: 37 files in 18 dirs, 199.3 MB (captures/, stills/, brand/, music/)

Optional: video/out (19 files, 22 MB, re-renderable from the tracked Remotion src); video/.auth (243 files, 6.4 MB; re-login instead); 21 small .claude backup, harness, .idea and worker-workspace files (88 KB).
Skip: 9,854 regenerable files (1.29 GB).

## How to pull
- bird started again at 08:33 and is already in state U. A bulk download is unlikely to move.
- iCloud.com: practical for `website/video/public` (one folder). Unverified: whether iCloud.com shows dotfiles and dot-folders (.env, .claude). If it does not, the .env files can't be fetched that way.
- Better: a targeted `brctl download <path>`, or Finder "Download Now", on the 11 small files plus the one folder `website/video/public`, ideally after bird is restarted. All 48 paths are listed with `tier=MUST_PULL` in the TSV.
- Once those 48 are in, the cutover no longer needs the all-zero condition. Every other dataless file is in git or is regenerable.
