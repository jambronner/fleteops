import { isDemoMode } from "@/lib/runtime-mode";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

import {
  APP_DASHBOARD_PATH,
  getAppAbsoluteUrl,
  getMarketingHomeUrl,
  hasExternalAppHost,
  isConfiguredAppHost,
} from "@/lib/app-routing";
import { getSupabaseConfig } from "@/lib/supabase/config";

function isPublicAsset(pathname: string) {
  return (
    pathname === "/favicon.ico" ||
    pathname === "/logo.svg" ||
    /\.(?:avif|gif|ico|jpg|jpeg|json|png|svg|txt|webp|xml)$/.test(pathname)
  );
}

function applySecurityHeaders(response: NextResponse, noStore: boolean) {
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  if (noStore) {
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
  }

  return response;
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (isDemoMode()) {
    if (pathname.startsWith("/api/") && pathname !== "/api/health") {
      return NextResponse.json({ error: "Connected services are disabled in demo mode." }, { status: 403 });
    }
    const allowed = pathname === "/demo" || pathname === "/api/health" || pathname.startsWith("/_next/") || pathname === "/icon.svg" || pathname === "/logo.svg";
    const response = allowed ? NextResponse.next() : NextResponse.redirect(new URL("/demo", request.url));
    response.headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' ws://127.0.0.1:* ws://localhost:*; frame-ancestors 'none'; form-action 'self'; base-uri 'self'");
    return applySecurityHeaders(response, true);
  }

  const host = request.headers.get("host");
  const isApiRoute = pathname.startsWith("/api/");
  const isAppHost = isConfiguredAppHost(host);
  const isLandingPath = pathname === "/landing" || pathname.startsWith("/landing/");
  const isMarketingRoot = !isAppHost && pathname === "/";
  const assetPath = isPublicAsset(pathname);
  const isAppPage = !isApiRoute && !isMarketingRoot && !assetPath;

  if (isLandingPath) {
    return applySecurityHeaders(
      NextResponse.redirect(getMarketingHomeUrl(request.url), 308),
      false,
    );
  }

  if (isAppHost && pathname === APP_DASHBOARD_PATH) {
    return applySecurityHeaders(NextResponse.redirect(new URL("/", request.url), 308), true);
  }

  if (
    !isAppHost &&
    hasExternalAppHost() &&
    (pathname === "/login" || pathname.startsWith("/auth/"))
  ) {
    return applySecurityHeaders(
      NextResponse.redirect(getAppAbsoluteUrl(`${pathname}${request.nextUrl.search}`), 307),
      true,
    );
  }

  const rewriteUrl =
    isAppHost && pathname === "/" ? new URL(APP_DASHBOARD_PATH, request.url) : null;
  let response = rewriteUrl ? NextResponse.rewrite(rewriteUrl) : NextResponse.next();

  const supabaseConfig = getSupabaseConfig();

  if (supabaseConfig && isAppPage) {
    let supabaseResponse = response;

    const supabase = createServerClient(supabaseConfig.url, supabaseConfig.anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = rewriteUrl
            ? NextResponse.rewrite(rewriteUrl, { request })
            : NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    });

    await supabase.auth.getUser();
    response = supabaseResponse;
  }

  return applySecurityHeaders(response, isAppPage);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
