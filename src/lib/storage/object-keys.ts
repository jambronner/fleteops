import { randomUUID } from "node:crypto";

function sanitizeFileName(fileName?: string | null) {
  const baseName = (fileName ?? "document")
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  return baseName || "document";
}

export function buildStoredObjectRoutePath(key: string) {
  return `/api/storage/objects/${key
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

function getSafeFileExtension(fileName?: string | null) {
  const safeName = sanitizeFileName(fileName);
  const extension = safeName.match(/\.[a-z0-9]{1,12}$/i)?.[0];

  return extension ?? "";
}

export function buildContentAddressedDocumentObjectKey(args: {
  tenantId: string;
  sha256: string;
  originalFileName?: string | null;
}) {
  return [
    "tenants",
    args.tenantId,
    "documents",
    "_blobs",
    `${args.sha256}${getSafeFileExtension(args.originalFileName)}`,
  ].join("/");
}

export function buildDocumentObjectKey(args: {
  tenantId: string;
  documentId: string;
  originalFileName?: string | null;
}) {
  const safeName = sanitizeFileName(args.originalFileName);

  return [
    "tenants",
    args.tenantId,
    "documents",
    args.documentId,
    `${Date.now()}-${randomUUID()}-${safeName}`,
  ].join("/");
}

export function buildImportBatchObjectKey(args: {
  tenantId: string;
  importBatchId: string;
  importType: string;
  originalFileName?: string | null;
}) {
  const safeName = sanitizeFileName(args.originalFileName);

  return [
    "tenants",
    args.tenantId,
    "imports",
    args.importType,
    args.importBatchId,
    `${Date.now()}-${randomUUID()}-${safeName}`,
  ].join("/");
}
