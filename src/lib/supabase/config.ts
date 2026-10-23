import { env } from "@/lib/env";

export function isSupabaseAuthEnabled() {
  return Boolean(
    env.AUTH_PROVIDER === "supabase" &&
      env.NEXT_PUBLIC_SUPABASE_URL &&
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function getSupabaseConfig() {
  if (!isSupabaseAuthEnabled()) {
    return null;
  }

  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL!,
    anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  };
}
