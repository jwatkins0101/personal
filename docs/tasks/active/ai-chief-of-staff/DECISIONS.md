# Decisions: ai-chief-of-staff

| ID | Date | Decision | Reason | Supersedes |
|---|---|---|---|---|
| D1 | 2026-09-24 | Build inside `assistance` (repo `jwatkins0101/personal`), not a new repo | Reuse the pipeline, classifier, calendar, people and storage modules | — |
| D2 | 2026-09-24 | Brief delivered as HTML + audio page, with a one-line iMessage to self | Principal's preference for reviewable HTML + audio | Apple Notes briefing |
| D3 | 2026-09-24 | Retire the Apple Notes briefing pipeline and keep its modules | Dormant since 2026-02-25; replaced by the CoS brief | — |
| D4 | 2026-09-24 | Approvals through CLI / Claude Code (`approve N`, `send N`, `skip N`); no iMessage replies in v1 | Avoids an inbound injection channel | — |
| D5 | 2026-09-24 | Move flight check 07:43 → 07:20 | The 07:30 brief needs same-day flight data | — |
| D6 | 2026-09-24 | v1 = Phases 0–3; calendar writer after 2 weeks of clean briefs | Smallest useful increment | — |
| D7 | 2026-09-24 | $5/day cost ceiling for CoS headless calls | Cost control; the brief shows spend | — |
| D8 | 2026-09-24 | No Cortex fleet lane in v1 | Scope | — |
| OD-1 | 2026-09-24 | Gates run locally via `npm run gates`; no CI in v1 | Repo has no CI; local-only personal automation. Revisit if the repo gains a CI workflow | — |
| D9 | 2026-09-24 | Add AC-23 (shared Claude CLI JSON parser) to Phase 1 and ship it as a hotfix ahead of the rest of Phase 1 | The task-capture SMS step was failing live on the CLI's new array output | PRD revision 1 → 2 |
| D10 | 2026-09-24 | Remove the flight-check job and the `flights` lane; flights code stays in the repo | Principal: "You can delete flights" | D5 (flight time change) |
