# API Contract: ATS Resume Score Checker

*Draft for manager review (task T-M1). Source of truth: `docs/PRD.md`. Companion: `docs/DB.md`. This is the contract `apps/web` (UI-UX) and `apps/api` + `apps/worker` (Backend/AI) both build against.*

**Marker rule:** anything in this document that is **not directly implied by the PRD** is marked **`[PROPOSAL]`** and needs manager approval. Prices, plan limits and rate limits quoted here are copied verbatim from PRD §5 / §11 or live in the `plans` table / environment config — they must never be hardcoded in application code.

---

## 1. Conventions

- **Base path:** all endpoints are under `/api` (matches PRD §10 paths such as `POST /api/checkout`).
- **Transport:** HTTPS only (PRD §12).
- **Auth model:** `[PROPOSAL]` server-side session (or short-lived JWT with refresh rotation) carried in an `HttpOnly`, `Secure`, `SameSite` cookie. PRD §12 explicitly permits either ("Short-lived JWTs with refresh rotation, or server-side sessions"); the choice is the manager's. Endpoints below marked **Auth: session** require it. CSRF protection is required by PRD §12; `[PROPOSAL]` cookie-authenticated state-changing requests must send an `X-CSRF-Token` header.
- **Auth: public** = no session. **Auth: admin** = session of a user with the admin role `[PROPOSAL — PRD §7.7 requires an admin panel but does not specify how admin access is granted; open question]`.
- **Error envelope:** `[PROPOSAL]` all errors use:

```json
{ "error": { "code": "rate_limited", "message": "Friendly message.", "details": {} } }
```

- **Pagination:** `[PROPOSAL]` cursor-based: query `?cursor=<opaque>&limit=<n>`; response includes `next_cursor` (null when exhausted). Exact defaults are a manager decision — PRD does not specify pagination.
- **Idempotency:** payment and webhook processing are idempotent by Razorpay ids / event ids (PRD §10, DB unique constraints in `docs/DB.md`).

### 1.1 Common error codes `[PROPOSAL — the code catalogue itself is not in the PRD; HTTP statuses are implied]`

| HTTP | `code` | Meaning |
| --- | --- | --- |
| 400 | `invalid_request` | Malformed JSON / bad parameters |
| 401 | `unauthenticated` | No or expired session |
| 403 | `forbidden` | Authenticated but not allowed (e.g. not the owner) |
| 403 | `csrf_failed` | Missing/invalid CSRF token `[PROPOSAL]` |
| 404 | `not_found` | Resource does not exist |
| 409 | `conflict` | State conflict (e.g. order already paid) |
| 409 | `concurrent_scan_limit` | Too many in-flight jobs per user (PRD §11: concurrent job limit, "for example 2" — value is config) |
| 413 | `file_too_large` | Over 5 MB (PRD §7.2) |
| 415 | `unsupported_file_type` | Not PDF/DOCX (PRD §7.2) |
| 422 | `validation_failed` | Body failed schema validation |
| 422 | `consent_required` | Consent checkbox not accepted (PRD §12 consent) |
| 429 | `rate_limited` | PRD §11 limit hit — see §2 |
| 500 | `internal_error` | Unexpected server error |
| 503 | `processing_unavailable` | Queue/AI upstream unavailable `[PROPOSAL]` |

Per-endpoint extra codes are listed with each endpoint.

### 1.2 Rate limiting (PRD §11 — verbatim)

Implemented with Redis (sliding window / token bucket) plus Cloudflare edge rules (PRD §11, built by T-S2).

| Endpoint | Limit |
| --- | --- |
| OTP request | 3 per 10 minutes per email, 10 per hour per IP |
| Login attempts | 5 per 15 minutes per account and IP |
| Upload and scan (free) | 1 per day per user, 3 per day per IP |
| Upload and scan (Starter) | 3 per hour per user |
| Upload and scan (Pro) | 10 per hour per user |
| Upload and scan (Premium) | 20 per hour per user |
| Checkout creation | 10 per hour per user |
| General API | 100 requests per minute per IP |
| Webhook endpoint | Allow only Razorpay signatures, no user limits |

**429 behaviour (PRD §11, mandatory):** any limit violation returns **HTTP 429** with a **`Retry-After`** header (seconds until the window resets) and a friendly message. The UI must show a retry timer (UI-UX acceptance: "429 rate-limit states (friendly retry timer)"). Response body:

```json
{ "error": { "code": "rate_limited", "message": "Too many attempts. Please try again after the time shown.", "details": { "limit": "otp_request_email", "retry_after_seconds": 420 } } }
```

`details.limit` names which §11 rule fired `[PROPOSAL]`. Any endpoint not listed above falls under **General API (100/min per IP)**. The scan/upload plan limits are selected from the user's current plan read from the `plans` table (never hardcoded).

### 1.3 Scan pipeline statuses (PRD §9)

| `status` | PRD source | Meaning |
| --- | --- | --- |
| `queued` | §9 step 2 ("status: queued") | Scan created, credit deducted, job pushed to queue |
| `processing` | §8 ("immediate processing state"), §9 steps 3–6 | Worker running; `step` field shows the stage |
| `done` | §9 step 7 ("mark the scan done") | Report built, email queued |
| `failed` | §9 step 9 ("mark the scan failed") | After retries; credit restored automatically |

`step` values map directly to PRD §9 stages: `virus_scan_and_extract` → `rule_checks` → `ai_analysis` → `merge_and_report` → `deliver`. Failure reason is returned as `error_code` (e.g. `scanned_image_pdf` per PRD §7.2, `too_many_pages` `[PROPOSAL — PRD §7.2 sets the 5-page limit but not where it is reported]`).

---

## 2. Endpoints

### 2.1 Authentication (PRD §7.1)

#### `POST /api/auth/otp/request`

- **Auth:** public
- **Rate limit:** PRD §11 "OTP request" — 3 per 10 minutes per email, 10 per hour per IP → `429` + `Retry-After`
- **Purpose:** email a one-time login code.

**Request**

```json
{ "email": "user@example.com" }
```

**Response 200**

```json
{ "ok": true }
```

**Errors:** `422 validation_failed`, `429 rate_limited` (both email and IP buckets), `403 disposable_email_blocked` `[PROPOSAL — PRD §11 extra control "disposable email blocking"]`, `500`.

> OTP validity duration is **not specified in the PRD** — must be a config value (`OTP_TTL_*`), see open questions. Never hardcoded.

#### `POST /api/auth/otp/verify`

- **Auth:** public (creates the session)
- **Rate limit:** PRD §11 "Login attempts" — 5 per 15 minutes per account and IP → `429` + `Retry-After`
- **Purpose:** verify the OTP and start a session.

**Request**

```json
{ "email": "user@example.com", "otp": "123456" }
```

**Response 200** (sets session cookie)

```json
{ "user": { "id": "uuid", "email": "user@example.com", "name": "User", "verified": false } }
```

**Errors:** `422 validation_failed`, `401 otp_invalid_or_expired`, `429 rate_limited`, `500`.

#### `POST /api/auth/google`

- **Auth:** public (creates the session)
- **Rate limit:** PRD §11 "Login attempts" — 5 per 15 minutes per account and IP
- **Purpose:** Google sign-in (PRD §7.1).

**Request**

```json
{ "id_token": "<Google ID token> `[PROPOSAL — PRD names Google sign-in but not the handshake; Google Identity Services id_token is the proposed flow]`" }
```

**Response 200**

```json
{ "user": { "id": "uuid", "email": "user@example.com", "name": "User", "verified": false } }
```

**Errors:** `422 validation_failed`, `401 google_token_invalid`, `429 rate_limited`, `500`.

#### `GET /api/auth/session`

- **Auth:** session
- **Rate limit:** General API
- **Purpose:** who am I — the UI gates features on what this returns (never on client state, UI-UX rules).

**Response 200**

```json
{
  "user": { "id": "uuid", "email": "user@example.com", "name": "User", "verified": true },
  "plan": { "id": "uuid", "name": "Pro", "expires_at": "2026-12-01T00:00:00Z" },
  "entitlements": { "pdf_download": true, "email_report": true, "jd_matching": true, "full_report": true }
}
```

`entitlements` values derive from the user's plan row in the `plans` table (PRD §5 feature matrix). **Errors:** `401 unauthenticated`.

#### `POST /api/auth/logout`

- **Auth:** session
- **Rate limit:** General API
- **Purpose:** end the session.

**Request:** empty body. **Response 200:** `{ "ok": true }`. **Errors:** `401 unauthenticated`.

#### `POST /api/auth/email/verify/request`

- **Auth:** session
- **Rate limit:** not specified in PRD §11 → falls back to General API (**open question for manager**: should this share the OTP-request limits?)
- **Purpose:** send the verification email. PRD §7.1: "Email verification is required before any report is emailed."

**Request:** empty body. **Response 200:** `{ "ok": true }`. **Errors:** `401 unauthenticated`, `409 already_verified`, `429 rate_limited`.

#### `POST /api/auth/email/verify`

- **Auth:** session (or public with emailed token `[PROPOSAL]`)
- **Rate limit:** General API
- **Purpose:** confirm the email address.

**Request**

```json
{ "token": "<from verification email>" }
```

**Response 200:** `{ "user": { "id": "uuid", "email": "user@example.com", "verified": true } }`. **Errors:** `401 token_invalid_or_expired`, `401 unauthenticated`, `422 validation_failed`.

---

### 2.2 Upload (PRD §7.2, §9 step 1)

#### `POST /api/uploads/signed-url`

- **Auth:** session
- **Rate limit:** PRD §11 "Upload and scan" for the user's plan (free 1/day/user + 3/day/IP; Starter 3/h; Pro 10/h; Premium 20/h) — shares one bucket with `POST /api/scans` `[PROPOSAL: enforcement point]`
- **Purpose:** get a short-lived signed URL; client uploads directly to the private bucket. Backend checks **size (≤ 5 MB)** and **MIME type (PDF/DOCX)** and credits here (PRD §9 step 1). Signed URLs "expire in minutes" (PRD §12) — exact TTL is config.

**Request**

```json
{ "filename": "resume.pdf", "content_type": "application/pdf", "size_bytes": 245760 }
```

**Response 200**

```json
{
  "upload_url": "https://storage.example/... (pre-signed PUT, expires in minutes)",
  "file_key": "uploads/<user_id>/<uuid>.pdf",
  "headers": { "Content-Type": "application/pdf" },
  "expires_in_seconds": 300
}
```

`expires_in_seconds` value is config, not a PRD number. **Errors:** `413 file_too_large`, `415 unsupported_file_type`, `409 credits_required` (no credit available), `429 rate_limited` (plan bucket), `422 validation_failed`, `401 unauthenticated`, `400 captcha_required` (free-tier CAPTCHA, PRD §11 `[PROPOSAL — PRD §11 mandates Turnstile "on free scans" but not the exact field/endpoint]`).

#### `POST /api/scans` (credit deduction + queue — PRD §9 step 2)

- **Auth:** session
- **Rate limit:** same shared "Upload and scan" plan bucket as above → `429` + `Retry-After`
- **Purpose:** create the scan record, **deduct one credit in a DB transaction**, push the job to the queue.

**Request**

```json
{
  "file_key": "uploads/<user_id>/<uuid>.pdf",
  "job_description": "Optional JD text",
  "target_role": "Backend Developer",
  "consent": true,
  "captcha_token": "only when on the free plan [PROPOSAL]"
}
```

**Response 201**

```json
{
  "scan": { "id": "uuid", "status": "queued", "created_at": "2026-11-24T10:00:00Z" },
  "credits_remaining": 9
}
```

**Errors:** `409 credits_required`, `409 concurrent_scan_limit` (PRD §11, config value), `404 file_key_not_found`, `422 consent_required`, `429 rate_limited`, `401 unauthenticated`, `400 captcha_required` `[PROPOSAL]`.

*Notes:* the **Free** plan is "1 per day, score only" (PRD §5) — enforced via the §11 free bucket. If a later pipeline step fails, the credit is restored automatically (PRD §9 step 9).

---

### 2.3 Scans, status, reports (PRD §7.4, §7.5, §9)

#### `GET /api/scans/:id` (status polling)

- **Auth:** session (owner only; non-owner returns `404` `[PROPOSAL — avoids id enumeration]`)
- **Rate limit:** General API
- **Purpose:** the "analyzing" state polls this until `done`/`failed` (PRD §8, UI-UX upload page).

**Response 200**

```json
{
  "id": "uuid",
  "status": "processing",
  "step": "ai_analysis",
  "created_at": "2026-11-24T10:00:00Z",
  "score": null,
  "error_code": null
}
```

When `status = "done"`: `score` is a number 0–100. When `failed`: `error_code` explains (e.g. `scanned_image_pdf`, credit was restored). **Errors:** `401 unauthenticated`, `404 not_found`.

#### `GET /api/scans` (list / history)

- **Auth:** session
- **Rate limit:** General API
- **Purpose:** dashboard scan history (PRD §7.5).

**Query:** `?cursor=<opaque>&limit=<n>` `[PROPOSAL — pagination shape]`

**Response 200**

```json
{
  "items": [
    { "id": "uuid", "status": "done", "score": 78, "target_role": "Backend Developer", "created_at": "2026-11-24T10:00:00Z" }
  ],
  "next_cursor": null
}
```

**Errors:** `401 unauthenticated`, `429 rate_limited`.

#### `GET /api/scans/:id/report`

- **Auth:** session (owner)
- **Rate limit:** General API
- **Purpose:** the on-screen report (PRD §7.4, §7.5). Gated server-side by plan entitlements (PRD §5 matrix): Free = score only + top 3 keywords; Starter = full report minus JD matching; Pro/Premium = full.

**Response 200** (report JSON shape `[PROPOSAL — PRD §7.4 requires "structured JSON output from the model, rendered in the UI"; the exact field names are a shared contract to confirm]`)

```json
{
  "scan": { "id": "uuid", "status": "done", "prompt_version": "v3", "created_at": "2026-11-24T10:00:00Z" },
  "report": {
    "overall_score": 78,
    "sub_scores": {
      "formatting": 70, "sections": 85, "keywords": 60, "bullets": 75, "length_grammar": 90
    },
    "top_fixes": [ { "rank": 1, "title": "...", "impact": "...", "before": "...", "after": "..." } ],
    "keyword_gap": [ { "keyword": "...", "where_to_add": "..." } ],
    "bullet_rewrites": [ { "before": "...", "after": "..." } ]
  },
  "entitlements": { "locked_sections": ["job_description_matching", "cover_letter"], "keyword_gap_limit": 3 },
  "credits_remaining": 9
}
```

Sub-score weights are PRD §7.3 (25/15/25/20/15) and are computed in code, never by the AI alone. `keyword_gap_limit` for Free = "Top 3 only" (PRD §5, read from the plans table). **Errors:** `401 unauthenticated`, `404 not_found`, `409 scan_not_done`, `403 report_locked` `[PROPOSAL — alternatively return 200 with locked flags only; manager to decide]`.

#### `GET /api/scans/:id/pdf` (PDF download — PRD §5, §7.5)

- **Auth:** session (owner)
- **Rate limit:** General API
- **Purpose:** download the PDF report. Only plans with `pdf_download` = yes may call it (Free: No — PRD §5).

**Response:** `302` redirect to a short-lived signed URL for the stored PDF `[PROPOSAL — redirect vs inline bytes]`, or `200` with `application/pdf`.

**Errors:** `401 unauthenticated`, `404 not_found`, `409 scan_not_done`, `403 pdf_not_included` (free plan), `429 rate_limited`.

---

### 2.4 Plans (PRD §5)

#### `GET /api/plans`

- **Auth:** public
- **Rate limit:** General API
- **Purpose:** pricing page. **All plan data comes from the `plans` table — never hardcoded in the UI** (Shared Rules, UI-UX rules).

**Response 200**

```json
{
  "plans": [
    {
      "id": "uuid", "slug": "free", "name": "Free",
      "price_paise": 0, "currency": "INR",
      "validity_days": null, "scans": 1,
      "features": { "ats_score": true, "section_breakdown": false, "keyword_gap": "top_3",
                    "job_description_matching": false, "ai_bullet_rewrites": false,
                    "cover_letter": false, "linkedin_tips": false, "pdf_download": false,
                    "email_report": false, "priority_processing": false },
      "badge": null
    },
    { "slug": "starter", "name": "Starter", "price_paise": 5000, "currency": "INR", "validity_days": 7, "scans": 1, "features": { "...": "PRD §5" }, "badge": null },
    { "slug": "pro", "name": "Pro", "price_paise": 29900, "currency": "INR", "validity_days": 30, "scans": 10, "features": { "...": "PRD §5" }, "badge": "best_value" },
    { "slug": "premium", "name": "Premium", "price_paise": 59900, "currency": "INR", "validity_days": 30, "scans": 30, "features": { "...": "PRD §5" }, "badge": null }
  ]
}
```

Prices above are **row values seeded from PRD §5** (GST-inclusive, PRD §5) shown here only as documentation of the seed — the API reads them from the table. `badge` = "Best value" on Pro (PRD §5 pricing note) `[PROPOSAL: badge column]`. **Errors:** `429 rate_limited`, `500`.

---

### 2.5 Payments — Razorpay (PRD §10)

#### `POST /api/checkout` (checkout order creation)

- **Auth:** session
- **Rate limit:** PRD §11 "Checkout creation" — 10 per hour per user → `429` + `Retry-After`
- **Purpose:** create a Razorpay **Order**. Price is always looked up server-side from the `plans` table — "The price always comes from the server, never from the browser" (PRD §10.2).

**Request**

```json
{ "plan_id": "uuid" }
```

**Response 201**

```json
{
  "order": {
    "id": "uuid",
    "razorpay_order_id": "order_xxxxx",
    "plan_id": "uuid",
    "amount_paise": 29900,
    "currency": "INR",
    "razorpay_key_id": "<public key id — the only key allowed in the frontend>"
  }
}
```

Order saved with status `created` (PRD §10.2). **Errors:** `404 plan_not_found`, `400 plan_inactive`, `422 validation_failed`, `429 rate_limited`, `401 unauthenticated`.

#### `POST /api/payments/verify`

- **Auth:** session
- **Rate limit:** General API (signature verification is not guessable; still bounded)
- **Purpose:** frontend sends `razorpay_payment_id`, `razorpay_order_id`, `razorpay_signature`; backend verifies **HMAC SHA256 with the key secret**, then marks the order paid and grants credits (PRD §10.5). Granting is idempotent (unique on payment id — PRD §10 rules). The **webhook remains the source of truth** (PRD §10.6).

**Request**

```json
{
  "razorpay_order_id": "order_xxxxx",
  "razorpay_payment_id": "pay_xxxxx",
  "razorpay_signature": "<hex>"
}
```

**Response 200**

```json
{
  "order": { "id": "uuid", "status": "paid" },
  "credits": { "remaining": 10, "expires_at": "2026-12-24T00:00:00Z" },
  "plan": { "id": "uuid", "name": "Pro" }
}
```

**Errors:** `400 signature_invalid`, `404 order_not_found`, `409 order_already_refunded`, `401 unauthenticated`, `422 validation_failed`. Re-sending a valid verification after success returns the same 200 (idempotent).

#### `POST /api/webhooks/razorpay`

- **Auth:** none (user-level); **only Razorpay signatures accepted** (PRD §11 webhook row). Verify `x-razorpay-signature` (HMAC SHA256, webhook secret) over the **raw body**; process each **event id idempotently** (store the event id — PRD §10.6); grant credits only once.
- **Rate limit:** no user limits; invalid-signature requests rejected with `401` (PRD §11: "Allow only Razorpay signatures").
- **Events:** `payment.captured`, `payment.failed`, `refund.processed` (PRD §10.6).

**Request** (Razorpay event envelope)

```json
{
  "id": "evt_xxxxx",
  "entity": "event",
  "event": "payment.captured",
  "payload": { "payment": { "entity": { "id": "pay_xxxxx", "order_id": "order_xxxxx", "amount": 29900, "status": "captured" } } }
}
```

**Response 200:** `{ "received": true }` — returned quickly; heavy work (invoice email) is queued `[PROPOSAL: async handling]`.

**Errors:** `401 signature_invalid`, `400 invalid_payload`. Duplicate event ids return `200` and change nothing (idempotency, PRD §10.6).

---

### 2.6 Credits and dashboard (PRD §7.5)

#### `GET /api/credits`

- **Auth:** session
- **Rate limit:** General API
- **Purpose:** remaining credits balance.

**Response 200**

```json
{
  "plan": { "id": "uuid", "name": "Pro" },
  "remaining": 9,
  "expires_at": "2026-12-24T00:00:00Z",
  "free_daily": { "used": 0, "limit": 1, "resets_at": "2026-11-25T00:00:00Z" }
}
```

`free_daily` applies only to the Free plan (PRD §5 "1 per day"; §11 free bucket) `[PROPOSAL: response shape]`. Plan values come from the `plans` table / §11 config. **Errors:** `401 unauthenticated`, `429 rate_limited`.

#### `GET /api/dashboard`

- **Auth:** session
- **Rate limit:** General API
- **Purpose:** PRD §7.5 + UI-UX dashboard: scan history, remaining credits, plan expiry.

**Response 200**

```json
{
  "user": { "id": "uuid", "email": "user@example.com", "verified": true },
  "plan": { "id": "uuid", "name": "Starter", "expires_at": "2026-12-01T00:00:00Z", "badge": null },
  "credits": { "remaining": 0, "expires_at": "2026-12-01T00:00:00Z" },
  "scans": {
    "items": [ { "id": "uuid", "status": "done", "score": 74, "target_role": "...", "created_at": "2026-11-24T10:00:00Z" } ],
    "next_cursor": null
  },
  "entitlements": { "pdf_download": true, "email_report": true, "jd_matching": false, "full_report": true }
}
```

**Errors:** `401 unauthenticated`, `429 rate_limited`.

#### `DELETE /api/me/data` (delete-my-data — PRD §12, DPDP)

- **Auth:** session
- **Rate limit:** General API
- **Purpose:** one-click "delete my data" in the dashboard (PRD §12). Writes an `audit_log` entry (PRD §12 requires audit logs for deletions).

**Request**

```json
{ "confirm": "DELETE" }
```

`confirm` value `[PROPOSAL — PRD says "one-click", so a confirm field may be unwanted; manager to decide]`.

**Response 200**

```json
{ "deleted": { "scans": 12, "files": 9, "credits": 0 }, "status": "completed" }
```

`status` may be `scheduled` if files are removed by the retention job `[PROPOSAL — PRD §9 step 8 retention job and §12 deletion right, but sync-vs-async is unspecified]`. What must be kept (e.g. tax records for payments, PRD §12/GST) is a manager/compliance decision — **open question**.

**Errors:** `401 unauthenticated`, `422 validation_failed`, `429 rate_limited`.

---

### 2.7 Admin panel (PRD §7.7: users, payments, refunds, scan logs, abuse flags, prompt version management)

All admin endpoints: **Auth: admin** `[PROPOSAL — role mechanism unspecified in PRD]`, General API rate limit, and every call writes an `audit_log` row (PRD §12 "audit logs for … admin actions"). List endpoints take `?cursor=&limit=` `[PROPOSAL]`.

#### `GET /api/admin/users`

- **Query:** `?q=<email substring>&cursor=&limit=`
- **Response 200:** `{ "items": [ { "id": "uuid", "email": "...", "verified": true, "created_at": "...", "plan": "Pro", "credits_remaining": 9, "abuse_flags": 0 } ], "next_cursor": null }`
- **Errors:** `401 unauthenticated`, `403 forbidden` (non-admin), `429 rate_limited`.

#### `GET /api/admin/users/:id`

- **Response 200:** user detail + recent scans, orders, payments, flags.
- **Errors:** `401`, `403`, `404 not_found`.

#### `GET /api/admin/payments`

- **Query:** `?status=created|paid|refunded&cursor=&limit=`
- **Response 200:** `{ "items": [ { "id": "uuid", "razorpay_order_id": "...", "razorpay_payment_id": "...", "amount_paise": 29900, "status": "paid", "created_at": "..." } ], "next_cursor": null }`
- **Errors:** `401`, `403`, `429`.

#### `GET /api/admin/payments/:id`

- **Response 200:** payment + order + user + refunds. **Errors:** `401`, `403`, `404`.

#### `POST /api/admin/payments/:id/refund` (refunds — PRD §7.7, §10)

- **Purpose:** trigger a refund through the **Razorpay API** (PRD §10). Also used by the auto-refund rule when a scan fails for system reasons and credits were deducted (PRD §7.6).
- **Request**

```json
{ "reason": "scan failed for system reasons", "amount_paise": null }
```

`amount_paise: null` = full refund; a value = partial refund `[PROPOSAL — PRD does not mention partial refunds]`.

- **Response 201:** `{ "refund": { "id": "uuid", "razorpay_refund_id": "rfnd_xxxxx", "amount_paise": 29900, "status": "processed", "created_at": "..." } }`
- **Errors:** `401`, `403`, `404 not_found`, `409 already_refunded`, `422 not_refundable`, `502 razorpay_error` `[PROPOSAL]`.

#### `GET /api/admin/scans` (scan logs — PRD §7.7)

- **Query:** `?status=queued|processing|done|failed&user_id=&cursor=&limit=`
- **Response 200:** `{ "items": [ { "id": "uuid", "user_id": "uuid", "status": "failed", "error_code": "...", "prompt_version": "v3", "score": null, "created_at": "...", "completed_at": "..." } ], "next_cursor": null }`
- **Errors:** `401`, `403`, `429`.

#### `GET /api/admin/abuse-flags` and `POST /api/admin/abuse-flags` (PRD §7.7)

- **List query:** `?user_id=&status=open|resolved&cursor=&limit=`
- **Create request** `[PROPOSAL — flag record shape]`

```json
{ "user_id": "uuid", "reason": "disposable-email abuse", "severity": "low|medium|high" }
```

- **List response 200:** `{ "items": [ { "id": "uuid", "user_id": "uuid", "reason": "...", "severity": "medium", "status": "open", "created_at": "..." } ], "next_cursor": null }`
- **Create response 201:** the flag object.
- **Errors:** `401`, `403`, `404 user_not_found`, `422 validation_failed`.
- `PATCH /api/admin/abuse-flags/:id/resolve` `[PROPOSAL — resolution flow]` with `{ "status": "resolved" }`.

#### `GET /api/admin/prompts` and `POST /api/admin/prompts` (prompt version management — PRD §7.7)

- **List response 200** `[PROPOSAL — prompt record shape]`:

```json
{ "items": [ { "name": "ats_analysis", "version": "v3", "model_tier": "scoring", "active": true, "created_at": "..." } ], "next_cursor": null }
```

- **Create request:** `{ "name": "ats_analysis", "content": "...", "model_tier": "scoring" }` → `201` with `version` assigned. Activating a version (`POST /api/admin/prompts/:name/activate`) `[PROPOSAL]`. Scans store the `prompt_version` used (PRD §10 `scans.prompt_version`, §9 step 5 versioned prompts).
- **Errors:** `401`, `403`, `422 validation_failed`, `404`.

---

### 2.8 Email and PDF delivery notes (not endpoints)

- **Provider:** Resend (manager decision, PLAN §4; PRD §8 lists Resend/Brevo).
- **Emails sent:** OTP login code; email-verification link; **report email containing a secure link, not an attachment of the resume** (PRD §7.5); GST invoice + payment confirmation (PRD §10.7); scan-failed notification with credit restored (PRD §9 step 9); refund notification `[PROPOSAL]`.
- **Gating:** "Email verification is required before any report is emailed" (PRD §7.1) — enforced before queueing report email.
- **PDF:** generated by the worker (HTML/PDF build, PRD §8 step 5), stored in the private bucket, served only through `GET /api/scans/:id/pdf` with plan entitlement check (PRD §5: Free has no PDF).
- **Invoices:** include GST details (PRD §7.6), sent automatically after successful payment (PRD §10.7). GST/invoice number fields depend on registration status — open question (PRD §17.4).

---

## 3. Endpoint index (quick reference)

| Method | Path | Auth | PRD §11 rate limit |
| --- | --- | --- | --- |
| POST | `/api/auth/otp/request` | public | OTP request (3/10 min per email, 10/h per IP) |
| POST | `/api/auth/otp/verify` | public | Login attempts (5/15 min per account+IP) |
| POST | `/api/auth/google` | public | Login attempts |
| GET | `/api/auth/session` | session | General API |
| POST | `/api/auth/logout` | session | General API |
| POST | `/api/auth/email/verify/request` | session | General API (§11 silent — open question) |
| POST | `/api/auth/email/verify` | session `[PROPOSAL]` | General API |
| POST | `/api/uploads/signed-url` | session | Upload and scan (per plan) |
| POST | `/api/scans` | session | Upload and scan (per plan) |
| GET | `/api/scans/:id` | session | General API |
| GET | `/api/scans` | session | General API |
| GET | `/api/scans/:id/report` | session | General API |
| GET | `/api/scans/:id/pdf` | session | General API |
| GET | `/api/plans` | public | General API |
| POST | `/api/checkout` | session | Checkout creation (10/h per user) |
| POST | `/api/payments/verify` | session | General API |
| POST | `/api/webhooks/razorpay` | Razorpay signature | Signature allow-list only, no user limits |
| GET | `/api/credits` | session | General API |
| GET | `/api/dashboard` | session | General API |
| DELETE | `/api/me/data` | session | General API |
| GET | `/api/admin/users` | admin `[PROPOSAL]` | General API |
| GET | `/api/admin/users/:id` | admin `[PROPOSAL]` | General API |
| GET | `/api/admin/payments` | admin `[PROPOSAL]` | General API |
| GET | `/api/admin/payments/:id` | admin `[PROPOSAL]` | General API |
| POST | `/api/admin/payments/:id/refund` | admin `[PROPOSAL]` | General API |
| GET | `/api/admin/scans` | admin `[PROPOSAL]` | General API |
| GET, POST | `/api/admin/abuse-flags` | admin `[PROPOSAL]` | General API |
| GET, POST | `/api/admin/prompts` | admin `[PROPOSAL]` | General API |

---

## Appendix A — zod schemas to create in `packages/shared` (wave 2, backend agent)

Names + purpose only. **Do not treat this as permission to create them in this task** — this is the list wave-2 work builds from.

| Schema name | Purpose |
| --- | --- |
| `otpRequestSchema` | `POST /api/auth/otp/request` body (email) |
| `otpVerifySchema` | `POST /api/auth/otp/verify` body (email, otp) |
| `googleSignInSchema` | `POST /api/auth/google` body (id_token) `[PROPOSAL]` |
| `emailVerifySchema` | `POST /api/auth/email/verify` body (token) |
| `sessionResponseSchema` | `GET /api/auth/session` response (user, plan, entitlements) |
| `entitlementsSchema` | Plan entitlement flags derived from the plans table feature matrix (PRD §5) |
| `signedUrlRequestSchema` | `POST /api/uploads/signed-url` body (filename, content_type, size_bytes) |
| `signedUrlResponseSchema` | Signed upload URL response (upload_url, file_key, headers) |
| `createScanSchema` | `POST /api/scans` body (file_key, job_description, target_role, consent, captcha_token `[PROPOSAL]`) |
| `scanStatusSchema` | Scan status enum `queued \| processing \| done \| failed` + `step` enum (PRD §9) |
| `scanSummarySchema` | Scan list item (id, status, score, target_role, created_at) |
| `scanListResponseSchema` | `GET /api/scans` and dashboard history envelope (items, next_cursor) `[PROPOSAL: cursor]` |
| `reportSchema` | Full report JSON: overall_score, five sub-scores, top_fixes, keyword_gap, bullet_rewrites (PRD §7.3/§7.4) — validates worker output |
| `reportResponseSchema` | `GET /api/scans/:id/report` envelope (scan, report, entitlements, credits_remaining) |
| `planSchema` | Single plan row (id, slug, name, price_paise, currency, validity_days, scans, features, badge `[PROPOSAL]`) |
| `planListResponseSchema` | `GET /api/plans` response |
| `checkoutRequestSchema` | `POST /api/checkout` body (plan_id) |
| `checkoutResponseSchema` | `POST /api/checkout` response (order + public Razorpay key id) |
| `paymentVerifySchema` | `POST /api/payments/verify` body (razorpay_order_id, razorpay_payment_id, razorpay_signature) |
| `razorpayWebhookSchema` | `POST /api/webhooks/razorpay` event envelope; id + event + payload validated before idempotent processing |
| `creditsResponseSchema` | `GET /api/credits` response |
| `dashboardResponseSchema` | `GET /api/dashboard` response (user, plan, credits, scans, entitlements) |
| `deleteDataRequestSchema` | `DELETE /api/me/data` body `[PROPOSAL: confirm field]` |
| `adminUserListQuerySchema` | `GET /api/admin/users` query (q, cursor, limit) |
| `adminUserDetailResponseSchema` | `GET /api/admin/users/:id` response |
| `adminPaymentListQuerySchema` | `GET /api/admin/payments` query (status, cursor, limit) |
| `refundRequestSchema` | `POST /api/admin/payments/:id/refund` body (reason, amount_paise) |
| `refundResponseSchema` | Refund record returned by the refund endpoint |
| `adminScanListQuerySchema` | `GET /api/admin/scans` query (status, user_id, cursor, limit) |
| `abuseFlagSchema` | Abuse flag create/list record (PRD §7.7) `[PROPOSAL: shape]` |
| `promptVersionSchema` | Prompt version record (PRD §7.7 prompt version management) `[PROPOSAL: shape]` |
| `errorResponseSchema` | Standard error envelope `[PROPOSAL]` |
| `paginationQuerySchema` | Shared cursor/limit query `[PROPOSAL]` |
| `rateLimitErrorResponseSchema` | 429 body with `details.retry_after_seconds` `[PROPOSAL]` |

---

## 4. Open questions for the manager

1. **Session mechanism:** server-side session vs short-lived JWT + refresh rotation (PRD §12 allows both) — affects `apps/api` auth and CSRF design.
2. **OTP validity duration and email-verification token TTL:** not in the PRD; must be config values. Please set them.
3. **Rate limit for `POST /api/auth/email/verify/request`:** PRD §11 does not list it — share the OTP-request limits or General API only?
4. **Admin authentication:** how is the admin role granted/stored (not in PRD §10's users table)?
5. **Report-locked behaviour:** `403 report_locked` vs `200` with locked sections only.
6. **Delete-my-data scope:** what must be retained for GST/payment records after deletion (PRD §12 vs §10 invoices)?
7. **PDF serving:** 302 to signed URL vs inline bytes.
8. **Partial refunds:** allowed, or full refunds only?
9. **Pagination defaults** (page size) — PRD is silent.
10. **Free-scan CAPTCHA field:** exact placement (signed-url vs scan create) for Cloudflare Turnstile (PRD §11).
