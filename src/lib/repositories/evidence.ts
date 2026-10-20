import { eq, and, isNull, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { evidence, NewEvidence, Evidence } from "@/lib/db/schema";
import { syncRequirementStatus } from "@/lib/repositories/requirements";

/**
 * Evidence Repository
 * ALL queries are scoped by organizationId for strict multi-tenant isolation.
 */

export async function listEvidence(
  orgId: string,
  requirementId: string
): Promise<Evidence[]> {
  return db.query.evidence.findMany({
    where: and(
      eq(evidence.organizationId, orgId),
      eq(evidence.requirementId, requirementId),
      isNull(evidence.deletedAt)
    ),
    orderBy: [desc(evidence.createdAt)],
  });
}

export async function getEvidenceById(
  orgId: string,
  evidenceId: string
): Promise<Evidence | null> {
  const result = await db.query.evidence.findFirst({
    where: and(
      eq(evidence.id, evidenceId),
      eq(evidence.organizationId, orgId),
      isNull(evidence.deletedAt)
    ),
  });
  return result ?? null;
}

export async function createEvidence(
  orgId: string,
  data: Omit<NewEvidence, "organizationId" | "id" | "createdAt" | "updatedAt" | "deletedAt">
): Promise<Evidence> {
  const [created] = await db
    .insert(evidence)
    .values({ ...data, organizationId: orgId })
    .returning();

  // D-007: auto-transition requirement status
  if (created.requirementId) {
    await syncRequirementStatus(orgId, created.requirementId);
  }

  return created;
}

/**
 * Soft-delete an evidence record.
 * Triggers D-007 status sync after deletion.
 */
export async function softDeleteEvidence(
  orgId: string,
  evidenceId: string
): Promise<Evidence> {
  const existing = await getEvidenceById(orgId, evidenceId);
  if (!existing) {
    throw new Error("Evidence not found or access denied");
  }

  const [deleted] = await db
    .update(evidence)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(eq(evidence.id, evidenceId), eq(evidence.organizationId, orgId))
    )
    .returning();

  // D-007: may demote requirement back to 'open' if no evidence remains
  if (deleted.requirementId) {
    await syncRequirementStatus(orgId, deleted.requirementId);
  }

  return deleted;
}
