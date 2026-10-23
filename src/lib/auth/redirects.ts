export const DASHBOARD_PATH = "/dashboard";
export const PASSWORD_RESET_PATH = "/auth/reset-password";

export function buildSupabaseAuthCallbackUrl(baseUrl: string, nextPath = DASHBOARD_PATH) {
  const redirectTo = new URL("/auth/callback", baseUrl);
  redirectTo.searchParams.set("next", nextPath);
  return redirectTo;
}

function fallbackRedirectPath(fallbackPath: string) {
  return fallbackPath.startsWith("/") ? fallbackPath : DASHBOARD_PATH;
}

function redirectPathFromUrl(url: URL) {
  return `${url.pathname}${url.search}`;
}

function normalizeAuthRedirectTarget(args: {
  value: string | null;
  fallbackPath: string;
  requestOrigin: string;
  depth?: number;
}) {
  const fallbackPath = fallbackRedirectPath(args.fallbackPath);

  if (!args.value) {
    return fallbackPath;
  }

  let target: URL;

  try {
    target = new URL(args.value, args.requestOrigin);
  } catch {
    return fallbackPath;
  }

  if (target.origin !== args.requestOrigin) {
    return fallbackPath;
  }

  if (target.pathname === "/auth/callback" && (args.depth ?? 0) < 3) {
    return normalizeAuthRedirectTarget({
      value: target.searchParams.get("next"),
      fallbackPath,
      requestOrigin: args.requestOrigin,
      depth: (args.depth ?? 0) + 1,
    });
  }

  return redirectPathFromUrl(target);
}

export function resolveSupabaseAuthRedirectPath(requestUrl: string, fallbackPath = DASHBOARD_PATH) {
  const request = new URL(requestUrl);

  return resolveSupabaseAuthRedirectPathFromValue(request.searchParams.get("next"), request.origin, fallbackPath);
}

export function resolveSupabaseAuthRedirectPathFromValue(
  value: string | null,
  requestOrigin: string,
  fallbackPath = DASHBOARD_PATH,
) {
  return normalizeAuthRedirectTarget({
    value,
    fallbackPath,
    requestOrigin,
  });
}

export function authRedirectPathMatches(redirectPath: string, pathname: string) {
  return new URL(redirectPath, "https://fleteops.local").pathname === pathname;
}
