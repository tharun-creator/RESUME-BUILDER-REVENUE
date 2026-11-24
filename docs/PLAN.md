# PLAN: ATS Resume Score Checker

*Manager-owned. Source of truth: `docs/PRD.md`. Companion: `docs/AGENTS.md`. Updated: 2026-11-24.*

## 1. Milestones (PRD §15)

| Milestone | Scope | Estimate |
| --- | --- | --- |
| M1 MVP | Auth (email OTP), upload, extraction, rule checks, AI analysis, on-screen report, Free + Starter plans, Razorpay checkout, email OTP login | 3–4 weeks |
| M2 Monetization | Pro + Premium, JD matching, PDF report, email delivery, dashboard, admin panel, rate limiting, webhooks, daily reconciliation | 2–3 weeks |
| M3 Growth | Cover letters, LinkedIn tips, referrals, blog/SEO pages, analytics | 4–6 weeks |
| M4 Global | Merchant of Record, regional pricing, GDPR, country-specific resume rules | after validation |

**Build order (manager constraint):** auth → upload → extraction → rule-based scoring → AI analysis → report UI → payments → plans and credits → email and PDF → admin.

## 2. Agent task cards

Each task: **Goal | Owned files | Acceptance criteria (AC) | Definition of Done (DoD)**.
Agents may only edit files in their Owned list. Changes elsewhere go through the manager.

### Wave 1 (in progress — max 4 concurrent agents)

**T-M1 — Contract docs (Manager's scribe, developer agent)**
- Goal: Draft `docs/API.md` (every endpoint with request/response JSON, error codes, auth rules, 429 + Retry-After per PRD §11) and `docs/DB.md` (schema from PRD §10: users, plans, orders, payments, credits, scans, audit_log — types, indexes, FKs — plus migration plan) so backend and UI build against one contract.
- Owned: `docs/API.md`, `docs/DB.md` (manager-reviewed; no other docs).
- AC: covers PRD §7 endpoints, §9 pipeline states, §10 tables, §11 rate limits; prices/limits read from plans table, never hardcoded; anything not implied by the PRD is marked `[PROPOSAL]`; zod schemas to create in `packages/shared` are listed by name.
- DoD: manager review passed.

**T-S1 — Infra foundation + threat model (Security/DevOps agent)**
- Goal: Local dev infrastructure, CI, and the security threat model.
- Owned: `docker-compose.yml`, `Dockerfile*`, `.github/**`, `infra/**`, `docs/SECURITY.md`.
- AC: compose brings up Postgres + Redis + MinIO; multi-stage, non-root Dockerfiles for web/api/worker; CI runs lint, typecheck, tests, dependency audit, secret scan, build; `docs/SECURITY.md` threat model covers abuse, prompt injection, file upload, payment fraud, data leak with a mitigation each, plus a pre-launch checklist; no secrets anywhere, `.env.example` placeholders only (root `.env.example` is owned by T-R1).
- DoD: `docker compose config` validates; workflow YAML parses; manager review passed.

**T-U1 — Web foundation (UI/UX agent)**
- Goal: `apps/web` foundation: Next.js + Tailwind scaffold, design system, landing/pricing/upload screens against a mocked API layer, so the UI is ready before the backend.
- Owned: `apps/web/**` only.
- AC: landing page (headline, "Check your ATS score free" CTA, 3-step how-it-works, sample report preview, pricing, FAQ, privacy note); one accent color, small reusable component set, accessible (labels, contrast, keyboard), responsive from 360px; pricing fetched from mocked API shaped from PRD §5 — no prices hardcoded in components; upload page with drag-and-drop PDF/DOCX (5 MB max), JD textarea, target role, consent checkbox, analyzing state with step labels, status-polling stub; route stubs for auth, report, dashboard, checkout with empty/loading/error/429 states; **no `npm install` in wave 1** (root scaffold runs concurrently) — verification deferred to wave 2 and reported honestly.
- DoD: manager review passed; typecheck + run evidence added in wave 2.

**T-R1 — Monorepo root scaffold (Manager's hands, general agent)**
- Goal: Root configuration so wave-2 agents can run lint/typecheck/test.
- Owned: root `package.json`, `tsconfig.base.json`, eslint config, prettier config, `.gitignore`, `.env.example`, root `README.md`.
- AC: npm workspaces for `apps/*` and `packages/*`; scripts `lint`, `typecheck`, `test`, `format` (safe no-ops until packages exist); TypeScript strict base config; `.env.example` with placeholders only (DATABASE_URL, REDIS_URL, S3_*, RAZORPAY_*, CLAUDE_API_KEY, RESEND_*, SESSION_SECRET, …); **no `npm install`**, no Docker files, no docs, no feature code.
- DoD: manager review passed.

### Wave 2 (blocked until T-M1 approved + T-R1 merged)

- **T-B1 Backend/AI** (`apps/api`, `apps/worker`, `packages/shared`): shared zod schemas from `docs/API.md`; auth (OTP + Google); upload flow with signed URLs, credit deduction in a transaction, queue job; worker pipeline per PRD §9; rule-based sub-scores (formatting 25, sections 15, length/grammar 15) + AI sub-scores (keywords 25, bullets 20) computed in code; Claude integration with versioned prompts, strict JSON + zod, one retry, cheap scoring / strong rewrite models, cache by hash; Razorpay orders, signature verify, idempotent webhooks, refunds, GST invoice; plans and credits read from the plans table; email + PDF.
- **T-U2 UI screens** (`apps/web`): wire auth, upload, report (score ring, sub-scores, top-5 fixes, keyword gaps, bullet rewrites, locked free sections, PDF button), pricing, Razorpay checkout, dashboard, delete-my-data — against `docs/API.md`.
- **T-S2 Security hardening** (`infra/`, `.github/`, `apps/api/src/security`): rate limits per PRD §11 (429 + Retry-After), helmet/CORS/CSRF/HSTS/cookies, input validation, file safety (MIME, 5 MB/5 pages, ClamAV, signed expiring URLs), prompt-injection defence tests, Razorpay HMAC + idempotency + reconciliation, PII redaction, retention job, audit log, Sentry + structured logs.
- **T-Q1 QA** (`tests/`): unit tests for scoring rules, upload→report integration tests, Razorpay test-mode tests (forged signatures, duplicate webhooks, abandoned payments, refunds), rate-limit tests per §11, Playwright E2E (signup, free scan, buy Starter, buy Pro, view report, delete data), test resume set (clean, two-column, scanned image, table-heavy, 10-page, prompt-injection).

## 3. Dependencies

```
T-M1 (API/DB docs) ──> T-B1 ──> T-Q1
        └────────────> T-U2 ──┘
T-R1 (scaffold) ─────> T-B1, T-U2, T-S2
T-S1 (infra) ────────> T-S2
All: docs/PRD.md is the single source of truth.
```

## 4. Manager decisions

- **API framework: Express** — PRD §8 allows "NestJS or Express"; Shared Rules allow "Express or Fastify". Express is the intersection of both lists.
- **Email: Resend** (PRD §9 lists Resend or Brevo).
- **Plans are prepaid packs, not subscriptions** in v1 (PRD §5).
- **Open (confirm before wave 2 build):** AI model tiers for scoring vs rewrites (PRD §17.2 — proposal: cheap model for scoring, stronger for rewrites), file retention default (PRD §17.3 — 24 h vs 7 d), storage provider (S3 vs R2).

## 5. Delivery (local-first)

- Git repo initialized locally; the user will attach the remote later. All commits are local, format `<area>: <what>` (no co-author tags).
- Commit plan: (1) docs, (2) one commit per reviewed wave-1 task, (3) one commit per wave-2 task, (4) integration fixes as their own commits.
- Verification bar: `lint`, `typecheck`, `test` green at root before any wave-2 task is called done.

## 6. MVP scope guardrails (do not over-engineer)

- **Build Phase 1 only:** upload, extraction, rule checks, AI analysis, on-screen report, Free + Starter purchase flow, Razorpay checkout, email OTP login.
- **Explicitly deferred to later phases:** admin panel, JD matching, PDF download (button stays a phase-2 placeholder), Pro/Premium feature gating, dashboard beyond scan history, cover letters, LinkedIn tips, email report delivery, reconciliation job, CAPTCHA.
- Plans table is seeded with all four PRD §5 rows (data, not code); the checkout code path is shared for every paid plan, so no per-plan special-casing.
- Email OTP uses Resend when `RESEND_API_KEY` is set, otherwise logs the OTP to the server console in dev (documented in `.env.example`).
- Claude AI called only when `CLAUDE_API_KEY` is set; tests mock the AI client; a missing key fails the scan with a clear config error, never a fake score.
- Rate limiting: only the MVP-critical limits (OTP, free scan/day, general API) in wave 2; the full §11 matrix lands with Phase 2.

## 7. Review gates

1. Manager approves T-M1, T-S1, T-U1, T-R1 → release wave 2.
2. Manager reviews every agent task against `docs/PRD.md`; rejects rule violations and records them in `docs/STATUS.md`.
3. QA suite green → manager sign-off against PRD acceptance criteria (release order per `docs/AGENTS.md` §10).
