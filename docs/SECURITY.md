# SECURITY: ATS Resume Score Checker

*Manager-reviewed draft (T-S1). Source of truth: `docs/PRD.md` §11, §12. Stack: Next.js web, Express API, BullMQ worker, PostgreSQL, Redis, S3-compatible storage.*

## 1. Threat model

| Threat | Risk | Mitigations (PRD ref) | Owner / phase |
| --- | --- | --- | --- |
| **Abuse / free-tier abuse** | Cost spikes, fake accounts, scan farming | Redis sliding-window rate limits per PRD §11 (OTP 3/10min/email + 10/hr/IP, login 5/15min, free scan 1/day/user + 3/day/IP, checkout 10/hr, general 100/min/IP); `429` + `Retry-After`; daily AI spend cap with alert at 70% and kill switch for free scans; concurrent job limit per user (2); device fingerprint + disposable email blocking + Cloudflare Turnstile CAPTCHA on free scans; cache identical resume+JD results for short TTL (PRD §11). | S2/T-B1 |
| **Prompt injection in resumes** | Resume text hijacks model to inflate score / leak instructions | Treat resume as untrusted data: wrap in delimiters, instruct model it is data only, require strict JSON output validated with zod, retry once on invalid JSON, ignore instructions found in resume; malicious-resume test fixtures (PRD §9, §12, QA). | T-B1/T-Q1 |
| **File upload attacks** | Malware, polyglot files, oversized payloads, SSRF via URLs | Accept PDF/DOCX only; MIME + extension validation; max 5 MB / 5 pages (PRD §7.2, §11); virus scan step (ClamAV) before extraction; signed upload/download URLs expiring in minutes; private bucket, encryption at rest; no execution, isolated worker; request size limits (PRD §12). | T-S2/T-B1 |
| **Payment fraud (Razorpay)** | Price tampering, forged callbacks, replayed webhooks, double-crediting | Server-side price lookup from `plans` table (never trust browser); create Razorpay order server-side; verify HMAC SHA256 signature for checkout and webhooks; webhook as source of truth; idempotent processing by unique payment/event id; daily reconciliation job; store only Razorpay ids, no card data (PRD §10). | T-B1/T-S2 |
| **Data leak / privacy breach** | PII exposure in logs, AI prompts, storage, backups | Redact phone/email/address before sending text to AI; no secrets in code; `.env.example` placeholders only; encryption at rest and in transit; least-privilege DB/storage roles; signed short-lived URLs; retention job deletes files after window (default 24h, configurable); delete-my-data endpoint; audit_log for logins, payments, deletions, admin actions; structured logs without personal data; DPDP Act 2023 consent/notice/retention/deletion (PRD §12). | All agents |

## 2. Security controls (implementation map)

- **Edge/WAF**: Cloudflare DDoS/bot rules/rate limiting in front of web/API (PRD §8).
- **API middleware**: helmet headers, strict CORS allowlist, CSRF protection for cookie flows, HSTS, secure HttpOnly SameSite cookies, input validation (zod) on every route, request size limits.
- **Auth**: email OTP + Google sign-in; short-lived sessions/JWT with rotation (decision pending); email verification before report is emailed.
- **Storage**: private S3/R2/MinIO bucket, server-generated signed URLs, no public resume URLs.
- **Queue/worker**: credit deducted in DB transaction before enqueue; refund credit on terminal failure; idempotent job handling.
- **Secrets**: env vars / secrets manager only; CI secret scan (gitleaks); dependency audit (`npm audit --audit-level=high`).
- **Observability**: Sentry, structured logs without PII, uptime checks, alerts for failed jobs/webhooks/cost spikes.

## 3. Pre-launch checklist

- [ ] All PRD §11 rate limits enforced and returning 429 + `Retry-After`.
- [ ] Daily AI spend cap + 70% alert + free-scan kill switch configured.
- [ ] Razorpay signature verification (checkout + webhook) and idempotent credit grant tested.
- [ ] Daily Razorpay reconciliation job running.
- [ ] File upload: MIME/ext/size/page checks, ClamAV scan, signed expiring URLs, private bucket.
- [ ] Prompt-injection fixture set passes (malicious resume cannot override scoring/output schema).
- [ ] PII redaction before AI call verified; logs contain no resume PII/secrets.
- [ ] Retention job deletes files within configured window; delete-my-data works end-to-end.
- [ ] HTTPS/HSTS/CORS/CSRF/cookies/helmet/input validation enabled.
- [ ] Secrets only in env/secrets manager; no keys in client bundle except Razorpay public key id.
- [ ] Dependency audit clean (no unresolved high/critical); secret scan clean.
- [ ] Privacy Policy, Terms, Refund Policy published (Razorpay requirement).
- [ ] GST invoice flow verified in test mode; DPDP grievance contact published.
- [ ] Sentry + uptime + failed-job/webhook alerts wired.

## 4. Known open decisions (manager)

- Session mechanism: server-side sessions vs short-lived JWT + refresh rotation (PRD §12 allows both).
- OTP validity / verification token TTL (config values; not in PRD).
- File retention default 24h vs 7d (PRD §17.3) — `.env.example` defaults to 24h.
- CAPTCHA provider (Cloudflare Turnstile proposed by PRD §11).