import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  date,
  timestamp,
  boolean,
  jsonb,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// 1. ORGANIZATIONS
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkOrgId: text("clerk_org_id").notNull().unique(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  timezone: text("timezone").notNull().default("America/New_York"),
  fiscalYearEndMonth: integer("fiscal_year_end_month").notNull().default(12),
  plan: text("plan").notNull().default("starter"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// 2. USERS
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  email: text("email").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// 3. MEMBERSHIPS
export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"), // 'admin' | 'member'
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("memberships_org_user_idx").on(t.organizationId, t.userId),
  ]
);

// 4. GRANTS
export const grants = pgTable(
  "grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    funderName: text("funder_name").notNull(),
    opportunityNumber: text("opportunity_number"),
    awardAmountCents: bigint("award_amount_cents", { mode: "number" }),
    currency: text("currency").notNull().default("USD"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    status: text("status").notNull().default("active"), // 'active' | 'completed' | 'archived'
    programArea: text("program_area"),
    leadUserId: uuid("lead_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("grants_org_status_idx").on(t.organizationId, t.status),
  ]
);

// 5. GRANT DOCUMENTS
export const grantDocuments = pgTable("grant_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  grantId: uuid("grant_id")
    .notNull()
    .references(() => grants.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileSizeBytes: integer("file_size_bytes").notNull(),
  mimeType: text("mime_type").notNull(),
  storageKey: text("storage_key").notNull(),
  uploadStatus: text("upload_status").notNull().default("pending"), // 'pending' | 'uploaded'
  aiStatus: text("ai_status").notNull().default("none"), // 'none' | 'pending' | 'processing' | 'completed' | 'failed'
  aiExtractedAt: timestamp("ai_extracted_at", { withTimezone: true }),
  aiError: text("ai_error"),
  uploadedBy: uuid("uploaded_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// 6. REPORTS
export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    grantId: uuid("grant_id")
      .notNull()
      .references(() => grants.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    reportType: text("report_type").notNull(), // 'progress' | 'financial' | 'final' | 'other'
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    dueDate: date("due_date").notNull(),
    status: text("status").notNull().default("draft"), // 'draft' | 'submitted' | 'approved'
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    submittedBy: uuid("submitted_by").references(() => users.id, {
      onDelete: "set null",
    }),
    narrative: text("narrative"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("reports_org_due_date_idx").on(t.organizationId, t.dueDate),
    index("reports_org_status_idx").on(t.organizationId, t.status),
  ]
);

// 7. REQUIREMENTS
export const requirements = pgTable(
  "requirements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    requirementType: text("requirement_type").notNull().default("document"), // 'metric' | 'narrative' | 'financial' | 'document'
    status: text("status").notNull().default("open"), // 'open' | 'provided' | 'verified'
    assigneeUserId: uuid("assignee_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    dueDate: date("due_date"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("requirements_org_report_idx").on(t.organizationId, t.reportId),
  ]
);

// 8. EVIDENCE
export const evidence = pgTable("evidence", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  requirementId: uuid("requirement_id")
    .notNull()
    .references(() => requirements.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileSizeBytes: integer("file_size_bytes").notNull(),
  mimeType: text("mime_type").notNull(),
  storageKey: text("storage_key").notNull(),
  notes: text("notes"),
  uploadedBy: uuid("uploaded_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// 9. AI SUGGESTIONS
export const aiSuggestions = pgTable("ai_suggestions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  grantDocumentId: uuid("grant_document_id")
    .notNull()
    .references(() => grantDocuments.id, { onDelete: "cascade" }),
  targetType: text("target_type").notNull(), // 'report' | 'requirement'
  targetId: uuid("target_id"),
  suggestedData: jsonb("suggested_data").notNull(),
  status: text("status").notNull().default("suggested"), // 'suggested' | 'accepted' | 'rejected' | 'edited'
  sourceExcerpt: text("source_excerpt"),
  pageNumber: integer("page_number"),
  confidence: real("confidence"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// 10. REMINDER RULES
export const reminderRules = pgTable("reminder_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  daysBefore: integer("days_before").notNull(),
  channels: jsonb("channels").notNull().default(["email"]),
  appliesTo: text("applies_to").notNull().default("all"), // 'reports' | 'requirements' | 'all'
  isEnabled: boolean("is_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// 11. REMINDER LOG
// D-001: Two partial unique indexes on (target_id, user_id, days_before) filtered by target_type
export const reminderLog = pgTable(
  "reminder_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    targetType: text("target_type").notNull(), // 'report' | 'requirement'
    targetId: uuid("target_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    daysBefore: integer("days_before").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
    channel: text("channel").notNull().default("email"),
  },
  (t) => [
    uniqueIndex("reminder_log_report_unique_idx")
      .on(t.targetId, t.userId, t.daysBefore)
      .where(sql`target_type = 'report'`),
    uniqueIndex("reminder_log_requirement_unique_idx")
      .on(t.targetId, t.userId, t.daysBefore)
      .where(sql`target_type = 'requirement'`),
  ]
);

// 12. ACTIVITY LOGS
export const activityLogs = pgTable("activity_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  actorUserId: uuid("actor_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  action: text("action").notNull(), // 'create' | 'update' | 'delete' | 'confirm' | 'submit' | 'status_change'
  entityType: text("entity_type").notNull(), // 'grant' | 'report' | 'requirement' | 'evidence' | 'membership'
  entityId: uuid("entity_id").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// 13. AI USAGE
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    month: text("month").notNull(), // 'YYYY-MM'
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    requestCount: integer("request_count").notNull().default(0),
    costEstimateUsd: real("cost_estimate_usd").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("ai_usage_org_month_unique_idx").on(t.organizationId, t.month),
  ]
);

// 14. EXPORT JOBS
export const exportJobs = pgTable("export_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  reportId: uuid("report_id")
    .notNull()
    .references(() => reports.id, { onDelete: "cascade" }),
  requestedBy: uuid("requested_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"), // 'pending' | 'processing' | 'completed' | 'failed'
  storageKey: text("storage_key"),
  fileSizeBytes: integer("file_size_bytes"),
  error: text("error"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Type definitions inferred from schema
export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;

export type Grant = typeof grants.$inferSelect;
export type NewGrant = typeof grants.$inferInsert;

export type GrantDocument = typeof grantDocuments.$inferSelect;
export type NewGrantDocument = typeof grantDocuments.$inferInsert;

export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;

export type Requirement = typeof requirements.$inferSelect;
export type NewRequirement = typeof requirements.$inferInsert;

export type Evidence = typeof evidence.$inferSelect;
export type NewEvidence = typeof evidence.$inferInsert;

export type AiSuggestion = typeof aiSuggestions.$inferSelect;
export type NewAiSuggestion = typeof aiSuggestions.$inferInsert;

export type ReminderRule = typeof reminderRules.$inferSelect;
export type NewReminderRule = typeof reminderRules.$inferInsert;

export type ReminderLog = typeof reminderLog.$inferSelect;
export type NewReminderLog = typeof reminderLog.$inferInsert;

export type ActivityLog = typeof activityLogs.$inferSelect;
export type NewActivityLog = typeof activityLogs.$inferInsert;

export type AiUsage = typeof aiUsage.$inferSelect;
export type NewAiUsage = typeof aiUsage.$inferInsert;

export type ExportJob = typeof exportJobs.$inferSelect;
export type NewExportJob = typeof exportJobs.$inferInsert;
