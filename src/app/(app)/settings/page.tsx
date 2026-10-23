
import { WorkspaceMembersPanel } from "@/components/auth/workspace-members-panel";
import { DigestSettingsForm } from "@/components/forms/digest-settings-form";
import { LocaleSettingsForm } from "@/components/forms/locale-settings-form";
import { WhatsappIntakeSettingsForm } from "@/components/forms/whatsapp-intake-settings-form";
import { hasPermission } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";
import { getDigestFrequency } from "@/lib/digest/preferences";
import { getDictionary, type Dictionary } from "@/lib/i18n/config";
import { CopyField } from "@/components/ui/copy-field";
import {
  canManageWhatsappIntakeSettings,
  getPrimaryEmailIntakeChannel,
  getPrimaryWhatsappIntakeChannel,
} from "@/lib/intake/channels";
import { getWorkspaceMemberAdminSnapshot } from "@/lib/workspaces/member-admin";

type SettingsPageProps = {
  searchParams: Promise<{
    invite?: string;
    member?: string;
  }>;
};

const successInviteNotices = ["sent", "resent", "revoked"];

function memberSettingsNotice(
  params: { invite?: string; member?: string },
  dictionary: Dictionary,
) {
  const memberNotices = dictionary.settings.memberNotices as Record<string, string>;
  const inviteNotices = dictionary.settings.inviteNotices as Record<string, string>;

  if (params.member && params.member in memberNotices) {
    return {
      tone: params.member === "removed" ? ("success" as const) : ("error" as const),
      text: memberNotices[params.member],
    };
  }

  if (params.invite && params.invite in inviteNotices) {
    return {
      tone: successInviteNotices.includes(params.invite) ? ("success" as const) : ("error" as const),
      text: inviteNotices[params.invite],
    };
  }

  return null;
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const session = await getSession();
  const params = await searchParams;
  const dictionary = getDictionary(session.tenant.locale);
  const [whatsappIntakeChannel, emailIntakeChannel, digestFrequency] = await Promise.all([
    getPrimaryWhatsappIntakeChannel(session.tenant.id),
    getPrimaryEmailIntakeChannel(session.tenant.id),
    getDigestFrequency(session.user.id, session.tenant.id),
  ]);
  const channelCopy = {
    ...dictionary.settings.channels,
    statuses: dictionary.settings.channels.statuses as Record<string, string>,
  };
  const canManageWhatsappIntake = canManageWhatsappIntakeSettings(session);
  const canManageMembers = hasPermission(session.permissions, "membership.manage");
  const memberSnapshot = await getWorkspaceMemberAdminSnapshot(session.tenant.id);
  const memberCopy = dictionary.settings.members;

  return (
    <div className="mx-auto flex h-full min-h-0 max-w-5xl flex-col gap-5">
      <div className="flex-shrink-0">
        <h1 className="font-display text-3xl font-bold text-ink">
          {dictionary.settings.title}
        </h1>
      </div>

      <div className="grid min-h-0 flex-1 gap-5 overflow-hidden lg:grid-cols-[1fr_0.9fr]">
        <section className="min-h-0 space-y-5 overflow-y-auto pr-1">
          <article className="rounded-2xl border border-line bg-card p-6 shadow-sm">
            <h2 className="font-display text-xl font-semibold text-ink">
              {channelCopy.title}
            </h2>

            <div className="mt-5 grid gap-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-ink">{channelCopy.email}</p>
                {emailIntakeChannel ? (
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      emailIntakeChannel.status === "active"
                        ? "bg-emerald-50 text-emerald-700"
                        : emailIntakeChannel.status === "pending"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {channelCopy.statuses[emailIntakeChannel.status] ?? emailIntakeChannel.status}
                  </span>
                ) : null}
              </div>
              {emailIntakeChannel?.address ? (
                <CopyField copyLabel={channelCopy.copy} value={emailIntakeChannel.address} />
              ) : (
                <p className="rounded-xl bg-surface px-4 py-3 text-sm text-muted">
                  {channelCopy.emailMissing}
                </p>
              )}
            </div>

            <div className="mt-6 border-t border-line-2 pt-5">
              <p className="text-sm font-medium text-ink">{dictionary.settings.whatsappIntake.title}</p>
              <WhatsappIntakeSettingsForm
                canManage={canManageWhatsappIntake}
                channel={whatsappIntakeChannel}
                copy={dictionary.settings.whatsappIntake}
              />
            </div>
          </article>

          <article className="rounded-2xl border border-line bg-card p-6 shadow-sm">
            <h2 className="font-display text-xl font-semibold text-ink">
              {dictionary.settings.languageTitle}
            </h2>
            <p className="mt-2 text-sm text-muted/75">{dictionary.settings.languageBody}</p>
            <div className="mt-5 max-w-sm">
              <LocaleSettingsForm
                currentLocale={session.tenant.locale as "en" | "es-MX"}
                localeLabels={dictionary.common.locales}
                fieldLabel={dictionary.settings.languageTitle}
                saveLabel={dictionary.common.actions.save}
                savingLabel={dictionary.common.actions.saving}
                successMessage={dictionary.settings.languageSaved}
                errorMessage={dictionary.settings.languageSaveError}
              />
            </div>
          </article>

          <article className="rounded-2xl border border-line bg-card p-6 shadow-sm">
            <h2 className="font-display text-xl font-semibold text-ink">
              {dictionary.settings.digest.title}
            </h2>
            <div className="mt-5 max-w-sm">
              <DigestSettingsForm
                currentFrequency={digestFrequency}
                fieldLabel={dictionary.settings.digest.frequencyLabel}
                optionLabels={dictionary.settings.digest.options}
                saveLabel={dictionary.common.actions.save}
                savingLabel={dictionary.common.actions.saving}
                successMessage={dictionary.settings.digest.saved}
                errorMessage={dictionary.settings.digest.saveError}
              />
            </div>
          </article>

          <WorkspaceMembersPanel
            canManage={canManageMembers}
            copy={memberCopy}
            currentUserId={session.user.id}
            invites={memberSnapshot.invites}
            members={memberSnapshot.members}
            notice={memberSettingsNotice(params, dictionary)}
          />

        </section>

        <section className="min-h-0 space-y-5 overflow-y-auto pr-1">
          <article className="rounded-2xl border border-line bg-card p-6 shadow-sm">
            <h2 className="font-display text-xl font-semibold text-ink">
              {dictionary.settings.sessionTitle}
            </h2>
            <div className="mt-4 space-y-2 text-sm text-muted/80">
              <p>{session.user.fullName}</p>
              <p>{session.user.email}</p>
              <p>
                {session.tenant.name} / {session.user.role}
              </p>
            </div>
            <form action="/api/auth/signout" className="mt-5" method="post">
              <button
                className="rounded-xl border border-line bg-surface px-5 py-2.5 text-sm font-semibold text-ink-2 transition hover:bg-surface-2"
                type="submit"
              >
                {dictionary.common.actions.signOut}
              </button>
            </form>
          </article>
        </section>
      </div>
    </div>
  );
}
