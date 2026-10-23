import assert from "node:assert/strict";
import test from "node:test";

import {
  digestWindowStart,
  isDigestDue,
  readDigestFrequency,
  readDigestLastSentAt,
  weekdayInTimeZone,
} from "@/lib/digest/preferences";

const TENANT = "11111111-1111-1111-1111-111111111111";
const OTHER_TENANT = "22222222-2222-2222-2222-222222222222";
const CDMX = "America/Mexico_City";

// 2026-07-13 is a Monday; 13:00 UTC = 07:00 in Mexico City (UTC-6, no DST).
const MONDAY_RUN = new Date("2026-07-13T13:00:00Z");
const TUESDAY_RUN = new Date("2026-07-14T13:00:00Z");

test("readDigestFrequency defaults to weekly and honors per-tenant overrides", () => {
  assert.equal(readDigestFrequency(null, TENANT), "weekly");
  assert.equal(readDigestFrequency({}, TENANT), "weekly");
  assert.equal(readDigestFrequency({ digestFrequency: "garbage" }, TENANT), "weekly");

  const metadata = { digestFrequency: { [TENANT]: "daily", [OTHER_TENANT]: "off" } };
  assert.equal(readDigestFrequency(metadata, TENANT), "daily");
  assert.equal(readDigestFrequency(metadata, OTHER_TENANT), "off");
  assert.equal(readDigestFrequency({ digestFrequency: { [TENANT]: "hourly" } }, TENANT), "weekly");
});

test("readDigestLastSentAt parses per-tenant timestamps and rejects junk", () => {
  assert.equal(readDigestLastSentAt(null, TENANT), null);
  assert.equal(readDigestLastSentAt({ digestLastSentAt: { [TENANT]: "not-a-date" } }, TENANT), null);

  const parsed = readDigestLastSentAt(
    { digestLastSentAt: { [TENANT]: "2026-07-06T13:00:00.000Z" } },
    TENANT,
  );
  assert.equal(parsed?.toISOString(), "2026-07-06T13:00:00.000Z");
});

test("weekdayInTimeZone reports the operator's weekday, not UTC's", () => {
  // 02:00 UTC Tuesday is still Monday evening in Mexico City.
  assert.equal(weekdayInTimeZone(new Date("2026-07-14T02:00:00Z"), CDMX), "Mon");
  assert.equal(weekdayInTimeZone(MONDAY_RUN, CDMX), "Mon");
});

test("off frequency is never due", () => {
  assert.equal(
    isDigestDue({ frequency: "off", lastSentAt: null, now: MONDAY_RUN, timeZone: CDMX }),
    false,
  );
});

test("weekly digests only fire on Monday in the workspace timezone", () => {
  assert.equal(
    isDigestDue({ frequency: "weekly", lastSentAt: null, now: MONDAY_RUN, timeZone: CDMX }),
    true,
  );
  assert.equal(
    isDigestDue({ frequency: "weekly", lastSentAt: null, now: TUESDAY_RUN, timeZone: CDMX }),
    false,
  );
});

test("resend guard blocks a second send inside the period", () => {
  // Daily: sent 12 hours ago → cron retry must not double-send.
  assert.equal(
    isDigestDue({
      frequency: "daily",
      lastSentAt: new Date("2026-07-13T01:00:00Z"),
      now: MONDAY_RUN,
      timeZone: CDMX,
    }),
    false,
  );
  // Daily: sent yesterday at the same hour → due again.
  assert.equal(
    isDigestDue({
      frequency: "daily",
      lastSentAt: new Date("2026-07-12T13:05:00Z"),
      now: MONDAY_RUN,
      timeZone: CDMX,
    }),
    true,
  );
  // Weekly: sent last Monday → due; sent two days ago → not due even on Monday.
  assert.equal(
    isDigestDue({
      frequency: "weekly",
      lastSentAt: new Date("2026-07-06T13:00:00Z"),
      now: MONDAY_RUN,
      timeZone: CDMX,
    }),
    true,
  );
  assert.equal(
    isDigestDue({
      frequency: "weekly",
      lastSentAt: new Date("2026-07-11T13:00:00Z"),
      now: MONDAY_RUN,
      timeZone: CDMX,
    }),
    false,
  );
});

test("digestWindowStart uses lastSentAt, falling back to one period", () => {
  const lastSent = new Date("2026-07-06T13:00:00Z");
  assert.equal(digestWindowStart("weekly", lastSent, MONDAY_RUN), lastSent);
  assert.equal(
    digestWindowStart("weekly", null, MONDAY_RUN).toISOString(),
    "2026-07-06T13:00:00.000Z",
  );
  assert.equal(
    digestWindowStart("daily", null, MONDAY_RUN).toISOString(),
    "2026-07-12T13:00:00.000Z",
  );
});
