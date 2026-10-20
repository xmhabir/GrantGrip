import { eq, and, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { grants, NewGrant, Grant } from "@/lib/db/schema";

export class NotFoundError extends Error {
  constructor(message = "Resource not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

/**
 * Repository for Grants.
 * Enforces strict multi-tenant scoping: ALL functions take internal orgId (UUID) as first argument.
 */
export async function listGrants(orgId: string): Promise<Grant[]> {
  return db.query.grants.findMany({
    where: and(eq(grants.organizationId, orgId), isNull(grants.deletedAt)),
    orderBy: (grants, { desc }) => [desc(grants.createdAt)],
  });
}

export async function getGrantById(orgId: string, grantId: string): Promise<Grant | null> {
  const result = await db.query.grants.findFirst({
    where: and(
      eq(grants.id, grantId),
      eq(grants.organizationId, orgId),
      isNull(grants.deletedAt)
    ),
  });

  return result || null;
}

export async function createGrant(
  orgId: string,
  data: Omit<NewGrant, "organizationId" | "id" | "createdAt" | "updatedAt" | "deletedAt">
): Promise<Grant> {
  const [created] = await db
    .insert(grants)
    .values({
      ...data,
      organizationId: orgId,
    })
    .returning();

  return created;
}

export async function updateGrant(
  orgId: string,
  grantId: string,
  data: Partial<Omit<NewGrant, "organizationId" | "id" | "createdAt" | "updatedAt">>
): Promise<Grant> {
  const existing = await getGrantById(orgId, grantId);
  if (!existing) {
    throw new NotFoundError("Grant not found or access denied");
  }

  const [updated] = await db
    .update(grants)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(and(eq(grants.id, grantId), eq(grants.organizationId, orgId)))
    .returning();

  return updated;
}

export async function softDeleteGrant(orgId: string, grantId: string): Promise<Grant> {
  const existing = await getGrantById(orgId, grantId);
  if (!existing) {
    throw new NotFoundError("Grant not found or access denied");
  }

  const [deleted] = await db
    .update(grants)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(grants.id, grantId), eq(grants.organizationId, orgId)))
    .returning();

  return deleted;
}
