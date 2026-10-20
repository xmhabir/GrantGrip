"use server";

import { revalidatePath } from "next/cache";
import { requireOrgRole } from "@/lib/auth";
import {
  listRequirements,
  getRequirementById,
  createRequirement,
  updateRequirement,
  deleteRequirement,
  reorderRequirements,
  syncRequirementStatus,
} from "@/lib/repositories/requirements";
import { getReportById } from "@/lib/repositories/reports";
import { activityLogs } from "@/lib/db/schema";
import { db } from "@/lib/db";
import {
  CreateRequirementSchema,
  UpdateRequirementSchema,
  ReorderRequirementsSchema,
} from "@/lib/validations/requirements";
import type { Requirement } from "@/lib/db/schema";
import type { ActionResult } from "./grants";

// ─────────────────────────────────────────────────────────────────────────────
// READ
// ─────────────────────────────────────────────────────────────────────────────

export async function getRequirementsAction(
  reportId: string
): Promise<ActionResult<Requirement[]>> {
  try {
    const { orgId } = await requireOrgRole("member");
    const report = await getReportById(orgId, reportId);
    if (!report) {
      return { success: false, error: "Report not found" };
    }

    const items = await listRequirements(orgId, reportId);
    return { success: true, data: items };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch requirements";
    return { success: false, error: message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATE
// ─────────────────────────────────────────────────────────────────────────────

export async function createRequirementAction(
  rawInput: unknown
): Promise<ActionResult<Requirement>> {
  try {
    const { orgId, userId } = await requireOrgRole("member");

    const parseResult = CreateRequirementSchema.safeParse(rawInput);
    if (!parseResult.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const [key, errs] of Object.entries(parseResult.error.flatten().fieldErrors)) {
        fieldErrors[key] = errs ?? [];
      }
      return { success: false, error: "Validation failed", fieldErrors };
    }

    const data = parseResult.data;
    const report = await getReportById(orgId, data.reportId);
    if (!report) {
      return { success: false, error: "Report not found" };
    }

    const item = await createRequirement(orgId, {
      reportId: data.reportId,
      title: data.title,
      description: data.description || null,
      requirementType: data.requirementType,
      status: data.status,
      assigneeUserId: data.assigneeUserId || null,
      dueDate: data.dueDate || null,
      sortOrder: data.sortOrder ?? 0,
    });

    await db.insert(activityLogs).values({
      organizationId: orgId,
      actorUserId: userId,
      action: "create",
      entityType: "requirement",
      entityId: item.id,
      metadata: { title: item.title, reportId: item.reportId },
    });

    revalidatePath(`/app/reports/${data.reportId}`);
    revalidatePath("/app/reports");
    revalidatePath("/app");

    return { success: true, data: item };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create requirement";
    return { success: false, error: message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE
// ─────────────────────────────────────────────────────────────────────────────

export async function updateRequirementAction(
  requirementId: string,
  rawInput: unknown
): Promise<ActionResult<Requirement>> {
  try {
    const { orgId, userId } = await requireOrgRole("member");

    const parseResult = UpdateRequirementSchema.safeParse(rawInput);
    if (!parseResult.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const [key, errs] of Object.entries(parseResult.error.flatten().fieldErrors)) {
        fieldErrors[key] = errs ?? [];
      }
      return { success: false, error: "Validation failed", fieldErrors };
    }

    const data = parseResult.data;
    const existing = await getRequirementById(orgId, requirementId);
    if (!existing) {
      return { success: false, error: "Requirement not found" };
    }

    const item = await updateRequirement(orgId, requirementId, {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.description !== undefined ? { description: data.description || null } : {}),
      ...(data.requirementType !== undefined ? { requirementType: data.requirementType } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.assigneeUserId !== undefined ? { assigneeUserId: data.assigneeUserId || null } : {}),
      ...(data.dueDate !== undefined ? { dueDate: data.dueDate || null } : {}),
      ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
    });

    await db.insert(activityLogs).values({
      organizationId: orgId,
      actorUserId: userId,
      action: "update",
      entityType: "requirement",
      entityId: item.id,
      metadata: { changes: Object.keys(data) },
    });

    revalidatePath(`/app/reports/${item.reportId}`);
    revalidatePath("/app/reports");
    revalidatePath("/app");

    return { success: true, data: item };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update requirement";
    return { success: false, error: message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN VERIFY / UNVERIFY (D-007)
// ─────────────────────────────────────────────────────────────────────────────

export async function verifyRequirementAction(
  requirementId: string
): Promise<ActionResult<Requirement>> {
  try {
    const { orgId, userId } = await requireOrgRole("admin");

    const existing = await getRequirementById(orgId, requirementId);
    if (!existing) {
      return { success: false, error: "Requirement not found" };
    }

    const item = await updateRequirement(orgId, requirementId, {
      status: "verified",
    });

    await db.insert(activityLogs).values({
      organizationId: orgId,
      actorUserId: userId,
      action: "confirm",
      entityType: "requirement",
      entityId: item.id,
      metadata: { status: "verified" },
    });

    revalidatePath(`/app/reports/${item.reportId}`);
    revalidatePath("/app/reports");
    revalidatePath("/app");

    return { success: true, data: item };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to verify requirement";
    return { success: false, error: message };
  }
}

export async function unverifyRequirementAction(
  requirementId: string
): Promise<ActionResult<Requirement>> {
  try {
    const { orgId, userId } = await requireOrgRole("admin");

    const existing = await getRequirementById(orgId, requirementId);
    if (!existing) {
      return { success: false, error: "Requirement not found" };
    }

    // Set to provided or sync with actual evidence count
    await updateRequirement(orgId, requirementId, { status: "provided" });
    const item = (await syncRequirementStatus(orgId, requirementId)) ?? existing;

    await db.insert(activityLogs).values({
      organizationId: orgId,
      actorUserId: userId,
      action: "status_change",
      entityType: "requirement",
      entityId: item.id,
      metadata: { status: item.status },
    });

    revalidatePath(`/app/reports/${item.reportId}`);
    revalidatePath("/app/reports");
    revalidatePath("/app");

    return { success: true, data: item };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to unverify requirement";
    return { success: false, error: message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteRequirementAction(
  requirementId: string
): Promise<ActionResult> {
  try {
    const { orgId, userId } = await requireOrgRole("member");

    const deleted = await deleteRequirement(orgId, requirementId);

    await db.insert(activityLogs).values({
      organizationId: orgId,
      actorUserId: userId,
      action: "delete",
      entityType: "requirement",
      entityId: deleted.id,
      metadata: { title: deleted.title },
    });

    revalidatePath(`/app/reports/${deleted.reportId}`);
    revalidatePath("/app/reports");
    revalidatePath("/app");

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete requirement";
    return { success: false, error: message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REORDER
// ─────────────────────────────────────────────────────────────────────────────

export async function reorderRequirementsAction(
  reportId: string,
  items: Array<{ id: string; sortOrder: number }>
): Promise<ActionResult> {
  try {
    const { orgId } = await requireOrgRole("member");

    const parseResult = ReorderRequirementsSchema.safeParse({ reportId, items });
    if (!parseResult.success) {
      return { success: false, error: "Invalid reorder payload" };
    }

    await reorderRequirements(orgId, reportId, items);

    revalidatePath(`/app/reports/${reportId}`);

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to reorder requirements";
    return { success: false, error: message };
  }
}
