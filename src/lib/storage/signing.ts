import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

function getSigningSecret() {
  return env.ASSET_SIGNING_SECRET ?? env.AUTH_SECRET ?? "local-dev-only-secret";
}

function toHexSignature(value: string) {
  return createHmac("sha256", getSigningSecret()).update(value).digest("hex");
}

export function signObjectReadToken(key: string, expires: number) {
  return toHexSignature(`${key}:${expires}`);
}

export function verifyObjectReadToken(args: {
  key: string;
  expires: number;
  signature: string;
}) {
  if (Date.now() > args.expires * 1000) {
    return false;
  }

  const expected = Buffer.from(signObjectReadToken(args.key, args.expires), "utf8");
  const received = Buffer.from(args.signature, "utf8");

  if (expected.length !== received.length) {
    return false;
  }

  return timingSafeEqual(expected, received);
}
