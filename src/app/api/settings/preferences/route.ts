import { isDemoMode, demoApiDisabled } from "@/lib/runtime-mode";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getLocaleCookieOptions, getOptionalSession, localeCookieName } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const preferenceSchema = z.object({
  locale: z.enum(["en", "es-MX"]),
});

export async function POST(request: NextRequest) {
  if (isDemoMode()) return demoApiDisabled();

  if (!db) {
    return NextResponse.json({ ok: false, error: "Database is not configured." }, { status: 503 });
  }

  const session = await getOptionalSession();

  if (!session) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  const payload = preferenceSchema.parse(await request.json());

  await db
    .update(users)
    .set({
      preferredLocale: payload.locale,
      updatedAt: new Date(),
    })
    .where(eq(users.id, session.user.id));

  const supabase = await createServerSupabaseClient();

  if (supabase) {
    await supabase.auth.updateUser({
      data: {
        preferred_locale: payload.locale,
        locale: payload.locale,
      },
    });
  }

  const response = NextResponse.json({ ok: true, locale: payload.locale });
  response.cookies.set(localeCookieName, payload.locale, getLocaleCookieOptions());

  return response;
}
