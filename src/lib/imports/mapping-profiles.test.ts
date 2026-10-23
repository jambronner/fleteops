import assert from "node:assert/strict";
import { test } from "node:test";

import {
  deleteImportMappingProfile,
  findMatchingImportMappingProfile,
  parseImportMappingProfiles,
  saveConfirmedMappingProfile,
  upsertImportMappingProfile,
  type ImportMappingProfile,
  type ImportMappingProfileUpsertResult,
  type SaveConfirmedMappingProfileDeps,
} from "./mapping-profiles";

function makeProfile(overrides: Partial<ImportMappingProfile> = {}): ImportMappingProfile {
  return {
    id: "profile-1",
    name: "demo-freight weekly",
    importType: "shipment_tracker",
    sheetName: "Lista completa",
    mapping: {
      routeGroup: { type: "column", header: "Ruta" },
      deliveryPointName: { type: "column", header: "Nombre" },
    },
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

test("upsertImportMappingProfile creates a new profile with a fresh id and timestamps", () => {
  const result = upsertImportMappingProfile({
    profiles: [],
    input: {
      name: "demo-freight weekly",
      importType: "shipment_tracker",
      sheetName: "Lista completa",
      mapping: {
        routeGroup: { type: "column", header: "Ruta" },
      },
    },
    now: () => "2026-01-18T12:00:00.000Z",
    id: () => "profile-new",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.profile.id, "profile-new");
  assert.equal(result.profile.name, "demo-freight weekly");
  assert.equal(result.profile.importType, "shipment_tracker");
  assert.equal(result.profile.sheetName, "Lista completa");
  assert.equal(result.profile.createdAt, "2026-01-18T12:00:00.000Z");
  assert.equal(result.profile.updatedAt, "2026-01-18T12:00:00.000Z");
  assert.deepEqual(result.profiles, [result.profile]);
});

test("upsertImportMappingProfile upserts by name, keeping id and createdAt stable", () => {
  const existing = makeProfile();

  const result = upsertImportMappingProfile({
    profiles: [existing],
    input: {
      name: "demo-freight weekly",
      importType: "shipment_tracker",
      sheetName: "Lista completa (updated)",
      mapping: {
        routeGroup: { type: "column", header: "Ruta 2" },
      },
    },
    now: () => "2026-01-18T12:00:00.000Z",
    id: () => "should-not-be-used",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.profiles.length, 1);
  assert.equal(result.profile.id, existing.id);
  assert.equal(result.profile.createdAt, existing.createdAt);
  assert.equal(result.profile.updatedAt, "2026-01-18T12:00:00.000Z");
  assert.deepEqual(result.profile.mapping, { routeGroup: { type: "column", header: "Ruta 2" } });
  assert.equal(result.profile.sheetName, "Lista completa (updated)");
});

test("upsertImportMappingProfile rejects malformed mappings", () => {
  const missingMapping = upsertImportMappingProfile({
    profiles: [],
    input: { name: "Bad profile", importType: "shipment_tracker", sheetName: null, mapping: "not-an-object" },
  });
  assert.equal(missingMapping.ok, false);

  const emptyMapping = upsertImportMappingProfile({
    profiles: [],
    input: { name: "Bad profile", importType: "shipment_tracker", sheetName: null, mapping: { unknownField: { type: "column", header: "X" } } },
  });
  assert.equal(emptyMapping.ok, false);

  const missingName = upsertImportMappingProfile({
    profiles: [],
    input: { name: "  ", importType: "shipment_tracker", sheetName: null, mapping: { routeGroup: { type: "column", header: "Ruta" } } },
  });
  assert.equal(missingName.ok, false);
});

test("import mapping profiles survive a JSON (jsonb) round trip", () => {
  const created = upsertImportMappingProfile({
    profiles: [],
    input: {
      name: "demo-freight weekly",
      importType: "shipment_tracker",
      sheetName: "Lista completa",
      mapping: {
        routeGroup: { type: "column", header: "Ruta" },
        dispatchDate: { type: "derived", strategy: "file_date" },
      },
    },
    now: () => "2026-01-18T12:00:00.000Z",
    id: () => "profile-roundtrip",
  });

  assert.equal(created.ok, true);
  if (!created.ok) return;

  const roundTripped = parseImportMappingProfiles(JSON.parse(JSON.stringify(created.profiles)));

  assert.deepEqual(roundTripped, created.profiles);
});

test("deleteImportMappingProfile removes only the targeted profile", () => {
  const first = makeProfile({ id: "profile-1" });
  const second = makeProfile({ id: "profile-2", name: "Other" });

  const remaining = deleteImportMappingProfile({ profiles: [first, second], id: "profile-1" });

  assert.deepEqual(remaining, [second]);
});

test("findMatchingImportMappingProfile auto-applies the most recently updated fully-covered profile", () => {
  const older = makeProfile({
    id: "profile-older",
    name: "Older",
    mapping: { routeGroup: { type: "column", header: "Ruta" } },
    updatedAt: "2026-08-01T00:00:00.000Z",
  });
  const newer = makeProfile({
    id: "profile-newer",
    name: "Newer",
    mapping: {
      routeGroup: { type: "column", header: "Ruta" },
      deliveryPointName: { type: "column", header: "Nombre" },
    },
    updatedAt: "2026-08-15T00:00:00.000Z",
  });

  const matched = findMatchingImportMappingProfile({
    profiles: [older, newer],
    importType: "shipment_tracker",
    headers: ["Nombre", "Ruta", "Dirección"],
  });

  assert.equal(matched?.id, "profile-newer");
});

test("findMatchingImportMappingProfile skips profiles whose headers are not fully covered", () => {
  const profile = makeProfile({
    mapping: {
      routeGroup: { type: "column", header: "Ruta" },
      deliveryPointName: { type: "column", header: "Nombre del cliente" },
    },
  });

  const matched = findMatchingImportMappingProfile({
    profiles: [profile],
    importType: "shipment_tracker",
    headers: ["Nombre", "Ruta"],
  });

  assert.equal(matched, null);
});

test("findMatchingImportMappingProfile skips profiles with no column-source coverage", () => {
  const profile = makeProfile({
    mapping: {
      dispatchDate: { type: "derived", strategy: "file_date" },
    },
  });

  const matched = findMatchingImportMappingProfile({
    profiles: [profile],
    importType: "shipment_tracker",
    headers: ["Nombre", "Ruta"],
  });

  assert.equal(matched, null);
});

// --- saveConfirmedMappingProfile: the confirm handler's saveProfile wiring, tested with a fake
// repository since this codebase has no DB harness. These exercise exactly what the brief asks
// for: the confirm path passes the reviewed (draft-canonical) mapping/sheetName/tenant/name to
// upsert; an upsert failure produces a warning without throwing (so it can never fail the import
// result it's attached to); success reports the saved profile.

function fakeUpsertDeps(
  handler: (args: { tenantId: string; input: unknown }) => Promise<ImportMappingProfileUpsertResult>,
): { deps: SaveConfirmedMappingProfileDeps; calls: Array<{ tenantId: string; input: unknown }> } {
  const calls: Array<{ tenantId: string; input: unknown }> = [];

  return {
    calls,
    deps: {
      upsertImportMappingProfileForTenant: async (args) => {
        calls.push(args);
        return handler(args);
      },
    },
  };
}

test("saveConfirmedMappingProfile passes the reviewed mapping, sheetName, tenant, and name to upsert", async () => {
  const savedProfile = makeProfile({ id: "profile-saved", name: "demo-freight weekly" });
  const { deps, calls } = fakeUpsertDeps(async () => ({ ok: true, profile: savedProfile, profiles: [savedProfile] }));

  const reviewedMapping = {
    routeGroup: { type: "column" as const, header: "Ruta" },
    dispatchDate: { type: "derived" as const, strategy: "file_date" as const },
  };

  const result = await saveConfirmedMappingProfile(
    {
      tenantId: "tenant-1",
      locale: "en",
      saveProfileName: "  demo-freight weekly  ",
      sheetName: "Lista completa",
      mapping: reviewedMapping,
    },
    deps,
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].tenantId, "tenant-1");
  assert.deepEqual(calls[0].input, {
    name: "demo-freight weekly",
    importType: "shipment_tracker",
    sheetName: "Lista completa",
    mapping: reviewedMapping,
  });
  assert.deepEqual(result, { savedProfile: { id: "profile-saved", name: "demo-freight weekly" }, warning: null });
});

test("saveConfirmedMappingProfile does nothing when no profile name was requested", async () => {
  const { deps, calls } = fakeUpsertDeps(async () => {
    throw new Error("upsert should not be called");
  });

  const result = await saveConfirmedMappingProfile(
    { tenantId: "tenant-1", locale: "en", saveProfileName: "   ", sheetName: null, mapping: {} },
    deps,
  );

  assert.equal(calls.length, 0);
  assert.deepEqual(result, { savedProfile: null, warning: null });
});

test("saveConfirmedMappingProfile turns an upsert failure into a warning instead of throwing", async () => {
  const { deps } = fakeUpsertDeps(async () => ({ ok: false, error: "invalid_mapping" }));

  const resultEn = await saveConfirmedMappingProfile(
    { tenantId: "tenant-1", locale: "en", saveProfileName: "New profile", sheetName: null, mapping: {} },
    deps,
  );
  assert.equal(resultEn.savedProfile, null);
  assert.equal(resultEn.warning, "The mapping profile could not be saved.");

  const resultEs = await saveConfirmedMappingProfile(
    { tenantId: "tenant-1", locale: "es-MX", saveProfileName: "New profile", sheetName: null, mapping: {} },
    deps,
  );
  assert.equal(resultEs.warning, "No se pudo guardar el perfil de mapeo.");
});

// --- Final-review fix wave, Finding 3: a THROWN upsert error must not propagate --------------
//
// The confirm handler calls this after `processShipmentTrackerImport` has already committed the
// shipment import. `!result.ok` (a returned failure) was already turned into a warning above, but
// a *thrown* error from the repository (e.g. a row-lock timeout or a dropped connection) used to
// propagate out of this function, land in the caller's catch block, and turn an already-committed
// import into an "ok: false" response -- the import batch's success update never ran. This must
// behave identically to the `!result.ok` case: never throw, always resolve with the same warning.

test("saveConfirmedMappingProfile turns a THROWN upsert error into a warning instead of propagating", async () => {
  const { deps, calls } = fakeUpsertDeps(async () => {
    throw new Error("connection drop");
  });

  const resultEn = await saveConfirmedMappingProfile(
    { tenantId: "tenant-1", locale: "en", saveProfileName: "New profile", sheetName: null, mapping: {} },
    deps,
  );
  assert.equal(calls.length, 1);
  assert.deepEqual(resultEn, { savedProfile: null, warning: "The mapping profile could not be saved." });

  const resultEs = await saveConfirmedMappingProfile(
    { tenantId: "tenant-1", locale: "es-MX", saveProfileName: "New profile", sheetName: null, mapping: {} },
    deps,
  );
  assert.deepEqual(resultEs, { savedProfile: null, warning: "No se pudo guardar el perfil de mapeo." });
});
