import { env } from "@/lib/env";
import {
  normalizeEvolutionGroupParticipant,
  type NormalizedEvolutionGroupParticipant,
} from "@/lib/evolution/webhook";

export type EvolutionParticipantLookupResult = {
  attempted: boolean;
  ok: boolean;
  fetchedAt: string;
  participantCount: number;
  participants: NormalizedEvolutionGroupParticipant[];
  error?: string;
};

function isUsableInstanceName(value: string | undefined) {
  return Boolean(value && value !== "unknown-instance");
}

function buildEvolutionUrl(path: string) {
  if (!env.EVOLUTION_API_BASE_URL) {
    return null;
  }

  const baseUrl = env.EVOLUTION_API_BASE_URL.replace(/\/+$/, "");
  return new URL(`${baseUrl}${path}`);
}

function extractParticipants(value: unknown) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;

    if (Array.isArray(record.participants)) {
      return record.participants;
    }
  }

  return [];
}

export type EvolutionMediaDownloadResult = {
  attempted: boolean;
  ok: boolean;
  base64?: string;
  mimeType?: string;
  fileName?: string;
  error?: string;
};

/**
 * Downloads the binary content of a WhatsApp media message through the
 * Evolution API (getBase64FromMediaMessage). The webhook payload only carries
 * media metadata, so this is the only way an image, PDF, or voice note
 * actually reaches document storage and extraction.
 */
export async function fetchEvolutionMediaBase64(args: {
  instanceName: string;
  messageKeyId: string;
}): Promise<EvolutionMediaDownloadResult> {
  if (!env.EVOLUTION_API_KEY || !isUsableInstanceName(args.instanceName)) {
    return { attempted: false, ok: false, error: "Evolution API is not configured." };
  }

  const url = buildEvolutionUrl(
    `/chat/getBase64FromMediaMessage/${encodeURIComponent(args.instanceName)}`,
  );

  if (!url) {
    return { attempted: false, ok: false, error: "Evolution API base URL is not configured." };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      cache: "no-store",
      headers: {
        apikey: env.EVOLUTION_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: { key: { id: args.messageKeyId } },
        convertToMp4: false,
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      return {
        attempted: true,
        ok: false,
        error: `Evolution media download failed with ${response.status}.`,
      };
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const base64 = typeof payload.base64 === "string" ? payload.base64 : undefined;

    if (!base64) {
      return {
        attempted: true,
        ok: false,
        error: "Evolution media download returned no base64 content.",
      };
    }

    return {
      attempted: true,
      ok: true,
      base64,
      mimeType:
        typeof payload.mimetype === "string"
          ? payload.mimetype
          : typeof payload.mimeType === "string"
            ? payload.mimeType
            : undefined,
      fileName:
        typeof payload.fileName === "string"
          ? payload.fileName
          : typeof payload.filename === "string"
            ? payload.filename
            : undefined,
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      error: error instanceof Error ? error.message : "Evolution media download failed.",
    };
  }
}

export async function fetchEvolutionGroupParticipants(args: {
  instanceName: string;
  groupJid: string;
}): Promise<EvolutionParticipantLookupResult> {
  const fetchedAt = new Date().toISOString();

  if (!env.EVOLUTION_API_KEY || !isUsableInstanceName(args.instanceName)) {
    return {
      attempted: false,
      ok: false,
      fetchedAt,
      participantCount: 0,
      participants: [],
    };
  }

  const url = buildEvolutionUrl(`/group/participants/${encodeURIComponent(args.instanceName)}`);

  if (!url) {
    return {
      attempted: false,
      ok: false,
      fetchedAt,
      participantCount: 0,
      participants: [],
    };
  }

  url.searchParams.set("groupJid", args.groupJid);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        apikey: env.EVOLUTION_API_KEY,
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return {
        attempted: true,
        ok: false,
        fetchedAt,
        participantCount: 0,
        participants: [],
        error: `Evolution participant lookup failed with ${response.status}.`,
      };
    }

    const payload = (await response.json()) as unknown;
    const participants = extractParticipants(payload)
      .map((participant) => normalizeEvolutionGroupParticipant(participant))
      .filter((participant): participant is NormalizedEvolutionGroupParticipant => Boolean(participant));

    return {
      attempted: true,
      ok: true,
      fetchedAt,
      participantCount: participants.length,
      participants,
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      fetchedAt,
      participantCount: 0,
      participants: [],
      error: error instanceof Error ? error.message : "Evolution participant lookup failed.",
    };
  }
}
