import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { grantDocuments } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  headObject,
  deleteObject,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
} from "@/lib/storage/r2";

const BodySchema = z.object({
  docId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  try {
    const { orgId } = await requireOrgRole("member");

    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { docId } = parsed.data;

    // Load grant document, verifying org ownership
    const doc = await db.query.grantDocuments.findFirst({
      where: and(
        eq(grantDocuments.id, docId),
        eq(grantDocuments.organizationId, orgId)
      ),
    });

    if (!doc) {
      return NextResponse.json(
        { error: "Document not found or access denied." },
        { status: 404 }
      );
    }

    if (doc.uploadStatus === "uploaded") {
      return NextResponse.json({ success: true, docId }); // idempotent
    }

    // HEAD R2 to verify the object actually landed
    const metadata = await headObject(doc.storageKey);

    if (!metadata) {
      // Object never arrived — clean up DB row
      await db
        .delete(grantDocuments)
        .where(
          and(
            eq(grantDocuments.id, docId),
            eq(grantDocuments.organizationId, orgId)
          )
        );
      return NextResponse.json(
        { error: "File was not found in storage. Please re-upload." },
        { status: 422 }
      );
    }

    // Validate actual size (guards against client lying about declaredSize)
    if (metadata.contentLength > MAX_FILE_SIZE_BYTES) {
      await deleteObject(doc.storageKey);
      await db
        .delete(grantDocuments)
        .where(
          and(
            eq(grantDocuments.id, docId),
            eq(grantDocuments.organizationId, orgId)
          )
        );
      return NextResponse.json(
        { error: "Uploaded file exceeds the 25 MB size limit." },
        { status: 422 }
      );
    }

    // Validate actual content type (guards against MIME smuggling)
    if (!ALLOWED_MIME_TYPES.has(metadata.contentType)) {
      await deleteObject(doc.storageKey);
      await db
        .delete(grantDocuments)
        .where(
          and(
            eq(grantDocuments.id, docId),
            eq(grantDocuments.organizationId, orgId)
          )
        );
      return NextResponse.json(
        { error: `File type "${metadata.contentType}" is not permitted.` },
        { status: 422 }
      );
    }

    // Promote to uploaded
    await db
      .update(grantDocuments)
      .set({
        uploadStatus: "uploaded",
        fileSizeBytes: metadata.contentLength,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(grantDocuments.id, docId),
          eq(grantDocuments.organizationId, orgId)
        )
      );

    return NextResponse.json({ success: true, docId });
  } catch (err: any) {
    console.error("[upload/confirm] Error:", err);
    if (err.message?.includes("Unauthorized") || err.message?.includes("Forbidden")) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err.message?.includes("R2 is not configured")) {
      return NextResponse.json({ error: "File storage is not configured." }, { status: 503 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
