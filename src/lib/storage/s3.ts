import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { getS3StorageConfig } from "@/lib/env";
import type { StorageDriver } from "@/lib/storage/types";

type ResolvedS3Config = {
  bucket: string;
  region: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
};

let cachedClient: { cacheKey: string; client: S3Client } | null = null;

function buildMissingConfigError(missing: string[]) {
  return new Error(`S3 storage is not configured. Missing: ${missing.join(", ")}.`);
}

function resolveS3Config(): ResolvedS3Config {
  const config = getS3StorageConfig();
  const bucket = config.bucket;
  const endpoint = config.endpoint;
  const accessKeyId = config.accessKeyId;
  const secretAccessKey = config.secretAccessKey;
  const missing: string[] = [];

  if (!bucket) {
    missing.push("S3_BUCKET");
  }

  if (!endpoint) {
    missing.push("S3_ENDPOINT");
  }

  if (!accessKeyId) {
    missing.push("S3_ACCESS_KEY_ID");
  }

  if (!secretAccessKey) {
    missing.push("S3_SECRET_ACCESS_KEY");
  }

  if (missing.length > 0) {
    throw buildMissingConfigError(missing);
  }

  return {
    bucket: bucket as string,
    region: config.region || "auto",
    endpoint: endpoint as string,
    accessKeyId: accessKeyId as string,
    secretAccessKey: secretAccessKey as string,
  };
}

function getS3Client() {
  const config = resolveS3Config();
  const cacheKey = JSON.stringify(config);

  if (cachedClient?.cacheKey === cacheKey) {
    return { client: cachedClient.client, config };
  }

  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  cachedClient = { cacheKey, client };

  return { client, config };
}

function sanitizeDownloadFileName(fileName: string | null | undefined) {
  const normalized = (fileName ?? "file")
    .replace(/[\r\n]/g, " ")
    .replace(/["\\]/g, "_")
    .trim();

  return normalized || "file";
}

function encodeRfc5987FileName(fileName: string) {
  return encodeURIComponent(fileName).replace(/['()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function buildInlineContentDisposition(fileName: string | null | undefined) {
  const safeFileName = sanitizeDownloadFileName(fileName);
  return `inline; filename="${safeFileName}"; filename*=UTF-8''${encodeRfc5987FileName(safeFileName)}`;
}

export const s3StorageDriver: StorageDriver = {
  name: "s3",
  async putObject({ key, body, contentType, originalFileName }) {
    const { client, config } = getS3Client();

    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType ?? undefined,
        Metadata: originalFileName ? { originalfilename: originalFileName } : undefined,
      }),
    );

    return {
      driver: "s3",
      key,
      contentType: contentType ?? null,
      size: body.byteLength,
      originalFileName: originalFileName ?? null,
    };
  },
  async readObject({ key }) {
    const { client, config } = getS3Client();
    const response = await client.send(
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: key,
      }),
    );

    if (!response.Body) {
      throw new Error("Stored file not found.");
    }

    return response.Body.transformToByteArray();
  },
  async createSignedReadUrl({ key, expiresInSeconds = 900, fileName }) {
    const { client, config } = getS3Client();

    return getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: key,
        ResponseContentDisposition: buildInlineContentDisposition(fileName),
      }),
      { expiresIn: expiresInSeconds },
    );
  },
  async deleteObject({ key }) {
    const { client, config } = getS3Client();

    await client.send(
      new DeleteObjectCommand({
        Bucket: config.bucket,
        Key: key,
      }),
    );
  },
};
