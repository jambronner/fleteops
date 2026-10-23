import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseConfig } from "@/lib/supabase/config";

export function createEmailSupabaseClient() {
  const config = getSupabaseConfig();

  if (!config) {
    return null;
  }

  return createClient(config.url, config.anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function looksLikeExistingSupabaseUserError(error: Error) {
  return /already (registered|exists)|already been registered|user.*exists/i.test(error.message);
}

async function sendMagicLink(
  supabase: SupabaseClient,
  email: string,
  options: {
    redirectTo: string;
    data: Record<string, string>;
  },
) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: options.redirectTo,
      data: options.data,
    },
  });

  if (error) {
    throw error;
  }

  return { deliveryKind: "magic_link" as const, supabaseAuthUserId: null };
}

export function createSupabaseInviteEmailAuthClient(supabaseAdmin: SupabaseClient, supabaseEmail: SupabaseClient) {
  return {
    async sendInviteAccessEmail(
      email: string,
      options: {
        redirectTo: string;
        data: Record<string, string>;
        hasSupabaseAuthUser: boolean;
      },
    ) {
      if (options.hasSupabaseAuthUser) {
        return sendMagicLink(supabaseEmail, email, options);
      }

      const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo: options.redirectTo,
        data: options.data,
      });

      if (!error) {
        return { deliveryKind: "invite" as const, supabaseAuthUserId: data.user?.id ?? null };
      }

      if (looksLikeExistingSupabaseUserError(error)) {
        return sendMagicLink(supabaseEmail, email, options);
      }

      throw error;
    },
  };
}
