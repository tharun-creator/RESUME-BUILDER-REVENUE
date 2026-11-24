# STATUS: ATS Resume Score Checker

*Manager-owned. Updated: 2026-11-24.*

## Done

- `docs/PRD.md`, `docs/AGENTS.md`, `docs/PLAN.md` created and committed.
- Root scaffold: `package.json` (workspaces), `tsconfig.base.json`, eslint/prettier, `.gitignore`, `.env.example`, `README.md`.
- Security baseline: `docs/SECURITY.md` (threat model + pre-launch checklist).
- Draft contracts: `docs/API.md`, `docs/DB.md` (from wave-1 scribe output; manager review pending).
- Infra: `docker-compose.yml` (Postgres/Redis/MinIO), Dockerfiles for web/api/worker, CI workflow.
- MVP code skeleton (manager takeover after wave-1 subagents hit provider free-usage limit):
  - `packages/shared`: zod schemas/types, PRD §5 plan seed.
  - `apps/api`: Express API (health, plans, OTP auth dev-fallback, upload, scan create/poll/report, dashboard, checkout, payment verify HMAC, webhook stub), in-memory store, rule-based scoring engine, PDF/DOCX extraction.
  - `apps/worker`: placeholder (MVP processing runs in-process in API; BullMQ move is Phase 2).
  - `apps/web`: Next.js+Tailwind app (landing, pricing from API, auth OTP, upload+poll, report, dashboard, dev checkout verify), one accent color, responsive layout.

## In progress

- Manager review of API/DB draft contracts for PRD alignment.
- Wiring/verification: `npm install`, lint/typecheck/test/build (not run in this session; deps not installed).
- E2E manual smoke run with local env.

## Blocked / needs input

- Live keys for full flow: `RAZORPAY_*`, `CLAUDE_API_KEY`, `RESEND_API_KEY`, Google OAuth. Dev fallbacks exist for OTP and dev checkout; Razorpay/Claude need keys or explicit mocks for live integration.
- AI model tiers and retention default still open (PRD §17.2/§17.3) — recorded in PLAN.

## Known issues

1. Wave-1 background subagents (T-M1/T-S1/T-U1/T-R1) all failed with "Free usage limit reached" — manager took over and completed deliverables directly. Quality review still needed.
2. `perplexity` MCP env key missing (`PERPLEXITY_API_KEY` not set). Not blocking.
3. `bash` maps to WSL with no distro installed on this machine — use Git Bash/PowerShell.
4. `npm install` / lint / typecheck / tests / build not executed here (no dependency install performed). Reported as unverified.
5. API uses in-memory store for MVP; Postgres/Redis/BullMQ wiring is Phase 2 hardening.
6. PDF download button intentionally disabled (Phase 2 per PLAN §6).

## Decisions

- Express for API; Resend for email; prepaid packs v1.
- Dev fallback: OTP logged to API console when `RESEND_API_KEY` missing; dev checkout verify accepted when Razorpay secret is placeholder and `NODE_ENV!=production`.
- Scoring is deterministic rule+heuristic in MVP; Claude integration gated by `CLAUDE_API_KEY` (to be wired in T-B1 hardening).

## Rule violations / rejections

- None recorded. Subagent failures were provider-limit errors, not rule violations.
