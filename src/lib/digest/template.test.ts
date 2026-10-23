import assert from "node:assert/strict";
import test from "node:test";

import { assembleDigestContent, type DigestRouteInput } from "@/lib/digest/content";
import { buildDigestSubject, renderDigestEmail } from "@/lib/digest/template";

const NOW = Date.parse("2026-07-13T13:00:00Z");
const APP_URL = "https://app.fleteops.test";

function route(overrides: Partial<DigestRouteInput> = {}): DigestRouteInput {
  return {
    id: "route-1",
    reference: "RTE-001",
    customerName: "demo-freight",
    status: "needsReview",
    expectedDeliveryDate: "2026-07-10",
    ...overrides,
  };
}

function contentWith(args: {
  routes?: DigestRouteInput[];
  intakeCount?: number;
  whatsappCount?: number;
  resolvedCount?: number;
}) {
  return assembleDigestContent({
    routes: args.routes ?? [],
    intakeTasks: Array.from({ length: args.intakeCount ?? 0 }, (_, index) => ({
      id: `task-${index}`,
      title: `Evidencia ${index}`,
      createdAt: "2026-07-13T09:00:00Z",
      subjectId: `subject-${index}`,
      metadata: null,
    })),
    whatsappSources: Array.from({ length: args.whatsappCount ?? 0 }, (_, index) => ({
      id: `wa-${index}`,
      label: `+52 55 0000 000${index}`,
      lastSeenAt: "2026-07-13T08:00:00Z",
    })),
    resolvedCount: args.resolvedCount ?? 0,
    now: NOW,
  });
}

test("subject carries the route count, singular and plural", () => {
  assert.equal(
    buildDigestSubject(contentWith({ routes: [route(), route({ id: "r2" }), route({ id: "r3" })] }), "es-MX"),
    "FleteOps: 3 rutas esperan decisión",
  );
  assert.equal(
    buildDigestSubject(contentWith({ routes: [route()] }), "es-MX"),
    "FleteOps: 1 ruta espera decisión",
  );
});

test("subject falls back through evidence, sources, then resolved-only", () => {
  assert.equal(
    buildDigestSubject(contentWith({ intakeCount: 2 }), "es-MX"),
    "FleteOps: 2 evidencias por vincular",
  );
  assert.equal(
    buildDigestSubject(contentWith({ whatsappCount: 1 }), "es-MX"),
    "FleteOps: 1 fuente nueva de WhatsApp",
  );
  assert.equal(
    buildDigestSubject(contentWith({ resolvedCount: 4 }), "es-MX"),
    "FleteOps: 4 pendientes resueltos, nada en espera",
  );
});

test("pendingDocs-only routes surface in the list but not the subject count", () => {
  const content = contentWith({ routes: [route({ status: "pendingDocs" })], intakeCount: 1 });
  assert.equal(buildDigestSubject(content, "es-MX"), "FleteOps: 1 evidencia por vincular");
  assert.equal(content.items.length, 2);
});

test("only pendingDocs routes pending: subject uses the raw pending total", () => {
  assert.equal(
    buildDigestSubject(contentWith({ routes: [route({ status: "pendingDocs" })] }), "es-MX"),
    "FleteOps: 1 pendiente",
  );
  assert.equal(
    buildDigestSubject(
      contentWith({
        routes: [route({ status: "pendingDocs" }), route({ id: "r2", status: "pendingDocs" })],
        resolvedCount: 2,
      }),
      "es-MX",
    ),
    "FleteOps: 2 pendientes",
  );
});

test("english locale renders english copy", () => {
  assert.equal(
    buildDigestSubject(contentWith({ routes: [route(), route({ id: "r2" })] }), "en"),
    "FleteOps: 2 routes await a decision",
  );
});

test("html deep-links every pending item and the settings footer", () => {
  const email = renderDigestEmail({
    content: contentWith({ routes: [route({ id: "abc-123" })], whatsappCount: 1, resolvedCount: 2 }),
    locale: "es-MX",
    appUrl: `${APP_URL}/`,
    workspaceName: "demo-freight Ops",
  });

  assert.ok(email.html.includes(`${APP_URL}/routes/abc-123`));
  assert.ok(email.html.includes(`${APP_URL}/partners#whatsapp-source-review`));
  assert.ok(email.html.includes(`${APP_URL}/settings`));
  assert.ok(email.html.includes("Ajustar frecuencia"));
  assert.ok(email.html.includes("2 pendientes resueltos desde el último resumen."));
  assert.ok(email.html.includes("demo-freight Ops"));
  assert.ok(!email.html.includes("undefined"));
  assert.ok(email.text.includes(`${APP_URL}/settings`));
});

test("resolved-only email skips the pending section entirely", () => {
  const email = renderDigestEmail({
    content: contentWith({ resolvedCount: 1 }),
    locale: "es-MX",
    appUrl: APP_URL,
    workspaceName: "demo-freight Ops",
  });

  assert.equal(email.subject, "FleteOps: 1 pendiente resuelto, nada en espera");
  assert.ok(!email.html.includes("Pendientes principales"));
  assert.ok(email.html.includes("1 pendiente resuelto desde el último resumen."));
});

test("dynamic text is html-escaped", () => {
  const email = renderDigestEmail({
    content: contentWith({
      routes: [route({ customerName: 'Cliente <Ácme> & "Hijos"' })],
    }),
    locale: "es-MX",
    appUrl: APP_URL,
    workspaceName: "demo-freight <Ops>",
  });

  assert.ok(!email.html.includes("<Ácme>"));
  assert.ok(email.html.includes("&lt;Ácme&gt;"));
  assert.ok(email.html.includes("demo-freight &lt;Ops&gt;"));
});
