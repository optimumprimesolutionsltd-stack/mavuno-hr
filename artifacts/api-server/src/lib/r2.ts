import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";
import { HttpError } from "./http-error.js";

/**
 * Cloudflare R2 (S3-compatible) client for private per-org file storage —
 * employee photos and documents. Everything is private: there are no public
 * URLs or presigned links. Reads and writes always go through our own
 * authenticated routes, which stream bytes through the API server — this
 * matters here because documents include national ID scans.
 *
 * Required env vars:
 *   R2_ACCOUNT_ID
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *   R2_BUCKET_NAME
 */
function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new HttpError(500, `File storage is not configured: missing ${name}`);
  return value;
}

let _client: S3Client | null = null;
function client(): S3Client {
  if (_client) return _client;
  _client = new S3Client({
    region: "auto",
    endpoint: `https://${requiredEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
  return _client;
}

const bucket = () => requiredEnv("R2_BUCKET_NAME");

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await client().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }));
}

export async function getObject(key: string): Promise<{ body: Readable; contentType?: string; contentLength?: number }> {
  const res = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  return { body: res.Body as Readable, contentType: res.ContentType, contentLength: res.ContentLength };
}

export async function deleteObject(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
