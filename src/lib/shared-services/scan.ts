import {
  getSharedServicesGatewayUrl,
  getSharedServicesScanToken,
  isDocumentScanRequired,
} from "@/lib/env";

export type ScanOutcome = "clean" | "infected" | "rejected" | "failed" | "skipped";

// "error" is an internal transport failure (network/parse); it never reaches callers.
type EvaluatedOutcome = ScanOutcome | "error";

export type ScanResult = {
  outcome: ScanOutcome;
  requestId: string | null;
  signature: string | null;
};

export type ScanRejectionCode = "infected" | "rejected" | "scan_unavailable" | "scan_unconfigured";

export class DocumentScanRejectedError extends Error {
  code: ScanRejectionCode;
  userMessage: string;
  statusCode: number;
  requestId: string | null;
  signature: string | null;

  constructor(args: {
    code: ScanRejectionCode;
    requestId?: string | null;
    signature?: string | null;
  }) {
    const userMessage =
      args.code === "infected"
        ? "This file was flagged by malware scanning and was not accepted."
        : args.code === "rejected"
          ? "This file type or size was rejected by malware scanning."
          : args.code === "scan_unconfigured"
            ? "Malware scanning is required but not configured; the file was not accepted."
            : "Malware scanning is unavailable right now; the file was not accepted.";

    super(`Document rejected by scan gateway (${args.code}).`);
    this.name = "DocumentScanRejectedError";
    this.code = args.code;
    this.userMessage = userMessage;
    this.statusCode = 422;
    this.requestId = args.requestId ?? null;
    this.signature = args.signature ?? null;
  }
}

/**
 * Pure policy: given the deployment posture and a scan outcome, allow or block.
 *
 * - Not configured: fail closed only when scanning is *required* (the platform
 *   sets `SHARED_SERVICES_SCAN_REQUIRED=1`); otherwise allow, so the shared
 *   `main` branch and local dev are unaffected on hosts without the gateway.
 * - `infected` / `rejected` are definitive verdicts and always block.
 * - `failed` / `error` are transient; block only when scanning is required.
 */
export function evaluateScanPolicy(input: {
  required: boolean;
  configured: boolean;
  outcome: EvaluatedOutcome;
}): "allow" | "block" {
  if (!input.configured) {
    return input.required ? "block" : "allow";
  }

  switch (input.outcome) {
    case "clean":
    case "skipped":
      return "allow";
    case "infected":
    case "rejected":
      return "block";
    case "failed":
    case "error":
    default:
      return input.required ? "block" : "allow";
  }
}

function interpretScanResponse(status: number, body: unknown): EvaluatedOutcome {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const reported = typeof record?.result === "string" ? record.result : record?.status;

  if (reported === "clean") return "clean";
  if (reported === "infected") return "infected";
  if (reported === "rejected") return "rejected";

  if (status === 200) return "clean";
  if (status === 415 || status === 413 || status === 422) return "rejected";
  return "failed";
}

async function performScan(args: {
  gatewayUrl: string;
  token: string;
  bytes: Uint8Array;
  fileName: string;
  mimeType?: string | null;
}): Promise<{ outcome: EvaluatedOutcome; requestId: string | null; signature: string | null }> {
  const base = args.gatewayUrl.replace(/\/+$/, "");
  const response = await fetch(`${base}/v1/scan`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${args.token}`,
      "content-type": args.mimeType || "application/octet-stream",
      "x-filename": encodeURIComponent(args.fileName),
    },
    // undici accepts a Uint8Array body at runtime; the DOM lib's BodyInit type
    // is stricter than the platform, so cast the known-good raw-bytes body.
    body: args.bytes as unknown as BodyInit,
  });

  const requestId = response.headers.get("x-request-id");
  const payload = await response.json().catch(() => null);
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  const signature = typeof record?.signature === "string" ? record.signature : null;

  return {
    outcome: interpretScanResponse(response.status, payload),
    requestId: requestId ?? (typeof record?.requestId === "string" ? record.requestId : null),
    signature,
  };
}

/**
 * Scans a file before it is trusted as evidence. Returns a result when allowed
 * (including `skipped` when scanning is off), and throws
 * `DocumentScanRejectedError` when the content must be refused.
 */
export async function assertDocumentContentSafe(args: {
  bytes: Uint8Array;
  fileName: string;
  mimeType?: string | null;
}): Promise<ScanResult> {
  const gatewayUrl = getSharedServicesGatewayUrl();
  const token = getSharedServicesScanToken();
  const required = isDocumentScanRequired();
  const configured = Boolean(gatewayUrl && token);

  if (!configured) {
    if (evaluateScanPolicy({ required, configured, outcome: "skipped" }) === "block") {
      throw new DocumentScanRejectedError({ code: "scan_unconfigured" });
    }
    return { outcome: "skipped", requestId: null, signature: null };
  }

  let scanned: { outcome: EvaluatedOutcome; requestId: string | null; signature: string | null };
  try {
    scanned = await performScan({
      gatewayUrl: gatewayUrl!,
      token: token!,
      bytes: args.bytes,
      fileName: args.fileName,
      mimeType: args.mimeType,
    });
  } catch {
    scanned = { outcome: "error", requestId: null, signature: null };
  }

  if (evaluateScanPolicy({ required, configured, outcome: scanned.outcome }) === "block") {
    throw new DocumentScanRejectedError({
      code:
        scanned.outcome === "infected"
          ? "infected"
          : scanned.outcome === "rejected"
            ? "rejected"
            : "scan_unavailable",
      requestId: scanned.requestId,
      signature: scanned.signature,
    });
  }

  return {
    outcome: scanned.outcome === "error" ? "failed" : scanned.outcome,
    requestId: scanned.requestId,
    signature: scanned.signature,
  };
}
