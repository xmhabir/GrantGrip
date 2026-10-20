"use server";

import { revalidatePath } from "next/cache";
import { requireOrgRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { evidence, requirements } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import {
  createEvidence,
  softDeleteEvidence,
} from "@/lib/repositories/evidence";
import {
  generatePresignedPutUrl,
  generatePresignedGetUrl,
  buildEvidenceKey,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  sanitizeFilename,
} from "@/lib/storage/r2";
import { randomUUID } from "crypto";
import { z } from "zod";

const PresignSchema = z.object({
  requirementId: z.string().uuid(),
  filename: z.string().min(1).max(500),
  contentType: z.string().min(1),
  declaredSize: z.number().int().positive(),
});

export type PresignResult =
  | { success: true; presignedUrl: string; evidenceId: string; storageKey: string }
  | { success: false; error: string };

/**
 * Step 1: Get a presigned PUT URL to upload evidence directly to R2 from the browser.
 * Creates a temporary evidence row with upload_status pending (we use a simple convention
 * of storageKey existing as the marker — R2 storage is the source of truth).
 */
export async function presignEvidenceUploadAction(
  data: z.infer<typeof PresignSchema>
): Promise<PresignResult> {
  try {
    const { orgId, userId } = await requireOrgRole("member");

    const parsed = PresignSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: "Invalid request data." };
    }

    const { requirementId, filename, contentType, declaredSize } = parsed.data;

    if (!ALLOWED_MIME_TYPES.has(contentType)) {
      return {
        success: false,
        error: `File type "${contentType}" is not allowed. Allowed: PDF, images, Office documents, text, and CSV.`,
      };
    }

    if (declaredSize > MAX_FILE_SIZE_BYTES) {
      return {
        success: false,
        error: `File is too large. Maximum allowed size is 25 MB.`,
      };
    }

    // Verify requirement belongs to org
    const req = await db.query.requirements.findFirst({
      where: and(
        eq(requirements.id, requirementId),
        eq(requirements.organizationId, orgId)
      ),
    });

    if (!req) {
      return { success: false, error: "Requirement not found or access denied." };
    }

    const evidenceId = randomUUID();
    const storageKey = buildEvidenceKey(orgId, requirementId, evidenceId, filename);

    const presignedUrl = await generatePresignedPutUrl(storageKey, contentType);

    return { success: true, presignedUrl, evidenceId, storageKey };
  } catch (err: any) {
    console.error("[presignEvidenceUpload] Error:", err);
    if (err.message?.includes("R2 is not configured")) {
      return { success: false, error: "File storage is not configured by an administrator." };
    }
    return { success: false, error: err.message || "Failed to generate upload URL." };
  }
}

const ConfirmSchema = z.object({
  evidenceId: z.string().uuid(),
  requirementId: z.string().uuid(),
  filename: z.string().min(1).max(500),
  contentType: z.string().min(1),
  fileSizeBytes: z.number().int().positive(),
  storageKey: z.string().min(1),
  notes: z.string().optional(),
});

export type ConfirmResult =
  | { success: true; evidenceId: string }
  | { success: false; error: string };

/**
 * Step 2: After the browser successfully PUT the file to R2, confirm the upload.
 * Creates the actual evidence DB row and triggers D-007 requirement status sync.
 */
export async function confirmEvidenceUploadAction(
  data: z.infer<typeof ConfirmSchema>
): Promise<ConfirmResult> {
  try {
    const { orgId, userId } = await requireOrgRole("member");

    const parsed = ConfirmSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: "Invalid confirmation data." };
    }

    const { evidenceId, requirementId, filename, contentType, fileSizeBytes, storageKey, notes } =
      parsed.data;

    // Verify requirement ownership once more
    const req = await db.query.requirements.findFirst({
      where: and(
        eq(requirements.id, requirementId),
        eq(requirements.organizationId, orgId)
      ),
    });

    if (!req) {
      return { success: false, error: "Requirement not found or access denied." };
    }

    // Create the evidence row (also triggers syncRequirementStatus via repository)
    await createEvidence(orgId, {
      requirementId,
      fileName: sanitizeFilename(filename),
      fileSizeBytes,
      mimeType: contentType,
      storageKey,
      notes: notes || null,
      uploadedBy: userId,
    });

    revalidatePath(`/app/reports/[id]`, "page");

    return { success: true, evidenceId };
  } catch (err: any) {
    console.error("[confirmEvidenceUpload] Error:", err);
    return { success: false, error: err.message || "Failed to confirm upload." };
  }
}

export type DeleteEvidenceResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Soft-delete an evidence record and sync requirement status (D-007).
 */
export async function deleteEvidenceAction(
  evidenceId: string,
  reportId?: string
): Promise<DeleteEvidenceResult> {
  try {
    const { orgId } = await requireOrgRole("member");

    await softDeleteEvidence(orgId, evidenceId);

    revalidatePath(`/app/reports/[id]`, "page");

    return { success: true };
  } catch (err: any) {
    console.error("[deleteEvidence] Error:", err);
    return { success: false, error: err.message || "Failed to delete evidence." };
  }
}

export type GetEvidenceDownloadResult =
  | { success: true; url: string }
  | { success: false; error: string };

/**
 * Generate a 5-minute presigned download URL for a given evidence record.
 */
export async function getEvidenceDownloadUrlAction(
  evidenceId: string
): Promise<GetEvidenceDownloadResult> {
  try {
    const { orgId } = await requireOrgRole("member");

    const ev = await db.query.evidence.findFirst({
      where: and(
        eq(evidence.id, evidenceId),
        eq(evidence.organizationId, orgId),
        isNull(evidence.deletedAt)
      ),
    });

    if (!ev) {
      return { success: false, error: "Evidence not found or access denied." };
    }

    const url = await generatePresignedGetUrl(ev.storageKey, 300);
    return { success: true, url };
  } catch (err: any) {
    console.error("[getEvidenceDownloadUrl] Error:", err);
    if (err.message?.includes("R2 is not configured")) {
      return { success: false, error: "File storage is not configured." };
    }
    return { success: false, error: err.message || "Failed to generate download URL." };
  }
}

export type ListEvidenceResult =
  | { success: true; evidence: Array<{ id: string; fileName: string; mimeType: string; fileSizeBytes: number; notes: string | null; createdAt: Date }> }
  | { success: false; error: string };

export async function listEvidenceAction(
  requirementId: string
): Promise<ListEvidenceResult> {
  try {
    const { orgId } = await requireOrgRole("member");

    const rows = await db.query.evidence.findMany({
      where: and(
        eq(evidence.organizationId, orgId),
        eq(evidence.requirementId, requirementId),
        isNull(evidence.deletedAt)
      ),
      columns: {
        id: true,
        fileName: true,
        mimeType: true,
        fileSizeBytes: true,
        notes: true,
        createdAt: true,
      },
      orderBy: (ev, { desc }) => [desc(ev.createdAt)],
    });

    return { success: true, evidence: rows };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to list evidence." };
  }
}
