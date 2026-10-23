import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db/client";
import { tenants } from "@/lib/db/schema";
import { parseRouteManifestMappingPayload, type RouteManifestMapping } from "@/lib/imports/route-manifest";

// Task 3: saved mapping profiles. A profile is a reusable, named `RouteManifestMapping` (the
// same column/constant/derived field-source shape produced by the import review workbench) that
// can be auto-applied to a future upload once the sheet's headers cover every column the profile
// references. Storage lives on `tenants.metadata.importMappingProfiles` (jsonb) -- no new table.

export type ImportMappingProfileImportType = "shipment_tracker";

export type ImportMappingProfile = {
  id: string;
  name: string;
  importType: ImportMappingProfileImportType;
  sheetName: string | null;
  mapping: RouteManifestMapping;
  createdAt: string;
  updatedAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const importMappingProfileImportTypeSchema = z.literal("shipment_tracker");

/**
 * Validates and normalizes a single stored profile entry. Returns null for anything that doesn't
 * match the expected shape (used to defensively drop corrupted/legacy entries when reading the
 * tenant metadata array, rather than failing the whole list).
 */
export function parseImportMappingProfile(value: unknown): ImportMappingProfile | null {
  if (!isRecord(value)) {
    return null;
  }

  if (typeof value.id !== "string" || !value.id.trim()) {
    return null;
  }

  if (typeof value.name !== "string" || !value.name.trim()) {
    return null;
  }

  const importType = importMappingProfileImportTypeSchema.safeParse(value.importType);
  if (!importType.success) {
    return null;
  }

  const mapping = parseRouteManifestMappingPayload(value.mapping);
  if (!mapping || Object.keys(mapping).length === 0) {
    return null;
  }

  if (typeof value.createdAt !== "string" || typeof value.updatedAt !== "string") {
    return null;
  }

  return {
    id: value.id,
    name: value.name,
    importType: importType.data,
    sheetName: typeof value.sheetName === "string" ? value.sheetName : null,
    mapping,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

export function parseImportMappingProfiles(value: unknown): ImportMappingProfile[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(parseImportMappingProfile)
    .filter((profile): profile is ImportMappingProfile => profile !== null);
}

export function readImportMappingProfilesFromTenantMetadata(
  metadata: Record<string, unknown> | null | undefined,
): ImportMappingProfile[] {
  if (!metadata) {
    return [];
  }

  return parseImportMappingProfiles(metadata.importMappingProfiles);
}

export function getImportMappingProfileById(
  profiles: ImportMappingProfile[],
  id: string,
): ImportMappingProfile | null {
  return profiles.find((profile) => profile.id === id) ?? null;
}

const importMappingProfileInputSchema = z.object({
  name: z.string().trim().min(1),
  importType: importMappingProfileImportTypeSchema,
  sheetName: z.string().trim().min(1).nullable().optional(),
  mapping: z.unknown(),
});

export type ImportMappingProfileValidationError = "invalid_input" | "invalid_mapping";

type ValidatedImportMappingProfileInput = {
  name: string;
  importType: ImportMappingProfileImportType;
  sheetName: string | null;
  mapping: RouteManifestMapping;
};

function validateImportMappingProfileInput(
  value: unknown,
):
  | { ok: true; input: ValidatedImportMappingProfileInput }
  | { ok: false; error: ImportMappingProfileValidationError } {
  const shape = importMappingProfileInputSchema.safeParse(value);

  if (!shape.success) {
    return { ok: false, error: "invalid_input" };
  }

  const mapping = parseRouteManifestMappingPayload(shape.data.mapping);

  if (!mapping || Object.keys(mapping).length === 0) {
    return { ok: false, error: "invalid_mapping" };
  }

  return {
    ok: true,
    input: {
      name: shape.data.name,
      importType: shape.data.importType,
      sheetName: shape.data.sheetName ?? null,
      mapping,
    },
  };
}

export type ImportMappingProfileUpsertResult =
  | { ok: true; profile: ImportMappingProfile; profiles: ImportMappingProfile[] }
  | { ok: false; error: ImportMappingProfileValidationError };

/**
 * The pure merge step of an upsert, once the input is already known to be valid: matches by
 * (importType, name) -- case-insensitive, matching how a user would think of "the demo-freight weekly
 * profile" regardless of casing. A matching existing profile keeps its `id` and `createdAt`;
 * everything else (sheetName, mapping, updatedAt) is replaced. Split out from
 * `upsertImportMappingProfile` so the locked, tenant-scoped repository path
 * (`upsertImportMappingProfileForTenant`) can validate once, take its row lock, and merge -- all
 * without re-validating already-known-good input inside the lock.
 */
function applyValidatedImportMappingProfileUpsert(args: {
  profiles: ImportMappingProfile[];
  input: ValidatedImportMappingProfileInput;
  now?: () => string;
  id?: () => string;
}): { profile: ImportMappingProfile; profiles: ImportMappingProfile[] } {
  const nowIso = (args.now ?? (() => new Date().toISOString()))();
  const existing = args.profiles.find(
    (profile) =>
      profile.importType === args.input.importType &&
      profile.name.trim().toLowerCase() === args.input.name.trim().toLowerCase(),
  );

  const profile: ImportMappingProfile = existing
    ? {
        ...existing,
        name: args.input.name,
        sheetName: args.input.sheetName,
        mapping: args.input.mapping,
        updatedAt: nowIso,
      }
    : {
        id: (args.id ?? randomUUID)(),
        name: args.input.name,
        importType: args.input.importType,
        sheetName: args.input.sheetName,
        mapping: args.input.mapping,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

  const profiles = existing
    ? args.profiles.map((entry) => (entry.id === existing.id ? profile : entry))
    : [...args.profiles, profile];

  return { profile, profiles };
}

/**
 * Upserts a profile by (importType, name) from raw, unvalidated input. Used directly by the pure
 * unit tests in this module; the tenant-scoped repository path validates separately (see
 * `upsertImportMappingProfileForTenant`) so it can fail fast before taking a row lock.
 */
export function upsertImportMappingProfile(args: {
  profiles: ImportMappingProfile[];
  input: unknown;
  now?: () => string;
  id?: () => string;
}): ImportMappingProfileUpsertResult {
  const validated = validateImportMappingProfileInput(args.input);

  if (!validated.ok) {
    return validated;
  }

  const { profile, profiles } = applyValidatedImportMappingProfileUpsert({
    profiles: args.profiles,
    input: validated.input,
    now: args.now,
    id: args.id,
  });

  return { ok: true, profile, profiles };
}

export function deleteImportMappingProfile(args: { profiles: ImportMappingProfile[]; id: string }): ImportMappingProfile[] {
  return args.profiles.filter((profile) => profile.id !== args.id);
}

function mappingColumnHeaders(mapping: RouteManifestMapping): string[] {
  return Object.values(mapping)
    .filter((source): source is { type: "column"; header: string } => Boolean(source) && source.type === "column")
    .map((source) => source.header);
}

/**
 * Finds the best profile to auto-apply to a freshly uploaded sheet: among profiles for the given
 * import type whose every "column" field source is present in the sheet's headers (a full-coverage
 * match), returns the most recently updated one. Profiles with no column-type sources never match
 * -- there is nothing sheet-specific to verify, so auto-applying one would be a guess, not a match.
 */
export function findMatchingImportMappingProfile(args: {
  profiles: ImportMappingProfile[];
  importType: ImportMappingProfileImportType;
  headers: string[];
}): ImportMappingProfile | null {
  const headerSet = new Set(args.headers);

  const candidates = args.profiles.filter((profile) => {
    if (profile.importType !== args.importType) {
      return false;
    }

    const requiredHeaders = mappingColumnHeaders(profile.mapping);
    return requiredHeaders.length > 0 && requiredHeaders.every((header) => headerSet.has(header));
  });

  return candidates.reduce<ImportMappingProfile | null>((latest, candidate) => {
    if (!latest || candidate.updatedAt > latest.updatedAt) {
      return candidate;
    }

    return latest;
  }, null);
}

// --- Thin, tenant-scoped repository (DB access only; all decisions above are pure) ------------
//
// upsert/delete are read-modify-write on the single `tenants.metadata` jsonb column: read the
// current profiles array, apply a pure decision, write the whole (merged) metadata object back.
// Two concurrent confirms for the same tenant doing that naively -- plain SELECT then UPDATE, no
// locking -- can both read the same starting metadata and the later UPDATE silently discards the
// earlier one's saved profile (last-writer-wins on the *entire* object, not just the one key).
// Both mutations below instead run inside a transaction that takes `SELECT ... FOR UPDATE` on the
// tenant row first: a second concurrent transaction blocks on that SELECT until the first one
// commits its UPDATE, so it always merges onto the up-to-date metadata rather than a stale read.
// The merge always spreads the freshly-locked-read metadata before overwriting just the
// `importMappingProfiles` key, so other metadata keys (present now or added later) are preserved.

function requireDb() {
  if (!db) {
    throw new Error("Database is not configured.");
  }

  return db;
}

export async function listImportMappingProfiles(tenantId: string): Promise<ImportMappingProfile[]> {
  if (!db) {
    return [];
  }

  const [row] = await db.select({ metadata: tenants.metadata }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);

  return readImportMappingProfilesFromTenantMetadata(row?.metadata ?? null);
}

export async function getImportMappingProfileForTenant(args: {
  tenantId: string;
  id: string;
}): Promise<ImportMappingProfile | null> {
  const profiles = await listImportMappingProfiles(args.tenantId);
  return getImportMappingProfileById(profiles, args.id);
}

export async function upsertImportMappingProfileForTenant(args: {
  tenantId: string;
  input: unknown;
}): Promise<ImportMappingProfileUpsertResult> {
  // Validate before ever opening a transaction / taking a row lock: malformed input should fail
  // fast without contending for the tenant row.
  const validated = validateImportMappingProfileInput(args.input);

  if (!validated.ok) {
    return validated;
  }

  const database = requireDb();

  return database.transaction(async (tx) => {
    const [row] = await tx
      .select({ metadata: tenants.metadata })
      .from(tenants)
      .where(eq(tenants.id, args.tenantId))
      .for("update");

    const existingProfiles = readImportMappingProfilesFromTenantMetadata(row?.metadata ?? null);
    const merged = applyValidatedImportMappingProfileUpsert({ profiles: existingProfiles, input: validated.input });

    await tx
      .update(tenants)
      .set({
        metadata: { ...(row?.metadata ?? {}), importMappingProfiles: merged.profiles },
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, args.tenantId));

    return { ok: true, profile: merged.profile, profiles: merged.profiles };
  });
}

export async function deleteImportMappingProfileForTenant(args: { tenantId: string; id: string }): Promise<void> {
  const database = requireDb();

  await database.transaction(async (tx) => {
    const [row] = await tx
      .select({ metadata: tenants.metadata })
      .from(tenants)
      .where(eq(tenants.id, args.tenantId))
      .for("update");

    const existingProfiles = readImportMappingProfilesFromTenantMetadata(row?.metadata ?? null);
    const profiles = deleteImportMappingProfile({ profiles: existingProfiles, id: args.id });

    await tx
      .update(tenants)
      .set({
        metadata: { ...(row?.metadata ?? {}), importMappingProfiles: profiles },
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, args.tenantId));
  });
}

// --- Confirm-flow wiring (injectable for testing without a DB) ---------------------------------

export type SaveConfirmedMappingProfileDeps = {
  upsertImportMappingProfileForTenant: (args: {
    tenantId: string;
    input: unknown;
  }) => Promise<ImportMappingProfileUpsertResult>;
};

const defaultSaveConfirmedMappingProfileDeps: SaveConfirmedMappingProfileDeps = {
  upsertImportMappingProfileForTenant,
};

export type SaveConfirmedMappingProfileResult = {
  savedProfile: { id: string; name: string } | null;
  warning: string | null;
};

function mappingProfileSaveFailedWarning(locale: string): string {
  return locale === "en" ? "The mapping profile could not be saved." : "No se pudo guardar el perfil de mapeo.";
}

/**
 * The import confirm handler's "save this mapping as a profile" wiring, factored out so it can be
 * unit-tested with a fake repository instead of a real database. Persists the reviewed,
 * draft-canonical mapping and sheet name (including derived sources like dispatch date <- file
 * name) under the requested name. A save failure never fails the confirm response -- the shipment
 * import it's attached to has already happened -- it only surfaces as a warning string. This
 * applies equally to a returned `{ ok: false }` result AND a thrown error (e.g. a row-lock timeout
 * or dropped connection from `upsertImportMappingProfileForTenant`'s transaction) -- this function
 * never throws (final-review fix wave, Finding 3: a thrown error here used to propagate out of the
 * confirm handler and turn an already-committed import into an error response).
 */
export async function saveConfirmedMappingProfile(
  args: {
    tenantId: string;
    locale: string;
    saveProfileName: string | null | undefined;
    sheetName: string | null;
    mapping: RouteManifestMapping;
  },
  deps: SaveConfirmedMappingProfileDeps = defaultSaveConfirmedMappingProfileDeps,
): Promise<SaveConfirmedMappingProfileResult> {
  const name = args.saveProfileName?.trim();

  if (!name) {
    return { savedProfile: null, warning: null };
  }

  let result: ImportMappingProfileUpsertResult;

  try {
    result = await deps.upsertImportMappingProfileForTenant({
      tenantId: args.tenantId,
      input: {
        name,
        importType: "shipment_tracker",
        sheetName: args.sheetName,
        mapping: args.mapping,
      },
    });
  } catch {
    return { savedProfile: null, warning: mappingProfileSaveFailedWarning(args.locale) };
  }

  if (result.ok) {
    return { savedProfile: { id: result.profile.id, name: result.profile.name }, warning: null };
  }

  return { savedProfile: null, warning: mappingProfileSaveFailedWarning(args.locale) };
}
