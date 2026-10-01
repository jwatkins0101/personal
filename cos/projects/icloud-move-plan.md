# Plan: move code repos out of iCloud (Task #193, Phase 1)

Inventory taken 2026-09-30, read-only. Nothing was moved, copied, fetched, stashed or changed.
Status: **waiting for Jermaine's approval.** Step 0 needs his OK before anything else can run.

## 1. What I found (short version)

1. **There is only one folder to move.** `~/Documents/Sites` is a symlink to `~/Documents/Documents - Jermaine’s MacBook Pro/Sites`. `~/Documents` is inside iCloud "Desktop & Documents" sync (xattr `com.apple.file-provider-domain-id: com.apple.CloudDocs.iCloudDriveFileProvider/...`, and many files are flagged `compressed,dataless`).
2. **iCloud has emptied most of the local files, and it is not downloading them back right now.**
   - Sites takes 47 GB in total but only 26 GB is actually on this Mac.
   - 731,703 files under Sites are "dataless": the name is here, the content is only in iCloud. 562k of them are in node_modules and **26,124 are inside `.git` folders**.
   - Reading a 369-byte dataless `.git/config` hung for more than 30 s and never finished. `brctl` shows CloudDocs as `needs-sync-up | in-sync-down`.
   - iCloud was still emptying files while I worked: `wiki/.git/config` could be read at 17:50 and was dataless a few minutes later.
   - This is why git hangs. The cortex pack `pack-d071ebb1….pack` (22.7 MB) is itself dataless.
3. **The disk is nearly full**: 460 GB disk, 412 GB used, **15 GB free (97%)**. That is the likely reason macOS keeps emptying files. The biggest item is Docker: `Docker.raw` takes about **101 GB** on disk, and `docker system df` shows **71 GB of volumes that could be freed** (1,349 volumes, 18 in use) plus 12.5 GB of images.
4. **I could not check git status for any repo.** Every repo except the empty paytons-place-week1-reel has at least one key git file (config, HEAD, index, packs, loose objects or refs) that is dataless. So for all 91 table rows, "uncommitted changes", "stash count" and fsck are **UNVERIFIED**. I did not guess them. The one repo git could open, `paytons-place-week1-reel`, has 0 commits and git status hung on its working files.
5. **What I checked instead, without using git:** I read each local branch pointer that is still on disk and asked GitHub (`gh api repos/X/commits/SHA`) whether that commit exists there.
   - **Confirmed NOT on GitHub:** 4 cortex branches: `gatefix/ads-connectors-v2@4c14324e`, `gatefix/agent-import@7d6e371d`, `gatefix/meta-messaging@3ae9065f`, `gatefix/scan-truth-final@9983d321`. These commits exist only in the iCloud copy.
   - All other branch pointers I could read are on GitHub. Many pointers are dataless and could not be read (see the table).
6. **The Smart-Calltime repos can't be re-cloned.** `Smart-Calltime-Solutions-LLC/*` (SmartCalltimeMonorepo, smart-calltime-solutions-v2, smart-calltime-solutions-website, prompt-keeper) return "Repository not found". jwatkins0101 is not a member of that org any more (checked with `gh api user/orgs`). For this move, treat these as **local-only**. They can only be saved by copying, and only after iCloud downloads their files again.
7. **Repos with 0 commits** (all the code is in the working files only): abrl.org (its GitHub repo is also empty), kindred, mychart, wiki, paytons-place-week1-reel. abrl.org also has a leftover `.git/index.lock` dated Sep 30 12:18.
8. **Archived GitHub remotes:** OwlThat/core-app, OwlThat/adaptive-agent-system, OwlThat/facebookai, OwlThat/hogshead.

## 2. Counts

- Top-level folders under Sites: ~88 (plus loose files). The table has 91 rows: 59 repos + 32 worktrees.
  - 3 of these are symlinks that already point into ~/Code: assistance, deal-watch, youtube-knowledge. Skip them.
- `.git` entries found (maxdepth 5): **151**
  - **59 real repos** (including nested ones such as core/backend/baseService, gb-platform/backend/baseService, Life/fanstyfootball, and owlthat-hq/{.github, core, cortex, docs, mobile, sensei-console, website}).
  - **32 worktrees at the top level** (owlthat-hq/core-*, cortex-*, .worktrees, .process-fixes-2026-09-23/*, SmartCalltimeMonorepo-S09/-sentry).
  - **60 agent worktrees** under `SmartCalltimeMonorepo/.claude/worktrees/`. The `.git` pointer file is dataless in 41 of them. They are 11–20 MB each with no node_modules.
  - There are also 8 more agent worktrees under `owlthat-hq/cortex/.claude/worktrees/` (below the scan depth; they appear in cortex's `.git/worktrees`).
- Repos with a GitHub remote I could reach: 45 slugs checked, 41 exist, 4 not found (the Smart-Calltime ones).
- Local-only (no remote, or remote empty or unreachable): abrl.org, kindred, mychart, wiki, paytons-place-week1-reel, song, when-the-ville-stood-still, Life/fanstyfootball, owlthat-hq/.worktrees etc., plus the 4 Smart-Calltime repos.
  - song and when-the-ville-stood-still had commits in the Sep 26 scan but no remote.
  - For Life/fanstyfootball the config can't be read, and the Sep 26 scan did not list it.
- Corrupt or failing fsck: **could not run on any repo** because of the dataless files. The known-bad one is cortex (the truncated `pack-d071ebb1`, reported by you). No repo had fsck results I could collect.

## 3. Inventory table

Key:
- **Remote**: read from `.git/config` when it could be read. Otherwise taken from the Sep 26 cos scan (`inventory.json`) or matched by name, and marked as such.
- **Git files evicted**: which key git files are dataless. `packs(n)` counts both .pack and .idx files; `loose(n)` counts dataless loose objects.
- **Unpushed**: only branch tips that could be read were checked against GitHub. `readable < br` means some branches could not be checked.
- **Dirty / stash / fsck**: UNVERIFIED for every row (see §1.4), so there is no column for them.
- **Evicted work files**: dataless files outside `.git` and node_modules.

| # | Repo (under Sites/) | Type | Remote | GitHub check | HEAD branch (from file) | Git files evicted (dataless) | Unpushed commits (verified vs GitHub) | Evicted work files | Size total / .git / node_modules | Last commit (Sep 26 scan) | Proposed method |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | .process-fixes-2026-09-23/core | wt | worktree of owlthat-hq/core | - | HEAD-DATALESS | commondir HEAD | see parent | 259 | 30M / - / 0M | ? | recreate as worktree/branch from new clone; rsync uncommitted files |
| 2 | .process-fixes-2026-09-23/cortex | wt | worktree of owlthat-hq/cortex | - | fix/process-enforcement-2026-09-23 | commondir index | see parent | 2969 | 127M / - / 0M | ? | recreate as worktree/branch from new clone; rsync uncommitted files |
| 3 | .process-fixes-2026-09-23/SmartCalltimeMonorepo | wt | worktree of SmartCalltimeMonorepo | - | HEAD-DATALESS | commondir HEAD index | see parent | 2144 | 31M / - / 0M | ? | recreate as worktree/branch from new clone; rsync uncommitted files |
| 4 | .process-fixes-2026-09-23/softwareharness | wt | worktree of softwareharness | - | fix/process-enforcement-2026-09-23 | loose(89) refs(2) index | see parent | 35 | 239K / - / 0M | ? | recreate as worktree/branch from new clone; rsync uncommitted files |
| 5 | .process-fixes-2026-09-23/veryapp | wt | worktree of veryapp (inferred from name; .git file evicted) | - | ? | none | see parent | 585 | 10M / - / 0M | ? | recreate as worktree/branch from new clone; rsync uncommitted files |
| 6 | .process-fixes-2026-09-23/wethejuryroom | wt | worktree of wethejuryroom (inferred from name; .git file evicted) | - | ? | none | see parent | 369 | 54M / - / 0M | ? | recreate as worktree/branch from new clone; rsync uncommitted files |
| 7 | abrl.org | repo | jwatkins0101/abrl.org (from Sep 26 scan / name match; config unreadable) | OK, pushed 2026-03-16, EMPTY | HEAD-DATALESS | config HEAD | none found (br 0, readable 0, on GitHub 0) | 15 | 194M /  35K / 0M | ? | rsync working tree (repo has 0 commits) |
| 8 | adaptive-agent-system | repo | OwlThat/adaptive-agent-system (from Sep 26 scan / name match; config unreadable) | OK ARCHIVED, pushed 2025-07-15 | HEAD-DATALESS | config HEAD packs(2) loose(199) refs(4) index | none found (br 1, readable 0, on GitHub 0) | 96 | 78M /  59M / 0M | 2025-07-14 | clone (archived remote) or skip |
| 9 | agentic-price-monitor | repo | jwatkins0101/agentic-price-monitor (from Sep 26 scan / name match; config unreadable) | OK, pushed 2026-06-25 | HEAD-DATALESS | config HEAD loose(21) refs(2) | none found (br 1, readable 0, on GitHub 0) | 17 | 24M /  90K / 0M | 2026-06-25 | fresh clone + overlay working tree |
| 10 | AIAgents | repo | jwatkins0101/AIAgents (from Sep 26 scan / name match; config unreadable) | OK, pushed 2026-09-28 | HEAD-DATALESS | config HEAD packs(1) loose(107) refs(2) | none found (br 1, readable 1, on GitHub 1) | 5311 | 5.7G / 323M / 1194M | 2026-09-22 | fresh clone + overlay working tree |
| 11 | atria | repo | newguy987/atria (from Sep 26 scan / name match; config unreadable) | OK, pushed 2026-03-27 | HEAD-DATALESS | config HEAD packs(2) loose(38) refs(3) index | none found (br 1, readable 0, on GitHub 0) | 8 | 2.8M / 1.3M / 0M | 2026-03-14 | fresh clone + overlay working tree |
| 12 | awstest | repo | https://github.com/stellasvenue/awstest.git | OK, pushed 2024-11-15, EMPTY | main | loose(1) refs(2) | none found (br 1, readable 1, on GitHub 1) | 4 | 56K /  50K / 0M | 2024-11-15 | fresh clone + overlay working tree |
| 13 | bouvier-bridge | repo | jwatkins0101/bouvier-bridge (from Sep 26 scan / name match; config unreadable) | OK, pushed 2026-05-17 | HEAD-DATALESS | config HEAD packs(3) loose(139) refs(2) | none found (br 1, readable 0, on GitHub 0) | 278 | 168M /  44M / 29M | 2026-03-21 | fresh clone + overlay working tree |
| 14 | core | repo | stellasvenue/core (from Sep 26 scan / name match; config unreadable) | OK, pushed 2025-03-17 | main | config packs(1) loose(1187) refs(2) | none found (br 1, readable 0, on GitHub 0) | 158 | 1.9G / 123M / 1627M | 2025-03-17 | fresh clone + overlay working tree |
| 15 | core-app | repo | git@github.com:OwlThat/core-app.git | - | HEAD-DATALESS | HEAD packs(5) loose(2983) refs(57) index | UNVERIFIED | 4543 | 4.3G / 121M / 0M | 2026-03-18 | rsync copy |
| 16 | core/backend/baseService | repo | https://github.com/stellasvenue/baseService.git | OK, pushed 2025-02-12 | main | packs(1) loose(3425) refs(3) | none found (br 1, readable 0, on GitHub 0) | 7 | 44M / 6.0M / 37M | ? | fresh clone + overlay working tree |
| 17 | corefour | repo | jwatkins0101/jwatkins0101.github.io (from Sep 26 scan / name match; config unreadable) | OK, pushed 2026-01-17 | HEAD-DATALESS | config HEAD loose(60) refs(3) | none found (br 1, readable 0, on GitHub 0) | 52 | 254M /  94M / 0M | 2026-01-17 | fresh clone + overlay working tree |
| 18 | diligence-os | repo | https://github.com/newguy987/diligence-os.git | OK, pushed 2026-07-19 | main | packs(4) loose(162) refs(2) index | none found (br 1, readable 1, on GitHub 1) | 647 | 287M / 1.9M / 0M | 2026-06-15 | fresh clone + overlay working tree |
| 19 | empathy-form-flow | repo | veryhealth/empathy-form-flow (from Sep 26 scan / name match; config unreadable) | OK, pushed 2026-03-20 | HEAD-DATALESS | config HEAD refs(2) | none found (br 1, readable 1, on GitHub 1) | 64 | 2.0M / 836K / 0M | 2026-03-05 | fresh clone + overlay working tree |
| 20 | EvalScope | repo | https://github.com/jwatkins0101/EvalScope.git | OK, pushed 2025-08-19, EMPTY | main | packs(2) refs(1) index | none found (br 1, readable 1, on GitHub 1) | 7 | 75K /  61K / 0M | 2025-08-19 | fresh clone + overlay working tree |
| 21 | facebookai | repo | OwlThat/facebookai (from Sep 26 scan / name match; config unreadable) | OK ARCHIVED, pushed 2025-02-15, EMPTY | HEAD-DATALESS | config HEAD packs(2) loose(7) refs(3) index | none found (br 1, readable 0, on GitHub 0) | 8 | 515K / 169K / 0M | 2025-02-15 | clone (archived remote) or skip |
| 22 | gb-platform | repo | stellasvenue/core (from Sep 26 scan / name match; config unreadable) | OK, pushed 2025-03-17 | HEAD-DATALESS | config HEAD packs(1) loose(1193) refs(2) | none found (br 1, readable 1, on GitHub 1) | 160 | 1.9G / 124M / 1662M | 2025-03-17 | fresh clone + overlay working tree |
| 23 | gb-platform/backend/baseService | repo | stellasvenue/baseService (from Sep 26 scan / name match; config unreadable) | OK, pushed 2025-02-12 | HEAD-DATALESS | config HEAD packs(1) loose(3330) refs(3) index | none found (br 1, readable 0, on GitHub 0) | 6 | 44M / 6.0M / 37M | ? | fresh clone + overlay working tree |
| 24 | guardianowldigital | repo | https://github.com/OwlThat/guardianowldigital.git | OK, pushed 2026-09-28 | HEAD-DATALESS | HEAD loose(40) refs(1) | none found (br 1, readable 1, on GitHub 1) | 138 | 34M / 644K / 0M | 2026-05-13 | fresh clone + overlay working tree |
| 25 | healthy-habits-guide | repo | git@github.com:veryhealth/healthy-habits-guide.git | OK, pushed 2026-03-20 | main | packs(1) refs(3) index | none found (br 1, readable 0, on GitHub 0) | 51 | 1.0M / 272K / 0M | 2026-02-14 | fresh clone + overlay working tree |
| 26 | hogshead | repo | https://github.com/OwlThat/hogshead.git / upstream https://github.com/OwlThat/core.git | OK ARCHIVED, pushed 2024-05-22 | HEAD-DATALESS | HEAD packs(2) loose(4) refs(3) index | none found (br 1, readable 0, on GitHub 0) | 70 | 226M / 919K / 223M | 2024-05-22 | clone (archived remote) or skip |
| 27 | intellecta-ops | repo | jwatkins0101/intellecta-ops (from Sep 26 scan / name match; config unreadable) | OK, pushed 2025-11-19 | HEAD-DATALESS | config HEAD packs(1) loose(12) refs(1) | none found (br 1, readable 1, on GitHub 1) | 91 | 1.6M / 433K / 0M | 2025-11-19 | fresh clone + overlay working tree |
| 28 | kindred | repo | CONFIG-DATALESS | - | HEAD-DATALESS | config HEAD | UNVERIFIED | 98 | 833M /  35K / 818M | ? | rsync working tree (repo has 0 commits) |
| 29 | larry | repo | jwatkins0101/site-to-quote (from Sep 26 scan / name match; config unreadable) | OK, pushed 2026-03-27 | HEAD-DATALESS | config HEAD packs(2) loose(54) refs(3) | none found (br 1, readable 0, on GitHub 0) | 101 | 29M / 9.6M / 0M | 2026-03-27 | fresh clone + overlay working tree |
| 30 | leadership-connect-spark | repo | jwatkins0101/leadership-connect-spark (from Sep 26 scan / name match; config unreadable) | OK, pushed 2025-09-04 | HEAD-DATALESS | config HEAD packs(2) loose(71) refs(3) | none found (br 1, readable 0, on GitHub 0) | 119 | 5.9M / 1.0M / 0M | 2025-09-03 | fresh clone + overlay working tree |
| 31 | levyeps | repo | jwatkins0101/levyeps (from Sep 26 scan / name match; config unreadable) | OK, pushed 2024-09-24 | HEAD-DATALESS | config HEAD packs(1) loose(11) refs(3) index | none found (br 1, readable 0, on GitHub 0) | 13 | 21M /  10M / 0M | 2024-09-24 | fresh clone + overlay working tree |
| 32 | Life/fanstyfootball | repo | CONFIG-DATALESS | - | HEAD-DATALESS | config HEAD loose(42) | UNVERIFIED | 12 | 198K / 144K / 0M | ? | rsync copy |
| 33 | mychart | repo | CONFIG-DATALESS | - | HEAD-DATALESS | config HEAD | UNVERIFIED | 4 | 814K /  35K / 0M | ? | rsync working tree (repo has 0 commits) |
| 34 | Neighborhood360 | repo | jwatkins0101/Neighborhood360 (from Sep 26 scan / name match; config unreadable) | OK, pushed 2025-07-10 | main | config packs(3) loose(282) refs(2) | none found (br 1, readable 0, on GitHub 0) | 183 | 422M / 100M / 256M | 2025-07-10 | fresh clone + overlay working tree |
| 35 | nicole-s-intake-connect | repo | git@github.com:veryhealth/nicole-s-intake-connect.git | OK, pushed 2026-01-30 | HEAD-DATALESS | HEAD packs(1) refs(2) index | none found (br 1, readable 0, on GitHub 0) | 58 | 39M /  19M / 0M | 2026-01-28 | fresh clone + overlay working tree |
| 36 | owlthat-hq/.github | repo | git@github.com:OwlThat/.github.git | OK, pushed 2026-07-11, EMPTY | HEAD-DATALESS | HEAD loose(4) refs(1) index | none found (br 1, readable 1, on GitHub 1) | 0 | 49K /  47K / 0M | ? | fresh clone + overlay working tree |
| 37 | owlthat-hq/.worktrees/cortex-forest-palette | wt | worktree of owlthat-hq/cortex (inferred from name; .git file evicted) | - | ? | none | see parent | 2788 | 124M / - / 0M | ? | recreate as worktree/branch from new clone; rsync uncommitted files |
| 38 | owlthat-hq/core | repo | git@github.com:OwlThat/core.git | OK, pushed 2026-09-29 | HEAD-DATALESS | HEAD packs(2) loose(2160) refs(25) | none found (br 33, readable 13, on GitHub 12) | 559 | 425M /  11M / 289M | ? | fresh clone + overlay working tree |
| 39 | owlthat-hq/core-dropbox-sharing | wt | worktree of owlthat-hq/core | - | 1706b9aa3185b1c9929c0756d045d84abf141a2d | packs(2) loose(2160) refs(25) | see parent | 0 | 87M / - / 55M | ? | recreate as worktree/branch from new clone; rsync uncommitted files |
| 40 | owlthat-hq/core-keylessA | wt | worktree of owlthat-hq/core | - | HEAD-DATALESS | commondir HEAD | see parent | 117 | 2.5M / - / 0M | ? | recreate as worktree/branch from new clone; rsync uncommitted files |
| 41 | owlthat-hq/core-loop4 | wt | worktree of owlthat-hq/core | - | HEAD-DATALESS | HEAD packs(2) loose(2160) refs(25) index | see parent | 111 | 1.8M / - / 0M | ? | recreate as worktree/branch from new clone; rsync uncommitted files |
| 42 | owlthat-hq/core-mailgun-ralph | wt | worktree of owlthat-hq/core (inferred from name; .git file evicted) | - | ? | none | see parent | 227 | 31M / - / 0M | ? | recreate as worktree/branch from new clone; rsync uncommitted files |
| 43 | owlthat-hq/core-pages-health | wt | worktree of owlthat-hq/core (inferred from name; .git file evicted) | - | ? | none | see parent | 231 | 30M / - / 0M | ? | recreate as worktree/branch from new clone; rsync uncommitted files |
| 44 | owlthat-hq/core-s04a | wt | worktree of owlthat-hq/core (inferred from name; .git file evicted) | - | ? | none | see parent | 121 | 2.6M / - / 0M | ? | recreate as worktree/branch from new clone; rsync uncommitted files |
| 45 | owlthat-hq/cortex | repo | git@github.com:OwlThat/cortex.git | OK, pushed 2026-09-30 | main | packs(5) loose(882) refs(5) | 4 branches: gatefix/ads-connectors-v2, gatefix/agent-import, gatefix/meta-messaging, gatefix/scan-truth-final (commits absent on GitHub) | 21683 | 4.8G /  75M / 3238M | ? | fresh clone + overlay working tree |
| 46 | owlthat-hq/cortex-auctic-pilot12 | wt | worktree of owlthat-hq/cortex | - | feature/guardian-auctic-pilot12 | packs(5) loose(882) refs(5) | see parent | 0 | 1.0G / - / 916M | ? | recreate as worktree/branch from new clone; rsync uncommitted files |
| 47 | owlthat-hq/cortex-auctic-workflow | wt | worktree of owlthat-hq/cortex | - | feature/guardian-auctic-auction-workflow | packs(5) loose(882) refs(5) | see parent | 0 | 1.0G / - / 915M | ? | recreate as worktree/branch from new clone; rsync uncommitted files |
| 48 | owlthat-hq/cortex-ccfg-fix | wt | worktree of owlthat-hq/cortex | - | fix/client-config-multiline-redact | packs(5) loose(882) refs(5) | see parent | 0 | 1.0G / - / 916M | ? | recreate as worktree/branch from new clone; rsync uncommitted files |
| 49 | owlthat-hq/cortex-dropbox-links | wt | worktree of owlthat-hq/cortex | - | feature/dropbox-shared-links | packs(5) loose(882) refs(5) | see parent | 0 | 1.0G / - / 915M | ? | recreate as worktree/branch from new clone; rsync uncommitted files |
| 50 | owlthat-hq/cortex-dsl-s04 | wt | worktree of owlthat-hq/cortex | - | merge/dropbox-shared-links-main | packs(5) loose(882) refs(5) | see parent | 0 | 1.0G / - / 916M | ? | recreate as worktree/branch from new clone; rsync uncommitted files |
| 51 | owlthat-hq/cortex-gatefix-ads | wt | worktree of owlthat-hq/cortex (inferred from name; .git file evicted) | - | ? | none | see parent | 1750 | 42M / - / 0M | ? | recreate as worktree/branch from new clone; rsync uncommitted files |
| 52 | owlthat-hq/cortex-gatefix-browserop | wt | worktree of owlthat-hq/cortex | - | gatefix/delegated-browser-operator | packs(5) loose(882) refs(5) index | see parent | 1837 | 42M / - / 0M | ? | recreate as worktree/branch from new clone; rsync uncommitted files |
| 53 | owlthat-hq/cortex-gatefix-import | wt | worktree of owlthat-hq/cortex | - | HEAD-DATALESS | HEAD packs(5) loose(882) refs(5) index | see parent | 1877 | 42M / - / 0M | ? | recreate as worktree/branch from new clone; rsync uncommitted files |
| 54 | owlthat-hq/cortex-gatefix-meta | wt | worktree of owlthat-hq/cortex (inferred from name; .git file evicted) | - | ? | none | see parent | 1804 | 42M / - / 0M | ? | recreate as worktree/branch from new clone; rsync uncommitted files |
| 55 | owlthat-hq/cortex-gatefix-scantruth | wt | worktree of owlthat-hq/cortex (inferred from name; .git file evicted) | - | ? | none | see parent | 1838 | 42M / - / 0M | ? | recreate as worktree/branch from new clone; rsync uncommitted files |
| 56 | owlthat-hq/cortex-mailgun-ralph | wt | worktree of owlthat-hq/cortex (inferred from name; .git file evicted) | - | ? | none | see parent | 1949 | 44M / - / 0M | ? | recreate as worktree/branch from new clone; rsync uncommitted files |
| 57 | owlthat-hq/cortex-mpml-s06 | wt | worktree of owlthat-hq/cortex (inferred from name; .git file evicted) | - | ? | none | see parent | 1791 | 41M / - / 0M | ? | recreate as worktree/branch from new clone; rsync uncommitted files |
| 58 | owlthat-hq/cortex-mpml-s08 | wt | worktree of owlthat-hq/cortex (inferred from name; .git file evicted) | - | ? | none | see parent | 1789 | 42M / - / 0M | ? | recreate as worktree/branch from new clone; rsync uncommitted files |
| 59 | owlthat-hq/cortex-mpml-s09 | wt | worktree of owlthat-hq/cortex (inferred from name; .git file evicted) | - | ? | none | see parent | 1803 | 42M / - / 0M | ? | recreate as worktree/branch from new clone; rsync uncommitted files |
| 60 | owlthat-hq/cortex-pages-fix | wt | worktree of owlthat-hq/cortex | - | HEAD-DATALESS | HEAD packs(5) loose(882) refs(5) index | see parent | 2878 | 151M / - / 0M | ? | recreate as worktree/branch from new clone; rsync uncommitted files |
| 61 | owlthat-hq/cortex-pages-ralph | wt | worktree of owlthat-hq/cortex (inferred from name; .git file evicted) | - | ? | none | see parent | 2122 | 47M / - / 0M | ? | recreate as worktree/branch from new clone; rsync uncommitted files |
| 62 | owlthat-hq/cortex-release3 | wt | worktree of owlthat-hq/cortex (inferred from name; .git file evicted) | - | ? | none | see parent | 2716 | 122M / - / 0M | ? | recreate as worktree/branch from new clone; rsync uncommitted files |
| 63 | owlthat-hq/docs | repo | OwlThat/docs (from Sep 26 scan / name match; config unreadable) | - | HEAD-DATALESS | config HEAD loose(382) refs(1) | none found (br 3, readable 3, on GitHub 2) | 117 | 37M /  20M / 0M | ? | fresh clone + overlay working tree |
| 64 | owlthat-hq/mobile | repo | OwlThat/mobile (from Sep 26 scan / name match; config unreadable) | - | HEAD-DATALESS | config HEAD loose(437) refs(11) | none found (br 12, readable 4, on GitHub 3) | 5107 | 721M / 2.9M / 0M | ? | fresh clone + overlay working tree |
| 65 | owlthat-hq/sensei-console | repo | OwlThat/sensei-console (from Sep 26 scan / name match; config unreadable) | - | main | config loose(63) refs(2) | none found (br 1, readable 0, on GitHub 0) | 41 | 284M / 381K / 282M | ? | fresh clone + overlay working tree |
| 66 | owlthat-hq/website | repo | OwlThat/owlthat-website (from Sep 26 scan / name match; config unreadable) | - | HEAD-DATALESS | config HEAD packs(1) loose(2934) refs(5) | none found (br 4, readable 2, on GitHub 1) | 4528 | 1.8G / 135M / 1043M | ? | fresh clone + overlay working tree |
| 67 | paytons-place-week1-reel | repo | NONE (local-only) | - | main | none | UNVERIFIED | 775 | 985M /  35K / 647M | ? | rsync working tree (repo has 0 commits) |
| 68 | prompt-keeper | repo | https://github.com/Smart-Calltime-Solutions-LLC/prompt-keeper.git | NOT FOUND (no access) | HEAD-DATALESS | HEAD packs(2) refs(2) index | UNVERIFIED | 87 | 1.1M / 320K / 0M | 2026-03-04 | RSYNC COPY (remote unreachable) after hydration |
| 69 | reelectmccraney | repo | jwatkins0101/reelectmccraney (from Sep 26 scan / name match; config unreadable) | OK, pushed 2026-06-29 | main | config loose(207) refs(8) | none found (br 1, readable 0, on GitHub 0) | 61 | 73M /  47M / 0M | 2026-06-28 | fresh clone + overlay working tree |
| 70 | referral-hub | repo | git@github.com:veryhealth/referral-hub.git (Sep 26 scan) | - | HEAD-DATALESS | config HEAD packs(2) refs(1) | UNVERIFIED | 101 | 1.9M / 738K / 0M | 2026-01-09 | rsync copy |
| 71 | review  | repo | CONFIG-DATALESS | - | main | config packs(1) refs(1) index | UNVERIFIED | 66 | 1.1M / 305K / 0M | ? | rsync copy |
| 72 | Sensei | repo | jwatkins0101/Sensei (from Sep 26 scan / name match; config unreadable) | OK, pushed 2026-02-16 | HEAD-DATALESS | config HEAD packs(1) loose(1055) refs(5) index | none found (br 2, readable 1, on GitHub 0) | 1135 | 203M /  49M / 0M | 2026-02-16 | fresh clone + overlay working tree |
| 73 | smart-calltime-solutions-v2 | repo | https://github.com/Smart-Calltime-Solutions-LLC/smart-calltime-solutions-v2.git (Sep 26 scan) | NOT FOUND (no access) | HEAD-DATALESS | config HEAD packs(3) loose(68) refs(6) index | UNVERIFIED | 294 | 131M /  65M / 0M | 2026-03-24 | RSYNC COPY (remote unreachable) after hydration |
| 74 | SmartCalltimeMonorepo | repo | git@github.com:Smart-Calltime-Solutions-LLC/SmartCalltimeMonorepo.git (Sep 26 scan) | NOT FOUND (no access) | HEAD-DATALESS | config HEAD packs(15) loose(3552) refs(50) index | UNVERIFIED | 105207 | 4.9G /  55M / 1996M | 2026-09-23 | RSYNC COPY (remote unreachable) after hydration |
| 75 | SmartCalltimeMonorepo-S09 | wt | worktree of SmartCalltimeMonorepo (inferred from name; .git file evicted) | - | ? | none | see parent | 1433 | 20M / - / 0M | 2026-04-16 | recreate as worktree/branch from new clone; rsync uncommitted files |
| 76 | SmartCalltimeMonorepo-sentry | wt | worktree of SmartCalltimeMonorepo (inferred from name; .git file evicted) | - | ? | none | see parent | 1960 | 22M / - / 0M | 2026-05-09 | recreate as worktree/branch from new clone; rsync uncommitted files |
| 77 | smartwebsite | repo | git@github.com:Smart-Calltime-Solutions-LLC/smart-calltime-solutions-website.git (Sep 26 scan) | NOT FOUND (no access) | main | config packs(2) loose(48) refs(4) index | UNVERIFIED | 70 | 2.4M / 779K / 0M | 2026-04-30 | RSYNC COPY (remote unreachable) after hydration |
| 78 | softwareharness | repo | git@github.com:jwatkins0101/softwareharness.git | OK, pushed 2026-09-23 | main | loose(89) refs(2) index | none found (br 2, readable 1, on GitHub 1) | 34 | 829K / 387K / 0M | 2026-09-23 | fresh clone + overlay working tree |
| 79 | song | repo | CONFIG-DATALESS | - | main | config loose(13) | UNVERIFIED | 172 | 261M /  54K / 0M | 2026-01-28 | rsync copy |
| 80 | speech-assistant-openai-realtime-api-node | repo | https://github.com/twilio-samples/speech-assistant-openai-realtime-api-node.git | OK, pushed 2025-09-02 | HEAD-DATALESS | HEAD packs(2) loose(7) refs(4) index | none found (br 1, readable 0, on GitHub 0) | 6 | 174K / 109K / 0M | 2025-01-15 | fresh clone + overlay working tree |
| 81 | stella-venues-reveal | repo | https://github.com/jwatkins0101/stella-venues-reveal.git | OK, pushed 2026-08-05 | main | packs(1) loose(199) refs(2) index | none found (br 1, readable 0, on GitHub 0) | 170 | 129M /  38M / 0M | 2026-08-05 | fresh clone + overlay working tree |
| 82 | threadline-vision | repo | https://github.com/jwatkins0101/threadline-vision.git | OK, pushed 2025-10-03 | main | refs(1) index | none found (br 1, readable 1, on GitHub 1) | 55 | 1.7M / 607K / 0M | 2025-10-03 | fresh clone + overlay working tree |
| 83 | ulcore | repo | git@github.com:OwlthatUofL/core-app.git / upstream git@github.com:OwlThat/core-app.git | OK, pushed 2026-04-09 | HEAD-DATALESS | HEAD packs(14) loose(710) refs(59) index | none found (br 1, readable 1, on GitHub 1) | 1995 | 599M / 118M / 29M | 2026-04-09 | fresh clone + overlay working tree |
| 84 | veryapp | repo | veryhealth/very-path-forward (from Sep 26 scan / name match; config unreadable) | OK, pushed 2026-09-23 | HEAD-DATALESS | config HEAD packs(1) loose(359) refs(17) index | none found (br 2, readable 0, on GitHub 0) | 768 | 501M /  15M / 0M | 2026-08-05 | fresh clone + overlay working tree |
| 85 | veryweb | repo | veryhealth/very-health-hub (from Sep 26 scan / name match; config unreadable) | OK, pushed 2026-09-30 | HEAD-DATALESS | config HEAD packs(12) loose(719) refs(24) | none found (br 1, readable 1, on GitHub 1) | 255 | 691M / 112M / 246M | 2026-09-24 | fresh clone + overlay working tree |
| 86 | virtual-wellness-hub | repo | veryhealth/virtual-wellness-hub (from Sep 26 scan / name match; config unreadable) | OK, pushed 2026-03-20 | HEAD-DATALESS | config HEAD packs(1) refs(3) index | none found (br 1, readable 0, on GitHub 0) | 61 | 1.7M / 634K / 0M | 2026-01-22 | fresh clone + overlay working tree |
| 87 | voice | repo | stellasvenue/voice (from Sep 26 scan / name match; config unreadable) | OK, pushed 2025-10-29 | HEAD-DATALESS | config HEAD packs(2) loose(3451) refs(3) index | none found (br 1, readable 0, on GitHub 0) | 10 | 8.3M / 8.1M / 0M | 2025-10-29 | fresh clone + overlay working tree |
| 88 | wethejuryroom | repo | git@github.com:jwatkins0101/wethejuryroom.git | OK, pushed 2026-09-23 | HEAD-DATALESS | HEAD packs(1) loose(1303) refs(11) index | none found (br 11, readable 6, on GitHub 6) | 783 | 1.4G / 180M / 43M | 2026-09-23 | fresh clone + overlay working tree |
| 89 | when-the-ville-stood-still | repo | CONFIG-DATALESS | - | HEAD-DATALESS | config HEAD loose(82) | UNVERIFIED | 64 | 412M / 262K / 352M | 2026-07-30 | rsync copy |
| 90 | wiki | repo | CONFIG-DATALESS | - | main | config | UNVERIFIED | 14 | 340K /  35K / 0M | ? | rsync working tree (repo has 0 commits) |
| 91 | wright-paint-showcase | repo | jwatkins0101/wright-paint-showcase (from Sep 26 scan / name match; config unreadable) | OK, pushed 2026-05-16 | HEAD-DATALESS | config HEAD packs(1) loose(7) refs(3) | none found (br 1, readable 0, on GitHub 0) | 159 | 166M / 1.2M / 0M | 2026-05-16 | fresh clone + overlay working tree |

### SmartCalltimeMonorepo/.claude/worktrees (60 agent worktrees; one line)
- 41 have a dataless `.git` pointer file.
- 15 have a readable pointer but a dataless HEAD.
- 4 have a readable HEAD: `fix/54-sentry-feedback-cleanup-F09`, `-F24`, `-F34`, `feature/60-s13c-integration-test`.
- Each is 11–20 MB with no node_modules.
- The remote can't be reached, so these can only be saved by copying. **Recommendation: don't move them.** Keep them inside the `.old-icloud` copy unless you name ones you want.

### Non-git folders (not in scope unless you say so)
| Folder | Size | Folder | Size |
|---|---|---|---|
| Life (family data and media; lightning-highlights reads from it) | 5.4G | forte3d | 153M |
| AIDiligenceforPrivateEquity | 92M | schdule | 35M |
| ai-chief-of-staff-report | 24M | stateclaim | 14M |
| stellascorp | 9.9M | law | 6.4M |
| oil | 1.0M | xxx | 435K |
| ge | 417K | ai-teacher-channel | 126K |
| unless | 122K | test | 113K |
| cassidy | 112K | iphone-ctl | 69K |
| reviewer | 20K | rscs-demo-files | 31K |
| goodbounce | 15K | ferpa-demo | 4.5K |
| gem | 2.5K | skills | 2.0K |
| testge / worktrees (ios-app-conversion stub) | ~1K | owlthat-hq/marketing | 44K |

The owlthat-hq container folder itself is **not a git repo**. It holds `CLAUDE.md`, `README.md` and `.claude/` (skills including seo-growth-loop and marketing skills, 336K). These files are not under version control, and CLAUDE.md and README.md are currently dataless. Loose files in the Sites root (.md, .zip, .png, package.json) are also out of scope.

## 4. Things that point at the old paths and would break after a move

| Dependency | What points at Sites | Action after the move |
|---|---|---|
| **Docker compose project `cortex`** (10 containers running; cortex-worker-1 is in a **restart loop**) | Bind mounts from `~/Documents/Sites/owlthat-hq/cortex/{backups,certbot/conf,certbot/www,ops,ops/egress-proxy/squid.conf,custom-scripts,nginx}`. Postgres and Redis use named volumes `cortex_postgres-data` and `cortex_redis-data`, which do not depend on the path. | Needs your OK to stop and start. Run `docker compose down` in the old dir, then `docker compose up -d` from `~/Code/owlthat-hq/cortex`. Keep the folder name `cortex` so the project name stays `cortex` and the named volumes reattach. Copy `backups/` and `certbot/conf` (ignored by git, so a fresh clone won't have them) **before** bringing it up. |
| Long-running processes with their working dir in Sites | `vite --port 5310` (AIAgents/console, 9 days), `vite preview --port 4173` (owlthat-hq/website, 13 days), `python -m http.server 8769` serving `Sites/guardianowldigital/deliverables/ux-audit-2026-09-19` (11 days), node mailgun fixture (owlthat-hq/cortex-mailgun-ralph, 18 days), `log stream` (owlthat-hq/mobile), dns-sd (Life/tv-remote) | Restart them from the new paths, or leave them running against the `.old-icloud` copies until you're done with them. |
| `~/.zshrc` line 46 | `cd ~/Documents/Sites` | Change to `cd ~/Code` |
| `~/.claude/settings.json` line 7 | `Edit(/Users/jermainewatkins/Documents/Sites/**)` | Add `Edit(/Users/jermainewatkins/Code/**)` (or replace) |
| `~/Code/assistance/cos/hooks/agent-path-guard.sh` lines 20 and 28 | Allows and blocks the two Sites paths. Its hash is pinned in `cos/gates.json` lines 818 and 832. | Add `~/Code/*` project paths, then re-pin the hash in gates.json. This file is protected by gates, so the change is a builder task. |
| `~/Code/assistance/cos/projects/scan-projects.mjs` lines 17–18 | `SITES_SHORT` and `SITES_LONG` roots | Point the roots at `~/Code`, then re-run `refresh.sh`, which rewrites INDEX.md (9 refs), inventory.json (272), overrides.json (9) and 16 cards |
| `~/Code/assistance/prompts/gmail-triage.md` line 169 | `~/Documents/Sites/Life/school/README.md` | Only needs a change if Life moves (Life is not a repo, so it stays by default) |
| `~/Code/lightning-highlights/scripts/analyze-clips.mjs` lines 17–18 and `make-index.mjs` line 8 | Default paths under `Sites/Life/family/football/...` | Only needs a change if Life moves |
| `~/Code/assistance/tests/gates/cos-agent.ts` lines 74 and 93–95 | Test fixtures that use `~/Documents/Sites/...` | Update together with the path-guard change |
| `SmartCalltimeMonorepo/.claude/settings.local.json` (10 abs refs) and `law/.claude/settings.local.json` (1) | Absolute Sites paths | Rewrite after copying |
| 16 other CLAUDE.md / settings.local.json files | **Could not be read (dataless)**: owlthat-hq, Sensei, veryapp, AIAgents, core-app, Life, … | Grep again after the files are downloaded |
| Claude Code memory dirs (`~/.claude/projects/<path-key>`) | These have memory: `-Documents-Sites-owlthat-hq` (114 files, 58 sessions), `-Documents-Sites` (33), `-Documents-Sites-AIAgents` (30), `-owlthat-hq-core` (17), `-Documents-Sites-owlthat` (17), `-veryapp` (10), `-SmartCalltimeMonorepo` (7), `-bouvier-bridge` (7), `-xxx` (6), `-guardianowldigital` (6), `-smart-calltime-solutions-v2` (5), `-wethejuryroom` (4), `-Documents-Documents---…-Sites` (6), plus smaller ones (Life, larry, very-health-hub, veryweb, wiki, core-app, very, stateclaim, Sensei). 41 dirs in total. | Copy (don't move) `memory/` into the new key dirs, e.g. `-Users-jermainewatkins-Code-owlthat-hq`, `-Users-jermainewatkins-Code-owlthat-hq-core`, and so on. Merge the two keys for the same folder (the short and long Sites paths). |
| Git worktree back-pointers | cortex `.git/worktrees/deploy-21349adf` and `deploy-3ee5aab0` point at a session scratchpad under `/private/tmp/...`. Core and cortex worktree admin dirs point at both the short and long Sites paths. | These disappear with the old repo. Recreate only the worktrees you still need, from the new clone. |
| `~/Code/wt/*` | These are all **independent clones** (core, cortex-auctic-v4, cortex-playbooks, cortex-records-*, veryweb-186) or worktrees of them. **None point into iCloud.** | No action |
| launchd (`~/Library/LaunchAgents`, 19 plists), crontab, VS Code `.code-workspace`, `~/.local/share/softwareharness` releases | **No references found** (there is no crontab; no workspace files) | No action |
| `.claude/harness` pins inside repos | Could not grep (dataless) | Check after the files are downloaded; they are relative to the repo, so they probably move with it |

## 5. Target layout (no name clashes)

`~/Code` today has: assistance, deal-watch, jermainewatkins.com, lightning-highlights, wt, youtube-knowledge.

Proposed:
- `~/Code/owlthat-hq/{core,cortex,website,mobile,docs,sensei-console,.github}`, plus the container files (CLAUDE.md, README.md, `.claude/`) copied in.
- `~/Code/<name>` for every other repo, using the same name: AIAgents, veryweb, veryapp, wethejuryroom, Sensei, SmartCalltimeMonorepo, ulcore, bouvier-bridge, guardianowldigital, softwareharness, and so on.
- Rename `review ` (trailing space) to `~/Code/review`.
- `core` (stellasvenue/core) and `gb-platform` both point at stellasvenue/core. Clone once as `~/Code/core`, keep `gb-platform` in old-icloud, or tell me you want both.
- Leave out the throwaway worktrees (`owlthat-hq/core-*`, `cortex-*`, `.process-fixes-*`, `SmartCalltimeMonorepo-S09/-sentry`, agent worktrees). Recreate a worktree only where it holds unpushed work, under `~/Code/wt/<name>` (which is already your convention).
- **No clashes.** `~/Code/wt/core` is a separate OwlThat/core clone, and a different path from `~/Code/owlthat-hq/core`.

## 6. Method per repo type

**Step 0: free disk and get iCloud downloading again. Needs your OK; nothing else is safe until this is done.**
- Free at least 30–40 GB. The biggest safe-looking lever is `docker volume prune` (71 GB reclaimable, 1,331 volumes not attached to any container) and `docker image prune` (12.5 GB). I have **not** run either. You would need to confirm that no volume you care about is detached. `cortex_postgres-data` is attached, so prune would keep it.
- Then check that iCloud is downloading: `brctl status`, and try reading one dataless file with a timeout.
- Optional: in Finder, right-click Sites → "Keep Downloaded" (macOS 15+) so the files stop being emptied while we copy.

**Type A: GitHub remote reachable (41 repos). Fresh clone plus overlay.**
1. `git clone <remote> ~/Code/<path>`. This does not depend on iCloud at all.
2. Unpushed commits: push or bundle each confirmed-unpushed branch **from the old repo after it has been downloaded** (`git bundle create /tmp/x.bundle <branch>`). Then fetch the bundle into the new clone. The known case is cortex's 4 gatefix branches. After the download, run `git log --branches --not --remotes` again in every old repo, because many branch pointers could not be read today.
3. Uncommitted work: check out the old HEAD branch in the new clone, then `rsync -a --exclude .git --exclude node_modules --exclude .next --exclude dist <old>/ <new>/`, then `git status` in the new clone. The diff is the uncommitted work. Commit it to a `wip/icloud-rescue` branch, or leave it uncommitted.
4. Ignored files git won't carry over: `.env*`, `backups/`, `certbot/`, local DBs. For each repo, rsync the files matched by `git status --ignored`, excluding node_modules and build output.
5. Reinstall dependencies only for repos you actively use (the 18.7 GB of node_modules is not copied).

**Type B: remote unreachable or empty (Smart-Calltime ×4, abrl.org, kindred, mychart, wiki, paytons-place-week1-reel, song, when-the-ville-stood-still, Life/fanstyfootball).**
- These need iCloud to download their files first.
- Then run `rsync -a --exclude node_modules` **including `.git`** into `~/Code/<name>`, and run `git fsck --full` on the copy.
- For SmartCalltimeMonorepo: also ask whether you want to get org access back, or push to a repo you own. Until then, the iCloud copy is the only copy.

**Type C: worktrees.** Don't move them. For each one whose HEAD branch is not on GitHub, or that has uncommitted work (check this after the download), recreate it in the new clone as `git worktree add ~/Code/wt/<name> <branch>` and rsync its files over it.

**Type D: archived remotes** (core-app, adaptive-agent-system, facebookai, hogshead). Clone them only if you still want them locally. Otherwise leave them in old-icloud.

**Keeping the old copies:** after each repo is verified in `~/Code`, rename the old folder in place to `<name>.old-icloud`, for example `Sites/owlthat-hq/cortex.old-icloud`. **Nothing gets deleted until you OK it.** Leave the `~/Documents/Sites` symlink until everything is done, then point it at `~/Code` or remove it (your call).

## 7. Order
1. Step 0: free disk, confirm iCloud is downloading again (needs your OK).
2. **owlthat-hq/cortex**: clone, bundle the 4 gatefix branches, overlay the working tree, copy `backups/` and `certbot/`, then move the Docker stack (needs your OK to stop and start it). Then owlthat-hq/core, website, mobile, docs, sensei-console, .github, and the container files.
3. The other active repos: veryweb, veryapp, wethejuryroom, AIAgents, softwareharness, guardianowldigital, reelectmccraney, stella-venues-reveal, bouvier-bridge, ulcore, Sensei.
4. Type B copies (SmartCalltimeMonorepo first), each after its files have been downloaded.
5. The remaining older repos with a GitHub remote (clone, or skip if archived).
6. Path updates (§4), Claude memory copies, cos `refresh.sh`.
7. Rename the old copies to `.old-icloud`. You review, and delete only on your OK.

## 8. Disk space
- Free now: **15 GB** (97% used).
- Needed for fresh clones: about **1.4 GB** (GitHub reports 1,379,259 KB across the 45 slugs, before dedup).
- Working-tree overlay and ignored files: est. 1–3 GB. The "source-only" size of the repos is 19.7 GB apparent, but most of that is build output and media that we would not carry over.
- Type B copies with `.git`: about 3–4 GB (SmartCalltimeMonorepo is 4.9 GB apparent, including 2 GB of node_modules we would skip).
- Reinstalling node_modules for about 10 active repos: est. 5–8 GB.
- **Total: about 10–15 GB, which is all of the free space.** Moving within the same APFS volume does not free anything until you delete the old copies. Hence Step 0.

## 9. Couldn't verify (said plainly)
- Uncommitted changes, stash counts, fsck and last commit date for every repo. Git state files are dataless and iCloud is not downloading them.
- The unpushed state of branch pointers that are dataless (e.g. owlthat-hq/core: 20 of 33; mobile: 8 of 12; SmartCalltimeMonorepo: all of them).
- Remotes for repos whose config is dataless and that were not in the Sep 26 scan: Life/fanstyfootball, owlthat-hq/docs/mobile/sensei-console/website. For these I matched the GitHub slug by name, and for website, docs and mobile I confirmed it by finding a local commit on GitHub.
- The contents of 16 CLAUDE.md and settings files (dataless).

## Decisions (Jermaine, 2026-09-30)
- Step 0 approved: remove unused Docker volumes + images + build cache (#198).
- Smart-Calltime repos: back up to PRIVATE repos under github.com/jwatkins0101 (#199).
- core vs gb-platform (same GitHub repo stellasvenue/core): keep only `core`; gb-platform not re-cloned (old copy kept as .old-icloud until OK).
