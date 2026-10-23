import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExtractionProvenanceSummary,
  buildExtractionRunMetadata,
  buildReusedExtractionMetadata,
  mergeExtractionResultMetadata,
} from "@/lib/documents/extraction-provenance";

test("run metadata records tenant-owned input without retaining signed file locations", () => {
  const metadata = buildExtractionRunMetadata({
    request: {
      tenantId: "tenant-1",
      documentId: "document-1",
      fileUrl: "https://storage.example/signed-secret",
      fileDataUrl: "data:application/pdf;base64,secret",
      mimeType: "application/pdf",
      originalFileName: "pod.pdf",
    },
    decision: {
      inputClass: "digital_document",
      primaryProvider: "docling",
      strategy: "native_parse",
      shouldFallbackToVision: true,
      fallbackProvider: "openrouter_vision",
      reviewThreshold: 0.8,
      reasons: ["Digital document"],
    },
    provider: "docling",
  });

  assert.equal(metadata.request.source, "tenant_stored_document");
  assert.equal("fileUrl" in metadata.request, false);
  assert.equal("fileDataUrl" in metadata.request, false);
});

test("result metadata retains actual provider route and rejects mismatches", () => {
  const merged = mergeExtractionResultMetadata({
    existingMetadata: {
      request: { fileUrl: "https://storage.example/signed-secret", mimeType: "image/jpeg" },
    },
    provider: "openrouter_vision",
    result: {
      provider: "openrouter_vision",
      model: "google/gemini-2.5-flash",
      status: "completed",
      needsReview: false,
      artifacts: [],
      facts: [],
      metadata: { provider: "Google" },
    },
  });

  assert.deepEqual(merged.execution, {
    provider: "openrouter_vision",
    model: "google/gemini-2.5-flash",
    upstreamProvider: "Google",
    externalProcessing: true,
  });
  assert.deepEqual(merged.request, { mimeType: "image/jpeg" });

  assert.throws(
    () =>
      mergeExtractionResultMetadata({
        existingMetadata: null,
        provider: "docling",
        result: {
          provider: "openrouter_vision",
          status: "failed",
          needsReview: true,
          artifacts: [],
          facts: [],
        },
      }),
    /does not match/,
  );
});

test("summary resolves fallback, upstream provider, fact sources, and reuse", () => {
  const sourceRun = {
    id: "run-1",
    provider: "docling",
    model: "docling",
    status: "needs_review",
    isFallbackRun: false,
    fallbackFromRunId: null,
    metadata: null,
  };
  const fallbackRun = {
    id: "run-2",
    provider: "openrouter_vision",
    model: "google/gemini-2.5-flash",
    status: "completed",
    isFallbackRun: true,
    fallbackFromRunId: "run-1",
    metadata: {
      execution: {
        upstreamProvider: "Google",
        externalProcessing: true,
      },
      reusedExtraction: { sourceRunId: "source-run" },
    },
  };

  assert.deepEqual(
    buildExtractionProvenanceSummary({
      latestRun: fallbackRun,
      runs: [fallbackRun, sourceRun],
      facts: [
        {
          extractionRunId: "run-2",
          sourceArtifactId: "artifact-1",
          sourceProvider: "openrouter_vision",
        },
        {
          extractionRunId: "run-2",
          sourceArtifactId: null,
          sourceProvider: "openrouter_vision",
        },
      ],
    }),
    {
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
      reusedFromStoredEvidence: true,
      factCount: 2,
      sourceLinkedFactCount: 1,
    },
  );
});

test("reused metadata retains the source chain without copying a signed URL", () => {
  const metadata = buildReusedExtractionMetadata({
    sourceMetadata: {
      request: { fileUrl: "https://storage.example/signed-secret", mimeType: "application/pdf" },
      execution: { provider: "docling" },
    },
    sourceDocumentId: "document-1",
    sourceRunId: "run-2",
    sourceFallbackFromRunId: "run-1",
    copiedAt: "2026-08-01T00:00:00.000Z",
  });

  assert.deepEqual(metadata.request, { mimeType: "application/pdf" });
  assert.deepEqual(metadata.reusedExtraction, {
    sourceDocumentId: "document-1",
    sourceRunId: "run-2",
    sourceFallbackFromRunId: "run-1",
    copiedAt: "2026-08-01T00:00:00.000Z",
  });
});
