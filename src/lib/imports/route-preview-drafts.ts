import type { SupportedImportFormat } from "@/lib/imports/contracts";
import type { RouteManifestMapping } from "@/lib/imports/route-manifest";
import type { StoredObjectRef } from "@/lib/storage/types";

export type RoutePreviewDraftPreview = {
  fileName: string;
  importType: "shipment_tracker";
  sourceFormat: SupportedImportFormat;
  sheetName: string | null;
  sheets: Array<{ name: string; nonEmptyRowCount: number }>;
  sourceHeaders: string[];
  acceptedFields: unknown[];
  suggestedMapping: RouteManifestMapping;
  mapping: RouteManifestMapping;
  directoryOptions: {
    locations: unknown[];
    organizations: unknown[];
  };
  result: Record<string, unknown>;
  warnings: string[];
  appliedProfile: { id: string; name: string } | null;
};

export type RoutePreviewDraftMetadata = {
  importType: "shipment_tracker";
  fileName: string;
  sourceFormat: SupportedImportFormat;
  mappingTemplate: string | null;
  stableFileUrl: string;
  file: {
    size: number | null;
    mimeType: string | null;
  };
  storage: StoredObjectRef;
  scan?: {
    outcome: string;
    requestId: string | null;
    scannedAt: string;
  };
  routeManifestMapping: RouteManifestMapping;
  sheetName: string | null;
  routePreviewDraft: {
    version: 1;
    preview: RoutePreviewDraftPreview;
    savedAt: string;
  };
};

function normalizeComparable(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeComparable);
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, normalizeComparable(nested)]),
    );
  }

  return value;
}

function sameValue(left: unknown, right: unknown) {
  return (
    JSON.stringify(normalizeComparable(left)) ===
    JSON.stringify(normalizeComparable(right))
  );
}

export function routePreviewConfirmationMatches(args: {
  draft: RoutePreviewDraftMetadata;
  mappingTemplate?: string | null;
  routeManifestMapping?: unknown;
  sheetName?: string | null;
}) {
  const submittedMappingTemplate = args.mappingTemplate?.trim() || null;
  const submittedSheetName = args.sheetName?.trim() || null;

  return (
    (args.mappingTemplate === undefined ||
      submittedMappingTemplate === args.draft.mappingTemplate) &&
    (args.sheetName === undefined ||
      submittedSheetName === args.draft.sheetName) &&
    (args.routeManifestMapping === undefined ||
      sameValue(
        args.routeManifestMapping,
        args.draft.routeManifestMapping,
      ))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSupportedImportFormat(value: unknown): value is SupportedImportFormat {
  return value === "csv" || value === "xlsx" || value === "xls";
}

function readStoredObjectRef(value: unknown): StoredObjectRef | null {
  if (!isRecord(value) || (value.driver !== "local" && value.driver !== "s3") || typeof value.key !== "string") {
    return null;
  }

  return {
    driver: value.driver,
    key: value.key,
    contentType: typeof value.contentType === "string" ? value.contentType : null,
    size: typeof value.size === "number" ? value.size : null,
    originalFileName: typeof value.originalFileName === "string" ? value.originalFileName : null,
  };
}

function readAppliedProfile(value: unknown): { id: string; name: string } | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") {
    return null;
  }

  return { id: value.id, name: value.name };
}

function readRoutePreview(value: unknown): RoutePreviewDraftPreview | null {
  if (!isRecord(value) || value.importType !== "shipment_tracker" || typeof value.fileName !== "string") {
    return null;
  }

  if (!isSupportedImportFormat(value.sourceFormat) || !Array.isArray(value.sourceHeaders) || !isRecord(value.result)) {
    return null;
  }

  const directoryOptions = isRecord(value.directoryOptions)
    ? {
        locations: Array.isArray(value.directoryOptions.locations) ? value.directoryOptions.locations : [],
        organizations: Array.isArray(value.directoryOptions.organizations) ? value.directoryOptions.organizations : [],
      }
    : { locations: [], organizations: [] };

  return {
    fileName: value.fileName,
    importType: "shipment_tracker",
    sourceFormat: value.sourceFormat,
    sheetName: typeof value.sheetName === "string" ? value.sheetName : null,
    sheets: Array.isArray(value.sheets) ? value.sheets as Array<{ name: string; nonEmptyRowCount: number }> : [],
    sourceHeaders: value.sourceHeaders.map(String),
    acceptedFields: Array.isArray(value.acceptedFields) ? value.acceptedFields : [],
    suggestedMapping: isRecord(value.suggestedMapping) ? value.suggestedMapping as RouteManifestMapping : {},
    mapping: isRecord(value.mapping) ? value.mapping as RouteManifestMapping : {},
    directoryOptions,
    result: value.result,
    warnings: Array.isArray(value.warnings) ? value.warnings.map(String) : [],
    appliedProfile: readAppliedProfile(value.appliedProfile),
  };
}

export function buildRoutePreviewDraftMetadata(args: {
  fileName: string;
  sourceFormat: SupportedImportFormat;
  mappingTemplate: string | null;
  sheetName: string | null;
  routeManifestMapping: RouteManifestMapping;
  preview: RoutePreviewDraftPreview;
  stableFileUrl: string;
  storedObject: StoredObjectRef;
  scan?: {
    outcome: string;
    requestId: string | null;
    scannedAt: string;
  };
  savedAt?: string;
}): RoutePreviewDraftMetadata {
  return {
    importType: "shipment_tracker",
    fileName: args.fileName,
    sourceFormat: args.sourceFormat,
    mappingTemplate: args.mappingTemplate,
    stableFileUrl: args.stableFileUrl,
    file: {
      size: args.storedObject.size ?? null,
      mimeType: args.storedObject.contentType ?? null,
    },
    storage: args.storedObject,
    scan: args.scan,
    routeManifestMapping: args.routeManifestMapping,
    sheetName: args.sheetName,
    routePreviewDraft: {
      version: 1,
      preview: args.preview,
      savedAt: args.savedAt ?? new Date().toISOString(),
    },
  };
}

export function readRoutePreviewDraftMetadata(value: unknown): RoutePreviewDraftMetadata | null {
  if (!isRecord(value) || value.importType !== "shipment_tracker" || !isSupportedImportFormat(value.sourceFormat)) {
    return null;
  }

  const storage = readStoredObjectRef(value.storage);
  const routePreviewDraft = isRecord(value.routePreviewDraft) ? value.routePreviewDraft : null;
  const preview = readRoutePreview(routePreviewDraft?.preview);

  if (!storage || !routePreviewDraft || routePreviewDraft.version !== 1 || !preview) {
    return null;
  }

  return {
    importType: "shipment_tracker",
    fileName: preview.fileName,
    sourceFormat: value.sourceFormat,
    mappingTemplate: typeof value.mappingTemplate === "string" ? value.mappingTemplate : null,
    stableFileUrl: typeof value.stableFileUrl === "string" ? value.stableFileUrl : "",
    file: isRecord(value.file)
      ? {
          size: typeof value.file.size === "number" ? value.file.size : null,
          mimeType: typeof value.file.mimeType === "string" ? value.file.mimeType : null,
        }
      : {
          size: storage.size ?? null,
          mimeType: storage.contentType ?? null,
        },
    storage,
    scan: isRecord(value.scan)
      ? {
          outcome:
            typeof value.scan.outcome === "string"
              ? value.scan.outcome
              : "unknown",
          requestId:
            typeof value.scan.requestId === "string"
              ? value.scan.requestId
              : null,
          scannedAt:
            typeof value.scan.scannedAt === "string"
              ? value.scan.scannedAt
              : "",
        }
      : undefined,
    routeManifestMapping: isRecord(value.routeManifestMapping) ? value.routeManifestMapping as RouteManifestMapping : preview.mapping,
    sheetName: typeof value.sheetName === "string" ? value.sheetName : preview.sheetName,
    routePreviewDraft: {
      version: 1,
      preview,
      savedAt: typeof routePreviewDraft.savedAt === "string" ? routePreviewDraft.savedAt : "",
    },
  };
}
