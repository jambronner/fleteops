import { isDemoMode, demoApiDisabled } from "@/lib/runtime-mode";
import { NextRequest, NextResponse } from "next/server";

import { env } from "@/lib/env";
import { normalizeEmailRoutingPayload } from "@/lib/email/email-routing";
import { processInboundEmailMessages } from "@/lib/email/process-inbound";
import { inngest } from "@/inngest/client";
import {
  isFreshUnixTimestamp,
  verifyTimestampedSha256Hmac,
} from "@/lib/webhooks/signatures";

export const runtime = "nodejs";

const MAX_SIGNATURE_AGE_SECONDS = 60 * 5;

export async function POST(request: NextRequest) {
  if (isDemoMode()) return demoApiDisabled();

  const rawBody = await request.text();
  const timestamp =
    request.headers.get("x-fleteops-timestamp") ?? request.headers.get("X-Fleteops-Timestamp");
  const signature =
    request.headers.get("x-fleteops-signature") ?? request.headers.get("X-Fleteops-Signature");

  if (!env.EMAIL_INGEST_WEBHOOK_SECRET) {
    return NextResponse.json(
      { ok: false, error: "Email ingress authentication is not configured." },
      { status: 503 },
    );
  }

  if (
    !timestamp ||
    !signature ||
    !isFreshUnixTimestamp(timestamp, MAX_SIGNATURE_AGE_SECONDS)
  ) {
    return NextResponse.json(
      { ok: false, error: "Missing or stale email ingress signature headers." },
      { status: 401 },
    );
  }

  if (
    !verifyTimestampedSha256Hmac({
      body: rawBody,
      timestamp,
      signature,
      secret: env.EMAIL_INGEST_WEBHOOK_SECRET,
    })
  ) {
    return NextResponse.json(
      { ok: false, error: "Invalid email ingress signature." },
      { status: 401 },
    );
  }

  let payload: unknown;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid email ingress JSON payload." },
      { status: 400 },
    );
  }

  const messages = await normalizeEmailRoutingPayload(payload);
  const hasAttachments = messages.some((message) => message.attachments.length > 0);

  if (messages.length > 0 && env.INNGEST_EVENT_KEY && !hasAttachments) {
    await inngest.send({
      name: "email/message.received",
      data: {
        messages,
      },
    });
  }

  const processed = messages.length > 0 && (!env.INNGEST_EVENT_KEY || hasAttachments)
    ? await processInboundEmailMessages({ messages })
    : null;

  return NextResponse.json({
    ok: true,
    provider: "email_routing",
    received: messages.length,
    queued: Boolean(env.INNGEST_EVENT_KEY && !hasAttachments),
    processed,
  });
}
