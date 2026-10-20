/**
 * Cloudflare R2 Storage Client
 * Uses AWS SDK v3 S3-compatible API pointed at R2 endpoint.
 * All operations are safe to call server-side only.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";

/** Max file size enforced both at presign-time and on HEAD verify: 25 MB */
export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

/** Allowed MIME types for evidence uploads */
export const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/zip",
]);

function buildR2Client(): S3Client | null {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    return null;
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
}

function getClient(): S3Client {
  const client = buildR2Client();
  if (!client) {
    throw new Error(
      "R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY in your environment."
    );
  }
  return client;
}

/**
 * Generate a presigned PUT URL for uploading a file directly from the browser.
 * @param key   R2 object key (storage path)
 * @param contentType   MIME type of the upload
 * @param ttlSeconds    URL expiry in seconds (default 5 minutes)
 */
export async function generatePresignedPutUrl(
  key: string,
  contentType: string,
  ttlSeconds = 300
): Promise<string> {
  const client = getClient();
  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(client, command, { expiresIn: ttlSeconds });
}

/**
 * Generate a presigned GET URL for downloading a file.
 * @param key           R2 object key
 * @param ttlSeconds    URL expiry in seconds (default 5 minutes)
 */
export async function generatePresignedGetUrl(
  key: string,
  ttlSeconds = 300
): Promise<string> {
  const client = getClient();
  const command = new GetObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
  });
  return getSignedUrl(client, command, { expiresIn: ttlSeconds });
}

/**
 * HEAD an R2 object to check existence and metadata.
 */
export async function headObject(
  key: string
): Promise<{ contentLength: number; contentType: string } | null> {
  const client = getClient();
  try {
    const response = await client.send(
      new HeadObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key })
    );
    return {
      contentLength: response.ContentLength ?? 0,
      contentType: response.ContentType ?? "application/octet-stream",
    };
  } catch (err: any) {
    if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw err;
  }
}

/**
 * Delete an object from R2 (soft-fail: does not throw if object not found).
 */
export async function deleteObject(key: string): Promise<void> {
  const client = getClient();
  try {
    await client.send(
      new DeleteObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key })
    );
  } catch (err: any) {
    // Ignore 404 — object may already be gone
    if (err.name !== "NotFound" && err.$metadata?.httpStatusCode !== 404) {
      throw err;
    }
  }
}

/** Sanitize a filename to be safe for use as a URL/path segment. */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(0, 200);
}

/** Build the canonical R2 key for an evidence file. */
export function buildEvidenceKey(
  orgId: string,
  requirementId: string,
  evidenceId: string,
  filename: string
): string {
  return `org/${orgId}/requirements/${requirementId}/evidence/${evidenceId}/${sanitizeFilename(filename)}`;
}

/** Build the canonical R2 key for a grant document. */
export function buildGrantDocKey(
  orgId: string,
  grantId: string,
  docId: string,
  filename: string
): string {
  return `org/${orgId}/grants/${grantId}/docs/${docId}/${sanitizeFilename(filename)}`;
}
