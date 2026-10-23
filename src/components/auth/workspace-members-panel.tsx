import { RefreshCw } from "lucide-react";

import { WorkspaceMemberRemoveAction } from "@/components/auth/workspace-member-remove-action";
import type { AppRole } from "@/lib/auth/roles";

type MemberRow = {
  userId: string;
  email: string;
  fullName: string | null;
  role: AppRole;
  status: string;
};

type InviteRow = {
  id: string;
  email: string;
  role: AppRole;
  status: string;
  expiresAt: Date | null;
};

type WorkspaceMembersPanelCopy = {
  title: string;
  body: string;
  inviteTitle: string;
  email: string;
  role: string;
  sendInvite: string;
  resendInvite: string;
  remove: string;
  pending: string;
  active: string;
  noPending: string;
  readOnly: string;
  cancel: string;
  removing: string;
  removeInviteTitle: string;
  removeInviteBody: string;
  removeInviteWarning: string;
  removeMemberTitle: string;
  removeMemberBody: string;
  removeMemberWarning: string;
};

type WorkspaceMembersPanelProps = {
  canManage: boolean;
  copy: WorkspaceMembersPanelCopy;
  currentUserId: string;
  invites: InviteRow[];
  members: MemberRow[];
  notice?: { tone: "success" | "error"; text: string } | null;
};

const roles: AppRole[] = ["admin", "operator", "finance", "viewer"];

export function WorkspaceMembersPanel({
  canManage,
  copy,
  currentUserId,
  invites,
  members,
  notice = null,
}: WorkspaceMembersPanelProps) {
  return (
    <article className="min-w-0 rounded-2xl border border-line bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-xl font-semibold text-ink">{copy.title}</h2>
        <p className="text-sm leading-6 text-muted/75">{copy.body}</p>
      </div>

      {notice ? (
        <p
          className={
            notice.tone === "success"
              ? "mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800"
              : "mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800"
          }
        >
          {notice.text}
        </p>
      ) : null}

      {canManage ? (
        <form action="/api/workspaces/invitations" className="mt-5 grid gap-3 rounded-2xl bg-tint p-4" method="post">
          <h3 className="text-sm font-semibold text-ink">{copy.inviteTitle}</h3>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-ink">{copy.email}</span>
            <input
              className="h-11 rounded-xl border border-line bg-card px-3 text-ink"
              name="email"
              required
              type="email"
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-ink">{copy.role}</span>
            <select className="h-11 rounded-xl border border-line bg-card px-3 text-ink" name="role">
              {roles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>
          <button className="h-11 rounded-xl bg-accent text-sm font-semibold text-accent-contrast" type="submit">
            {copy.sendInvite}
          </button>
        </form>
      ) : (
        <p className="mt-5 rounded-2xl bg-tint px-4 py-3 text-sm text-muted">{copy.readOnly}</p>
      )}

      <div className="mt-6 grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="min-w-0">
          <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted/70">{copy.active}</h3>
          <div className="mt-3 grid min-w-0 gap-2">
            {members.map((member) => (
              <div className="min-w-0 rounded-xl border border-line px-3 py-2.5" key={member.userId}>
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="truncate text-sm font-semibold text-ink">{member.fullName ?? member.email}</p>
                    <p className="truncate text-xs text-muted">
                      {member.email} / {member.role}
                    </p>
                  </div>
                  {canManage && member.userId !== currentUserId ? (
                    <div className="ml-auto flex max-w-full shrink-0 flex-wrap justify-end gap-2">
                      <WorkspaceMemberRemoveAction
                        action={`/api/workspaces/members/${member.userId}/remove`}
                        buttonLabel={copy.remove}
                        cancelLabel={copy.cancel}
                        confirmLabel={copy.remove}
                        deletingLabel={copy.removing}
                        dialogBody={copy.removeMemberBody}
                        dialogTitle={copy.removeMemberTitle}
                        recordLabel={member.email}
                        warning={copy.removeMemberWarning}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="min-w-0">
          <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted/70">{copy.pending}</h3>
          <div className="mt-3 grid min-w-0 gap-2">
            {invites.length > 0 ? (
              invites.map((invite) => (
                <div className="min-w-0 rounded-xl border border-line px-3 py-2.5" key={invite.id}>
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="truncate text-sm font-semibold text-ink">{invite.email}</p>
                      <p className="text-xs text-muted">
                        {invite.role} / {invite.status}
                      </p>
                    </div>
                    {canManage ? (
                      <div className="ml-auto flex max-w-full shrink-0 flex-wrap justify-end gap-2">
                        <form
                          action={`/api/workspaces/invitations/${invite.id}/resend`}
                          className="max-w-full shrink-0"
                          method="post"
                        >
                          <button
                            className="inline-flex h-8 max-w-full items-center gap-1.5 whitespace-nowrap rounded-lg border border-line bg-card px-2.5 text-xs font-semibold text-ink-2 transition hover:border-accent/40 hover:bg-surface"
                            type="submit"
                          >
                            <RefreshCw aria-hidden="true" className="size-3.5" />
                            {copy.resendInvite}
                          </button>
                        </form>
                        <WorkspaceMemberRemoveAction
                          action={`/api/workspaces/invitations/${invite.id}/revoke`}
                          buttonLabel={copy.remove}
                          cancelLabel={copy.cancel}
                          confirmLabel={copy.remove}
                          deletingLabel={copy.removing}
                          dialogBody={copy.removeInviteBody}
                          dialogTitle={copy.removeInviteTitle}
                          recordLabel={invite.email}
                          warning={copy.removeInviteWarning}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-xl border border-dashed border-line px-3 py-2.5 text-sm text-muted">{copy.noPending}</p>
            )}
          </div>
        </section>
      </div>
    </article>
  );
}
