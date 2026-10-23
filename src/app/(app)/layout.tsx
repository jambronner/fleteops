import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { and, desc, eq, inArray } from "drizzle-orm";

import { AppShell } from "@/components/layout/app-shell";
import type { NotificationItem } from "@/components/layout/notification-bell";
import { getAvailableWorkspacesForSession, getOptionalSession } from "@/lib/auth/session";
import { getAppHomePathForHost } from "@/lib/app-routing";
import { db } from "@/lib/db/client";
import { reviewTasks } from "@/lib/db/schema";
import { getRequestDictionary } from "@/lib/i18n/server";
import { getIntakeReviewTaskAction } from "@/lib/review-tasks/actions";
import { getWhatsappSourceReviewSnapshot } from "@/lib/whatsapp/sources";

async function getNotificationItems(tenantId: string, whatsappTitle: string): Promise<NotificationItem[]> {
  if (!db) {
    return [];
  }

  const [openIntakeTasks, whatsappSources] = await Promise.all([
    db
      .select({
        id: reviewTasks.id,
        subjectId: reviewTasks.subjectId,
        title: reviewTasks.title,
        details: reviewTasks.details,
        metadata: reviewTasks.metadata,
      })
      .from(reviewTasks)
      .where(
        and(
          eq(reviewTasks.tenantId, tenantId),
          inArray(reviewTasks.status, ["open", "assigned"]),
          eq(reviewTasks.subjectType, "intake_event"),
        ),
      )
      .orderBy(desc(reviewTasks.createdAt))
      .limit(6),
    getWhatsappSourceReviewSnapshot(tenantId),
  ]);

  const intakeItems: NotificationItem[] = openIntakeTasks.map((task) => ({
    id: task.id,
    title: task.title,
    detail: task.details,
    href: getIntakeReviewTaskAction(task).href,
    kind: "intake",
  }));

  const whatsappItems: NotificationItem[] = whatsappSources.sources
    .filter((source) => source.status === "unclaimed")
    .slice(0, 4)
    .map((source) => ({
      id: source.id,
      title: whatsappTitle,
      detail: source.displayName ?? source.externalConversationId,
      href: "/partners#whatsapp-source-review",
      kind: "whatsapp",
    }));

  return [...whatsappItems, ...intakeItems].slice(0, 8);
}

// Personalized by session cookie: never statically prerender or cache.
export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const session = await getOptionalSession();

  if (!session) {
    redirect("/login");
  }

  const { dictionary } = await getRequestDictionary();
  const [workspaces, notifications] = await Promise.all([
    getAvailableWorkspacesForSession(session),
    getNotificationItems(session.tenant.id, dictionary.notifications.newWhatsappSource),
  ]);
  const requestHeaders = await headers();
  const homeHref = getAppHomePathForHost(requestHeaders.get("host"));

  return (
    <AppShell
      dictionary={dictionary}
      homeHref={homeHref}
      notifications={notifications}
      session={session}
      workspaces={workspaces}
    >
      {children}
    </AppShell>
  );
}
