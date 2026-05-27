import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type StorageProvider = "local" | "s3";

export interface StoredObject {
  provider: StorageProvider;
  key: string;
  url: string;
  size: number;
  contentType: string;
}

export function getStorageProvider(): StorageProvider {
  if (
    process.env.S3_BUCKET &&
    process.env.S3_REGION &&
    process.env.S3_ACCESS_KEY_ID &&
    process.env.S3_SECRET_ACCESS_KEY
  ) {
    return "s3";
  }

  return "local";
}

export async function storeObject({
  key,
  bytes,
  contentType
}: {
  key: string;
  bytes: Uint8Array;
  contentType: string;
}): Promise<StoredObject> {
  const safeKey = key.replace(/^\/+/, "").replace(/\.\./g, "");

  if (getStorageProvider() === "s3") {
    return storeS3Object({ key: safeKey, bytes, contentType });
  }

  const root = join(process.cwd(), "public", "generated");
  const filePath = join(root, safeKey);
  await mkdir(filePath.split("/").slice(0, -1).join("/"), { recursive: true });
  await writeFile(filePath, bytes);

  return {
    provider: "local",
    key: safeKey,
    url: `/generated/${safeKey}`,
    size: bytes.byteLength,
    contentType
  };
}

async function storeS3Object({
  key,
  bytes,
  contentType
}: {
  key: string;
  bytes: Uint8Array;
  contentType: string;
}): Promise<StoredObject> {
  const bucket = process.env.S3_BUCKET ?? "";
  const region = process.env.S3_REGION ?? "us-east-1";
  const endpoint = process.env.S3_ENDPOINT?.replace(/\/$/, "");
  const publicBaseUrl = process.env.S3_PUBLIC_BASE_URL?.replace(/\/$/, "");
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    region,
    endpoint,
    forcePathStyle: Boolean(endpoint),
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? ""
    }
  });

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: bytes,
      ContentType: contentType
    })
  );

  return {
    provider: "s3",
    key,
    url: publicBaseUrl ? `${publicBaseUrl}/${key}` : `s3://${bucket}/${key}`,
    size: bytes.byteLength,
    contentType
  };
}
