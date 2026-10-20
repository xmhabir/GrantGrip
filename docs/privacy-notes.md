# GrantGrip — Data Privacy & Security Notes

> Technical notes on tenant isolation, data retention, third-party processors, and security boundaries.

---

## Data Processors & Data Flows

| Service | Data Handled | Security / Privacy Controls |
|---|---|---|
| **Neon (PostgreSQL)** | All transactional data, orgs, users, grants, reports, requirements | TLS encrypted in transit; encrypted at rest; strict `organization_id` foreign keys and tenant-isolated queries |
| **Cloudflare R2** | Grant agreement PDFs, evidence files (PDF, image, spreadsheet) | Encrypted at rest; tenant-scoped keys `org_{orgId}/...`; presigned URLs with short TTL; server-side HEAD validation before confirm |
| **Clerk** | User identities, emails, passwords, org memberships, roles | SOC 2 Type II compliant; tenant org IDs mapped to internal UUIDs via `requireOrgRole()` |
| **Anthropic (Claude)** | Grant agreement text for requirement extraction; draft report narratives for quality review | Enterprise API: Anthropic does not train models on API inputs/outputs by default; zero-retention / minimal retention policies |
| **Resend** | Email addresses, reminder text, digest summaries | Transactional email delivery only; unsubscribes managed per-user |
| **Sentry** | Error traces, exception logs | PII scrubbing enabled; sensitive tokens, auth headers, and request bodies stripped before export |

## Tenant Isolation Guarantees

1. **Every query scoped to `organization_id`**: No repository function permits querying or mutating records across organizations.
2. **Internal UUIDs**: Repositories accept only internal `organizations.id` UUIDs, resolved securely by `requireOrgRole()`.
3. **Storage isolation**: Cloudflare R2 object keys are strictly prefix-namespaced by org: `org_{organization_id}/...`.
4. **Automated verification**: Tenant isolation test suite (`tests/integration/tenant-isolation.test.ts`) runs multi-tenant cross-org intrusion checks against every repository function.
