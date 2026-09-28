# softwareharness
_Card for CoS sub-agent briefs. Built 2026-09-26 from the Sources below; hand-maintained, build-index.mjs never overwrites it._

## What it is
Versioned, project-neutral Ralph delivery workflow and supporting agents; canonical procedure is `workflow/RALPH.md` (README.md). Jermaine's private agent system, described as his competitive advantage (SmartCalltimeMonorepo memory/project_ralph_package.md); OwlThat is described as its productized startup (workspace memory user_profile.md).

## Paths
- Project: `/Users/jermainewatkins/Documents/Documents - Jermaine’s MacBook Pro/Sites/softwareharness`
- CLAUDE.md: none (ships `CLAUDE.template.md` for installed projects); README: `<project>/README.md`
- Workflow: `<project>/workflow/RALPH.md`, `PRD-template.md`, `feature-template.json`; agents: `<project>/agents/` (38 .md + archived/); `install.sh`; `scripts/feature-status.py`, `scripts/research.py`; `docs/` (architecture, lean-canvas, fundraising, ICP research)
- Memory: none mapped. Related: `~/.claude/projects/-Users-jermainewatkins-Documents-Sites-SmartCalltimeMonorepo/memory/project_ralph_package.md`, `~/.claude/projects/-Users-jermainewatkins-Documents-Sites/memory/project_team.md`
- Installed releases: `~/.local/share/softwareharness/releases/` (6d9f21ea..., de040bf4...); `~/.claude/agents/*.md` symlink to release 6d9f21ea

## Stack & how to run/test
- Markdown agents + bash installer + Python helpers (README.md)
- Install: `./install.sh /path/to/project [full-commit-sha]` (pins a committed revision into an immutable snapshot) (README.md)
- Tests: `python3 -m unittest discover -s scripts -p 'test_*.py'` (README.md)
- Evidence status: `python3 scripts/feature-status.py <feature-folder> [--write]` (README.md)

## Accounts, services & IDs
- GitHub: `jwatkins0101/softwareharness` (git remote)
- `scripts/research.py` uses existing pplx (Perplexity) authentication (README.md)

## People
- Jermaine Watkins (founder/architect), Dan Murphy (Executive Director, Slingshot Ventures), Sarah Bhatia (Director of AI Product Innovation, Slingshot) listed as core team (workspace memory project_team.md)

## Status
- Last commit: 2026-09-23 7e9744f "Merge pull request #2 from jwatkins0101/fix/process-enforcement-2026-09-23"
- HEAD 7e9744fd is newer than the installed release 6d9f21ea used by `~/.claude/agents` (only merge commit differs; verify)
- Open cos_work items: none

## Gotchas / decisions
- Installed projects are pinned; changing this checkout does not change them. Re-run installer to upgrade (README.md)
- No AI attribution in commits or PRs; do not infer deployment from implementation completion (README.md)
- Evidence path `evidence/<story-id>/<gate>.json`; manual/missing/deferred/skipped-required checks are not passed (workflow/RALPH.md)
- One worktree per feature; never stash, stage, switch branches or clean another session's work (workflow/RALPH.md)
- Older memory describes a symlink install `.claude/agents -> ~/softwareharness/agents`; install.sh now links to pinned release snapshots (SmartCalltimeMonorepo memory/project_ralph_package.md vs install.sh)
- Orchestrator agents cannot dispatch subagents; run dispatch top-level (SmartCalltimeMonorepo memory/feedback_orchestrator_subagent_limit.md)

## Gaps
- No CLAUDE.md or project memory of its own; which projects currently have it installed (SmartCalltimeMonorepo and wethejuryroom confirmed via `.claude/harness`/commits; others unverified)
- Relationship to OwlThat product and business docs in `docs/` (not read)

## Sources
- `<project>/README.md`, `<project>/workflow/RALPH.md` (head), `<project>/CLAUDE.template.md` (head), `<project>/install.sh` (head); `git log`, `git rev-parse HEAD`; `ls ~/.local/share/softwareharness/releases`, `ls -la ~/.claude/agents`
- `~/.claude/projects/-Users-jermainewatkins-Documents-Sites-SmartCalltimeMonorepo/memory/project_ralph_package.md`, feedback_orchestrator_subagent_limit.md
- `~/.claude/projects/-Users-jermainewatkins-Documents-Sites/memory/project_team.md`, user_profile.md (grep)
