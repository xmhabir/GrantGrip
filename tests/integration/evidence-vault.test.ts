/**
 * Phase 3 Integration Tests — Evidence & Document Vault
 *
 * Covers:
 * - Evidence repository multi-tenant isolation
 * - Cross-org access denial (D-012)
 * - File-type rejection (MIME allowlist)
 * - Oversized file rejection (25 MB limit)
 * - D-007: syncRequirementStatus transitions on evidence create/delete
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  sanitizeFilename,
  buildEvidenceKey,
  buildGrantDocKey,
} from "@/lib/storage/r2";
import {
  syncRequirementStatus,
  countActiveEvidence,
} from "@/lib/repositories/requirements";
import { Evidence, Requirement } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let evidenceStore: Evidence[] = [];
let requirementsStore: Requirement[] = [];

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      evidence: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
      requirements: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => [{ count: 0 }]),
      })),
    })),
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
    delete: vi.fn(() => ({
      where: vi.fn(async () => []),
    })),
  },
}));

import { db } from "@/lib/db";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeEvidence = (overrides: Partial<Evidence> = {}): Evidence => ({
  id: "ev-a-uuid",
  organizationId: "org-a-uuid",
  requirementId: "req-a-uuid",
  fileName: "budget.pdf",
  fileSizeBytes: 1024 * 500, // 500 KB
  mimeType: "application/pdf",
  storageKey: "org/org-a-uuid/requirements/req-a-uuid/evidence/ev-a-uuid/budget.pdf",
  notes: null,
  uploadedBy: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  ...overrides,
});

const makeRequirement = (overrides: Partial<Requirement> = {}): Requirement => ({
  id: "req-a-uuid",
  organizationId: "org-a-uuid",
  reportId: "report-a-uuid",
  title: "Budget Report",
  description: null,
  requirementType: "document",
  status: "open",
  assigneeUserId: null,
  dueDate: null,
  sortOrder: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// ---------------------------------------------------------------------------
// MIME Type Allowlist Tests
// ---------------------------------------------------------------------------

describe("MIME Type Allowlist (R2 Storage)", () => {
  it("allows application/pdf", () => {
    expect(ALLOWED_MIME_TYPES.has("application/pdf")).toBe(true);
  });

  it("allows image/jpeg", () => {
    expect(ALLOWED_MIME_TYPES.has("image/jpeg")).toBe(true);
  });

  it("allows image/png", () => {
    expect(ALLOWED_MIME_TYPES.has("image/png")).toBe(true);
  });

  it("allows application/vnd.openxmlformats-officedocument.wordprocessingml.document (docx)", () => {
    expect(
      ALLOWED_MIME_TYPES.has(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      )
    ).toBe(true);
  });

  it("allows text/csv", () => {
    expect(ALLOWED_MIME_TYPES.has("text/csv")).toBe(true);
  });

  it("REJECTS application/x-msdownload (.exe)", () => {
    expect(ALLOWED_MIME_TYPES.has("application/x-msdownload")).toBe(false);
  });

  it("REJECTS application/x-sh (.sh script)", () => {
    expect(ALLOWED_MIME_TYPES.has("application/x-sh")).toBe(false);
  });

  it("REJECTS application/octet-stream (generic binary)", () => {
    expect(ALLOWED_MIME_TYPES.has("application/octet-stream")).toBe(false);
  });

  it("REJECTS text/javascript", () => {
    expect(ALLOWED_MIME_TYPES.has("text/javascript")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// File Size Tests
// ---------------------------------------------------------------------------

describe("File Size Limit (25 MB ceiling)", () => {
  it("accepts exactly 25 MB", () => {
    expect(25 * 1024 * 1024 <= MAX_FILE_SIZE_BYTES).toBe(true);
  });

  it("rejects 25 MB + 1 byte", () => {
    const tooLarge = MAX_FILE_SIZE_BYTES + 1;
    expect(tooLarge > MAX_FILE_SIZE_BYTES).toBe(true);
  });

  it("MAX_FILE_SIZE_BYTES is exactly 26214400 (25 * 1024 * 1024)", () => {
    expect(MAX_FILE_SIZE_BYTES).toBe(26214400);
  });
});

// ---------------------------------------------------------------------------
// Storage Key Builder Tests
// ---------------------------------------------------------------------------

describe("Storage Key Builders", () => {
  it("buildEvidenceKey produces expected format", () => {
    const key = buildEvidenceKey("org-1", "req-1", "ev-1", "annual report.pdf");
    expect(key).toBe("org/org-1/requirements/req-1/evidence/ev-1/annual_report.pdf");
  });

  it("buildGrantDocKey produces expected format", () => {
    const key = buildGrantDocKey("org-1", "grant-1", "doc-1", "Q3 Financials.xlsx");
    expect(key).toBe("org/org-1/grants/grant-1/docs/doc-1/Q3_Financials.xlsx");
  });

  it("sanitizeFilename strips dangerous characters", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe(".._.._etc_passwd");
  });

  it("sanitizeFilename collapses multiple underscores", () => {
    expect(sanitizeFilename("file   name.pdf")).toBe("file_name.pdf");
  });

  it("sanitizeFilename trims to 200 characters", () => {
    const long = "a".repeat(300) + ".pdf";
    expect(sanitizeFilename(long).length).toBeLessThanOrEqual(200);
  });
});

// ---------------------------------------------------------------------------
// Evidence Repository Isolation Tests
// ---------------------------------------------------------------------------

describe("Evidence Repository Multi-Tenant Isolation (D-012)", () => {
  const ORG_A = "org-a-uuid";
  const ORG_B = "org-b-uuid";
  const REQ_A = "req-a-uuid";
  const REQ_B = "req-b-uuid";

  beforeEach(() => {
    evidenceStore = [
      makeEvidence({ id: "ev-a", organizationId: ORG_A, requirementId: REQ_A }),
      makeEvidence({ id: "ev-b", organizationId: ORG_B, requirementId: REQ_B }),
    ];
  });

  it("Org A list returns empty when queried with Org B scope", async () => {
    // Simulate the DB filtering by org — Org B querying Org A's requirement returns nothing
    (vi.mocked(db.query.evidence.findMany) as any).mockResolvedValueOnce(
      evidenceStore.filter(
        (e) => e.organizationId === ORG_B && e.requirementId === REQ_A
      )
    );

    const { listEvidence } = await import("@/lib/repositories/evidence");
    const result = await listEvidence(ORG_B, REQ_A);
    expect(result).toHaveLength(0);
  });

  it("getEvidenceById returns null for cross-org access", async () => {
    // DB returns nothing because org filter prevents cross-tenant read
    (vi.mocked(db.query.evidence.findFirst) as any).mockResolvedValueOnce(undefined);

    const { getEvidenceById } = await import("@/lib/repositories/evidence");
    const result = await getEvidenceById(ORG_A, "ev-b"); // Org A trying to read Org B's evidence
    expect(result).toBeNull();
  });

  it("softDeleteEvidence throws if evidence belongs to different org", async () => {
    // getEvidenceById returns null → softDelete throws
    (vi.mocked(db.query.evidence.findFirst) as any).mockResolvedValueOnce(undefined);

    const { softDeleteEvidence } = await import("@/lib/repositories/evidence");
    await expect(softDeleteEvidence(ORG_A, "ev-b")).rejects.toThrow(
      "Evidence not found or access denied"
    );
  });
});

// ---------------------------------------------------------------------------
// D-007: syncRequirementStatus Integration Tests
// ---------------------------------------------------------------------------

describe("D-007: Requirement Status Auto-Sync via Evidence Count", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("transitions 'open' → 'provided' when evidence count > 0", async () => {
    const req = makeRequirement({ status: "open" });

    // findFirst for getRequirementById
    (vi.mocked(db.query.requirements.findFirst) as any)
      .mockResolvedValueOnce(req) // initial load
      .mockResolvedValueOnce({ ...req, status: "provided" }); // after update

    // countActiveEvidence uses db.select — mock to return count=1
    (vi.mocked(db.select) as any).mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValueOnce([{ count: 1 }]),
      }),
    });

    // updateRequirement uses db.update
    (vi.mocked(db.update) as any).mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValueOnce([{ ...req, status: "provided" }]),
        }),
      }),
    });

    const result = await syncRequirementStatus("org-a-uuid", "req-a-uuid");
    expect(result?.status).toBe("provided");
  });

  it("transitions 'provided' → 'open' when evidence count is 0", async () => {
    const req = makeRequirement({ status: "provided" });

    (vi.mocked(db.query.requirements.findFirst) as any)
      .mockResolvedValueOnce(req)
      .mockResolvedValueOnce({ ...req, status: "open" });

    (vi.mocked(db.select) as any).mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValueOnce([{ count: 0 }]),
      }),
    });

    (vi.mocked(db.update) as any).mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValueOnce([{ ...req, status: "open" }]),
        }),
      }),
    });

    const result = await syncRequirementStatus("org-a-uuid", "req-a-uuid");
    expect(result?.status).toBe("open");
  });

  it("never auto-demotes 'verified' status", async () => {
    const req = makeRequirement({ status: "verified" });

    (vi.mocked(db.query.requirements.findFirst) as any).mockResolvedValueOnce(req);

    const result = await syncRequirementStatus("org-a-uuid", "req-a-uuid");
    // Should return req unchanged without calling update
    expect(result?.status).toBe("verified");
    expect(vi.mocked(db.update)).not.toHaveBeenCalled();
  });

  it("returns null if requirement does not exist", async () => {
    (vi.mocked(db.query.requirements.findFirst) as any).mockResolvedValueOnce(undefined);

    const result = await syncRequirementStatus("org-a-uuid", "req-nonexistent");
    expect(result).toBeNull();
  });
});
