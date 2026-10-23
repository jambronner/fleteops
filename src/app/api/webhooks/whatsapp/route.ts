import { isDemoMode, demoApiDisabled } from "@/lib/runtime-mode";
import { NextRequest, NextResponse } from "next/server";

import { env } from "@/lib/env";
import { normalizeWhatsappWebhookPayload } from "@/lib/whatsapp/webhook";
import { inngest } from "@/inngest/client";
import { processWhatsappMessages } from "@/inngest/functions/process-whatsapp-message";
import { verifySha256Hmac } from "@/lib/webhooks/signatures";

export async function GET(request: NextRequest) {
  if (isDemoMode()) return demoApiDisabled();

  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && token === env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }

  return NextResponse.json({ ok: false, error: "Invalid verification request" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  if (isDemoMode()) return demoApiDisabled();

  if (!env.WHATSAPP_APP_SECRET) {
    return NextResponse.json(
      { ok: false, error: "WhatsApp webhook authentication is not configured." },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (
    !signature ||
    !verifySha256Hmac({
      body: rawBody,
      secret: env.WHATSAPP_APP_SECRET,
      signature,
    })
  ) {
    return NextResponse.json(
      { ok: false, error: "Invalid WhatsApp webhook signature." },
      { status: 401 },
    );
  }

  let payload: unknown;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid WhatsApp webhook JSON payload." },
      { status: 400 },
    );
  }

  const messages = normalizeWhatsappWebhookPayload(payload);

  if (messages.length > 0 && env.INNGEST_EVENT_KEY) {
    await inngest.send({
      name: "whatsapp/message.received",
      data: {
        messages,
      },
    });
  }

  const processed =
    messages.length > 0 && !env.INNGEST_EVENT_KEY
      ? await processWhatsappMessages({ messages })
      : null;

  return NextResponse.json({
    ok: true,
    received: messages.length,
    queued: Boolean(env.INNGEST_EVENT_KEY && messages.length > 0),
    processed,
  });
}
