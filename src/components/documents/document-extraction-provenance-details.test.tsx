import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { DocumentExtractionProvenanceDetails } from "@/components/documents/document-extraction-provenance-details";

test("renders external provider, fallback, source coverage, and privacy boundary", () => {
  const markup = renderToStaticMarkup(
    <DocumentExtractionProvenanceDetails
      locale="en"
      provenance={{
        provider: "openrouter_vision",
        model: "google/gemini-2.5-flash",
        status: "completed",
        upstreamProvider: "Google",
        externalProcessing: true,
        isFallbackRun: true,
        fallbackFrom: {
          provider: "docling",
          model: "docling",
          status: "needs_review",
        },
        reusedFromStoredEvidence: false,
        factCount: 4,
        sourceLinkedFactCount: 4,
      }}
    />,
  );

  assert.match(markup, /AI processing/);
  assert.match(markup, /OpenRouter Vision/);
  assert.doesNotMatch(markup, /openrouter_vision/);
  assert.match(markup, /google\/gemini-2.5-flash/);
  assert.match(markup, /Fallback after/);
  assert.match(markup, /4 of 4 linked/);
  assert.match(markup, /sent through OpenRouter/);
});

test("renders Spanish configured-processing and reused-evidence disclosure", () => {
  const markup = renderToStaticMarkup(
    <DocumentExtractionProvenanceDetails
      locale="es-MX"
      provenance={{
        provider: "docling",
        model: "docling",
        status: "completed",
        upstreamProvider: null,
        externalProcessing: false,
        isFallbackRun: false,
        fallbackFrom: null,
        reusedFromStoredEvidence: true,
        factCount: 0,
        sourceLinkedFactCount: 0,
      }}
    />,
  );

  assert.match(markup, /Procesamiento con IA/);
  assert.match(markup, /servicio de extracción configurado/);
  assert.doesNotMatch(markup, /servicio privado/);
  assert.match(markup, /Reutilizado desde evidencia/);
});

test("discloses reused external evidence without claiming a new provider request", () => {
  const markup = renderToStaticMarkup(
    <DocumentExtractionProvenanceDetails
      locale="en"
      provenance={{
        provider: "openrouter_vision",
        model: "google/gemini-2.5-flash",
        status: "completed",
        upstreamProvider: "Google",
        externalProcessing: true,
        isFallbackRun: false,
        fallbackFrom: null,
        reusedFromStoredEvidence: true,
        factCount: 2,
        sourceLinkedFactCount: 2,
      }}
    />,
  );

  assert.match(markup, /earlier OpenRouter extraction/);
  assert.match(markup, /No new provider request was made/);
  assert.doesNotMatch(markup, /stored file.*were sent through OpenRouter/);
});
