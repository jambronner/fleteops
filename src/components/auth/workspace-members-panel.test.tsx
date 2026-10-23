import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { WorkspaceMembersPanel } from "./workspace-members-panel";

test("WorkspaceMembersPanel renders active members, pending invites, and the admin invite form", () => {
  const html = renderToStaticMarkup(
    <WorkspaceMembersPanel
      canManage
      copy={{
        title: "Members",
        body: "Manage access for this workspace.",
        inviteTitle: "Invite member",
        email: "Email",
        role: "Role",
        sendInvite: "Send invite",
        resendInvite: "Resend",
        remove: "Remove",
        pending: "Pending invites",
        active: "Active members",
        noPending: "No pending invites.",
        readOnly: "Only workspace admins can invite members.",
        cancel: "Cancel",
        removing: "Removing...",
        removeInviteTitle: "Remove invite",
        removeInviteBody: "This revokes the pending workspace invite.",
        removeInviteWarning: "The old email link will no longer grant workspace access.",
        removeMemberTitle: "Remove member",
        removeMemberBody: "This removes workspace access for this member.",
        removeMemberWarning: "Their active session will stop working on the next request.",
      }}
      currentUserId="user-1"
      invites={[
        {
          id: "invite-1",
          email: "operator@example.com",
          role: "operator",
          status: "pending",
          expiresAt: new Date("2026-05-26T12:00:00.000Z"),
        },
      ]}
      members={[
        {
          userId: "user-1",
          email: "admin@example.com",
          fullName: "Admin User",
          role: "admin",
          status: "active",
        },
        {
          userId: "user-2",
          email: "viewer@example.com",
          fullName: "Viewer User",
          role: "viewer",
          status: "active",
        },
      ]}
      notice={{ tone: "success", text: "Invite resent." }}
    />,
  );

  assert.match(html, /Members/);
  assert.match(html, /Invite resent\./);
  assert.doesNotMatch(html, /Ask the teammate/);
  assert.match(html, /action="\/api\/workspaces\/invitations"/);
  assert.match(html, /operator@example.com/);
  assert.match(html, /action="\/api\/workspaces\/invitations\/invite-1\/resend"/);
  assert.match(html, /action="\/api\/workspaces\/invitations\/invite-1\/revoke"/);
  assert.match(html, /Resend/);
  assert.match(html, /Remove/);
  assert.match(html, /flex-wrap/);
  assert.match(html, /basis-40/);
  assert.match(html, /max-w-full/);
  assert.match(html, /admin@example.com/);
  assert.match(html, /viewer@example.com/);
  assert.match(html, /action="\/api\/workspaces\/members\/user-2\/remove"/);
  assert.doesNotMatch(html, /action="\/api\/workspaces\/members\/user-1\/remove"/);
  assert.match(html, /name="role"/);
  assert.match(html, /value="operator"/);
});
