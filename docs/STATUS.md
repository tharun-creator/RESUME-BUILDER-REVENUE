# STATUS: ATS Resume Score Checker

*Manager-owned. Updated: 2026-11-24.*

## Done

- `docs/PRD.md` — source of truth created (from `PRD ATS Resume Score Checker.md`).
- `docs/AGENTS.md` — agent prompts + compliance rules created (from `Agent Prompts ATS Resume Score Checker.md`).
- `docs/PLAN.md` — milestones, task cards, dependencies, decisions.
- This file.

## In progress (wave 1, 4 agents)

| Task | Agent | Status |
| --- | --- | --- |
| T-M1 `docs/API.md` + `docs/DB.md` | developer (scribe) | in progress |
| T-S1 compose + Dockerfiles + CI + `docs/SECURITY.md` | devops | in progress |
| T-U1 `apps/web` foundation with mocked API | designer | in progress |
| T-R1 root monorepo scaffold | general | in progress |

## Blocked

- Wave 2 (T-B1 backend, T-U2 UI wiring, T-S2 hardening, T-Q1 QA): waiting for T-M1 manager review + T-R1.

## Known issues (from `docs/AGENTS.md` §9)

1. OpenCode plugins failing: `ecc-hooks.ts` and `index.ts` under the opencode plugins folder ("2 plugins failed"). Needs `/plugins` inspection.
2. `perplexity` MCP server failing: `PERPLEXITY_API_KEY` is not set in the environment. Fix: provide the key or disable the server so agents stop retrying it.
3. `bash` maps to WSL with no distro installed → all agents use Git Bash or PowerShell (already in Shared Rules).

## Decisions

- Express (framework), Resend (email), prepaid packs v1 (no subscriptions), MinIO for local S3-compatible storage.
- See `docs/PLAN.md` §4 for open decisions (AI model tiers, retention default, storage provider).

## Rule violations / rejections

- None yet.
