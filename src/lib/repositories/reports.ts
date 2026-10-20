import { eq, and, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { reports, NewReport, Report } from "@/lib/db/schema";
import { NotFoundError } from "./grants";

/**
 * Repository for Reports.
 * Enforces strict multi-tenant scoping: ALL functions take internal orgId (UUID) as first argument.
 */
export async function listReports(orgId: string, grantId?: string): Promise<Report[]> {
  const conditions = [eq(reports.organizationId, orgId), isNull(reports.deletedAt)];

  if (grantId) {
    conditions.push(eq(reports.grantId, grantId));
  }

  return db.query.reports.findMany({
    where: and(...conditions),
    orderBy: (reports, { asc }) => [asc(reports.dueDate)],
  });
}

export async function getReportById(orgId: string, reportId: string): Promise<Report | null> {
  const result = await db.query.reports.findFirst({
    where: and(
      eq(reports.id, reportId),
      eq(reports.organizationId, orgId),
      isNull(reports.deletedAt)
    ),
  });

  return result || null;
}

export async function createReport(
  orgId: string,
  data: Omit<NewReport, "organizationId" | "id" | "createdAt" | "updatedAt" | "deletedAt">
): Promise<Report> {
  const [created] = await db
    .insert(reports)
    .values({
      ...data,
      organizationId: orgId,
    })
    .returning();

  return created;
}

export async function updateReport(
  orgId: string,
  reportId: string,
  data: Partial<Omit<NewReport, "organizationId" | "id" | "createdAt" | "updatedAt">>
): Promise<Report> {
  const existing = await getReportById(orgId, reportId);
  if (!existing) {
    throw new NotFoundError("Report not found or access denied");
  }

  const [updated] = await db
    .update(reports)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(and(eq(reports.id, reportId), eq(reports.organizationId, orgId)))
    .returning();

  return updated;
}

export async function softDeleteReport(orgId: string, reportId: string): Promise<Report> {
  const existing = await getReportById(orgId, reportId);
  if (!existing) {
    throw new NotFoundError("Report not found or access denied");
  }

  const [deleted] = await db
    .update(reports)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(reports.id, reportId), eq(reports.organizationId, orgId)))
    .returning();

  return deleted;
}
