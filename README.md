# ATS Resume Score Checker

India-first web app that gives job seekers an ATS compatibility score, keyword gap analysis, and actionable resume fixes. Source of truth: [`docs/PRD.md`](docs/PRD.md).

## Status

MVP (Phase 1) in progress. Plan and task ownership: [`docs/PLAN.md`](docs/PLAN.md), status: [`docs/STATUS.md`](docs/STATUS.md).

## Monorepo layout

```
apps/web        Next.js + Tailwind frontend
apps/api        Node + Express API
apps/worker     BullMQ job workers
packages/shared Shared types and zod schemas
docs/           PRD, API/DB contracts, plan, security
infra/          Infrastructure assets (as added)
```

## Local setup (pending install)

```bash
# 1) Install deps (wave 2)
npm install

# 2) Copy env
cp .env.example .env   # or Copy-Item on PowerShell

# 3) Start local infra
docker compose up -d

# 4) Run apps (once scaffolded)
npm run dev
```

## Scripts

- `npm run lint` — workspace lint (`--if-present`, safe before packages exist)
- `npm run typecheck` — workspace typecheck
- `npm run test` — workspace tests
- `npm run build` — workspace builds
- `npm run format` — prettier check

## Docs

- PRD: `docs/PRD.md`
- Agent rules: `docs/AGENTS.md`
- API contract: `docs/API.md`
- DB schema: `docs/DB.md`
- Security: `docs/SECURITY.md`
