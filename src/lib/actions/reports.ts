"use server";

import { revalidatePath } from "next/cache";
import { requireOrgRole } from "@/lib/auth";
import {
  listReports,
  getReportById,
  createReport,
  updateReport,
  softDeleteReport,
} from "@/lib/repositories/reports";
import { activityLogs } from "@/lib/db/schema";
import { db } from "@/lib/db";
import { CreateReportSchema, UpdateReportSchema } from "@/lib/validations/reports";
import type { Report } from "@/lib/db/schema";
import type { ActionResult } from "./grants";

// ─────────────────────────────────────────────────────────────────────────────
// READ
// ─────────────────────────────────────────────────────────────────────────────

export async function getReportsAction(grantId?: string): Promise<ActionResult<Report[]>> {
  try {
    const { orgId } = await requireOrgRole("member");
    const reports = await listReports(orgId, grantId);
    return { success: true, data: reports };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch reports";
    return { success: false, error: message };
  }
}

export async function getReportAction(reportId: string): Promise<ActionResult<Report>> {
  try {
    const { orgId } = await requireOrgRole("member");
    const report = await getReportById(orgId, reportId);
    if (!report) return { success: false, error: "Report not found" };
    return { success: true, data: report };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch report";
    return { success: false, error: message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATE
// ─────────────────────────────────────────────────────────────────────────────

export async function createReportAction(rawInput: unknown): Promise<ActionResult<Report>> {
  try {
    const { orgId, userId } = await requireOrgRole("member");

    const parseResult = CreateReportSchema.safeParse(rawInput);
    if (!parseResult.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const [key, errs] of Object.entries(parseResult.error.flatten().fieldErrors)) {
        fieldErrors[key] = errs ?? [];
      }
      return { success: false, error: "Validation failed", fieldErrors };
    }

    const data = parseResult.data;
    const report = await createReport(orgId, {
      grantId: data.grantId,
      title: data.title,
      reportType: data.reportType,
      periodStart: data.periodStart || null,
      periodEnd: data.periodEnd || null,
      dueDate: data.dueDate,
      status: data.status,
      narrative: data.narrative || null,
      notes: data.notes || null,
    });

    await db.insert(activityLogs).values({
      organizationId: orgId,
      actorUserId: userId,
      action: "create",
      entityType: "report",
      entityId: report.id,
      metadata: { title: report.title, grantId: report.grantId },
    });

    revalidatePath("/app/reports");
    revalidatePath(`/app/grants/${data.grantId}`);
    revalidatePath("/app");

    return { success: true, data: report };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create report";
    return { success: false, error: message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE
// ─────────────────────────────────────────────────────────────────────────────

export async function updateReportAction(
  reportId: string,
  rawInput: unknown
): Promise<ActionResult<Report>> {
  try {
    const { orgId, userId } = await requireOrgRole("member");

    const parseResult = UpdateReportSchema.safeParse(rawInput);
    if (!parseResult.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const [key, errs] of Object.entries(parseResult.error.flatten().fieldErrors)) {
        fieldErrors[key] = errs ?? [];
      }
      return { success: false, error: "Validation failed", fieldErrors };
    }

    const data = parseResult.data;
    const report = await updateReport(orgId, reportId, {
      ...data,
      periodStart: data.periodStart || null,
      periodEnd: data.periodEnd || null,
      narrative: data.narrative || null,
      notes: data.notes || null,
    });

    await db.insert(activityLogs).values({
      organizationId: orgId,
      actorUserId: userId,
      action: "update",
      entityType: "report",
      entityId: report.id,
      metadata: { changes: Object.keys(data) },
    });

    revalidatePath("/app/reports");
    revalidatePath(`/app/reports/${reportId}`);
    revalidatePath(`/app/grants/${report.grantId}`);

    return { success: true, data: report };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update report";
    return { success: false, error: message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS TRANSITION
// ─────────────────────────────────────────────────────────────────────────────

export async function submitReportAction(reportId: string): Promise<ActionResult<Report>> {
  try {
    const { orgId, userId } = await requireOrgRole("member");

    const existing = await getReportById(orgId, reportId);
    if (!existing) return { success: false, error: "Report not found" };
    if (existing.status !== "draft") {
      return { success: false, error: "Only draft reports can be submitted" };
    }

    const report = await updateReport(orgId, reportId, {
      status: "submitted",
      submittedAt: new Date(),
      submittedBy: userId,
    });

    await db.insert(activityLogs).values({
      organizationId: orgId,
      actorUserId: userId,
      action: "submit",
      entityType: "report",
      entityId: report.id,
      metadata: {},
    });

    revalidatePath("/app/reports");
    revalidatePath(`/app/reports/${reportId}`);

    return { success: true, data: report };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to submit report";
    return { success: false, error: message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteReportAction(reportId: string): Promise<ActionResult> {
  try {
    const { orgId, userId } = await requireOrgRole("admin");

    const deleted = await softDeleteReport(orgId, reportId);

    await db.insert(activityLogs).values({
      organizationId: orgId,
      actorUserId: userId,
      action: "delete",
      entityType: "report",
      entityId: deleted.id,
      metadata: { title: deleted.title },
    });

    revalidatePath("/app/reports");
    revalidatePath(`/app/grants/${deleted.grantId}`);
    revalidatePath("/app");

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete report";
    return { success: false, error: message };
  }
}
