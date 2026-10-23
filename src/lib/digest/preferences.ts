import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

export const digestFrequencies = ["daily", "weekly", "off"] as const;

export type DigestFrequency = (typeof digestFrequencies)[number];

export const DEFAULT_DIGEST_FREQUENCY: DigestFrequency = "weekly";

const FREQUENCY_METADATA_KEY = "digestFrequency";
const LAST_SENT_METADATA_KEY = "digestLastSentAt";

const DAY_MS = 86_400_000;

// Resend guards: a retried cron run must not double-send, so a digest only
// goes out again once most of its period has elapsed.
const MIN_GAP_MS: Record<Exclude<DigestFrequency, "off">, number> = {
  daily: 20 * 60 * 60 * 1000,
  weekly: 6 * DAY_MS,
};

function requireDb() {
  if (!db) {
    throw new Error("Database is not configured.");
  }

  return db;
}

function readTenantMap(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key];

  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function readDigestFrequency(
  metadata: Record<string, unknown> | null | undefined,
  tenantId: string,
): DigestFrequency {
  const value = readTenantMap(metadata, FREQUENCY_METADATA_KEY)[tenantId];

  return digestFrequencies.includes(value as DigestFrequency)
    ? (value as DigestFrequency)
    : DEFAULT_DIGEST_FREQUENCY;
}

export function readDigestLastSentAt(
  metadata: Record<string, unknown> | null | undefined,
  tenantId: string,
): Date | null {
  const value = readTenantMap(metadata, LAST_SENT_METADATA_KEY)[tenantId];

  if (typeof value !== "string") {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

export async function getDigestFrequency(userId: string, tenantId: string): Promise<DigestFrequency> {
  const database = requireDb();
  const [row] = await database
    .select({ metadata: users.metadata })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return readDigestFrequency(row?.metadata, tenantId);
}

async function mergeUserMetadata(userId: string, key: string, tenantId: string, value: unknown) {
  const database = requireDb();
  const [row] = await database
    .select({ metadata: users.metadata })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const currentMetadata = row?.metadata ?? {};

  await database
    .update(users)
    .set({
      metadata: {
        ...currentMetadata,
        [key]: { ...readTenantMap(currentMetadata, key), [tenantId]: value },
      },
    })
    .where(eq(users.id, userId));
}

export async function setDigestFrequency(userId: string, tenantId: string, frequency: DigestFrequency) {
  await mergeUserMetadata(userId, FREQUENCY_METADATA_KEY, tenantId, frequency);
}

export async function markDigestSent(userId: string, tenantId: string, sentAt: Date) {
  await mergeUserMetadata(userId, LAST_SENT_METADATA_KEY, tenantId, sentAt.toISOString());
}

export function weekdayInTimeZone(now: Date, timeZone: string) {
  try {
    return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "America/Mexico_City" }).format(now);
  }
}

export function isDigestDue(args: {
  frequency: DigestFrequency;
  lastSentAt: Date | null;
  now: Date;
  timeZone: string;
}): boolean {
  const { frequency, lastSentAt, now, timeZone } = args;

  if (frequency === "off") {
    return false;
  }

  if (frequency === "weekly" && weekdayInTimeZone(now, timeZone) !== "Mon") {
    return false;
  }

  if (lastSentAt && now.valueOf() - lastSentAt.valueOf() < MIN_GAP_MS[frequency]) {
    return false;
  }

  return true;
}

/** Start of the "resolved since last digest" window. */
export function digestWindowStart(frequency: DigestFrequency, lastSentAt: Date | null, now: Date): Date {
  if (lastSentAt) {
    return lastSentAt;
  }

  return new Date(now.valueOf() - (frequency === "daily" ? DAY_MS : 7 * DAY_MS));
}
