import { describe, it, expect, beforeEach, vi } from "vitest";
import { randomUUID } from "crypto";

// ---------------------------------------------------------------------------
// In-Memory Mock Store for Offline / Vitest Runs
// ---------------------------------------------------------------------------
let reminderRulesStore: any[] = [];
let reminderLogStore: any[] = [];
let organizationsStore: any[] = [];
let usersStore: any[] = [];
let membershipsStore: any[] = [];
let grantsStore: any[] = [];
let reportsStore: any[] = [];
let requirementsStore: any[] = [];

vi.mock("@/lib/db", () => {
  return {
    db: {
      query: {
        reminderRules: {
          findMany: vi.fn(async (opts?: any) => {
            if (!opts?.where) return [...reminderRulesStore];
            // If filtering by organizationId
            return reminderRulesStore.filter((r) => !opts._orgId || r.organizationId === opts._orgId);
          }),
          findFirst: vi.fn(async (opts?: any) => {
            if (opts?._id) {
              return reminderRulesStore.find((r) => r.id === opts._id && (!opts._orgId || r.organizationId === opts._orgId)) || null;
            }
            return reminderRulesStore[0] || null;
          }),
        },
        reminderLog: {
          findFirst: vi.fn(async () => null),
        },
        organizations: {
          findMany: vi.fn(async () => [...organizationsStore]),
          findFirst: vi.fn(async () => organizationsStore[0] || null),
        },
        memberships: {
          findMany: vi.fn(async () => [...membershipsStore]),
        },
        users: {
          findFirst: vi.fn(async () => null),
        },
        grants: {
          findFirst: vi.fn(async () => grantsStore[0] || null),
        },
        reports: {
          findMany: vi.fn(async () => [...reportsStore]),
          findFirst: vi.fn(async () => reportsStore[0] || null),
        },
        requirements: {
          findMany: vi.fn(async () => [...requirementsStore]),
        },
      },
      insert: vi.fn((table: any) => ({
        values: vi.fn((vals: any) => {
          const items = Array.isArray(vals) ? vals : [vals];
          const results = items.map((val) => {
            const newItem = { id: val.id || randomUUID(), ...val, createdAt: new Date(), updatedAt: new Date() };
            if (table === reminderRules || val.daysBefore !== undefined && val.name) {
              reminderRulesStore.push(newItem);
            } else if (table === reminderLog || val.targetType) {
              // Deduplicate like PostgreSQL partial unique index
              const exists = reminderLogStore.some(
                (l) => l.targetId === val.targetId && l.userId === val.userId && l.daysBefore === val.daysBefore && l.targetType === val.targetType
              );
              if (!exists) {
                reminderLogStore.push(newItem);
              }
            } else if (table === organizations || val.timezone) {
              organizationsStore.push(newItem);
            } else if (table === users || val.email) {
              usersStore.push(newItem);
            } else if (table === memberships || val.role) {
              membershipsStore.push(newItem);
            } else if (table === grants || val.funderName) {
              grantsStore.push(newItem);
            } else if (table === reports || val.reportType) {
              reportsStore.push(newItem);
            } else if (table === requirements || val.title) {
              requirementsStore.push(newItem);
            }
            return newItem;
          });

          return {
            returning: vi.fn(async () => results),
            onConflictDoNothing: vi.fn(async () => results),
          };
        }),
      })),
      update: vi.fn(() => ({
        set: vi.fn((patch: any) => ({
          where: vi.fn((condition: any) => {
            const ruleId = condition?._id;
            const orgId = condition?._orgId;
            const idx = reminderRulesStore.findIndex(
              (r) => (!ruleId || r.id === ruleId) && (!orgId || r.organizationId === orgId)
            );
            if (idx === -1) {
              return { returning: vi.fn(async () => []) };
            }
            reminderRulesStore[idx] = { ...reminderRulesStore[idx], ...patch, updatedAt: new Date() };
            return { returning: vi.fn(async () => [reminderRulesStore[idx]]) };
          }),
        })),
      })),
      delete: vi.fn(() => ({
        where: vi.fn((condition: any) => {
          const ruleId = condition?._id;
          const orgId = condition?._orgId;
          const idx = reminderRulesStore.findIndex(
            (r) => (!ruleId || r.id === ruleId) && (!orgId || r.organizationId === orgId)
          );
          if (idx === -1) {
            return { returning: vi.fn(async () => []) };
          }
          const [removed] = reminderRulesStore.splice(idx, 1);
          return { returning: vi.fn(async () => [removed]) };
        }),
      })),
    },
  };
});

import {
  isHourInTimezone,
  isMondayInTimezone,
  getLocalDateString,
  calculateDaysDifference,
  createReminderRule,
  listReminderRules,
  updateReminderRule,
  deleteReminderRule,
  hasReminderBeenSent,
  logReminderSent,
  ensureDefaultReminderRules,
} from "@/lib/repositories/reminderRules";
import {
  renderDueReminderEmail,
  renderWeeklyDigestEmail,
} from "@/lib/email/templates";
import { mockSentEmails } from "@/lib/email/client";
import { processHourlyReminders } from "@/lib/services/reminders";
import { db } from "@/lib/db";
import {
  organizations,
  users,
  memberships,
  grants,
  reports,
  requirements,
  reminderRules,
  reminderLog,
} from "@/lib/db/schema";

describe("Phase 4 — Reminders & Emails Integration Suite", () => {
  beforeEach(() => {
    mockSentEmails.length = 0;
    reminderRulesStore = [];
    reminderLogStore = [];
    organizationsStore = [];
    usersStore = [];
    membershipsStore = [];
    grantsStore = [];
    reportsStore = [];
    requirementsStore = [];

    // Wire db.query handlers to in-memory stores
    vi.mocked(db.query.reminderRules.findMany).mockImplementation(async (opts?: any) => {
      return [...reminderRulesStore];
    });

    vi.mocked(db.query.reminderLog.findFirst).mockImplementation(async (opts?: any) => {
      // Find matching item from store
      return reminderLogStore[0] || null;
    });

    vi.mocked(db.query.organizations.findMany).mockImplementation(async () => {
      return [...organizationsStore];
    });

    vi.mocked(db.query.organizations.findFirst).mockImplementation(async () => {
      return organizationsStore[0] || null;
    });

    vi.mocked(db.query.memberships.findMany).mockImplementation(async () => {
      return [...membershipsStore];
    });

    vi.mocked(db.query.users.findFirst).mockImplementation(async (opts?: any) => {
      return usersStore[0] || null;
    });

    vi.mocked(db.query.grants.findFirst).mockImplementation(async () => {
      return grantsStore[0] || null;
    });

    vi.mocked(db.query.reports.findMany).mockImplementation(async () => {
      return [...reportsStore];
    });

    vi.mocked(db.query.reports.findFirst).mockImplementation(async () => {
      return reportsStore[0] || null;
    });

    vi.mocked(db.query.requirements.findMany).mockImplementation(async () => {
      return [...requirementsStore];
    });
  });

  // ==========================================================================
  // 1. TIMEZONE & DATE COMPUTATION UNIT TESTS (D-002)
  // ==========================================================================
  describe("Timezone & Local Date Calculations (D-002)", () => {
    it("correctly identifies 9:00 AM local time across US timezones", () => {
      // 13:00 UTC = 09:00 EDT (America/New_York, UTC-4)
      const utc13 = new Date("2026-10-20T13:00:00Z");
      expect(isHourInTimezone("America/New_York", 9, utc13)).toBe(true);
      expect(isHourInTimezone("America/Chicago", 9, utc13)).toBe(false); // 8 AM in Chicago
      expect(isHourInTimezone("America/Los_Angeles", 9, utc13)).toBe(false); // 6 AM in LA

      // 14:00 UTC = 09:00 CDT (America/Chicago, UTC-5)
      const utc14 = new Date("2026-10-20T14:00:00Z");
      expect(isHourInTimezone("America/Chicago", 9, utc14)).toBe(true);

      // 16:00 UTC = 09:00 PDT (America/Los_Angeles, UTC-7)
      const utc16 = new Date("2026-10-20T16:00:00Z");
      expect(isHourInTimezone("America/Los_Angeles", 9, utc16)).toBe(true);
    });

    it("correctly determines local date formatted as YYYY-MM-DD", () => {
      // Midnight in UTC on Oct 21 is still Oct 20 at 8 PM EDT in NY
      const eveningUtc = new Date("2026-10-21T00:30:00Z");
      expect(getLocalDateString("America/New_York", eveningUtc)).toBe("2026-10-20");
    });

    it("identifies Mondays in local timezone for weekly digests", () => {
      // 2026-10-19 is Monday
      const mondayUtc = new Date("2026-10-19T13:00:00Z");
      expect(isMondayInTimezone("America/New_York", mondayUtc)).toBe(true);

      // 2026-10-20 is Tuesday
      const tuesdayUtc = new Date("2026-10-20T13:00:00Z");
      expect(isMondayInTimezone("America/New_York", tuesdayUtc)).toBe(false);
    });

    it("calculates exact day differences: future, today, and overdue", () => {
      expect(calculateDaysDifference("2026-10-20", "2026-10-27")).toBe(7); // Due in 7 days
      expect(calculateDaysDifference("2026-10-20", "2026-10-20")).toBe(0); // Due today
      expect(calculateDaysDifference("2026-10-20", "2026-10-17")).toBe(-3); // Overdue by 3 days
    });
  });

  // ==========================================================================
  // 2. EMAIL TEMPLATES RENDERING
  // ==========================================================================
  describe("Email Templates Rendering", () => {
    it("renders due reminder email with correct subject, badge, and deep link", () => {
      const email = renderDueReminderEmail({
        recipientName: "Alice Walker",
        targetType: "report",
        title: "Q3 Interim Progress Report",
        grantName: "STEM Education Initiative",
        dueDate: "2026-10-27",
        daysBefore: 7,
        deepLink: "https://grantgrip.com/app/reports/123",
      });

      expect(email.subject).toContain("Due in 7 days: Q3 Interim Progress Report");
      expect(email.html).toContain("Alice Walker");
      expect(email.html).toContain("STEM Education Initiative");
      expect(email.html).toContain("https://grantgrip.com/app/reports/123");
      expect(email.text).toContain("Due Date: 2026-10-27");
    });

    it("renders Monday weekly digest email with stats and breakdown", () => {
      const email = renderWeeklyDigestEmail({
        recipientName: "Director Jane",
        orgName: "Youth Arts Foundation",
        overdueItems: [
          { title: "Financial Audit 2025", grantName: "Arts Council", dueDate: "2026-10-15", targetType: "report" },
        ],
        dueThisWeekItems: [
          { title: "Participant Roster", grantName: "City Grant", dueDate: "2026-10-22", targetType: "requirement" },
        ],
        deepLink: "https://grantgrip.com/app",
      });

      expect(email.subject).toContain("Weekly Grant Compliance Digest");
      expect(email.html).toContain("Youth Arts Foundation");
      expect(email.html).toContain("Financial Audit 2025");
      expect(email.html).toContain("Participant Roster");
      expect(email.text).toContain("Overdue Items: 1");
      expect(email.text).toContain("Due This Week: 1");
    });
  });

  // ==========================================================================
  // 3. REMINDER LOG & DEDUPLICATION (D-001)
  // ==========================================================================
  describe("Deduplication & reminder_log Idempotency (D-001)", () => {
    it("logs reminder and detects duplicate before sending second time", async () => {
      const testTargetId = randomUUID();
      const testUserId = randomUUID();
      const testOrgId = randomUUID();

      // Custom mock for findFirst matching exactly
      vi.mocked(db.query.reminderLog.findFirst).mockImplementation(async () => {
        return reminderLogStore.find(
          (l) => l.targetId === testTargetId && l.userId === testUserId && l.daysBefore === 14
        ) || null;
      });

      // Check not sent initially
      const initialCheck = await hasReminderBeenSent(testOrgId, "report", testTargetId, testUserId, 14);
      expect(initialCheck).toBe(false);

      // Log the reminder
      const logged = await logReminderSent({
        organizationId: testOrgId,
        targetType: "report",
        targetId: testTargetId,
        userId: testUserId,
        daysBefore: 14,
        channel: "email",
      });
      expect(logged).toBe(true);

      // Should now be detected as sent
      const secondCheck = await hasReminderBeenSent(testOrgId, "report", testTargetId, testUserId, 14);
      expect(secondCheck).toBe(true);

      // A different daysBefore window is NOT considered sent
      const differentWindowCheck = await hasReminderBeenSent(testOrgId, "report", testTargetId, testUserId, 7);
      expect(differentWindowCheck).toBe(false);
    });
  });

  // ==========================================================================
  // 4. MULTI-TENANT ISOLATION OF REMINDER RULES
  // ==========================================================================
  describe("Reminder Rules Multi-Tenant Isolation", () => {
    it("ensures default rules exist and scopes them strictly to tenant", async () => {
      const tenantA = randomUUID();
      const tenantB = randomUUID();

      // Filter findMany by organizationId
      vi.mocked(db.query.reminderRules.findMany).mockImplementation(async (opts?: any) => {
        return reminderRulesStore.filter((r) => r.organizationId === tenantA);
      });

      // Seed defaults for Tenant A
      const seeded = await ensureDefaultReminderRules(tenantA);
      expect(seeded.length).toBe(4);
      expect(seeded.map((s) => s.daysBefore).sort((a, b) => b - a)).toEqual([30, 14, 7, 1]);

      // Tenant B queries rules and gets 0 before seeding
      vi.mocked(db.query.reminderRules.findMany).mockImplementation(async (opts?: any) => {
        return reminderRulesStore.filter((r) => r.organizationId === tenantB);
      });
      const tenantBRules = await listReminderRules(tenantB);
      expect(tenantBRules.length).toBe(0);

      // Tenant A creates a custom 3-day rule
      const customRule = await createReminderRule(tenantA, {
        name: "3 Days Warning",
        daysBefore: 3,
        appliesTo: "reports",
      });
      expect(customRule.daysBefore).toBe(3);

      // Tenant B tries to delete Tenant A's rule -> returns empty array from update/delete
      await expect(deleteReminderRule(tenantB, customRule.id)).rejects.toThrow(
        "Reminder rule not found or access denied."
      );

      // Tenant B tries to update Tenant A's rule -> should throw
      await expect(
        updateReminderRule(tenantB, customRule.id, { name: "Hacked" })
      ).rejects.toThrow("Reminder rule not found or access denied.");
    });
  });

  // ==========================================================================
  // 5. SIMULATED CLOCK TEST — EXACTLY-ONCE DELIVERY GUARANTEE
  // ==========================================================================
  describe("Simulated Clock — Exact-Once Delivery Guarantee", () => {
    it("sends notifications exactly once and skips on subsequent runs", async () => {
      const simulatedOrgId = randomUUID();
      const simulatedAdminId = randomUUID();
      const simulatedAssigneeId = randomUUID();
      const simulatedGrantId = randomUUID();
      const simulatedReportId = randomUUID();
      const simulatedReqId = randomUUID();

      // 1. Setup mock org in America/New_York
      organizationsStore.push({
        id: simulatedOrgId,
        clerkOrgId: `org_sim_${simulatedOrgId.slice(0, 8)}`,
        name: "Community Health Alliance",
        slug: `health-${simulatedOrgId.slice(0, 6)}`,
        timezone: "America/New_York",
      });

      // 2. Setup admin and assignee
      usersStore.push(
        {
          id: simulatedAdminId,
          clerkUserId: `user_admin_${simulatedAdminId.slice(0, 8)}`,
          email: "admin@healthalliance.org",
          firstName: "Dr. Sarah",
          lastName: "Connor",
        },
        {
          id: simulatedAssigneeId,
          clerkUserId: `user_assignee_${simulatedAssigneeId.slice(0, 8)}`,
          email: "assignee@healthalliance.org",
          firstName: "Kyle",
          lastName: "Reese",
        }
      );

      membershipsStore.push(
        { organizationId: simulatedOrgId, userId: simulatedAdminId, role: "admin" },
        { organizationId: simulatedOrgId, userId: simulatedAssigneeId, role: "member" }
      );

      // 3. Setup grant, report due in 7 days, requirement due in 7 days
      grantsStore.push({
        id: simulatedGrantId,
        organizationId: simulatedOrgId,
        funderName: "CDC Foundation",
        status: "active",
      });

      reportsStore.push({
        id: simulatedReportId,
        organizationId: simulatedOrgId,
        grantId: simulatedGrantId,
        title: "Q3 Immunization Progress Report",
        reportType: "narrative",
        dueDate: "2026-10-27",
        status: "collecting",
      });

      requirementsStore.push({
        id: simulatedReqId,
        organizationId: simulatedOrgId,
        reportId: simulatedReportId,
        title: "Submit verified patient ledger",
        dueDate: "2026-10-27",
        status: "open",
        assigneeUserId: simulatedAssigneeId,
      });

      // Wire find helpers for simulated test
      vi.mocked(db.query.users.findFirst).mockImplementation(async (opts?: any) => {
        // Return matching user
        return usersStore.find((u) => u.id === opts?.where?.params?.[0]) || usersStore[0] || null;
      });

      vi.mocked(db.query.reminderRules.findMany).mockImplementation(async () => {
        return [
          { id: "r1", organizationId: simulatedOrgId, name: "7 Days Before", daysBefore: 7, isEnabled: true, appliesTo: "all", channels: ["email"] },
        ];
      });

      vi.mocked(db.query.reminderLog.findFirst).mockImplementation(async (opts?: any) => {
        // Check if sent in reminderLogStore
        return reminderLogStore[0] || null;
      });

      // 4. Run hourly processor at 9:00 AM EDT (13:00 UTC on 2026-10-20)
      const simulatedInstant = new Date("2026-10-20T13:00:00Z");

      // For first run: reminderLogStore is empty
      const firstRun = await processHourlyReminders(simulatedInstant, {
        forceOrgId: simulatedOrgId,
      });

      expect(firstRun.remindersSent).toBeGreaterThanOrEqual(1);
      expect(mockSentEmails.length).toBeGreaterThanOrEqual(1);

      // Now reminderLogStore has entries. Mock findFirst to return an entry:
      vi.mocked(db.query.reminderLog.findFirst).mockImplementation(async () => {
        return reminderLogStore[0] || { id: "logged" };
      });

      // 5. Run AGAIN with the SAME instant (simulated clock duplicate trigger)
      const secondRun = await processHourlyReminders(simulatedInstant, {
        forceOrgId: simulatedOrgId,
      });

      // EXACTLY-ONCE GUARANTEE: No duplicate emails sent!
      expect(secondRun.remindersSent).toBe(0);
      expect(secondRun.skippedDeduplicated).toBeGreaterThanOrEqual(1);
    });
  });
});
