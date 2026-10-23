"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  Home,
  Menu,
  Settings,
  Truck,
  X,
} from "lucide-react";

import type { AppSession } from "@/lib/auth/session";
import type { AvailableWorkspace } from "@/lib/auth/session";
import type { Dictionary } from "@/lib/i18n/config";

type SidebarProps = {
  dictionary: Dictionary;
  homeHref: string;
  session: AppSession;
  workspaces: AvailableWorkspace[];
};

export function Sidebar({ dictionary, homeHref, session, workspaces }: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [switchingWorkspaceId, setSwitchingWorkspaceId] = useState("");
  const [workspaceError, setWorkspaceError] = useState("");
  const pathname = usePathname();
  const router = useRouter();
  const workspaceCopy =
    session.tenant.locale === "en"
      ? {
          switchWorkspace: "Switch workspace",
          switchFailed: "Workspace switch failed.",
        }
      : {
          switchWorkspace: "Cambiar espacio",
          switchFailed: "No se pudo cambiar el espacio.",
        };

  const primaryNavigation = [
    { href: homeHref, key: "home", icon: Home },
    { href: "/routes", key: "shipments", icon: Truck },
    { href: "/evidence", key: "evidence", icon: FileText },
    { href: "/imports", key: "imports", icon: FileSpreadsheet },
    { href: "/partners", key: "partners", icon: Building2 },
    { href: "/settings", key: "settings", icon: Settings },
  ] as const;

  function isActive(item: (typeof primaryNavigation)[number]) {
    if (item.key === "home") {
      return pathname === "/" || pathname === "/dashboard";
    }

    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  async function handleWorkspaceChange(nextTenantId: string) {
    if (!nextTenantId || nextTenantId === session.tenant.id) {
      return;
    }

    setSwitchingWorkspaceId(nextTenantId);
    setWorkspaceError("");

    try {
      const response = await fetch("/api/workspaces/active", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tenantId: nextTenantId }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? workspaceCopy.switchFailed);
      }

      setWorkspaceMenuOpen(false);
      setMobileOpen(false);
      router.refresh();
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : workspaceCopy.switchFailed);
    } finally {
      setSwitchingWorkspaceId("");
    }
  }

  const navContent = (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/10 px-5 py-5">
        <div className="min-w-0">
          <p className="truncate font-mono text-[10px] uppercase tracking-widest text-blue-300/60">
            {dictionary.sidebar.workspaceLabel}
          </p>
          {workspaces.length > 1 ? (
            <div className="relative mt-1">
              <button
                aria-expanded={workspaceMenuOpen}
                aria-haspopup="listbox"
                aria-label={workspaceCopy.switchWorkspace}
                className="-ml-1 flex w-full items-start gap-1.5 rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-left text-sm font-semibold leading-snug text-white outline-none transition hover:border-white/10 hover:bg-card/8 focus:border-accent-2/80 focus:bg-card/10 disabled:cursor-wait disabled:opacity-70"
                disabled={Boolean(switchingWorkspaceId)}
                onClick={() => setWorkspaceMenuOpen((open) => !open)}
                type="button"
              >
                <span className="min-w-0 flex-1 whitespace-normal break-words">{session.tenant.name}</span>
                <ChevronDown
                  className={`mt-0.5 h-3.5 w-3.5 flex-shrink-0 transition-transform ${
                    workspaceMenuOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              {workspaceMenuOpen ? (
                <div
                  className="absolute left-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-xl border border-white/10 bg-nav-strong p-1 shadow-xl shadow-black/20"
                  role="listbox"
                >
                  {workspaces.map((workspace) => {
                    const selected = workspace.id === session.tenant.id;

                    return (
                      <button
                        aria-selected={selected}
                        className={`w-full rounded-lg px-3 py-2 text-left text-xs font-semibold leading-snug transition ${
                          selected
                            ? "bg-card/14 text-white"
                            : "text-blue-100 hover:bg-card/10 hover:text-white"
                        }`}
                        disabled={Boolean(switchingWorkspaceId)}
                        key={workspace.id}
                        onClick={() => {
                          if (selected) {
                            setWorkspaceMenuOpen(false);
                            return;
                          }

                          void handleWorkspaceChange(workspace.id);
                        }}
                        role="option"
                        type="button"
                      >
                        <span className="block whitespace-normal break-words">{workspace.name}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="truncate text-sm font-semibold leading-tight text-white">
              {session.tenant.name}
            </p>
          )}
          {workspaceError ? (
            <p className="mt-2 rounded-lg bg-rose-500/15 px-2 py-1 text-[10px] leading-4 text-rose-100">
              {workspaceError}
            </p>
          ) : null}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-blue-300/40">
          {dictionary.sidebar.primaryLabel}
        </p>
        <ul className="space-y-0.5">
          {primaryNavigation.map((item) => {
            const Icon = item.icon;
            const active = isActive(item);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => {
                    setMobileOpen(false);
                  }}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                    active
                      ? "border-accent-2/80 bg-[linear-gradient(135deg,_#1177e0_0%,_#0d6ad1_55%,_#0a56aa_100%)] text-white shadow-lg shadow-accent/35"
                      : "border-transparent bg-card/8 hover:border-white/12 hover:bg-card/12 hover:text-white"
                  }`}
                >
                  <Icon className={`h-4 w-4 flex-shrink-0 ${active ? "text-white" : "text-nav-soft"}`} />
                  <span className={`flex-1 truncate ${active ? "text-white" : "text-nav-soft"}`}>
                    {dictionary.nav[item.key]}
                  </span>
                  {active && <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 opacity-80" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

    </div>
  );

  return (
    <>
      <aside className="hidden h-dvh w-60 flex-shrink-0 flex-col bg-nav md:flex">
        {navContent}
      </aside>

      <button
        aria-label="Toggle menu"
        className="fixed left-4 top-4 z-50 flex h-9 w-9 items-center justify-center rounded-xl bg-nav text-white shadow-lg md:hidden"
        onClick={() => setMobileOpen((open) => !open)}
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-nav transition-transform duration-300 md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {navContent}
      </aside>
    </>
  );
}
