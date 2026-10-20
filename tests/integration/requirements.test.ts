import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  listRequirements,
  getRequirementById,
  createRequirement,
  updateRequirement,
  deleteRequirement,
  reorderRequirements,
  syncRequirementStatus,
  countActiveEvidence,
} from "@/lib/repositories/requirements";
import { Requirement, Evidence } from "@/lib/db/schema";
import { db } from "@/lib/db";

let requirementsStore: Requirement[] = [];
let evidenceStore: Evidence[] = [];

vi.mock("@/lib/db", () => {
  return {
    db: {
      query: {
        requirements: {
          findMany: vi.fn(),
          findFirst: vi.fn(),
        },
      },
      insert: vi.fn(() => ({
        values: vi.fn((vals) => ({
          returning: vi.fn(async () => {
            const newItem: Requirement = {
              id: vals.id || `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              organizationId: vals.organizationId,
              reportId: vals.reportId,
              title: vals.title,
              description: vals.description ?? null,
              requirementType: vals.requirementType || "document",
              status: vals.status || "open",
              assigneeUserId: vals.assigneeUserId ?? null,
              dueDate: vals.dueDate ?? null,
              sortOrder: vals.sortOrder ?? 0,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            requirementsStore.push(newItem);
            return [newItem];
          }),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(async () => []),
          })),
        })),
      })),
      delete: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => []),
        })),
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(async () => [{ count: 0 }]),
        })),
      })),
      transaction: vi.fn(async (cb) => {
        return cb({
          update: vi.fn(() => ({
            set: vi.fn((updates) => ({
              where: vi.fn(async () => []),
            })),
          })),
        });
      }),
    },
  };
});

describe("Requirements Repository & D-007 Auto-Status Transitions", () => {
  const ORG_A_ID = "11111111-1111-1111-1111-111111111111";
  const ORG_B_ID = "22222222-2222-2222-2222-222222222222";
  const REPORT_A_ID = "report-a-uuid";

  beforeEach(() => {
    requirementsStore = [];
    evidenceStore = [];

    // Mock query implementations
    (db.query.requirements.findMany as ReturnType<typeof vi.fn>).mockImplementation(
      async (args: any) => {
        return requirementsStore.filter((r) => r.organizationId === ORG_A_ID);
      }
    );

    (db.query.requirements.findFirst as ReturnType<typeof vi.fn>).mockImplementation(
      async (args: any) => {
        return (
          requirementsStore.find((r) => r.organizationId === ORG_A_ID) || null
        );
      }
    );
  });

  it("creates a requirement scoped to the tenant organization", async () => {
    const item = await createRequirement(ORG_A_ID, {
      reportId: REPORT_A_ID,
      title: "Quarterly Financial Ledger",
      description: "Itemized expense report",
      requirementType: "financial",
      status: "open",
      sortOrder: 0,
      assigneeUserId: null,
      dueDate: "2026-11-15",
    });

    expect(item).toBeDefined();
    expect(item.organizationId).toBe(ORG_A_ID);
    expect(item.title).toBe("Quarterly Financial Ledger");
    expect(item.status).toBe("open");
  });

  describe("D-007 Auto-Status Transitions", () => {
    it("transitions open -> provided when active evidence is added", async () => {
      const req: Requirement = {
        id: "req-1",
        organizationId: ORG_A_ID,
        reportId: REPORT_A_ID,
        title: "Proof of Program Hours",
        description: null,
        requirementType: "document",
        status: "open",
        assigneeUserId: null,
        dueDate: null,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      requirementsStore.push(req);

      (db.query.requirements.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(req);

      // Mock countActiveEvidence returning 1
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 1 }]),
        }),
      });

      // Mock update to return updated requirement with status 'provided'
      (db.update as ReturnType<typeof vi.fn>).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ ...req, status: "provided" }]),
          }),
        }),
      });

      const updated = await syncRequirementStatus(ORG_A_ID, "req-1");
      expect(updated?.status).toBe("provided");
    });

    it("transitions provided -> open when all evidence is removed (count = 0)", async () => {
      const req: Requirement = {
        id: "req-2",
        organizationId: ORG_A_ID,
        reportId: REPORT_A_ID,
        title: "Board Approval Letter",
        description: null,
        requirementType: "document",
        status: "provided",
        assigneeUserId: null,
        dueDate: null,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      requirementsStore.push(req);

      (db.query.requirements.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(req);

      // Mock countActiveEvidence returning 0
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 0 }]),
        }),
      });

      // Mock update to return updated requirement with status 'open'
      (db.update as ReturnType<typeof vi.fn>).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ ...req, status: "open" }]),
          }),
        }),
      });

      const updated = await syncRequirementStatus(ORG_A_ID, "req-2");
      expect(updated?.status).toBe("open");
    });

    it("never auto-demotes verified status even when evidence count is 0", async () => {
      const req: Requirement = {
        id: "req-3",
        organizationId: ORG_A_ID,
        reportId: REPORT_A_ID,
        title: "Audited Financials",
        description: null,
        requirementType: "financial",
        status: "verified",
        assigneeUserId: null,
        dueDate: null,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (db.query.requirements.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(req);

      // Even if evidence count is 0
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 0 }]),
        }),
      });

      const updated = await syncRequirementStatus(ORG_A_ID, "req-3");
      expect(updated?.status).toBe("verified");
      expect(db.update).not.toHaveBeenCalled();
    });
  });
});
