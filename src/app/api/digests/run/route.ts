import { isDemoMode, demoApiDisabled } from "@/lib/runtime-mode";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { tenantMemberships, tenants, users } from "@/lib/db/schema";
import {
  assembleDigestContent,
  hasDigestContent,
  type TenantDigestInputs,
} from "@/lib/digest/content";
import { buildTenantDigestInputs, countResolvedSince } from "@/lib/digest/data";
import {
  digestWindowStart,
  isDigestDue,
  markDigestSent,
  readDigestFrequency,
  readDigestLastSentAt,
} from "@/lib/digest/preferences";
import { renderDigestEmail } from "@/lib/digest/template";
import { sendOutboundEmail } from "@/lib/email/outbound";
import { getAppUrl, getCronSecret } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest) {
  const secret = getCronSecret();

  if (secret) {
    return request.headers.get("authorization") === `Bearer ${secret}`;
  }

  // No secret configured: only allow outside production so local runs work.
  return process.env.NODE_ENV !== "production";
}

type RecipientResult = {
  email: string;
  tenant: string;
  outcome: string;
  subject?: string;
  detail?: string;
};

async function runDigests(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!db) {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  // force ignores the schedule (weekday + resend guard) but still honors "off".
  const force = url.searchParams.get("force") === "1";
  // only restricts the run to one recipient — for targeted test sends.
  const only = url.searchParams.get("only")?.trim().toLowerCase() || null;
  // to redirects delivery (test sends only) and requires only, so a full run
  // can never funnel every workspace's digest into one inbox.
  const deliverTo = only ? url.searchParams.get("to")?.trim().toLowerCase() || null : null;
  const now = new Date();

  const members = await db
    .select({
      tenantId: tenants.id,
      tenantName: tenants.name,
      tenantLocale: tenants.defaultLocale,
      tenantTimezone: tenants.timezone,
      userId: users.id,
      email: users.email,
      preferredLocale: users.preferredLocale,
      metadata: users.metadata,
    })
    .from(tenantMemberships)
    .innerJoin(users, eq(users.id, tenantMemberships.userId))
    .innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
    .where(
      and(
        eq(tenantMemberships.status, "active"),
        eq(users.active, true),
        eq(tenants.active, true),
      ),
    );

  const results: RecipientResult[] = [];
  const tenantInputs = new Map<string, TenantDigestInputs>();
  const recipients = only
    ? members.filter((member) => member.email.toLowerCase() === only)
    : members;

  for (const member of recipients) {
    const frequency = readDigestFrequency(member.metadata, member.tenantId);
    const lastSentAt = readDigestLastSentAt(member.metadata, member.tenantId);
    const due =
      frequency !== "off" &&
      (force || isDigestDue({ frequency, lastSentAt, now, timeZone: member.tenantTimezone }));

    if (!due) {
      results.push({ email: member.email, tenant: member.tenantName, outcome: "skipped_schedule" });
      continue;
    }

    let inputs = tenantInputs.get(member.tenantId);

    if (!inputs) {
      inputs = await buildTenantDigestInputs(member.tenantId, member.tenantLocale);
      tenantInputs.set(member.tenantId, inputs);
    }

    const since = digestWindowStart(frequency, lastSentAt, now);
    const resolvedCount = await countResolvedSince(member.tenantId, since);
    const content = assembleDigestContent({ ...inputs, resolvedCount, now: now.valueOf() });

    if (!hasDigestContent(content)) {
      results.push({ email: member.email, tenant: member.tenantName, outcome: "skipped_empty" });
      continue;
    }

    const message = renderDigestEmail({
      content,
      locale: member.preferredLocale,
      appUrl: getAppUrl(),
      workspaceName: member.tenantName,
    });

    if (dryRun) {
      results.push({
        email: member.email,
        tenant: member.tenantName,
        outcome: "dry_run",
        subject: message.subject,
      });
      continue;
    }

    const sendResult = await sendOutboundEmail({
      to: deliverTo ?? member.email,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });

    if (sendResult.status === "sent") {
      // A redirected test delivery must not consume the member's real schedule.
      if (!deliverTo) {
        await markDigestSent(member.userId, member.tenantId, now);
      }
      results.push({
        email: member.email,
        tenant: member.tenantName,
        outcome: "sent",
        subject: message.subject,
      });
    } else {
      results.push({
        email: member.email,
        tenant: member.tenantName,
        outcome: sendResult.status === "skipped" ? "skipped_no_sender" : "error",
        detail: sendResult.status === "error" ? sendResult.detail : sendResult.reason,
      });
    }
  }

  const summary = results.reduce<Record<string, number>>((acc, result) => {
    acc[result.outcome] = (acc[result.outcome] ?? 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({ ranAt: now.toISOString(), dryRun, force, only, summary, results });
}

export async function GET(request: NextRequest) {
  if (isDemoMode()) return demoApiDisabled();

  return runDigests(request);
}

export async function POST(request: NextRequest) {
  if (isDemoMode()) return demoApiDisabled();

  return runDigests(request);
}
