import { NextRequest } from "next/server";

import { getAppUrl } from "@/lib/env";

/**
 * Resolves the base URL to use when building auth redirect and callback
 * URLs (magic links, password reset links, error/success redirects).
 *
 * Prefers the configured NEXT_PUBLIC_APP_URL, but falls back to the
 * request's own origin when the configured URL is a localhost placeholder
 * and the request arrived from a real (non-localhost) origin. This avoids
 * two related failure modes seen in production:
 *   - a misconfigured/unset NEXT_PUBLIC_APP_URL baking "localhost" into
 *     outbound auth links, and
 *   - a reverse proxy's internal request origin (e.g. 0.0.0.0:3000)
 *     leaking into redirect Location headers instead of the public URL.
 */
export function resolveAuthBaseUrl(input: { configuredAppUrl: string; requestUrl: string }): string {
  const { configuredAppUrl, requestUrl } = input;
  const requestOrigin = new URL(requestUrl).origin;

  if (configuredAppUrl.includes("localhost") && !requestOrigin.includes("localhost")) {
    return requestOrigin;
  }

  return configuredAppUrl;
}

/**
 * Convenience wrapper for Next.js route handlers: reads the configured app
 * URL from env and resolves against the incoming request.
 */
export function resolveAuthBaseUrlFromRequest(request: NextRequest): string {
  return resolveAuthBaseUrl({
    configuredAppUrl: getAppUrl(),
    requestUrl: request.url,
  });
}
