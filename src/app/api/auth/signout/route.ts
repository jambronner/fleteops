import { isDemoMode, demoApiDisabled } from "@/lib/runtime-mode";
import { NextRequest, NextResponse } from "next/server";

import {
  activeTenantCookieName,
  getLocaleCookieOptions,
  getSessionCookieOptions,
  localeCookieName,
  sessionCookieName,
} from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  if (isDemoMode()) return demoApiDisabled();

  const supabase = await createServerSupabaseClient();

  if (supabase) {
    await supabase.auth.signOut();
  }

  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.set(sessionCookieName, "", {
    ...getSessionCookieOptions(),
    expires: new Date(0),
    maxAge: 0,
  });
  response.cookies.set(localeCookieName, "", {
    ...getLocaleCookieOptions(),
    expires: new Date(0),
    maxAge: 0,
  });
  response.cookies.set(activeTenantCookieName, "", {
    ...getLocaleCookieOptions(),
    expires: new Date(0),
    maxAge: 0,
  });

  return response;
}
