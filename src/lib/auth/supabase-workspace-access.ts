import type { createServerSupabaseClient } from "@/lib/supabase/server";
import { acceptWorkspaceInvitesForSupabaseUser } from "@/lib/workspaces/invite-flow";
import { createDrizzleWorkspaceInviteRepository } from "@/lib/workspaces/invite-repository";

type SupabaseServerClient = NonNullable<Awaited<ReturnType<typeof createServerSupabaseClient>>>;

export async function resolveWorkspaceAccessAfterSupabaseAuth(supabase: SupabaseServerClient, now = new Date()) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return {
      activeMemberships: [],
    };
  }

  return acceptWorkspaceInvitesForSupabaseUser({
    supabaseUser: {
      id: user.id,
      email: user.email,
      fullName:
        (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name) ||
        (typeof user.user_metadata?.name === "string" && user.user_metadata.name) ||
        null,
      preferredLocale:
        (typeof user.user_metadata?.preferred_locale === "string" && user.user_metadata.preferred_locale) ||
        (typeof user.user_metadata?.locale === "string" && user.user_metadata.locale) ||
        null,
    },
    now,
    repository: createDrizzleWorkspaceInviteRepository(),
  });
}
