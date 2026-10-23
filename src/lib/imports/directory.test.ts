import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeImportedDirectoryText } from "./text-normalization";

// All names and addresses below are independently invented normalization fixtures.
test("normalizeImportedDirectoryText title-cases all-caps organization names", () => {
  assert.equal(normalizeImportedDirectoryText("DEMO MOUNTAIN FOODS"), "Demo Mountain Foods");
  assert.equal(normalizeImportedDirectoryText("DEMO ALIMENTOS G2C"), "Demo Alimentos G2C");
  assert.equal(normalizeImportedDirectoryText("DEMO PERSONA DE LA LUNA"), "Demo Persona de la Luna");
  assert.equal(normalizeImportedDirectoryText("DEMO-MARKET"), "Demo-Market");
});

test("normalizeImportedDirectoryText preserves useful route and location abbreviations", () => {
  assert.equal(
    normalizeImportedDirectoryText("BLVD. DEMO NORTE NO 10 Y 12 COL. DEMO DEL VALLE C.P. 00000"),
    "Blvd. Demo Norte No 10 y 12 Col. Demo del Valle C.P. 00000",
  );
  assert.equal(
    normalizeImportedDirectoryText("AV. DEMO DE PRUEBA # 100 COL DEMO, CIUDAD DEMO N.L"),
    "Av. Demo de Prueba # 100 Col Demo, Ciudad Demo N.L",
  );
  assert.equal(
    normalizeImportedDirectoryText("DEMO 101 LOTE KILOMETRO 1-2 CIUDAD DEL EJEMPLO CP 00000"),
    "Demo 101 Lote Kilometro 1-2 Ciudad del Ejemplo CP 00000",
  );
  assert.equal(normalizeImportedDirectoryText("DEMO CAFÉ PLAZA"), "Demo Café Plaza");
  assert.equal(normalizeImportedDirectoryText("CEDIS DEMO CDMX"), "Cedis Demo CDMX");
});

test("normalizeImportedDirectoryText title-cases words wrapped in punctuation", () => {
  assert.equal(
    normalizeImportedDirectoryText("DEMO LA PLAZA 10-LOCAL R-A CENTRO (AREA 1)"),
    "Demo la Plaza 10-Local R-A Centro (Area 1)",
  );
});

test("normalizeImportedDirectoryText cleans mostly-uppercase CSV address rows", () => {
  assert.equal(
    normalizeImportedDirectoryText("CALLE DEMO LT 10, BARRIO DEMO, 00000, CIUDAD DEMO, Estado Demo, País Demo"),
    "Calle Demo Lt 10, Barrio Demo, 00000, Ciudad Demo, Estado Demo, País Demo",
  );
});

test("normalizeImportedDirectoryText leaves intentional mixed-case names alone", () => {
  assert.equal(normalizeImportedDirectoryText("DemoBrand GDL"), "DemoBrand GDL");
  assert.equal(normalizeImportedDirectoryText("  Prol. Demo Norte   101 "), "Prol. Demo Norte 101");
});
