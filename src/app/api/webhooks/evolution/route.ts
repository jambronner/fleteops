import { isDemoMode, demoApiDisabled } from "@/lib/runtime-mode";
import { timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { env } from "@/lib/env";
import {
  normalizeEvolutionGroupWebhookPayload,
  normalizeEvolutionWebhookPayload,
} from "@/lib/evolution/webhook";
import { processEvolutionGroupEvents } from "@/lib/whatsapp/sources";
import { processWhatsappMessages } from "@/inngest/functions/process-whatsapp-message";
import { inngest } from "@/inngest/client";

export const runtime = "nodejs";

function safeEquals(left: string, right: string) {
  try {
    return timingSafeEqual(Buffer.from(left), Buffer.from(right));
  } catch {
    return false;
  }
}

function readWebhookSecret(request: NextRequest) {
  return (
    request.headers.get("x-fleteops-webhook-secret") ??
    request.headers.get("x-evolution-webhook-secret") ??
    request.nextUrl.searchParams.get("secret") ??
    request.nextUrl.searchParams.get("token")
  );
}

function verifyWebhookSecret(request: NextRequest) {
  if (!env.EVOLUTION_WEBHOOK_SECRET) {
    return process.env.NODE_ENV !== "production";
  }

  const providedSecret = readWebhookSecret(request);
  return providedSecret ? safeEquals(providedSecret, env.EVOLUTION_WEBHOOK_SECRET) : false;
}

export async function POST(request: NextRequest) {
  if (isDemoMode()) return demoApiDisabled();

  if (!env.EVOLUTION_WEBHOOK_SECRET) {
    return NextResponse.json(
      { ok: false, error: "Evolution webhook authentication is not configured." },
      { status: 503 },
    );
  }

  if (!verifyWebhookSecret(request)) {
    return NextResponse.json(
      { ok: false, error: "Invalid Evolution webhook secret." },
      { status: 401 },
    );
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid Evolution webhook JSON payload." },
      { status: 400 },
    );
  }

  const messages = normalizeEvolutionWebhookPayload(payload);
  const groups = normalizeEvolutionGroupWebhookPayload(payload);

  const processedGroups = groups.length > 0
    ? await processEvolutionGroupEvents({ events: groups })
    : null;

  if (messages.length > 0 && env.INNGEST_EVENT_KEY) {
    await inngest.send({
      name: "whatsapp/message.received",
      data: {
        messages,
      },
    });
  }

  const processed = messages.length > 0 && !env.INNGEST_EVENT_KEY
    ? await processWhatsappMessages({ messages })
    : null;

  return NextResponse.json({
    ok: true,
    provider: "evolution",
    received: messages.length,
    groupsReceived: groups.length,
    queued: Boolean(env.INNGEST_EVENT_KEY && messages.length > 0),
    processed,
    processedGroups,
    channels: [...new Set(messages.map((message) => message.externalChannelId).filter(Boolean))],
    conversations: [
      ...new Set(
        [
          ...messages.map((message) => message.externalConversationId),
          ...groups.map((group) => group.externalConversationId),
        ].filter(Boolean),
      ),
    ],
  });
}
