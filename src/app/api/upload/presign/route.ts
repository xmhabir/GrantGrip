import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { grantDocuments, grants } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  generatePresignedPutUrl,
  buildGrantDocKey,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  sanitizeFilename,
} from "@/lib/storage/r2";
import { randomUUID } from "crypto";

const BodySchema = z.object({
  grantId: z.string().uuid(),
  filename: z.string().min(1).max(500),
  contentType: z.string().min(1),
  declaredSize: z.number().int().positive(),
});

export async function POST(req: NextRequest) {
  try {
    const { orgId, userId } = await requireOrgRole("member");

    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { grantId, filename, contentType, declaredSize } = parsed.data;

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.has(contentType)) {
      return NextResponse.json(
        { error: `File type "${contentType}" is not allowed.` },
        { status: 422 }
      );
    }

    // Validate declared size
    if (declaredSize > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        {
          error: `File exceeds maximum allowed size of 25 MB. Declared: ${(declaredSize / 1024 / 1024).toFixed(2)} MB`,
        },
        { status: 422 }
      );
    }

    // Verify grantId belongs to this org (tenant isolation)
    const grant = await db.query.grants.findFirst({
      where: and(eq(grants.id, grantId), eq(grants.organizationId, orgId)),
    });

    if (!grant) {
      return NextResponse.json(
        { error: "Grant not found or access denied." },
        { status: 404 }
      );
    }

    const docId = randomUUID();
    const storageKey = buildGrantDocKey(orgId, grantId, docId, filename);

    // Create pending grant_documents row
    await db.insert(grantDocuments).values({
      id: docId,
      organizationId: orgId,
      grantId,
      fileName: sanitizeFilename(filename),
      fileSizeBytes: declaredSize,
      mimeType: contentType,
      storageKey,
      uploadStatus: "pending",
      uploadedBy: userId,
    });

    const presignedUrl = await generatePresignedPutUrl(storageKey, contentType);

    return NextResponse.json({ presignedUrl, docId });
  } catch (err: any) {
    console.error("[presign/grant] Error:", err);
    if (err.message?.includes("Unauthorized") || err.message?.includes("Forbidden")) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err.message?.includes("R2 is not configured")) {
      return NextResponse.json({ error: "File storage is not configured." }, { status: 503 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
