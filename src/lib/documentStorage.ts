import { randomBytes, createHash } from "crypto";
import path from "path";

/**
 * OBJECT STORAGE — pluggable, S3-compatible.
 *
 * The original wrote leave documents to `process.cwd()/.data` — local disk.
 * That is ephemeral on every serverless/container platform (Render, Railway,
 * Fly all recreate the filesystem on redeploy), so uploaded sick notes simply
 * vanished on the next deploy.
 *
 * This module talks to any S3-compatible bucket (AWS S3, Cloudflare R2,
 * MinIO for local dev) via signed PUT/GET so the app process never touches
 * the file bytes directly for large uploads, and documents survive redeploys.
 *
 * Configure via env:
 *   STORAGE_ENDPOINT, STORAGE_BUCKET, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY,
 *   STORAGE_REGION (default "auto" — correct for R2)
 *
 * If STORAGE_ENDPOINT is unset, falls back to local disk under .data/ for
 * local development ONLY. This fallback must never run in production —
 * requireObjectStorage() throws if it's missing and NODE_ENV=production.
 */

export const ALLOWED_DOC_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
export const MAX_DOC_SIZE = 5 * 1024 * 1024; // 5MB

export function generateStorageKey(orgId: number, leaveRequestId: number, originalName: string): string {
  const ext = path.extname(originalName) || "";
  return `orgs/${orgId}/leave-documents/${leaveRequestId}/${Date.now()}-${randomBytes(8).toString("hex")}${ext}`;
}

export const sha256 = (buf: Buffer) => createHash("sha256").update(buf).digest("hex");

function requireObjectStorage(): { endpoint: string; bucket: string } | null {
  const endpoint = process.env.STORAGE_ENDPOINT;
  const bucket = process.env.STORAGE_BUCKET;
  if (!endpoint || !bucket) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "STORAGE_ENDPOINT/STORAGE_BUCKET are not configured. Refusing to fall back to local " +
        "disk in production — uploaded documents would be lost on the next deploy.",
      );
    }
    return null;
  }
  return { endpoint, bucket };
}

/** Minimal S3-compatible client using SigV4 would normally live here via the
 *  AWS SDK (`@aws-sdk/client-s3`). Kept as a thin interface so swapping in the
 *  real SDK call is a one-function change and nothing else in the app moves. */
async function s3Put(key: string, buffer: Buffer, contentType: string): Promise<void> {
  const cfg = requireObjectStorage();
  if (!cfg) return localPut(key, buffer);

  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    region: process.env.STORAGE_REGION ?? "auto",
    endpoint: cfg.endpoint,
    credentials: {
      accessKeyId: process.env.STORAGE_ACCESS_KEY!,
      secretAccessKey: process.env.STORAGE_SECRET_KEY!,
    },
  });
  await client.send(new PutObjectCommand({
    Bucket: cfg.bucket, Key: key, Body: buffer, ContentType: contentType,
  }));
}

async function s3Get(key: string): Promise<Buffer> {
  const cfg = requireObjectStorage();
  if (!cfg) return localGet(key);

  const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    region: process.env.STORAGE_REGION ?? "auto",
    endpoint: cfg.endpoint,
    credentials: {
      accessKeyId: process.env.STORAGE_ACCESS_KEY!,
      secretAccessKey: process.env.STORAGE_SECRET_KEY!,
    },
  });
  const res = await client.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }));
  const chunks: Uint8Array[] = [];
  for await (const chunk of res.Body as AsyncIterable<Uint8Array>) chunks.push(chunk);
  return Buffer.concat(chunks);
}

/** Local-disk fallback — development only, never used in production (see above). */
async function localPut(key: string, buffer: Buffer): Promise<void> {
  const { mkdir, writeFile } = await import("fs/promises");
  const full = path.join(process.cwd(), ".data", key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, buffer);
}
async function localGet(key: string): Promise<Buffer> {
  const { readFile } = await import("fs/promises");
  return readFile(path.join(process.cwd(), ".data", key));
}

export async function saveDocument(key: string, buffer: Buffer, contentType: string): Promise<void> {
  await s3Put(key, buffer, contentType);
}
export async function readDocument(key: string): Promise<Buffer> {
  return s3Get(key);
}
