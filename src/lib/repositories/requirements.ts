import { eq, and, count, isNull, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { requirements, evidence, NewRequirement, Requirement } from "@/lib/db/schema";
import { NotFoundError } from "./grants";

/**
 * Repository for Report Requirements.
 * Enforces strict multi-tenant scoping: ALL queries MUST filter by organizationId.
 */

export async function listRequirements(orgId: string, reportId: string): Promise<Requirement[]> {
  return db.query.requirements.findMany({
    where: and(
      eq(requirements.organizationId, orgId),
      eq(requirements.reportId, reportId)
    ),
    orderBy: [asc(requirements.sortOrder), asc(requirements.createdAt)],
  });
}

export async function getRequirementById(
  orgId: string,
  requirementId: string
): Promise<Requirement | null> {
  const result = await db.query.requirements.findFirst({
    where: and(
      eq(requirements.id, requirementId),
      eq(requirements.organizationId, orgId)
    ),
  });

  return result || null;
}

export async function createRequirement(
  orgId: string,
  data: Omit<NewRequirement, "organizationId" | "id" | "createdAt" | "updatedAt">
): Promise<Requirement> {
  // If sortOrder is not provided, calculate next available sortOrder
  let sortOrder = data.sortOrder;
  if (sortOrder === undefined || sortOrder === null) {
    const existing = await listRequirements(orgId, data.reportId);
    sortOrder = existing.length > 0 ? Math.max(...existing.map((r) => r.sortOrder)) + 1 : 0;
  }

  const [created] = await db
    .insert(requirements)
    .values({
      ...data,
      sortOrder,
      organizationId: orgId,
    })
    .returning();

  return created;
}

export async function updateRequirement(
  orgId: string,
  requirementId: string,
  data: Partial<Omit<NewRequirement, "organizationId" | "id" | "createdAt" | "updatedAt">>
): Promise<Requirement> {
  const existing = await getRequirementById(orgId, requirementId);
  if (!existing) {
    throw new NotFoundError("Requirement not found or access denied");
  }

  const [updated] = await db
    .update(requirements)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(and(eq(requirements.id, requirementId), eq(requirements.organizationId, orgId)))
    .returning();

  return updated;
}

export async function deleteRequirement(
  orgId: string,
  requirementId: string
): Promise<Requirement> {
  const existing = await getRequirementById(orgId, requirementId);
  if (!existing) {
    throw new NotFoundError("Requirement not found or access denied");
  }

  const [deleted] = await db
    .delete(requirements)
    .where(and(eq(requirements.id, requirementId), eq(requirements.organizationId, orgId)))
    .returning();

  return deleted;
}

export async function reorderRequirements(
  orgId: string,
  reportId: string,
  items: Array<{ id: string; sortOrder: number }>
): Promise<void> {
  await db.transaction(async (tx) => {
    for (const item of items) {
      await tx
        .update(requirements)
        .set({ sortOrder: item.sortOrder, updatedAt: new Date() })
        .where(
          and(
            eq(requirements.id, item.id),
            eq(requirements.reportId, reportId),
            eq(requirements.organizationId, orgId)
          )
        );
    }
  });
}

/**
 * Counts active (non-soft-deleted) evidence files attached to a requirement.
 */
export async function countActiveEvidence(
  orgId: string,
  requirementId: string
): Promise<number> {
  const [result] = await db
    .select({ count: count() })
    .from(evidence)
    .where(
      and(
        eq(evidence.organizationId, orgId),
        eq(evidence.requirementId, requirementId),
        isNull(evidence.deletedAt)
      )
    );

  return Number(result?.count ?? 0);
}

/**
 * Syncs requirement status based on attached evidence count (D-007):
 * - If evidenceCount > 0 and status === 'open' -> 'provided'
 * - If evidenceCount === 0 and status === 'provided' -> 'open'
 * - Never auto-demotes 'verified'
 */
export async function syncRequirementStatus(
  orgId: string,
  requirementId: string
): Promise<Requirement | null> {
  const req = await getRequirementById(orgId, requirementId);
  if (!req || req.status === "verified") {
    return req;
  }

  const evidenceCount = await countActiveEvidence(orgId, requirementId);

  if (evidenceCount > 0 && req.status === "open") {
    return updateRequirement(orgId, requirementId, { status: "provided" });
  } else if (evidenceCount === 0 && req.status === "provided") {
    return updateRequirement(orgId, requirementId, { status: "open" });
  }

  return req;
}
