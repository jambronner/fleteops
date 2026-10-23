import assert from "node:assert/strict";
import test from "node:test";

import {
  assembleDigestContent,
  hasDigestContent,
  type DigestIntakeInput,
  type DigestRouteInput,
  type DigestWhatsappInput,
} from "@/lib/digest/content";

const NOW = Date.parse("2026-07-13T13:00:00Z");

function route(overrides: Partial<DigestRouteInput> = {}): DigestRouteInput {
  return {
    id: "route-1",
    reference: "RTE-001",
    customerName: "demo-freight",
    status: "needsReview",
    expectedDeliveryDate: "2026-07-13",
    ...overrides,
  };
}

function intake(overrides: Partial<DigestIntakeInput> = {}): DigestIntakeInput {
  return {
    id: "task-1",
    title: "POD recibido",
    createdAt: "2026-07-13T09:00:00Z",
    subjectId: "subject-1",
    metadata: null,
    ...overrides,
  };
}

function whatsapp(overrides: Partial<DigestWhatsappInput> = {}): DigestWhatsappInput {
  return {
    id: "wa-1",
    label: "+52 55 1234 5678",
    lastSeenAt: "2026-07-13T08:00:00Z",
    ...overrides,
  };
}

test("ranking mirrors the dashboard: severity weight beats days waiting", () => {
  const content = assembleDigestContent({
    routes: [
      route({ id: "old-pending", status: "pendingDocs", expectedDeliveryDate: "2026-07-01" }),
      route({ id: "fresh-blocked", status: "blocked", expectedDeliveryDate: "2026-07-13" }),
    ],
    intakeTasks: [intake()],
    whatsappSources: [whatsapp({ lastSeenAt: "2026-07-11T08:00:00Z" })],
    resolvedCount: 0,
    now: NOW,
  });

  assert.deepEqual(
    content.items.map((item) => item.kind),
    ["route", "whatsapp", "intake", "route"],
  );
  assert.equal(content.items[0].kind === "route" && content.items[0].reference, "RTE-001");
  assert.equal(content.items[0].kind === "route" && content.items[0].status, "blocked");
  // Two-day-old WhatsApp source outranks a same-day intake task.
  assert.equal(content.items[1].kind, "whatsapp");
});

test("caps pending items at five while reporting the true total", () => {
  const content = assembleDigestContent({
    routes: Array.from({ length: 7 }, (_, index) =>
      route({ id: `route-${index}`, reference: `RTE-00${index}` }),
    ),
    intakeTasks: [],
    whatsappSources: [],
    resolvedCount: 0,
    now: NOW,
  });

  assert.equal(content.items.length, 5);
  assert.equal(content.totalPending, 7);
});

test("headline counts: pendingDocs routes wait for info, not a decision", () => {
  const content = assembleDigestContent({
    routes: [
      route({ id: "r1", status: "blocked" }),
      route({ id: "r2", status: "needsReview" }),
      route({ id: "r3", status: "pendingDocs" }),
    ],
    intakeTasks: [intake(), intake({ id: "task-2" })],
    whatsappSources: [whatsapp()],
    resolvedCount: 0,
    now: NOW,
  });

  assert.deepEqual(content.counts, {
    routesAwaitingDecision: 2,
    evidenceToLink: 2,
    newWhatsappSources: 1,
  });
  assert.equal(content.totalPending, 6);
});

test("deep links: routes by id, intake via its review-task action", () => {
  const content = assembleDigestContent({
    routes: [route({ id: "abc-123" })],
    intakeTasks: [
      intake({
        id: "task-9",
        metadata: { action: "update_route", routeResolution: { shipmentId: "ship-42" } },
      }),
      intake({ id: "task-10" }),
    ],
    whatsappSources: [whatsapp()],
    resolvedCount: 0,
    now: NOW,
  });

  const hrefs = content.items.map((item) => item.href);

  assert.ok(hrefs.includes("/routes/abc-123"));
  assert.ok(hrefs.includes("/routes/ship-42"));
  assert.ok(hrefs.includes("/evidence#review-task-task-10"));
  assert.ok(hrefs.includes("/partners#whatsapp-source-review"));
});

test("send rule: empty queue and nothing resolved means no email", () => {
  const empty = assembleDigestContent({
    routes: [],
    intakeTasks: [],
    whatsappSources: [],
    resolvedCount: 0,
    now: NOW,
  });
  assert.equal(hasDigestContent(empty), false);

  const resolvedOnly = assembleDigestContent({
    routes: [],
    intakeTasks: [],
    whatsappSources: [],
    resolvedCount: 3,
    now: NOW,
  });
  assert.equal(hasDigestContent(resolvedOnly), true);

  const pendingOnly = assembleDigestContent({
    routes: [route()],
    intakeTasks: [],
    whatsappSources: [],
    resolvedCount: 0,
    now: NOW,
  });
  assert.equal(hasDigestContent(pendingOnly), true);
});
