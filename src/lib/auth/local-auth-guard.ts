import { env, isLocalAuthAllowedInProduction } from "@/lib/env";
import { isSupabaseAuthEnabled } from "@/lib/supabase/config";

/**
 * Thrown when local (passwordless dev) auth would be used in a production
 * runtime. `AUTH_PROVIDER` defaults to `local`, so a production deployment that
 * forgets to configure Supabase auth would otherwise silently accept anyone.
 */
export class LocalAuthDisabledError extends Error {
  code = "local_auth_disabled" as const;

  constructor() {
    super(
      "Local auth is disabled in production. Configure Supabase auth (AUTH_PROVIDER=supabase " +
        "with a valid project URL and anon key), or set ALLOW_LOCAL_AUTH_IN_PRODUCTION=1 to override.",
    );
    this.name = "LocalAuthDisabledError";
  }
}

/**
 * Pure decision: may local auth create a session under these conditions?
 *
 * Local auth is refused only when it is the *active* provider (Supabase auth is
 * not enabled) AND the runtime is production-like AND no explicit override is
 * set. When Supabase auth is enabled — the transitional Vercel deployment and
 * the target platform both set `AUTH_PROVIDER=supabase` — this never fires.
 */
export function evaluateLocalAuthAllowed(input: {
  supabaseAuthEnabled: boolean;
  productionRuntime: boolean;
  overrideEnabled: boolean;
}): boolean {
  if (input.supabaseAuthEnabled) {
    return true;
  }

  if (!input.productionRuntime) {
    return true;
  }

  return input.overrideEnabled;
}

function isProductionRuntime() {
  return process.env.NODE_ENV === "production" || env.NEXT_PUBLIC_APP_URL.startsWith("https://");
}

export function isLocalAuthAllowed() {
  return evaluateLocalAuthAllowed({
    supabaseAuthEnabled: isSupabaseAuthEnabled(),
    productionRuntime: isProductionRuntime(),
    overrideEnabled: isLocalAuthAllowedInProduction(),
  });
}

export function assertLocalAuthAllowed() {
  if (!isLocalAuthAllowed()) {
    throw new LocalAuthDisabledError();
  }
}
