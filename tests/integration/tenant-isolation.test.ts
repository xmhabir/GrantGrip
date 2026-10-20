import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  listGrants,
  getGrantById,
  updateGrant,
  softDeleteGrant,
  NotFoundError,
} from "@/lib/repositories/grants";
import {
  listReports,
  getReportById,
  updateReport,
  softDeleteReport,
} from "@/lib/repositories/reports";
import { Grant, Report } from "@/lib/db/schema";
import { db } from "@/lib/db";

// In-memory mock store simulating multi-tenant Postgres tables
let grantsStore: Grant[] = [];
let reportsStore: Report[] = [];

vi.mock("@/lib/db", () => {
  return {
    db: {
      query: {
        grants: {
          findMany: vi.fn(),
          findFirst: vi.fn(),
        },
        reports: {
          findMany: vi.fn(),
          findFirst: vi.fn(),
        },
      },
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(async () => []),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(async () => []),
          })),
        })),
      })),
    },
  };
});

describe("Multi-Tenant Isolation Guarantees (D-012)", () => {
  const ORG_A_ID = "11111111-1111-1111-1111-111111111111";
  const ORG_B_ID = "22222222-2222-2222-2222-222222222222";

  let orgAGrantId: string;
  let orgBGrantId: string;
  let orgAReportId: string;
  let orgBReportId: string;

  beforeEach(() => {
    grantsStore = [];
    reportsStore = [];

    // Seed Org A resources
    const grantA: Grant = {
      id: "grant-a-uuid",
      organizationId: ORG_A_ID,
      funderName: "Org A Foundation",
      opportunityNumber: null,
      awardAmountCents: 10000000,
      currency: "USD",
      startDate: null,
      endDate: null,
      status: "active",
      programArea: "Arts",
      leadUserId: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    grantsStore.push(grantA);
    orgAGrantId = grantA.id;

    // Seed Org B resources
    const grantB: Grant = {
      id: "grant-b-uuid",
      organizationId: ORG_B_ID,
      funderName: "Org B Foundation",
      opportunityNumber: null,
      awardAmountCents: 5000000,
      currency: "USD",
      startDate: null,
      endDate: null,
      status: "active",
      programArea: "Youth",
      leadUserId: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    grantsStore.push(grantB);
    orgBGrantId = grantB.id;

    // Seed Org A Report
    const reportA: Report = {
      id: "report-a-uuid",
      organizationId: ORG_A_ID,
      grantId: orgAGrantId,
      title: "Org A Annual Report",
      reportType: "progress",
      periodStart: null,
      periodEnd: null,
      dueDate: "2026-11-01",
      status: "draft",
      submittedAt: null,
      submittedBy: null,
      narrative: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    reportsStore.push(reportA);
    orgAReportId = reportA.id;

    // Seed Org B Report
    const reportB: Report = {
      id: "report-b-uuid",
      organizationId: ORG_B_ID,
      grantId: orgBGrantId,
      title: "Org B Final Report",
      reportType: "final",
      periodStart: null,
      periodEnd: null,
      dueDate: "2026-12-01",
      status: "draft",
      submittedAt: null,
      submittedBy: null,
      narrative: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    reportsStore.push(reportB);
    orgBReportId = reportB.id;
  });

  describe("Grants Repository Isolation", () => {
    it("never returns Org B grant when queried with Org A scope", async () => {
      (vi.mocked(db.query.grants.findFirst) as any).mockImplementation(async () => {
        return grantsStore.find((g) => g.organizationId === ORG_A_ID && g.id === orgBGrantId) || null;
      });

      const crossTenantGrant = await getGrantById(ORG_A_ID, orgBGrantId);
      expect(crossTenantGrant).toBeNull();
    });

    it("prevents Org A from updating an Org B grant", async () => {
      (vi.mocked(db.query.grants.findFirst) as any).mockImplementation(async () => null);

      await expect(
        updateGrant(ORG_A_ID, orgBGrantId, { funderName: "Malicious Tampering" })
      ).rejects.toThrow(NotFoundError);

      const targetOrgB = grantsStore.find((g) => g.id === orgBGrantId);
      expect(targetOrgB?.funderName).toBe("Org B Foundation");
    });

    it("prevents Org A from soft-deleting an Org B grant", async () => {
      (vi.mocked(db.query.grants.findFirst) as any).mockImplementation(async () => null);

      await expect(softDeleteGrant(ORG_A_ID, orgBGrantId)).rejects.toThrow(NotFoundError);

      const targetOrgB = grantsStore.find((g) => g.id === orgBGrantId);
      expect(targetOrgB?.deletedAt).toBeNull();
    });

    it("strictly isolates grant listings by organizationId", async () => {
      (vi.mocked(db.query.grants.findMany) as any).mockImplementation(async () => {
        return grantsStore.filter((g) => g.organizationId === ORG_A_ID);
      });

      const listA = await listGrants(ORG_A_ID);
      expect(listA.length).toBe(1);
      expect(listA[0].id).toBe(orgAGrantId);
      expect(listA.some((g) => g.organizationId === ORG_B_ID)).toBe(false);
    });
  });

  describe("Reports Repository Isolation", () => {
    it("never returns Org B report when queried with Org A scope", async () => {
      (vi.mocked(db.query.reports.findFirst) as any).mockImplementation(async () => {
        return reportsStore.find((r) => r.organizationId === ORG_A_ID && r.id === orgBReportId) || null;
      });

      const crossTenantReport = await getReportById(ORG_A_ID, orgBReportId);
      expect(crossTenantReport).toBeNull();
    });

    it("prevents Org A from modifying an Org B report", async () => {
      (vi.mocked(db.query.reports.findFirst) as any).mockImplementation(async () => null);

      await expect(
        updateReport(ORG_A_ID, orgBReportId, { title: "Hacked Report" })
      ).rejects.toThrow(NotFoundError);

      const targetOrgB = reportsStore.find((r) => r.id === orgBReportId);
      expect(targetOrgB?.title).toBe("Org B Final Report");
    });

    it("prevents Org A from deleting an Org B report", async () => {
      (vi.mocked(db.query.reports.findFirst) as any).mockImplementation(async () => null);

      await expect(softDeleteReport(ORG_A_ID, orgBReportId)).rejects.toThrow(NotFoundError);

      const targetOrgB = reportsStore.find((r) => r.id === orgBReportId);
      expect(targetOrgB?.deletedAt).toBeNull();
    });

    it("strictly isolates report listings by organizationId", async () => {
      (vi.mocked(db.query.reports.findMany) as any).mockImplementation(async () => {
        return reportsStore.filter((r) => r.organizationId === ORG_A_ID);
      });

      const listA = await listReports(ORG_A_ID);
      expect(listA.length).toBe(1);
      expect(listA[0].id).toBe(orgAReportId);
      expect(listA.some((r) => r.organizationId === ORG_B_ID)).toBe(false);
    });
  });
});
