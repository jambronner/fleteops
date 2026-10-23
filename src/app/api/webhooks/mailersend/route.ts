import { isDemoMode, demoApiDisabled } from "@/lib/runtime-mode";
import { NextRequest, NextResponse } from "next/server";

import { env } from "@/lib/env";
import { processInboundEmailMessages } from "@/lib/email/process-inbound";
import { normalizeMailersendWebhookPayload } from "@/lib/mailersend/webhook";
import { inngest } from "@/inngest/client";
import { verifySha256Hmac } from "@/lib/webhooks/signatures";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (isDemoMode()) return demoApiDisabled();

  const rawBody = await request.text();
  const signature = request.headers.get("Signature") ?? request.headers.get("signature");

  if (!env.MAILERSEND_WEBHOOK_SECRET) {
    return NextResponse.json(
      { ok: false, error: "MailerSend webhook authentication is not configured." },
      { status: 503 },
    );
  }

  if (
    !signature ||
    !verifySha256Hmac({
      body: rawBody,
      signature,
      secret: env.MAILERSEND_WEBHOOK_SECRET,
    })
  ) {
    return NextResponse.json(
      { ok: false, error: "Invalid MailerSend webhook signature." },
      { status: 401 },
    );
  }

  let payload: unknown;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid MailerSend webhook JSON payload." },
      { status: 400 },
    );
  }

  const messages = await normalizeMailersendWebhookPayload(payload);
  const hasAttachments = messages.some((message) => message.attachments.length > 0);

  if (messages.length > 0 && env.INNGEST_EVENT_KEY && !hasAttachments) {
    await inngest.send({
      name: "email/message.received",
      data: {
        messages,
      },
    });
  }

  const processed =
    messages.length > 0 && (!env.INNGEST_EVENT_KEY || hasAttachments)
      ? await processInboundEmailMessages({ messages })
      : null;

  return NextResponse.json({
    ok: true,
    received: messages.length,
    queued: Boolean(env.INNGEST_EVENT_KEY && !hasAttachments),
    processed,
  });
}
