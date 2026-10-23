import assert from "node:assert/strict";
import test from "node:test";

import { extractServiceDateCandidates } from "@/lib/ai/intake";
import {
  extractForwardedEmailMetadata,
  extractForwardedEmailOperationalBody,
} from "@/lib/email/forwarded";

test("extractForwardedEmailOperationalBody removes forwarded envelope headers before date extraction", () => {
  const body = [
    "---------- Forwarded message ---------",
    "From: Cliente Smoke <cliente-smoke@example.com>",
    "Date: Tue, 12 May 2026 09:32:00 -0600",
    "Subject: Nueva ruta PO123",
    "To: ops@example.invalid",
    "",
    "Nueva ruta PO PO123. Recolectar en Planta Norte y entregar en Cliente Centro el 2026-06-25.",
  ].join("\n");

  assert.deepEqual(new Set(extractServiceDateCandidates(body)), new Set(["2026-05-12", "2026-06-25"]));
  assert.equal(
    extractForwardedEmailOperationalBody(body),
    "Nueva ruta PO PO123. Recolectar en Planta Norte y entregar en Cliente Centro el 2026-06-25.",
  );
  assert.deepEqual(
    extractServiceDateCandidates(extractForwardedEmailOperationalBody(body) ?? ""),
    ["2026-06-25"],
  );
});

test("extractForwardedEmailMetadata still preserves forwarded headers", () => {
  const metadata = extractForwardedEmailMetadata({
    subject: "Fwd: Nueva ruta PO123",
    textBody: [
      "---------- Forwarded message ---------",
      "From: Cliente Smoke <cliente-smoke@example.com>",
      "Date: Tue, 12 May 2026 09:32:00 -0600",
      "Subject: Nueva ruta PO123",
      "To: ops@example.invalid",
      "",
      "Nueva ruta PO PO123.",
    ].join("\n"),
  });

  assert.equal(metadata?.fromAddress, "cliente-smoke@example.com");
  assert.equal(metadata?.fromName, "Cliente Smoke");
  assert.equal(metadata?.subject, "Nueva ruta PO123");
  assert.equal(metadata?.sentAt, "Tue, 12 May 2026 09:32:00 -0600");
});
