import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Plus } from "lucide-react";

import type { AppSession, AvailableWorkspace } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/roles";
import type { Dictionary } from "@/lib/i18n/config";
import { CommandPalette } from "@/components/layout/command-palette";
import { NotificationBell, type NotificationItem } from "@/components/layout/notification-bell";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Sidebar } from "@/components/layout/sidebar";
import { UserMenu } from "@/components/layout/user-menu";

type AppShellProps = {
  dictionary: Dictionary;
  homeHref: string;
  notifications: NotificationItem[];
  session: AppSession;
  workspaces: AvailableWorkspace[];
  children: ReactNode;
};

export function AppShell({
  dictionary,
  homeHref,
  notifications,
  session,
  workspaces,
  children,
}: AppShellProps) {
  const locale = session.tenant.locale;
  const newRouteLabel = locale === "en" ? "New route" : "Nueva ruta";
  const canCreateRoute = hasPermission(session.permissions, "shipment.write");

  return (
    <div className="fixed inset-0 flex h-dvh overflow-clip bg-surface text-ink">
      <Sidebar dictionary={dictionary} homeHref={homeHref} session={session} workspaces={workspaces} />

      <div className="flex min-w-0 flex-1 flex-col overflow-clip">
        <header className="relative z-40 flex h-14 flex-shrink-0 items-center gap-3 border-b border-line/80 bg-card/90 px-4 backdrop-blur-sm md:px-6">
          <Link className="ml-10 flex flex-shrink-0 items-center md:ml-0" href={homeHref as never}>
            <Image
              src="/logo.svg"
              alt={dictionary.appName}
              width={437}
              height={121}
              priority
              className="h-7 w-auto dark:hidden"
            />
            <Image
              src="/logo-white.svg"
              alt={dictionary.appName}
              width={437}
              height={121}
              priority
              className="hidden h-7 w-auto dark:block"
            />
          </Link>

          <div className="ml-2 min-w-0 flex-1 md:ml-6">
            <CommandPalette locale={locale} />
          </div>

          <div className="flex flex-shrink-0 items-center gap-2.5">
            {canCreateRoute ? (
              <Link
                className="hidden h-9 items-center gap-1.5 rounded-xl bg-accent px-3.5 text-sm font-semibold text-accent-contrast shadow-lg shadow-accent/25 transition hover:bg-accent-strong sm:flex"
                href="/routes?new=1"
              >
                <Plus className="h-4 w-4" />
                {newRouteLabel}
              </Link>
            ) : null}
            <ThemeToggle locale={locale} />
            <NotificationBell items={notifications} locale={locale} />
            <UserMenu
              email={session.user.email}
              fullName={session.user.fullName}
              locale={locale}
              role={session.user.role}
              workspaceName={session.tenant.name}
            />
          </div>
        </header>

        <main className="flex-1 min-h-0 overflow-clip p-5 md:p-7">{children}</main>
      </div>
    </div>
  );
}
