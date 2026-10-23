import { createHmac, timingSafeEqual } from "node:crypto";

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/i;

function normalizeSha256Hex(value: string) {
  const normalized = value.startsWith("sha256=")
    ? value.slice("sha256=".length)
    : value;

  return SHA256_HEX_PATTERN.test(normalized) ? normalized.toLowerCase() : null;
}

export function verifySha256Hmac(args: {
  body: string;
  secret: string;
  signature: string;
}) {
  const providedHex = normalizeSha256Hex(args.signature);

  if (!providedHex) {
    return false;
  }

  const expected = createHmac("sha256", args.secret)
    .update(args.body)
    .digest();
  const provided = Buffer.from(providedHex, "hex");

  return (
    expected.length === provided.length &&
    timingSafeEqual(expected, provided)
  );
}

export function isFreshUnixTimestamp(
  timestamp: string,
  maxAgeSeconds: number,
  nowMs = Date.now(),
) {
  const parsedSeconds = Number(timestamp);

  if (!Number.isFinite(parsedSeconds)) {
    return false;
  }

  return (
    Math.abs(Math.floor(nowMs / 1000) - parsedSeconds) <= maxAgeSeconds
  );
}

export function verifyTimestampedSha256Hmac(args: {
  body: string;
  timestamp: string;
  secret: string;
  signature: string;
}) {
  return verifySha256Hmac({
    body: `${args.timestamp}.${args.body}`,
    secret: args.secret,
    signature: args.signature,
  });
}
