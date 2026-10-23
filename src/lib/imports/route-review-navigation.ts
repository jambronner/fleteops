const defaultImportReviewReturnPath = "/routes";
const allowedImportReviewReturnPaths = new Set(["/routes", "/imports"]);

export function buildImportReviewPath(batchId: string) {
  return `/imports/${encodeURIComponent(batchId)}/review`;
}

export function coerceImportReviewReturnPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return defaultImportReviewReturnPath;
  }

  return allowedImportReviewReturnPaths.has(value) ? value : defaultImportReviewReturnPath;
}
