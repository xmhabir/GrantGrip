import { NextRequest, NextResponse } from "next/server";
import { requireOrgRole } from "@/lib/auth";
import { getEvidenceById } from "@/lib/repositories/evidence";
import { db } from "@/lib/db";
import { grantDocuments } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { generatePresignedGetUrl } from "@/lib/storage/r2";

interface RouteParams {
  params: Promise<{ docId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await requireOrgRole("member");
    const { docId } = await params;

    if (!docId) {
      return NextResponse.json({ error: "Missing docId" }, { status: 400 });
    }

    // Check if this is an evidence ID or a grant document ID
    const searchParam = req.nextUrl.searchParams.get("type") ?? "evidence";

    let storageKey: string | null = null;

    if (searchParam === "grant_document") {
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
      storageKey = doc.storageKey;
    } else {
      // Default: evidence
      const ev = await getEvidenceById(orgId, docId);
      if (!ev) {
        return NextResponse.json(
          { error: "Evidence not found or access denied." },
          { status: 404 }
        );
      }
      storageKey = ev.storageKey;
    }

    // Generate 5-minute presigned download URL
    const downloadUrl = await generatePresignedGetUrl(storageKey, 300);

    // Redirect client directly to presigned URL
    return NextResponse.redirect(downloadUrl, { status: 302 });
  } catch (err: any) {
    console.error("[download] Error:", err);
    if (err.message?.includes("Unauthorized") || err.message?.includes("Forbidden")) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err.message?.includes("R2 is not configured")) {
      return NextResponse.json({ error: "File storage is not configured." }, { status: 503 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
