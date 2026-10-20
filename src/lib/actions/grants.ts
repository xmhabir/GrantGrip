"use server";

import { revalidatePath } from "next/cache";
import { requireOrgRole } from "@/lib/auth";
import { checkPlanLimits } from "@/lib/billing/limits";
import {
  listGrants,
  getGrantById,
  createGrant,
  updateGrant,
  softDeleteGrant,
} from "@/lib/repositories/grants";
import { activityLogs } from "@/lib/db/schema";
import { db } from "@/lib/db";
import { CreateGrantSchema, UpdateGrantSchema } from "@/lib/validations/grants";
import type { Grant } from "@/lib/db/schema";

/** Standard shape returned from every mutating Server Action */
export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// READ
// ─────────────────────────────────────────────────────────────────────────────

export async function getGrantsAction(): Promise<ActionResult<Grant[]>> {
  try {
    const { orgId } = await requireOrgRole("member");
    const grants = await listGrants(orgId);
    return { success: true, data: grants };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch grants";
    return { success: false, error: message };
  }
}

export async function getGrantAction(grantId: string): Promise<ActionResult<Grant>> {
  try {
    const { orgId } = await requireOrgRole("member");
    const grant = await getGrantById(orgId, grantId);
    if (!grant) return { success: false, error: "Grant not found" };
    return { success: true, data: grant };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch grant";
    return { success: false, error: message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATE
// ─────────────────────────────────────────────────────────────────────────────

export async function createGrantAction(
  rawInput: unknown
): Promise<ActionResult<Grant>> {
  try {
    const { orgId, userId } = await requireOrgRole("member");

    const parseResult = CreateGrantSchema.safeParse(rawInput);
    if (!parseResult.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const [key, errs] of Object.entries(parseResult.error.flatten().fieldErrors)) {
        fieldErrors[key] = errs ?? [];
      }
      return { success: false, error: "Validation failed", fieldErrors };
    }

    const limitCheck = await checkPlanLimits(orgId, "create_grant");
    if (!limitCheck.allowed) {
      return { success: false, error: limitCheck.reason };
    }

    const data = parseResult.data;
    const grant = await createGrant(orgId, {
      funderName: data.funderName,
      opportunityNumber: data.opportunityNumber || null,
      awardAmountCents: data.awardAmountCents ?? null,
      currency: data.currency,
      startDate: data.startDate || null,
      endDate: data.endDate || null,
      status: data.status,
      programArea: data.programArea || null,
      leadUserId: data.leadUserId ?? null,
      notes: data.notes || null,
    });

    await db.insert(activityLogs).values({
      organizationId: orgId,
      actorUserId: userId,
      action: "create",
      entityType: "grant",
      entityId: grant.id,
      metadata: { funderName: grant.funderName },
    });

    revalidatePath("/app/grants");
    revalidatePath("/app");

    return { success: true, data: grant };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create grant";
    return { success: false, error: message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE
// ─────────────────────────────────────────────────────────────────────────────

export async function updateGrantAction(
  grantId: string,
  rawInput: unknown
): Promise<ActionResult<Grant>> {
  try {
    const { orgId, userId } = await requireOrgRole("member");

    const parseResult = UpdateGrantSchema.safeParse(rawInput);
    if (!parseResult.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const [key, errs] of Object.entries(parseResult.error.flatten().fieldErrors)) {
        fieldErrors[key] = errs ?? [];
      }
      return { success: false, error: "Validation failed", fieldErrors };
    }

    const data = parseResult.data;
    const grant = await updateGrant(orgId, grantId, {
      ...data,
      opportunityNumber: data.opportunityNumber || null,
      startDate: data.startDate || null,
      endDate: data.endDate || null,
      programArea: data.programArea || null,
      notes: data.notes || null,
    });

    await db.insert(activityLogs).values({
      organizationId: orgId,
      actorUserId: userId,
      action: "update",
      entityType: "grant",
      entityId: grant.id,
      metadata: { changes: Object.keys(data) },
    });

    revalidatePath("/app/grants");
    revalidatePath(`/app/grants/${grantId}`);

    return { success: true, data: grant };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update grant";
    return { success: false, error: message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteGrantAction(grantId: string): Promise<ActionResult> {
  try {
    const { orgId, userId } = await requireOrgRole("admin");

    const deleted = await softDeleteGrant(orgId, grantId);

    await db.insert(activityLogs).values({
      organizationId: orgId,
      actorUserId: userId,
      action: "delete",
      entityType: "grant",
      entityId: deleted.id,
      metadata: { funderName: deleted.funderName },
    });

    revalidatePath("/app/grants");
    revalidatePath("/app");

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete grant";
    return { success: false, error: message };
  }
}


