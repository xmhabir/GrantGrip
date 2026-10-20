# GrantGrip — TODO

> Phased build checklist v0.2 (post-review amendments applied).
> Legend: `[ ]` not started · `[x]` done · `[~]` in progress · `[!]` blocked

---

## Build Order

Phases 0 → 1 → 2 → 3 → 4 → 5 → **8-lite** (marketing + polish).
Phases 6 (export pack) and 7 (billing adapter) are **deferred** — stubs/interfaces are built earlier.

---

## Phase 0 — Foundation
> **Goal:** repo setup, tooling, CI green, DB migrates from scratch.

### Repo & Tooling
- [x] `npx create-next-app@latest` with TypeScript strict, App Router, Tailwind v4
- [x] Configure `tsconfig.json` — strict mode, path aliases (`@/`)
- [x] Install and configure ESLint (next/core-web-vitals + import plugin)
- [x] Install and configure Prettier (with Tailwind plugin)
- [x] Add `.editorconfig`
- [x] Add `@t3-oss/env-nextjs` and create `src/lib/env.ts` (validated env schema including `ANTHROPIC_MODEL`)
- [x] Create `.env.example` with all required keys and descriptions

### Tailwind & UI Foundation
- [x] Confirm Tailwind v4 CSS-first config in `globals.css` (no `tailwind.config.js`)
- [x] Modern UI token design system, glassmorphism, curated non-profit color palette (emerald/teal/amber), dark mode

### Database — Full Schema (all tables defined upfront)
- [x] Install `drizzle-orm`, `drizzle-kit`, `@neondatabase/serverless`
- [x] Create `src/lib/db/schema.ts` with **all** tables:
  - [x] `organizations` (clerk_org_id unique)
  - [x] `users` (clerk_user_id unique)
  - [x] `memberships`
  - [x] `grants` (with `deleted_at`)
  - [x] `grant_documents` (with `upload_status: pending|uploaded`, `ai_status`)
  - [x] `reports` (with `deleted_at`)
  - [x] `requirements` (with `sort_order`)
  - [x] `evidence` (with `deleted_at`)
  - [x] `ai_suggestions`
  - [x] `reminder_rules`
  - [x] `reminder_log` — columns: `target_type text`, `target_id uuid`, `user_id`, `days_before`, `sent_at`
  - [x] `activity_logs`
  - [x] `ai_usage` — columns: `organization_id`, `month text`, `input_tokens`, `output_tokens`, `request_count`, `cost_estimate_usd`
  - [x] `export_jobs` — columns: `organization_id`, `report_id`, `requested_by`, `status`, `storage_key`, `expires_at`, `error`
- [x] Composite indexes: `(organization_id, due_date)`, `(organization_id, status)`
- [x] **Two partial unique indexes** on `reminder_log`:
  ```sql
  UNIQUE (target_id, user_id, days_before) WHERE target_type = 'report'
  UNIQUE (target_id, user_id, days_before) WHERE target_type = 'requirement'
  ```
- [x] Unique index on `ai_usage (organization_id, month)`
- [x] Create `src/lib/db/index.ts` — Neon serverless db client singleton
- [x] Configure `drizzle.config.ts`
- [x] Generate initial migration (`drizzle-kit generate`) -> `drizzle/0000_famous_kat_farrell.sql`

### Billing Stubs (interface only — adapter deferred to Phase 7)
- [x] `src/lib/billing/types.ts` — `BillingProvider` interface
- [x] `src/lib/billing/plans.ts` — plan constants (maxUsers, maxActiveGrants, aiRequestsPerMonth)
- [x] `src/lib/billing/limits.ts` — `checkPlanLimits(orgId, action)` (returns allow/deny; wired to real data in Phase 2)

### Base Layout & App Shell
- [x] Root layout with Geist font
- [x] Global CSS with design tokens, glassmorphism, glow utilities
- [x] `(app)` layout: sidebar nav, header skeleton, user badge placeholder
- [x] `(marketing)` layout: minimal navbar + footer
- [x] 404 (`not-found.tsx`) and 500 (`error.tsx`) error pages with friendly UI

### CI & Unit Tests
- [x] `.github/workflows/ci.yml`: lint → typecheck → test (Vitest) → build
- [x] `vitest.config.ts` setup
- [x] Unit test suite (`tests/unit/phase0.test.ts`): env loads, db schema exports, `PLANS` constants, D-013 readiness calculation returns 0 (not NaN) for empty array
- [x] Vitest 5 tests passing (100% green)

### Documentation
- [x] `README.md` — overview, local setup, env vars, migration commands, test commands, backup/restore note
- [x] `docs/decisions.md` — Phase 0 decisions logged
- [x] `docs/future-ideas.md` — created
- [x] `docs/privacy-notes.md` — data flow list and security boundaries
- [x] `docs/SPEC.md`, `docs/architecture.md`, `docs/TODO.md` stored in repository

**Acceptance:** `npm run dev` works locally; `tsc --noEmit` clean; CI workflow configured; Vitest passing; build clean; Drizzle migration generated.

---

## Phase 1 — Auth & Tenancy
> **Goal:** two orgs can exist; tenant isolation integration tests pass.

- [x] Install `@clerk/nextjs`
- [x] Configure Clerk middleware (`src/middleware.ts`) protecting `/app/**`
- [x] Set up Clerk organization creation & switcher (`<OrganizationSwitcher />`)
- [x] Clerk UI components:
  - [x] `/sign-in/[[...sign-in]]/page.tsx` with `<Suspense>`
  - [x] `/sign-up/[[...sign-up]]/page.tsx` with `<Suspense>`
  - [x] Header: `<OrganizationSwitcher />` + `<UserButton />`
- [x] Clerk webhook handler (`/api/webhooks/clerk`):
  - [x] Verify SVIX signature
  - [x] `user.created` / `user.updated` → upsert `users` table
  - [x] `organization.created` / `organization.updated` → upsert `organizations` table
  - [x] `organizationMembership.created` / `.updated` / `.deleted` → upsert/delete `memberships`
- [x] `requireOrgRole(minRole)` in `src/lib/auth.ts`:
  - [x] Clerk session → `clerkUserId`, `clerkOrgId`, `clerkRole`
  - [x] Look up `users WHERE clerk_user_id = ?` → **if missing**, fetch from Clerk API and INSERT (D-004)
  - [x] Look up `organizations WHERE clerk_org_id = ?` → **if missing**, fetch from Clerk API and INSERT (D-004)
  - [x] Look up `memberships` → **if missing**, INSERT with role from Clerk session (D-004)
  - [x] Return `{ userId: users.id, orgId: organizations.id, role }` (all internal UUIDs per D-003)
  - [x] Throw 401 if no session; throw 403 if role < minRole

### Tenant Isolation Test Suite
- [x] `tests/integration/tenant-isolation.test.ts`:
  - [x] Multi-tenant cross-org intrusion checks for `grants` and `reports` repositories
  - [x] Call with `orgA.id` + resource ID from Org B → assert returns `null` or throws `NotFoundError`
  - [x] Assert list functions called with `orgA.id` never return Org B resources
  - [x] 8/8 tenant isolation tests passing (100% green)

**Acceptance:** Sign-in & sign-up routes operational; tenant isolation tests pass; Next.js 16 Partial Prerendering production build clean.

---

## Phase 2 — Grants & Reports Core
> **Goal:** full manual flow works; readiness calculation tested.

### Grants
- [x] Repository: `grants.ts` (list with pagination, get, create, update, soft-delete)
- [x] Grants list page (search by name/funder, filter by status, cursor pagination)
- [x] Grant create/edit form (Zod validation, `award_amount` optional numeric)
- [x] Grant detail page with tabs: Overview, Reports, Documents (empty stub), Activity
- [x] Activity log writes on grant create / update / delete

### Reports
- [x] Repository: `reports.ts` (list, get, create, update, soft-delete)
- [x] Report create form (under a grant)
- [x] Report detail page: requirements checklist, status workflow, notes field, activity timeline
- [x] Status transitions: `draft → submitted → approved`
- [x] Mark submitted: store `submitted_at`, `submitted_by`
- [x] Readiness calculation function in `src/lib/reports/readiness.ts`:
  - [x] `(provided + verified) / total` — returns `0` (not `NaN`) when `total === 0`

### Requirements & Assignments
- [x] Repository: `requirements.ts`:
  - [x] CRUD + reorder (`sort_order`)
  - [x] `syncRequirementStatus(orgId, requirementId)` — enforces auto-status rules
- [x] Add / edit / delete / reorder requirements within a report
- [x] Assign to team member (dropdown from org members via `src/lib/repositories/members.ts`)
- [x] Per-item internal due date (default: `report.due_date - 7 days`)
- [x] Status display: `open → provided → verified`; `verified` only settable by admin (D-007)

### Dashboard v1
- [x] Upcoming reports list grouped: Overdue / 7 days / 30 days (using org timezone)
- [x] Readiness meter per report & overall portfolio
- [x] "Needs my attention" panel (current user's assigned items)
- [x] Org stats (active grants count, reports due in 30 days, % ready)

### Plan Limits Wired Up
- [x] `checkPlanLimits` queries real DB counts before create actions
- [x] Grant creation blocked when `activeGrants >= plan.maxActiveGrants`
- [x] Safe mock overrides supported for isolated unit tests

### Seed Script
- [x] `scripts/seed.ts`: 1 demo org, 6 grants, 10 reports, realistic requirements + evidence (`npm run db:seed`)

### Tests
- [x] Unit: `readiness([], []) === 0` (no NaN) (`tests/unit/readiness.test.ts`)
- [x] Unit: `readiness([provided, verified], [open]) === 2/3` (`tests/unit/readiness.test.ts`)
- [x] Unit: requirement auto-status transitions (first evidence → provided; all removed → open) (`tests/integration/requirements.test.ts`)
- [x] Integration: grants & reports CRUD is org-scoped (`tests/integration/tenant-isolation.test.ts`)
- [x] 22/22 unit and integration tests passing (100% green)

**Acceptance:** full manual flow; readiness calculation unit-tested; seed runs cleanly.

---

## Phase 3 — Evidence & Files
> **Goal:** cross-tenant file access impossible (tested).

### R2 Integration
- [ ] R2 client in `src/lib/storage/r2.ts` (AWS SDK v3 S3 client pointed at R2 endpoint)
- [ ] `generatePresignedPutUrl(key, contentType, maxBytes)` helper
- [ ] `generatePresignedGetUrl(key, ttlSeconds)` helper
- [ ] `headObject(key)` helper (returns `{ contentLength, contentType }`)
- [ ] `deleteObject(key)` helper

### Upload Flow
- [ ] Presigned upload endpoint `POST /api/upload/presign`:
  - [ ] `requireOrgRole("member")`
  - [ ] Validate: `grantId` belongs to org, `kind` is valid enum, `filename` non-empty, `contentType` on allow-list, `declaredSize ≤ 25 MB`
  - [ ] Key: `org/{orgId}/grants/{grantId}/docs/{newDocId}/{sanitized-filename}`
  - [ ] Write `grant_documents` row with `upload_status = 'pending'`
  - [ ] Return `{ presignedUrl, docId }`
- [ ] Upload confirm endpoint `POST /api/upload/confirm`:
  - [ ] `requireOrgRole("member")`
  - [ ] Verify `docId.organizationId === orgId`
  - [ ] HEAD R2 object → verify `Content-Length ≤ 25 MB` and `Content-Type` on allow-list
  - [ ] If invalid: DELETE from R2, DELETE DB row, return 422
  - [ ] If valid: UPDATE `grant_documents SET upload_status = 'uploaded'`
- [ ] Signed download endpoint `GET /api/download/[docId]`:
  - [ ] `requireOrgRole("member")`
  - [ ] Verify `doc.organizationId === orgId` (403 if not)
  - [ ] Generate 5-minute presigned GET URL
  - [ ] Return URL (client redirects)
- [ ] Cleanup Inngest job `storage/cleanup-pending` (hourly):
  - [ ] Delete `grant_documents WHERE upload_status = 'pending' AND created_at < now() - 24h`
  - [ ] Attempt R2 DELETE for each before DB delete

### Evidence Repository & UI
- [ ] Repository: `evidence.ts` (create, list, soft-delete)
- [ ] After create: call `syncRequirementStatus(orgId, requirementId)` if `requirementId` set
- [ ] After soft-delete: call `syncRequirementStatus` if `requirementId` set
- [ ] Evidence types: file, link, text, metric
- [ ] Evidence UI: drag-and-drop upload, link paste, text note, metric entry
- [ ] Simple preview: `<img>` for images; PDF iframe embed for PDFs
- [ ] Admin verify button: `provided → verified` (role check in server action)

### Tests
- [ ] Integration: Org A cannot call `/api/download/:docId` for Org B's document (expect 403)
- [ ] Integration: Org A `evidence.ts` list returns empty for Org B's report
- [ ] Integration: file type rejection (`.exe` → 422)
- [ ] Integration: oversized file rejection (> 25 MB declared → presign returns 422; HEAD verify catches bypass attempts)
- [ ] Integration: `syncRequirementStatus` transitions correctly
- [ ] Update `tenant-isolation.test.ts` to cover evidence + grant_documents repositories

**Acceptance:** cross-tenant file access impossible in tests; upload flow end-to-end verified locally.

---

## Phase 4 — Reminders & Emails
> **Goal:** simulated clock tests send right emails exactly once.

### Inngest & Resend Setup
- [ ] Inngest client (`src/lib/inngest/client.ts`)
- [ ] Inngest route handler `/api/webhooks/inngest` (verify signature)
- [ ] Resend client wrapper (`src/lib/email/client.ts`)

### React Email Templates
- [ ] `reminder.tsx` — subject, due date, item title, org name, deep link button
- [ ] `weekly-digest.tsx` — overdue count, upcoming list, deep link to dashboard
- [ ] `invitation.tsx` — placeholder (used in Phase 1 settings)
- [ ] `export-ready.tsx` — placeholder (used in Phase 6)
- [ ] `ai-review-ready.tsx` — placeholder (used in Phase 5)

### Hourly Reminder Job
- [ ] Inngest function `reminders/hourly` (cron: `0 * * * *`):
  - [ ] Fetch all active orgs with `reminder_rules`
  - [ ] For each org: compute local time from `org.timezone + UTC now`
  - [ ] Skip if local hour ≠ 9
  - [ ] Compute org's local date; query reports + requirements matching `days_before` thresholds or overdue
  - [ ] Per item per recipient: query `reminder_log` by `(target_type, target_id, user_id, days_before)` — skip if found
  - [ ] Send email via Resend → INSERT `reminder_log` row
  - [ ] If local day = Monday → send weekly digest to admins (same dedup)

### Reminder Rules UI
- [ ] Settings page: edit `days_before` array, toggle `notify_assignees`, `notify_admins`

### Tests
- [ ] Unit: `getOrgsAtLocalNine(utcNow, allOrgs)` — returns only orgs where local hour = 9
- [ ] Unit: `computeDaysUntilDue(localDate, dueDate)` — handles past dates (negative = overdue)
- [ ] Unit: reminder scheduling — given days_before `[30,14,7,1]`, correct days trigger
- [ ] Integration (simulated clock): run hourly job at UTC times that correspond to 09:00 in two different orgs with different timezones; verify each org's reminders sent at the right time and not duplicated
- [ ] Integration: dedup — calling job twice at the same UTC hour sends each email exactly once (partial unique index tested)

**Acceptance:** simulated clock integration tests pass; each reminder sent exactly once.

---

## Phase 5 — AI Agreement Review
> **Goal:** fixtures produce expected suggestions; malformed AI output handled; nothing becomes a real deadline without human confirmation.

- [ ] Anthropic SDK installed (`@anthropic-ai/sdk`)
- [ ] Claude client wrapper `src/lib/ai/claude.ts` — reads model from `env.ANTHROPIC_MODEL`
- [ ] Zod schema `src/lib/ai/extract-schema.ts` for AI output validation
- [ ] Claude prompt `src/lib/ai/prompts.ts` — constraints documented
- [ ] Inngest function `ai/extract-agreement`:
  - [ ] **Step 1 `validate-limits`:** check `ai_usage` for current month; check PDF page count; block if over quota or page limit; pass only `docId` between steps (not file bytes)
  - [ ] **Step 2 `extract`:** fetch storage key from DB; download PDF from R2; upload to Anthropic Files API; send message with `file_id`; validate Zod schema; retry once on malformed
  - [ ] **Step 3 `store-results`:** write `ai_suggestions` rows; upsert `ai_usage`; update `grant_documents.ai_status`; emit `ai-review-ready` notification
  - [ ] Graceful failure: if page/size limit exceeded or both attempts fail → `ai_status = 'failed'`, notify user
- [ ] Review UI:
  - [ ] List `ai_suggestions WHERE grant_document_id = ? AND status = 'suggested'`
  - [ ] Each row: suggestion details + `source_excerpt` + `source_page` + confidence badge
  - [ ] Per-row: Accept / Edit / Reject buttons
  - [ ] Bulk accept all button
  - [ ] Persistent AI disclaimer banner (cannot be dismissed)
- [ ] Accept flow (server action):
  - [ ] `requireOrgRole("admin")` (only admins can accept AI suggestions)
  - [ ] Create `reports` row (source: `ai_confirmed`)
  - [ ] Create `requirements` rows (source: `ai_confirmed`)
  - [ ] Update `ai_suggestions.status = 'accepted'`, `resolved_by`, `resolved_at`
  - [ ] Log activity
- [ ] Reject flow: update `ai_suggestions.status = 'rejected'` only — no reports/requirements created
- [ ] `fixtures/agreements/`:
  - [ ] `sample-award-letter.txt` — fake grant agreement text
  - [ ] `sample-award-letter.expected.json` — expected Zod-validated output
  - [ ] `sample-complex-reporting.txt` — multiple report obligations, relative dates
- [ ] `fixtures/mock-claude.ts` — returns fixture output for given input hash

### Tests
- [ ] Unit: Zod schema rejects missing `title` field (malformed AI output)
- [ ] Unit: Zod schema rejects invented absolute date when rule text is present
- [ ] Unit: `sample-award-letter.txt` → mock Claude → matches `.expected.json`
- [ ] Integration: no `reports` or `requirements` row created until human accepts
- [ ] Integration: over-limit blocks Inngest step 1 (job fails gracefully)
- [ ] Integration: malformed output → retry → still malformed → `ai_status = 'failed'`

**Acceptance:** all Phase 5 tests pass; review UI functional; human confirmation required.

---

## Phase 6 — Export Pack *(Deferred)*
> Build after Phase 8-lite if time permits.

- [ ] Implement `export/generate-report-pack` Inngest function
- [ ] PDF generation (`pdf-lib` or `@react-pdf/renderer`)
- [ ] ZIP assembly (`archiver`)
- [ ] CSV generation
- [ ] `export_jobs` status updates
- [ ] Signed 24-hour download URL
- [ ] `export-ready.tsx` email template wired up
- [ ] Tests: ZIP structure, CSV correctness

---

## Phase 7 — Billing Adapter *(Deferred)*
> Build after Phase 8-lite if time permits.

- [ ] `LemonSqueezyAdapter` implementing `BillingProvider`
- [ ] Checkout flow (redirect to Lemon Squeezy hosted checkout)
- [ ] Customer portal link
- [ ] Billing webhook handler `/api/webhooks/billing`:
  - [ ] Verify Lemon Squeezy signature
  - [ ] Handle `subscription_created`, `subscription_updated`, `subscription_cancelled`, `subscription_expired`
  - [ ] Update `organizations.subscription_status` and `plan` (idempotent)
- [ ] Tests:
  - [ ] Webhook signature verification (valid + tampered)
  - [ ] Replay same event twice → no double update
  - [ ] Subscription cancel → plan = trial, read-only mode

---

## Phase 8-lite — Polish & Launch Readiness
> **Goal:** Playwright E2E green; launch checklist complete.

### Marketing Pages
- [ ] Landing page (hero, features, social proof, CTA)
- [ ] Pricing page (plan cards, FAQ)
- [ ] Privacy policy placeholder (`/privacy`)
- [ ] Terms of service placeholder (`/terms`)

### Empty / Loading / Error States
- [ ] Skeleton loaders for all list pages (grants, reports, requirements, evidence)
- [ ] Empty states with helpful CTAs
- [ ] Error boundaries on all major page sections
- [ ] Toast notifications (success, error)

### Accessibility
- [ ] Keyboard navigation audit
- [ ] ARIA labels on icon buttons, form fields, modals
- [ ] Focus management on modals and drawers
- [ ] Color contrast check (WCAG AA minimum)

### Performance
- [ ] Server components for all read-only views
- [ ] Streaming / Suspense for slow queries
- [ ] Pagination verified on all list pages
- [ ] `next/image` for any images

### Security Review
- [ ] Every route handler and server action calls `requireOrgRole()` — audit pass
- [ ] CSP headers configured in `next.config.ts`
- [ ] Rate limiting on upload and AI endpoints verified
- [ ] All user-rendered content sanitized
- [ ] Webhook signatures verified (Clerk ✓; billing — Phase 7)

### Analytics
- [ ] PostHog client installed (`posthog-js`)
- [ ] Events fired: `signup`, `first_grant`, `first_report`, `first_evidence`, `report_ready`, `export_generated`

### Documentation
- [ ] `docs/launch-checklist.md` completed
- [ ] `docs/privacy-notes.md` completed
- [ ] `docs/decisions.md` up to date through Phase 8

### E2E Tests (Playwright)
- [ ] Flow 1: sign up → create grant → add report → add requirements → assign → upload evidence → mark ready
- [ ] Flow 2: upload agreement → AI review screen → accept suggestions → verify reports created
- [ ] CI runs Playwright against Vercel preview deploy

**Acceptance:** Playwright tests green; launch checklist completed.

---

## Cross-Cutting (All Phases)
- [ ] `docs/decisions.md` updated after each phase
- [ ] `TODO.md` updated after each phase
- [ ] Conventional commits on every logical unit
- [ ] ESLint + Prettier + `tsc --noEmit` green before each phase merge
