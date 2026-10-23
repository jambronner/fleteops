import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  beginCommandPaletteRequest,
  CommandPaletteSearchFeedback,
  requestCommandPaletteResults,
} from "./command-palette";

function makeJsonResponse(body: unknown, init?: { status?: number }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

function decodeSearchParam(url: string): string {
  const q = url.slice(url.indexOf("?"));
  return new URLSearchParams(q).get("q") ?? "";
}

const feedbackClassName = "px-3 py-6 text-center text-sm text-muted/70";

test("beginCommandPaletteRequest increments the sequence once and returns the new value", () => {
  const seq = { current: 0 };
  const a = beginCommandPaletteRequest(seq);
  assert.equal(seq.current, 1);
  assert.equal(a, 1);

  const b = beginCommandPaletteRequest(seq);
  assert.equal(seq.current, 2);
  assert.equal(b, 2);
  assert.notEqual(a, b);
});

test("requestCommandPaletteResults returns results on a 2xx response with a results array", async () => {
  const calls: string[] = [];
  const fetcher = async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push(url);
    return makeJsonResponse({ results: [{ id: "r1", label: "Route 1", detail: null, href: "/routes/1", group: "routes" }] });
  };

  const results = await requestCommandPaletteResults("Route", fetcher);

  assert.equal(calls.length, 1);
  assert.match(calls[0]!, /^\/api\/search\?q=/);
  assert.equal(decodeSearchParam(calls[0]!), "Route");
  assert.equal(results.length, 1);
  assert.equal(results[0]!.id, "r1");
});

test("requestCommandPaletteResults URL-encodes the query and uses the current /api/search?q= URL", async () => {
  const calls: string[] = [];
  const fetcher = async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push(url);
    return makeJsonResponse({ results: [] });
  };

  await requestCommandPaletteResults("a & b/c", fetcher);

  assert.equal(calls.length, 1);
  assert.match(calls[0]!, /^\/api\/search\?q=/);
  assert.equal(decodeSearchParam(calls[0]!), "a & b/c");
});

test("requestCommandPaletteResults rejects on a non-2xx response instead of returning empty", async () => {
  const fetcher = async () => makeJsonResponse({ results: [] }, { status: 500 });

  await assert.rejects(() => requestCommandPaletteResults("anything", fetcher), {
    message: /unavailable/i,
  });
});

test("requestCommandPaletteResults rejects when the response body lacks a results array", async () => {
  const fetcher = async () => makeJsonResponse({ items: [] });

  await assert.rejects(() => requestCommandPaletteResults("anything", fetcher), {
    message: /unavailable/i,
  });
});

test("requestCommandPaletteResults rejects when JSON parsing fails", async () => {
  const fetcher = async () =>
    new Response("<not-json>", { status: 200, headers: { "content-type": "text/html" } });

  await assert.rejects(() => requestCommandPaletteResults("anything", fetcher));
});

test("requestCommandPaletteResults rejects when fetch rejects", async () => {
  const fetcher = async () => {
    throw new Error("network down");
  };

  await assert.rejects(() => requestCommandPaletteResults("anything", fetcher), {
    message: /network down/,
  });
});

test("CommandPaletteSearchFeedback renders the loading ellipsis while loading", () => {
  const html = renderToStaticMarkup(
    <CommandPaletteSearchFeedback error={false} loading={true} locale="en" />,
  );
  assert.match(html, /…/);
  assert.match(html, new RegExp(`class="${feedbackClassName}"`));
  assert.doesNotMatch(html, /No matches\./);
  assert.doesNotMatch(html, /unavailable/i);
});

test("CommandPaletteSearchFeedback renders localized empty copy for a settled successful empty search in English", () => {
  const html = renderToStaticMarkup(
    <CommandPaletteSearchFeedback error={false} loading={false} locale="en" />,
  );
  assert.match(html, /No matches\./);
  assert.match(html, new RegExp(`class="${feedbackClassName}"`));
  assert.doesNotMatch(html, /unavailable/i);
});

test("CommandPaletteSearchFeedback renders localized empty copy for a settled successful empty search in Spanish", () => {
  const html = renderToStaticMarkup(
    <CommandPaletteSearchFeedback error={false} loading={false} locale="es-MX" />,
  );
  assert.match(html, /Sin coincidencias\./);
});

test("CommandPaletteSearchFeedback renders an accessible error message distinct from empty copy in English", () => {
  const html = renderToStaticMarkup(
    <CommandPaletteSearchFeedback error={true} loading={false} locale="en" />,
  );
  assert.match(html, /role="alert"/);
  assert.match(html, new RegExp(`class="${feedbackClassName}"`));
  assert.match(html, /Search is temporarily unavailable\./);
  assert.doesNotMatch(html, /No matches\./);
});

test("CommandPaletteSearchFeedback renders an accessible error message distinct from empty copy in Spanish", () => {
  const html = renderToStaticMarkup(
    <CommandPaletteSearchFeedback error={true} loading={false} locale="es-MX" />,
  );
  assert.match(html, /role="alert"/);
  assert.match(html, /La búsqueda no está disponible temporalmente\./);
  assert.doesNotMatch(html, /Sin coincidencias\./);
});

test("CommandPaletteSearchFeedback prefers the error message over the loading ellipsis when both are set", () => {
  const html = renderToStaticMarkup(
    <CommandPaletteSearchFeedback error={true} loading={true} locale="en" />,
  );
  assert.match(html, /role="alert"/);
  assert.match(html, /Search is temporarily unavailable\./);
});

// Request identity: a response from query A must be stale immediately after
// query B begins, including during B's debounce window. Here we prove the two
// request identities differ and that the second makes the first stale by
// simulating the sequence capture the live effect performs.
test("a second request identity supersedes the first immediately, before its network response settles", () => {
  const seq = { current: 0 };

  // Query A's effect starts synchronously at the top of the effect.
  const requestA = beginCommandPaletteRequest(seq);

  // Query B begins before A's fetch ever resolves (e.g. user types again,
  // re-running the query effect and bumping the sequence synchronously).
  const requestB = beginCommandPaletteRequest(seq);

  assert.notEqual(requestA, requestB);
  assert.ok(requestB > requestA);

  // The live effect guards every state mutation on `seq === requestSeqRef.current`.
  // After B begins, A's captured identity is no longer the current one, so A's
  // success/catch/finally must be ignored — even though A resolves later.
  assert.notEqual(requestA, seq.current);
  assert.equal(requestB, seq.current);
});
