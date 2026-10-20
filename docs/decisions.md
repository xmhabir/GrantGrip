# GrantGrip — Architectural Decisions

> This log records every significant decision made during development, why it was made, and what alternatives were considered. Append new entries as work progresses.

---

## Pre-Phase-0 Review — 2026-10-20

The following 13 amendments were requested by the product owner after reviewing the initial spec. All were accepted without modification and propagated to SPEC.md, architecture.md, and TODO.md.

---

### D-001 — reminder_log: partial unique indexes instead of nullable composite unique constraint

**Decision:** Replace the single `UNIQUE (report_id, requirement_id, user_id, days_before)` constraint (which contained nullable columns) with two partial unique indexes:
```sql
UNIQUE (target_id, user_id, days_before) WHERE target_type = 'report'
UNIQUE (target_id, user_id, days_before) WHERE target_type = 'requirement'
```
Also change the column design from `report_id (nullable)` + `requirement_id (nullable)` to `target_type text` + `target_id uuid`.

**Rationale:** In PostgreSQL, a `UNIQUE` constraint on nullable columns does **not** prevent duplicates — multiple rows with `NULL` in a nullable column are treated as distinct. The partial index approach avoids this by eliminating nullability entirely. The `target_type` + `target_id` discriminated union pattern is also simpler to query than a nullable two-column join.

**Alternatives considered:** Using a computed `COALESCE` expression in the unique index. Rejected as less readable and harder to enforce in application layer.

---

### D-002 — Reminders: hourly job with org-local-time check instead of fixed UTC cron

**Decision:** Replace the fixed daily UTC cron (`0 9 * * *`) with an **hourly** Inngest function (`0 * * * *`) that:
1. Fetches all organizations and their configured `timezone`
2. Computes each org's local time from the current UTC instant
3. Processes only organizations whose local hour equals 9
4. Computes "overdue" and "due in N days" using each org's **local date**, not UTC date

Same logic applies to the Monday weekly digest (checks local day of week).

**Rationale:** A fixed UTC cron fires at the same UTC time for all orgs, which means orgs in Western timezones (US Pacific) get reminders at 1 AM local time, and orgs in Eastern timezones may get them at 5 AM. Small nonprofits rely on 9 AM local delivery. Computing "days until due" in org-local time also prevents off-by-one errors at date boundaries (e.g. midnight UTC vs 8 PM local).

**Alternatives considered:** One scheduled job per org. Rejected as it would create O(N) Inngest schedules, which is expensive and hard to manage as org count grows.

---

### D-003 — orgId is always the internal organizations.id UUID

**Decision:** `orgId` throughout the codebase (all repository functions, server actions, service functions) always refers to `organizations.id` (the internal PostgreSQL UUID), **never** the Clerk organization ID string (`org_...`).

- `organizations.clerk_org_id` exists only for webhook sync and JIT lookup
- The single conversion point is `requireOrgRole()` in `src/lib/auth.ts`
- Repositories accept `orgId: string` where this is always the internal UUID

**Rationale:** Mixing two different "org identifiers" leads to confusion, security bugs, and hard-to-trace query errors. Centralizing the conversion eliminates an entire class of bugs. The internal UUID is also what appears in all DB foreign keys, making joins straightforward.

---

### D-004 — requireOrgRole() performs JIT upsert when webhook is delayed

**Decision:** If `requireOrgRole()` finds a missing `users`, `organizations`, or `memberships` row in the local DB (which can happen if the Clerk webhook has not yet been delivered), it fetches the data from the Clerk API synchronously and upserts the missing rows before proceeding.

**Rationale:** Clerk webhooks are delivered asynchronously and can lag by seconds or more. Without JIT upsert, a user who creates an org and immediately hits an API endpoint would receive a 500/403 error. This is a common production issue with Clerk-based apps. The JIT upsert is idempotent — if the webhook arrives later, the upsert is a no-op.

**Trade-off:** This adds a Clerk API call on the first request in the race window, which adds latency (~100–300 ms). Acceptable for a cold-start scenario that affects only first requests after org/user creation.

---

### D-005 — Add ai_usage and export_jobs tables

**Decision:** Add two new tables to the schema:
- `ai_usage`: tracks per-org, per-month token usage and cost estimates for AI requests
- `export_jobs`: tracks the status and storage location of report pack export background jobs

**Rationale:**
- `ai_usage` is required to enforce per-plan AI quotas (plan limits include `aiRequestsPerMonth`) and to give users visibility into their AI consumption. It is also needed before Phase 5.
- `export_jobs` provides job tracking, status polling, and error visibility for the ZIP export flow (Phase 6). Defining it in Phase 0 alongside the rest of the schema avoids a migration mid-development.

---

### D-006 — grant_documents: upload_status field + R2 HEAD verification on confirm

**Decision:** Add `upload_status: 'pending' | 'uploaded'` to `grant_documents`. The row is created with `pending` at presign time. On confirm:
1. Server performs a `HEAD` request to R2
2. Verifies `Content-Length ≤ 25 MB` and `Content-Type` is on the allow-list
3. If invalid: DELETE object from R2, DELETE DB row, return 422
4. If valid: update `upload_status = 'uploaded'`

An Inngest cleanup job (hourly) purges stale `pending` rows older than 24 hours.

**Rationale:** Without server-side verification, a client could bypass the declared content-type/size by uploading a different file directly to the presigned URL. The HEAD check on confirm closes this attack surface. The `pending` status allows differentiating "presign issued but not yet confirmed" from "confirmed and ready" without a separate table.

---

### D-007 — Requirement status: automatic provided/open transitions, admin-only verified

**Decision:** The requirement `status` field is automatically managed by the data-access layer (not the UI):
- First evidence attached → auto-transition `open → provided`
- All evidence soft-deleted → auto-transition `provided → open`
- `verified` can **only** be set by a user with `admin` role; it is never set automatically

This logic lives in `evidence.ts` (calls `syncRequirementStatus` after every create or soft-delete) and `requirements.ts` (guards `verified` transitions).

**Rationale:** Requiring users to manually click "mark as provided" after uploading evidence is friction that will be forgotten. Auto-transitioning based on evidence presence is the natural behavior and reduces errors. Keeping `verified` manual and admin-only preserves the human oversight step.

---

### D-008 — Tailwind v4 confirmed with shadcn/ui support

**Decision:** Use **Tailwind CSS v4** with CSS-first configuration (`@theme` directive in `globals.css`, no `tailwind.config.js`). shadcn/ui CLI (`npx shadcn@latest init`) natively targets Tailwind v4 as of its current version.

**Verification:** Confirmed via official shadcn.com docs (October 2025): full Tailwind v4 support with `@theme inline` for color tokens, `data-slot` attributes on primitives, OKLCH color format.

---

### D-009 — Neon confirmed as PostgreSQL provider

**Decision:** Use **Neon** (serverless PostgreSQL) for the database. Connection via `@neondatabase/serverless` which supports the HTTP-based connection protocol ideal for Vercel serverless functions.

**Rationale:** Neon has native Vercel integration, a free tier sufficient for development, and the serverless HTTP driver avoids connection pool exhaustion under Vercel's function concurrency model.

---

### D-010 — Claude model from ANTHROPIC_MODEL env var; graceful failure path for PDF limits

**Decision:**
1. The Claude model used for AI extraction is read from `env.ANTHROPIC_MODEL` (default: `claude-sonnet-4-5`). Never hardcoded.
2. Before submitting a PDF to the Claude API, the extraction job checks:
   - File size ≤ 25 MB (already enforced at upload; double-checked before API call)
   - Page count ≤ model limit (100 pages for 200k-context models; 600 pages for 1M-context)
3. If the PDF exceeds limits, OR if both extraction attempts (initial + one retry) fail due to malformed output, the job sets `grant_documents.ai_status = 'failed'` and the user sees a clear failure message with a call to action to add requirements manually.

**Claude PDF limits (official Anthropic docs, verified 2025-10):**
- 100 pages per request (200k-context window models)
- 600 pages per request (1M-context window models)
- 32 MB total request payload
- Recommendation: use Files API to avoid re-uploading on retry (adopted)

**Rationale:** Model capabilities change frequently. An env var allows switching models (e.g. to a cheaper model for staging) without a code deploy. The graceful failure path ensures users are never left with a broken-looking UI — they always have a path forward (manual entry).

---

### D-011 — Inngest steps: pass storage keys only, never file byte contents

**Decision:** Between Inngest steps (i.e., in the `step.run()` return value and the next step's input), only pass identifiers and metadata — never raw file contents or byte buffers. Each step that needs a file fetches it directly from R2 using the storage key.

**Rationale:** Inngest persists step output to durable storage, with size limits on payloads. Large file contents passed between steps would hit payload limits, cause memory issues, and increase costs. Storage keys are tiny (< 200 bytes) and sufficient for any step that needs the file.

---

### D-012 — Tenant isolation test: every repository function tested cross-org

**Decision:** A dedicated test file `tests/integration/tenant-isolation.test.ts` creates two organizations (Org A, Org B) and runs every read/write repository function with an Org A actor targeting Org B resources. Each call must return `null`, `[]`, or throw a `NotFoundError`. No Org B data may ever be returned.

**Rationale:** Tenant isolation bugs are high-severity (data leakage between customers). Testing every repository function systematically is the only way to catch accidental omissions of the `organizationId` filter (e.g. a developer adding a new repository function without the org scope).

---

### D-013 — Readiness calculation returns 0 (not NaN) for zero requirements

**Decision:** The readiness function is defined as:
```ts
function calculateReadiness(requirements: Requirement[]): number {
  if (requirements.length === 0) return 0;
  const satisfied = requirements.filter(r => r.status === "provided" || r.status === "verified").length;
  return satisfied / requirements.length;
}
```
An explicit unit test covers `calculateReadiness([]) === 0`.

**Rationale:** `0 / 0 === NaN` in JavaScript. NaN propagates silently through arithmetic and UI rendering (typically displays as "NaN%" or empty). A new report with zero requirements should display 0% readiness, not a broken UI. The check is a one-liner but prevents a common silent failure.

---

### D-014 — Build order: Phases 0–4, then 5, then 8-lite; Phases 6 and 7 deferred

**Decision:** Revise the build order to:
1. Phases 0–4 first (foundation through reminders)
2. Phase 5 (AI review)
3. Phase 8-lite (polish, marketing, E2E)
4. Phases 6 (export) and 7 (billing adapter) deferred

The `BillingProvider` **interface**, plan constants, and limit enforcement are built during Phases 0–2 (to gate creation actions). The Lemon Squeezy adapter (checkout, portal, webhook handler) is deferred to Phase 7.

**Rationale:** Phases 6 and 7 are valuable but not on the critical user path for the first working demo. The export pack (ZIP + PDF) and billing checkout are independent modules. Delivering a working grant-tracking + AI review product sooner is higher value. The interface-first approach for billing means limit enforcement is live from Phase 2 without needing the actual payment provider.

---

## Phase 0 — 2026-10-20

*(Decisions specific to Phase 0 implementation will be added here as they arise.)*
