# GrantGrip — Architecture

> **Version:** 0.2 (post-review amendments applied)

---

## 1. High-Level Overview

```
Browser / Vercel Edge
        │
        ▼
┌─────────────────────────────────────────┐
│          Next.js App Router             │
│  ┌──────────────┐  ┌─────────────────┐  │
│  │ Server Comps │  │  Route Handlers │  │
│  │  (RSC / SSR) │  │  /api/webhooks  │  │
│  └──────┬───────┘  └───────┬─────────┘  │
│         │  Server Actions  │            │
│  ┌──────▼──────────────────▼─────────┐  │
│  │        Data Access Layer          │  │
│  │  (repository fns, requireOrgRole) │  │
│  └────────────────┬──────────────────┘  │
└───────────────────┼─────────────────────┘
                    │
        ┌───────────┼───────────────┐
        ▼           ▼               ▼
   PostgreSQL    Clerk Auth     Inngest Jobs
   (Drizzle)    (Webhooks)     (Background)
                                    │
                    ┌───────────────┼──────────┐
                    ▼               ▼          ▼
               Resend Email    Claude API   R2 Storage
```

---

## 2. Repository Structure

```
grantgrip/
├── src/
│   ├── app/                        # Next.js App Router
│   │   ├── (auth)/                 # Clerk sign-in/up routes
│   │   ├── (marketing)/            # Public landing, pricing, legal
│   │   ├── (app)/                  # Authenticated app shell
│   │   │   ├── dashboard/
│   │   │   ├── grants/
│   │   │   ├── grants/[grantId]/
│   │   │   ├── grants/[grantId]/reports/[reportId]/
│   │   │   ├── settings/
│   │   │   └── billing/
│   │   └── api/
│   │       ├── webhooks/
│   │       │   ├── clerk/          # Membership sync
│   │       │   ├── billing/        # Lemon Squeezy / Paddle (Phase 7)
│   │       │   └── inngest/        # Inngest event delivery
│   │       └── upload/             # Presigned URL generation + confirm
│   │
│   ├── components/
│   │   ├── ui/                     # shadcn/ui re-exports
│   │   └── [feature]/              # Feature-specific components
│   │
│   ├── lib/
│   │   ├── auth.ts                 # requireOrgRole, getCurrentUser, JIT upsert
│   │   ├── db/
│   │   │   ├── schema.ts           # Drizzle schema (single source of truth)
│   │   │   ├── migrations/         # drizzle-kit output
│   │   │   └── index.ts            # db client singleton
│   │   ├── repositories/           # Data-access layer (all accept orgId UUID)
│   │   │   ├── grants.ts
│   │   │   ├── reports.ts
│   │   │   ├── requirements.ts     # Includes auto-status transition logic
│   │   │   ├── evidence.ts         # Triggers requirement status transitions
│   │   │   ├── organizations.ts
│   │   │   ├── users.ts
│   │   │   └── activity.ts
│   │   ├── storage/
│   │   │   ├── r2.ts               # R2 client, presign helpers, HEAD verify
│   │   │   └── types.ts
│   │   ├── ai/
│   │   │   ├── claude.ts           # Claude client wrapper (model from env)
│   │   │   ├── extract-schema.ts   # Zod schema for AI output
│   │   │   └── prompts.ts
│   │   ├── billing/
│   │   │   ├── types.ts            # BillingProvider interface
│   │   │   ├── plans.ts            # Plan constants (NOT in components)
│   │   │   └── limits.ts           # Plan limit enforcement
│   │   ├── email/
│   │   │   └── templates/
│   │   ├── inngest/
│   │   │   ├── client.ts
│   │   │   └── functions/          # One file per job
│   │   ├── env.ts                  # @t3-oss/env-nextjs typed env
│   │   └── utils.ts
│   │
│   └── types/                      # Shared TypeScript types
│
├── tests/
│   ├── unit/
│   ├── integration/
│   │   └── tenant-isolation.test.ts  # Every repo fn tested cross-org
│   └── e2e/                        # Playwright
│
├── fixtures/
│   ├── agreements/                 # Sample fake grant agreement PDFs/text
│   └── mock-claude.ts              # Mocked Claude client for tests
├── docs/
│   ├── architecture.md             # This file
│   ├── decisions.md
│   ├── future-ideas.md
│   ├── privacy-notes.md
│   └── launch-checklist.md
├── scripts/
│   └── seed.ts                     # DB seed script
├── .env.example
├── SPEC.md
├── TODO.md
└── README.md
```

---

## 3. Multi-Tenancy & Authorization Pattern

### 3.1 The `orgId` Convention

**`orgId` always refers to `organizations.id` (the internal UUID)**, never the Clerk org ID string (`org_...`).

- The Clerk org ID is stored in `organizations.clerk_org_id` and used only for webhook sync and JIT upserts
- All repository functions accept `orgId: string` where this is always the internal UUID
- The boundary where Clerk org ID → internal UUID conversion happens is `requireOrgRole()` — nowhere else

```ts
// src/lib/auth.ts (conceptual)
export async function requireOrgRole(minRole: "admin" | "member"): Promise<{
  userId: string;   // internal users.id UUID
  orgId: string;    // internal organizations.id UUID  ← always internal UUID
  role: "admin" | "member";
}>
```

### 3.2 JIT Upsert in `requireOrgRole()`

Clerk delivers membership events via webhooks, but there is always a race window on first request. `requireOrgRole()` handles this:

```
1. Get Clerk session → clerkUserId, clerkOrgId, clerkRole
2. Look up users WHERE clerk_user_id = clerkUserId
   → if missing: fetch user from Clerk API, INSERT into users
3. Look up organizations WHERE clerk_org_id = clerkOrgId
   → if missing: fetch org from Clerk API, INSERT into organizations
4. Look up memberships WHERE organization_id = org.id AND user_id = user.id
   → if missing: INSERT membership with role from Clerk session
5. Check role meets minRole → throw 403 if not
6. Return { userId: user.id, orgId: org.id, role }
```

This is the **only** place Clerk API is called synchronously on a request. Subsequent webhook delivery will be a no-op (upsert).

### 3.3 Organization Scoping

Every database query that touches tenant data **must** pass through a repository function that accepts `orgId` and filters accordingly:

```ts
// ✅ Correct
const grants = await listGrants({ orgId: "550e8400-...", status: "active" });

// ❌ Never — no Clerk IDs in repositories, no unscoped queries
const grants = await db.select().from(grantsTable);
```

### 3.4 Request Lifecycle (Server Action Example)

```
Client component calls server action
  → requireOrgRole("member")         // auth + tenancy gate → returns internal orgId
  → validateInput(schema, input)     // Zod parse (throws on failure)
  → checkPlanLimits(orgId, action)   // billing/limits.ts
  → repository.createGrant(orgId, …) // DB write, always org-scoped
  → logActivity(orgId, actor, …)     // audit log
  → return result
```

---

## 4. Data-Access Layer

All repository functions follow this pattern:

```ts
// src/lib/repositories/grants.ts
export async function getGrant(orgId: string, grantId: string) {
  return db.query.grants.findFirst({
    where: and(
      eq(grants.organizationId, orgId),   // always org-scoped
      eq(grants.id, grantId),
      isNull(grants.deletedAt)             // always exclude soft-deleted
    ),
  });
}
```

**Rules:**
- Always include `organizationId` filter
- Always exclude soft-deleted rows unless explicitly querying deleted items
- Return typed results (inferred from Drizzle schema — no `any`)
- Pagination via cursor-based approach (more resilient than offset for live data)

### 4.1 Requirement Auto-Status (enforced here, not in UI)

```ts
// Called in evidence.ts after creating or soft-deleting evidence
async function syncRequirementStatus(orgId: string, requirementId: string) {
  const evidenceCount = await countActiveEvidence(orgId, requirementId);
  const req = await getRequirement(orgId, requirementId);
  if (!req || req.status === "verified") return; // never auto-demote verified

  if (evidenceCount > 0 && req.status === "open") {
    await setRequirementStatus(orgId, requirementId, "provided");
  } else if (evidenceCount === 0 && req.status === "provided") {
    await setRequirementStatus(orgId, requirementId, "open");
  }
}
```

---

## 5. Database Schema Conventions

- UUIDs for all PKs (`gen_random_uuid()` default)
- `created_at DEFAULT now()`, `updated_at` maintained by application layer (or trigger)
- Enums defined in TypeScript via Drizzle `pgEnum`; mirrored to Postgres
- Soft delete via `deleted_at timestamptz NULL`
- All FK columns have indexes
- Composite indexes: `(organization_id, due_date)`, `(organization_id, status)`
- Partial unique indexes on `reminder_log` (see §8)

---

## 6. File Storage (Cloudflare R2)

### Upload Flow

```
1. Client → POST /api/upload/presign
   Server: requireOrgRole → validate filename/type/declared-size
   → write grant_documents row (upload_status: "pending")
   → return R2 presigned PUT URL

2. Client → PUT file directly to R2 using presigned URL

3. Client → POST /api/upload/confirm
   Server: requireOrgRole → HEAD the R2 object
   → verify Content-Length ≤ 25 MB AND Content-Type on allow-list
   → if invalid: DELETE from R2, DELETE DB row, return 422
   → if valid: UPDATE grant_documents SET upload_status = 'uploaded',
               size_bytes = actual, mime_type = actual
```

### Download Flow
```
1. Client → GET /api/download/:docId
   Server: requireOrgRole → verify doc.organizationId === orgId
   → generate R2 presigned GET URL (TTL: 5 min)
   → redirect or return URL
```

### Cleanup Job
Inngest cron (`0 * * * *` — hourly): deletes `grant_documents` rows with `upload_status = 'pending'` and `created_at < now() - interval '24 hours'`; attempts R2 DELETE for each before removing DB row.

### Key Structure
```
org/{orgId}/grants/{grantId}/docs/{docId}/{sanitized-filename}
org/{orgId}/grants/{grantId}/evidence/{evidenceId}/{sanitized-filename}
org/{orgId}/exports/{exportJobId}/report-pack.zip
```

---

## 7. Background Jobs (Inngest)

| Function | Trigger | Description |
|---|---|---|
| `ai/extract-agreement` | Event: `grant.document.uploaded` | Claude PDF extraction + Zod validation |
| `reminders/hourly` | Cron: `0 * * * *` | Org-local-time reminder dispatch |
| `storage/cleanup-pending` | Cron: `0 * * * *` | Delete stale pending upload rows |
| `export/generate-report-pack` | Event: `report.export.requested` | ZIP + PDF + CSV generation (Phase 6) |

**Inngest step data rule:** between steps, pass only storage keys or IDs. File contents are fetched inside the step that needs them.

**Idempotency:**
- Each job uses `{ idempotencyKey }` from the triggering event ID
- `reminders/hourly` checks `reminder_log` before every send (partial unique index prevents duplicates at DB level too)

---

## 8. Reminder System — Hourly Org-Local-Time Design

```
Inngest cron: every hour (0 * * * *)
│
├── For each organization:
│   │
│   ├── Compute org's current local time from org.timezone + UTC now
│   ├── Is local hour == 9 AND local minute in [0..59]?  (hourly job runs once per hour window)
│   │   └── Yes → proceed with daily reminder check for this org
│   │
│   ├── Compute org's "local today" date
│   ├── Query reports + requirements where:
│   │     status NOT IN (final statuses)
│   │     AND (due_date - local_today) IN reminder_rules.days_before
│   │        OR due_date < local_today  (overdue)
│   │
│   ├── For each item × each recipient:
│   │   ├── Check reminder_log for (target_type, target_id, user_id, days_before)
│   │   ├── If found → skip
│   │   └── If not found → send email → INSERT reminder_log
│   │
│   └── Is local day == Monday?
│       └── Yes → send weekly digest to admins (also deduped via reminder_log)
```

**Partial unique indexes on `reminder_log`:**
```sql
-- Prevents duplicate report reminders at DB level
CREATE UNIQUE INDEX reminder_log_report_dedup
  ON reminder_log (target_id, user_id, days_before)
  WHERE target_type = 'report';

-- Prevents duplicate requirement reminders at DB level
CREATE UNIQUE INDEX reminder_log_requirement_dedup
  ON reminder_log (target_id, user_id, days_before)
  WHERE target_type = 'requirement';
```

---

## 9. AI Pipeline

```
grant_documents (upload_status: "uploaded", ai_status: "none")
        │
        ▼ Inngest event: grant.document.uploaded
┌────────────────────────────────────────────┐
│  ai/extract-agreement (Inngest function)   │
│                                            │
│  Step 1: validate-limits                   │
│    - Check ai_usage for current month      │
│    - Block if over quota                   │
│    - Check PDF page count (R2 HEAD / PDF   │
│      metadata) — block if > model limit    │
│                                            │
│  Step 2: extract                           │
│    - Fetch PDF from R2 (storage key only   │
│      passed from Step 1)                   │
│    - Upload to Anthropic Files API         │
│    - Send message with file_id             │
│    - Model: env.ANTHROPIC_MODEL            │
│    - Validate response with Zod schema     │
│    - If malformed: retry once              │
│    - If still malformed: mark failed       │
│                                            │
│  Step 3: store-results                     │
│    - Write ai_suggestions rows             │
│    - Upsert ai_usage (tokens, cost)        │
│    - Update grant_documents.ai_status      │
│    - Emit notification event               │
└────────────────────────────────────────────┘
        │
        ▼ Graceful failure path
  ai_status = 'failed'
  User sees: "Extraction failed — add items manually"
  Document stays in system for reference
        │
        ▼ Happy path: User action in Review UI
┌────────────────────────────────────────────┐
│  Accept / Edit / Reject                    │
│  → Create real reports + requirements      │
│    (source: 'ai_confirmed') if accepted    │
│  → Update ai_suggestions.status            │
│  → Log activity                            │
└────────────────────────────────────────────┘
```

**Claude PDF limits (official Anthropic docs, verified 2025):**
- ≤ 100 pages for 200k-context window models (e.g. claude-sonnet)
- ≤ 600 pages for 1M-context window models
- ≤ 32 MB total request payload
- Recommendation: use Files API for large documents (avoids re-uploading on retry)

---

## 10. Billing Abstraction

```ts
// src/lib/billing/types.ts
export interface BillingProvider {
  createCheckoutSession(params: CheckoutParams): Promise<{ url: string }>;
  createPortalSession(params: PortalParams): Promise<{ url: string }>;
  validateWebhook(payload: unknown, signature: string): WebhookEvent;
}
```

- Interface and plan constants built in Phase 0
- Limit enforcement (`limits.ts`) built in Phase 2 to gate CRUD operations
- `LemonSqueezyAdapter` implementation **deferred to Phase 7**

```ts
// src/lib/billing/plans.ts (built Phase 0)
export const PLANS = {
  trial:   { maxUsers: 15, maxActiveGrants: 100, aiRequestsPerMonth: 50 },
  starter: { maxUsers: 1,  maxActiveGrants: 10,  aiRequestsPerMonth: 20 },
  team:    { maxUsers: 5,  maxActiveGrants: 30,  aiRequestsPerMonth: 50 },
  plus:    { maxUsers: 15, maxActiveGrants: 100, aiRequestsPerMonth: 200 },
} as const;
```

---

## 11. Email System (Resend + React Email)

Templates (`src/lib/email/templates/`):
- `reminder.tsx` — individual deadline reminder with deep link
- `weekly-digest.tsx` — admin Monday digest
- `invitation.tsx` — team invitation
- `export-ready.tsx` — download link for report pack (Phase 6)
- `ai-review-ready.tsx` — notify when AI extraction is complete

All emails construct deep links from `env.NEXT_PUBLIC_APP_URL`.

---

## 12. Typed Environment Variables

```ts
// src/lib/env.ts (partial)
export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    CLERK_SECRET_KEY: z.string(),
    CLERK_WEBHOOK_SECRET: z.string(),
    ANTHROPIC_API_KEY: z.string(),
    ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-5"),
    R2_ACCOUNT_ID: z.string(),
    R2_ACCESS_KEY_ID: z.string(),
    R2_SECRET_ACCESS_KEY: z.string(),
    R2_BUCKET_NAME: z.string(),
    R2_ENDPOINT: z.string().url(),
    RESEND_API_KEY: z.string(),
    INNGEST_EVENT_KEY: z.string(),
    INNGEST_SIGNING_KEY: z.string(),
    LEMON_SQUEEZY_API_KEY: z.string().optional(), // Phase 7
    LEMON_SQUEEZY_WEBHOOK_SECRET: z.string().optional(), // Phase 7
    SENTRY_DSN: z.string().url().optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string(),
    NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  },
  runtimeEnv: process.env,
});
```

---

## 13. Security Measures

| Concern | Implementation |
|---|---|
| Auth | Clerk session + `requireOrgRole()` on every handler |
| Tenant isolation | Internal `orgId` UUID filter on every repository query |
| ID mapping | Clerk org ID → internal UUID resolved only in `requireOrgRole()` |
| CSRF | Next.js Server Actions (same-origin by default) |
| File authorization | R2 presigned URL generated only after DB auth check; HEAD verify on confirm |
| File type/size | Server-side validation on presign + confirmed via HEAD on confirm |
| Webhook integrity | SVIX (Clerk) + provider signature verification (billing Phase 7) |
| Input | Zod schema on every server action / route handler |
| Content | Sanitize any user-provided HTML before render |
| Headers | CSP, X-Frame-Options, HSTS via Next.js config |
| Rate limiting | Upstash Ratelimit on AI + upload endpoints |
| Secrets | `@t3-oss/env-nextjs` validated at startup |
| Inngest step data | Storage keys only between steps — never file bytes |

---

## 14. Deployment Topology

```
Vercel (Next.js)
├── Edge Runtime — middleware (auth redirect)
├── Node.js Runtime — server actions, route handlers
└── Static — marketing pages, assets

Neon — PostgreSQL (serverless, HTTP connection pooling)
Cloudflare R2 — private file bucket (no public access)
Inngest Cloud — background jobs (webhook delivery from Vercel)
Clerk — auth, organizations
Resend — transactional email
Anthropic — Claude API (Files API for PDF upload)
Lemon Squeezy — billing (Phase 7)
Sentry — error monitoring
PostHog — product analytics
```

---

## 15. CI/CD Pipeline

```yaml
# .github/workflows/ci.yml (outline)
jobs:
  lint:      npx eslint . && npx prettier --check .
  typecheck: npx tsc --noEmit
  test:      npx vitest run
  e2e:       npx playwright test (against preview deploy — Phase 8)
```

Migrations run via `drizzle-kit migrate` in the Vercel build step.

---

## 16. Tenant Isolation Test Pattern

```ts
// tests/integration/tenant-isolation.test.ts
// Creates two orgs; runs every repository read/write fn from orgA context
// targeting orgB IDs; asserts null / [] / NotFoundError returned

const orgA = await createTestOrg("org-a");
const orgB = await createTestOrg("org-b");
const grantB = await createTestGrant(orgB.id, { ... });

// Every repository function is tested:
expect(await getGrant(orgA.id, grantB.id)).toBeNull();
expect(await listGrants({ orgId: orgA.id })).not.toContain(grantB);
// ... and so on for reports, requirements, evidence, documents
```
