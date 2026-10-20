# GrantGrip — MVP Product Specification

> **Version:** 0.2 (post-review amendments applied)
> **Last updated:** 2026-10-20

---

## 1. Product Overview

GrantGrip is a B2B SaaS **Grant Reporting Workspace** for small US nonprofits (community charities, arts orgs, after-school programs) with roughly 5–30 active grants and no dedicated compliance staff.

### Core Promise

> "Everything needed to report on a grant, in one place. No missed deadlines, no missing documents."

### Target User

- Executive directors, program managers, or part-time grant writers at small nonprofits
- 1–15 team members collaborating on collecting evidence, writing narratives, and submitting reports
- Currently using spreadsheets, email threads, and shared drives

### Out of Scope for v1

- Grant discovery / search
- Federal grant accounting
- Payroll allocation
- Audit compliance (2 CFR 200)
- Financial integrations (QuickBooks, Sage, etc.)
- Automatic report submission to funders
- Mobile native apps
- SSO / SAML enterprise auth

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| Framework | Next.js (latest stable, App Router) + TypeScript strict mode |
| Styling | Tailwind CSS v4 + shadcn/ui (confirmed: shadcn fully supports Tailwind v4) |
| Database | PostgreSQL (**Neon**) via Drizzle ORM + drizzle-kit migrations |
| Auth & Multi-tenancy | Clerk (Clerk Organizations for org isolation, roles) |
| File Storage | Cloudflare R2 (S3-compatible, private bucket, signed URLs only) |
| Background Jobs | Inngest |
| Email | Resend + React Email templates |
| AI Extraction | Anthropic Claude API (official SDK); model from `ANTHROPIC_MODEL` env var |
| Billing | `BillingProvider` interface (Lemon Squeezy adapter deferred to Phase 7) |
| Validation | Zod everywhere (forms, server actions, API inputs, AI output) |
| Testing | Vitest (unit/integration) + Playwright (E2E) |
| Monitoring | Sentry |
| Analytics | PostHog |
| Deployment | Vercel |

---

## 3. Non-Negotiable Engineering Rules

### 3.1 Multi-Tenancy
- Every tenant-owned table has an `organization_id` column
- **`orgId` is always the internal `organizations.id` UUID** — never the Clerk org ID string
- `requireOrgRole()` is the single place that resolves the Clerk org ID → internal UUID
- All repository functions accept only the internal UUID `orgId` — never a Clerk ID
- Every query **must** filter by the current organization
- Never query tenant tables directly from components or route handlers

### 3.2 Authorization
- Check **authentication + organization membership + role** on every server action and route handler
- Roles: `admin` (full access, billing, invites) and `member` (work on assigned items, upload evidence)
- Reusable `requireOrgRole(minRole)` helper returns `{ userId: string, orgId: string, role }` where `orgId` is the internal UUID
- **JIT upsert:** if the `users`, `organizations`, or `memberships` row is missing (Clerk webhook not yet delivered), `requireOrgRole()` fetches from the Clerk API and upserts the missing rows before proceeding; this is the only place Clerk data is fetched on-demand

### 3.3 Input Validation
- Validate all inputs with Zod on the server — never trust client data

### 3.4 Secrets
- All secrets in environment variables, validated at startup with `@t3-oss/env-nextjs`
- Provide `.env.example`; never commit secrets

### 3.5 File Handling
- Private R2 bucket; uploads via presigned URL; downloads via short-lived signed URL after an authorization check
- Allowed types: PDF, DOCX, XLSX, CSV, PNG, JPG; max **25 MB**
- Object key prefix: `org/{orgId}/...` where `orgId` is the internal UUID; key and metadata stored in DB, scoped by organization
- On upload confirmation: server performs a HEAD request to R2, verifies `Content-Length` ≤ 25 MB and `Content-Type` is on the allow-list; if invalid, the object is deleted from R2 and the DB row is removed

### 3.6 AI Safety
- AI output is a **suggestion, never a fact**
- Every AI-extracted item stored with status `suggested`
- Requires explicit human confirmation before becoming a real deadline/requirement or triggering reminders
- Always store the source excerpt (and page number if available) for each suggestion

### 3.7 Auditability
- Write an `activity_logs` row for: create, update, delete, confirm, submit actions on grants, reports, requirements, assignments, and evidence

### 3.8 Soft Delete
- Grants, reports, and evidence use `deleted_at`
- Hard delete only through an explicit "delete organization data" flow

### 3.9 Idempotency
- Background jobs and webhooks must be idempotent
- Verify webhook signatures on all incoming webhooks

### 3.10 Inngest Step Data Rule
- Between Inngest steps, pass only **storage keys or IDs** — never raw file byte contents
- File contents are fetched within the step that needs them

### 3.11 Accessibility & UX
- Keyboard navigable, proper ARIA labels
- Loading, empty, and error states on every screen
- Mobile-responsive layouts

### 3.12 Code Quality
- Small modules, no dead code, meaningful names, no `any`
- ESLint + Prettier + `tsc --noEmit` must pass in CI

### 3.13 Dates & Timezones
- All timestamps stored in UTC
- Due dates stored as `DATE` (no time) plus the organization's timezone setting
- Render dates in the organization's configured timezone
- "Overdue" and "due in N days" computed using the organization's **local date**, not UTC

---

## 4. Data Model

All tables: `id` (UUID PK), `created_at`, `updated_at`. Tenant tables also have `organization_id` (FK → `organizations.id` internal UUID).

### 4.1 `organizations`
| Column | Type | Notes |
|---|---|---|
| clerk_org_id | text | unique — used only for Clerk webhook sync; never passed to repositories |
| name | text | |
| timezone | text | default `America/New_York` |
| plan | enum | `trial\|starter\|team\|plus` |
| trial_ends_at | timestamptz | |
| billing_customer_id | text | nullable |
| billing_subscription_id | text | nullable |
| subscription_status | text | nullable |

### 4.2 `users`
| Column | Type |
|---|---|
| clerk_user_id | text (unique) |
| email | text |
| name | text |

### 4.3 `memberships`
| Column | Type |
|---|---|
| organization_id | FK → organizations |
| user_id | FK → users |
| role | enum `admin\|member` |

> Mirror Clerk; sync via webhook. JIT-upserted in `requireOrgRole()` if webhook is delayed.

### 4.4 `grants`
| Column | Type | Notes |
|---|---|---|
| organization_id | FK | |
| funder_name | text | |
| grant_name | text | |
| award_amount | numeric | nullable |
| currency | text | default `USD` |
| start_date | date | |
| end_date | date | |
| status | enum | `active\|completed\|closed` |
| owner_user_id | FK → users | nullable |
| notes | text | nullable |
| deleted_at | timestamptz | nullable |

### 4.5 `grant_documents`
| Column | Type | Notes |
|---|---|---|
| organization_id | FK | |
| grant_id | FK → grants | |
| storage_key | text | R2 object key |
| filename | text | |
| mime_type | text | |
| size_bytes | integer | |
| kind | enum | `agreement\|award_letter\|other` |
| uploaded_by | FK → users | |
| upload_status | enum | `pending\|uploaded` — row written at presign; set to `uploaded` after server-side R2 HEAD verification |
| ai_status | enum | `none\|processing\|ready\|failed` |

**Upload confirmation flow:**
1. Row created with `upload_status = 'pending'` at presign time
2. Client PUTs file to R2 via presigned URL
3. Client calls confirm endpoint → server HEADs the R2 object
4. If `Content-Length` > 25 MB or `Content-Type` not on allow-list → delete from R2, delete DB row, return error
5. Otherwise → set `upload_status = 'uploaded'`, record actual `size_bytes` and `mime_type`

**Cleanup:** An Inngest scheduled job deletes `pending` rows (and their R2 objects if they exist) older than 24 hours.

### 4.6 `reports`
| Column | Type | Notes |
|---|---|---|
| organization_id | FK | |
| grant_id | FK → grants | |
| title | text | |
| report_type | enum | `narrative\|financial\|combined\|other` |
| due_date | date | |
| status | enum | `not_started\|collecting\|ready\|submitted` |
| submitted_at | timestamptz | nullable |
| submitted_by | FK → users | nullable |
| source | enum | `manual\|ai_confirmed` |
| deleted_at | timestamptz | nullable |

### 4.7 `requirements`
| Column | Type | Notes |
|---|---|---|
| organization_id | FK | |
| report_id | FK → reports | |
| title | text | |
| description | text | nullable |
| kind | enum | `document\|metric\|narrative\|financial\|photo\|other` |
| status | enum | `open\|provided\|verified` |
| assignee_user_id | FK → users | nullable |
| due_date | date | defaults to report due_date − 7 days |
| source | enum | `manual\|ai_confirmed` |
| sort_order | integer | for reordering |

**Automatic status transitions (enforced in the data-access layer):**
- When the **first** evidence item is attached to a requirement → `open → provided` (if currently `open`)
- When **all** evidence items for a requirement are soft-deleted → `provided → open` (if currently `provided`)
- `verified` may **only** be set by an `admin` role user; never set automatically
- These rules apply regardless of whether the requirement was manually created or AI-confirmed

### 4.8 `evidence`
| Column | Type | Notes |
|---|---|---|
| organization_id | FK | |
| requirement_id | FK → requirements | nullable |
| report_id | FK → reports | |
| type | enum | `file\|link\|text\|metric` |
| title | text | |
| storage_key | text | nullable |
| external_url | text | nullable |
| text_value | text | nullable |
| metric_name | text | nullable |
| metric_value | numeric | nullable |
| metric_unit | text | nullable |
| uploaded_by | FK → users | |
| deleted_at | timestamptz | nullable |

### 4.9 `ai_suggestions`
| Column | Type | Notes |
|---|---|---|
| organization_id | FK | |
| grant_document_id | FK → grant_documents | |
| suggestion_type | enum | `report\|requirement` |
| payload | jsonb | |
| source_excerpt | text | |
| source_page | integer | nullable |
| confidence | enum | `low\|medium\|high` |
| status | enum | `suggested\|accepted\|edited\|rejected` |
| resolved_by | FK → users | nullable |
| resolved_at | timestamptz | nullable |

### 4.10 `reminder_rules`
| Column | Type | Notes |
|---|---|---|
| organization_id | FK (unique) | one per org |
| days_before | int[] | default `{30,14,7,1}` |
| notify_assignees | boolean | default true |
| notify_admins | boolean | default true |

### 4.11 `reminder_log`
| Column | Type | Notes |
|---|---|---|
| organization_id | FK | |
| target_type | text | `'report'` or `'requirement'` |
| target_id | UUID | the report or requirement ID |
| user_id | FK → users | |
| days_before | integer | |
| sent_at | timestamptz | |

> **Deduplication via two partial unique indexes** (a single nullable composite unique constraint does not prevent duplicates in Postgres):
> ```sql
> CREATE UNIQUE INDEX reminder_log_report_dedup
>   ON reminder_log (target_id, user_id, days_before)
>   WHERE target_type = 'report';
>
> CREATE UNIQUE INDEX reminder_log_requirement_dedup
>   ON reminder_log (target_id, user_id, days_before)
>   WHERE target_type = 'requirement';
> ```
> Before sending, the job queries for an existing row matching `(target_type, target_id, user_id, days_before)` and skips if found.

### 4.12 `activity_logs`
| Column | Type |
|---|---|
| organization_id | FK |
| actor_user_id | FK → users |
| entity_type | text |
| entity_id | UUID |
| action | text |
| metadata | jsonb |

### 4.13 `ai_usage`
| Column | Type | Notes |
|---|---|---|
| organization_id | FK | |
| month | text | `YYYY-MM` format |
| input_tokens | integer | cumulative for month |
| output_tokens | integer | cumulative for month |
| request_count | integer | cumulative for month |
| cost_estimate_usd | numeric(10,6) | updated on each job completion |

> Unique on `(organization_id, month)`. Upserted via `INSERT … ON CONFLICT DO UPDATE`.

### 4.14 `export_jobs`
| Column | Type | Notes |
|---|---|---|
| organization_id | FK | |
| report_id | FK → reports | |
| requested_by | FK → users | |
| status | enum | `pending\|processing\|ready\|failed` |
| storage_key | text | nullable — R2 key of final ZIP |
| expires_at | timestamptz | nullable — when the signed URL expires (24 h after generation) |
| error | text | nullable — error message if failed |

### Indexes
- `(organization_id, due_date)` on `reports`, `requirements`
- `(organization_id, status)` on `grants`, `reports`, `requirements`
- FK indexes on all foreign key columns
- Partial unique indexes on `reminder_log` (see §4.11)

---

## 5. Screens & Features

### 5.1 Auth & Onboarding
- Sign up / sign in via Clerk
- Create organization → set timezone → optional "add your first grant" wizard
- 14-day trial, no card required

### 5.2 Dashboard
- **Upcoming reports** grouped: Overdue / Due in 7 days / Due in 30 days / Later (computed in org's local timezone)
- **Readiness meter** per report = `(verified + provided) / total requirements`; returns `0` when `total === 0`
- **"Needs my attention"** panel — items assigned to current user
- **Org-level stats:** active grants count, reports due in 30 days, % ready

### 5.3 Grants
- List: search by name/funder, filter by status/funder
- Create / edit form
- Detail tabs: Overview, Reports, Documents, Activity

### 5.4 Reports
- Create under a grant
- Detail: requirements checklist, assignees, evidence per requirement, status workflow, notes field, activity timeline
- Mark as ready / submitted (manual; user enters submission date)

### 5.5 Requirements & Assignments
- Add / edit / reorder within a report
- Assign to team member; per-item internal due date (default: report due_date − 7 days)
- Status: `open → provided → verified`
  - `provided` is **automatically set** when the first evidence item is attached (data-access layer, not UI)
  - `open` is **automatically restored** if all evidence items are soft-deleted (data-access layer)
  - `verified` may **only** be set by an `admin`; never set automatically
- Assignee sees item in "Needs my attention"

### 5.6 Evidence Collection
- File upload (drag-and-drop → R2 presigned PUT → server confirm with HEAD verification)
- Link paste (plain URL)
- Text note
- Metric (name, value, unit)
- Simple preview for images and PDFs
- Admin verification: `provided → verified`

### 5.7 Agreement AI Review
1. User uploads PDF (max 25 MB) via R2 presigned URL; server-side HEAD verification on confirm
2. Inngest job `ai/extract-agreement`:
   - Receives the `grant_documents.id` (storage key resolved inside the step — not between steps)
   - Uploads PDF to Anthropic Files API, references by `file_id` in the message
   - **Claude model:** read from `ANTHROPIC_MODEL` env var (default: `claude-sonnet-4-5`)
   - **PDF limits (from official Anthropic docs):** ≤ 100 pages for 200k-context models, ≤ 600 pages for 1M-context models; 32 MB total request payload. Violations trigger the graceful failure path immediately
3. Claude returns structured JSON: `{title, report_type, due_date|null, rule_text|null, required_items[], source_excerpt, source_page, confidence}`
4. Zod validation → retry once on malformed → mark `grant_documents.ai_status = 'failed'`
5. **Graceful failure path:** if the PDF exceeds page/size limits, or both extraction attempts fail, `ai_status` is set to `'failed'` and the user sees: *"Automatic extraction failed — please add your reporting requirements manually."* The document remains in the system
6. Review UI: suggestion + source excerpt side-by-side; Accept / Edit / Reject; bulk accept; confidence badge
7. Accepted → create real `reports` + `requirements` (source: `ai_confirmed`); rejected → logged only in `ai_suggestions`
8. Persistent disclaimer: *"AI suggestions can be wrong. Please verify every date and requirement against your agreement."*
9. Track per-org monthly usage in `ai_usage`; enforce plan AI quotas (job blocked if over quota)

### 5.8 Reminders (Hourly Inngest Job)
The reminder job runs every hour. Each execution:
1. Queries all organizations where the current UTC instant corresponds to **09:00 local time** (within a ±30 min window) in the org's `timezone`
2. For each qualifying organization, computes "overdue" and "due in N days" using the **org's local date** (not UTC)
3. For each report / requirement matching `reminder_rules.days_before` with non-final status, checks `reminder_log` for `(target_type, target_id, user_id, days_before)` — skips if found
4. Sends email to assignees and/or admins per `reminder_rules`; writes `reminder_log` row after each send
5. Deep link to item included in every email body

**Weekly digest:** same hourly job also checks if today is **Monday** in the org's local timezone; if so, sends the admin weekly digest (deduped same way).

### 5.9 Report Preparation Pack Export (Background Job)
ZIP contains:
- **(a)** PDF summary (grant info, due date, requirements, status, assignees, evidence list, metrics table)
- **(b)** All uploaded evidence files (organized folder structure)
- **(c)** CSV of evidence and metrics

Export tracked in `export_jobs` table. Background job passes only storage keys between steps. Signed download link expires in **24 hours**; emailed and shown in UI.

### 5.10 Team & Settings
- Invite members (Clerk)
- Change roles, remove members
- Org settings: timezone, reminder defaults
- Data export request
- Delete organization (hard delete with confirmation)

### 5.11 Billing
**Plans (configurable constants in `src/lib/billing/plans.ts`):**

| Plan | Price/mo | Users | Active Grants | AI Quota |
|---|---|---|---|---|
| Starter | $29 | 1 | 10 | Standard |
| Team | $59 | 5 | 30 | Standard |
| Plus | $99 | 15 | 100 | Higher |

- `BillingProvider` interface defined in Phase 0; plan constants and limit enforcement built in Phases 0–2
- Lemon Squeezy adapter (checkout, portal, webhook) **deferred to Phase 7**
- Gate creation actions when over limits or trial expired → read-only mode (no data loss ever)

### 5.12 Marketing Pages
- Landing page, pricing page, privacy policy placeholder, terms placeholder, sign-up CTA

---

## 6. Non-Functional Requirements

- Server components, streaming, pagination (cursor-based) for all lists
- Rate limiting on AI endpoints and uploads (Upstash Ratelimit or DB-based counter)
- Security headers, CSP, CSRF-safe server actions, sanitize rendered user content
- Restore procedure documented in README
- Data flows documented in `docs/privacy-notes.md`

---

## 7. Testing

| Layer | Scope |
|---|---|
| Unit (Vitest) | Due-date math, readiness calc, reminder scheduling logic, limit enforcement, AI Zod schema |
| Integration (Vitest) | Tenant isolation, role checks, webhook signature verification |
| E2E (Playwright) | Full grant→report→evidence→ready flow; AI review flow |

**Readiness calculation rule:** `readiness = (provided + verified) / total`. When `total === 0`, return `0` (not `NaN`). Explicit unit test required.

**Tenant isolation test suite** (`tests/integration/tenant-isolation.test.ts`):
- Creates Org A and Org B with separate users
- Runs **every repository function** that reads or mutates tenant data with an Org A actor trying to access Org B records
- Asserts all such calls return `null`, `[]`, or throw `NotFoundError` — never Org B's data

Mocked Claude client (`fixtures/mock-claude.ts`) used in all tests; `fixtures/agreements/` contains 2–3 fake grant agreement texts with expected extraction output.

---

## 8. PostHog Events

`signup`, `first_grant`, `first_report`, `first_evidence`, `report_ready`, `export_generated`

---

## 9. Phases & Build Order

See `TODO.md` for detailed checklist.

**Revised build order:**

| Phase | Focus | Status |
|---|---|---|
| 0 | Foundation (repo, tooling, full schema, CI) | Build now |
| 1 | Auth & tenancy (Clerk, requireOrgRole + JIT upsert, isolation tests) | Build now |
| 2 | Grants & reports core (CRUD, assignments, dashboard, seed) | Build now |
| 3 | Evidence & files (R2, presigned URLs, HEAD verify, cleanup job, isolation tests) | Build now |
| 4 | Reminders & emails (hourly Inngest job, React Email, org-local-time, dedup) | Build now |
| 5 | AI agreement review (Claude via Files API, Zod, review UI, usage tracking) | Build next |
| 6 | Export pack (PDF + ZIP + CSV job, export_jobs table) | **Deferred** |
| 7 | Billing & limits (Lemon Squeezy adapter, checkout, portal, webhooks) | **Deferred** |
| 8-lite | Polish & launch (marketing pages, a11y, security review, PostHog, Playwright E2E) | After Phase 5 |

> **Billing note:** `BillingProvider` interface, plan constants (`src/lib/billing/plans.ts`), and limit enforcement (`src/lib/billing/limits.ts`) are built during Phase 0–2 to gate creation actions. The Lemon Squeezy checkout/portal/webhook adapter is deferred to Phase 7.
