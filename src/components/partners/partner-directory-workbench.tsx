"use client";

import { Building2, MapPinned, MessageCircle, UsersRound } from "lucide-react";

import { ContactDirectoryForm } from "@/components/forms/contact-directory-form";
import { LocationDirectoryForm } from "@/components/forms/location-directory-form";
import { OrganizationDirectoryForm } from "@/components/forms/organization-directory-form";
import { WhatsappSourcesDirectoryPanel } from "@/components/partners/whatsapp-sources-directory-panel";
import type { PartnerLocationRecord } from "@/lib/partners/locations";
import type { PartnerContactRecord, PartnerOrganizationRecord } from "@/lib/partners/repository";
import type { WhatsappSourceReviewSnapshot } from "@/lib/whatsapp/sources";

export type DirectorySection = "organizations" | "locations" | "contacts" | "whatsapp";

type PartnerDirectoryWorkbenchProps = {
  locale: string;
  canManage: boolean;
  organizations: PartnerOrganizationRecord[];
  locations: PartnerLocationRecord[];
  contacts: PartnerContactRecord[];
  whatsappSources: WhatsappSourceReviewSnapshot;
  activeSection: DirectorySection;
  onSectionChange: (section: DirectorySection) => void;
  selectedOrganizationId?: string | null;
  selectedLocationId?: string | null;
  selectedContactId?: string | null;
  onDirtyChange?: (dirty: boolean) => void;
};

function copyForLocale(locale: string) {
  if (locale === "en") {
    return {
      title: "Directory workbench",
      subtitle:
        "Work one layer at a time so the page stays focused: define the company, pin the location, then map the people and phones.",
      tabs: {
        organizations: {
          label: "Organizations",
          description: "Create the companies first.",
        },
        locations: {
          label: "Locations",
          description: "Attach real pickup and delivery points.",
        },
        contacts: {
          label: "Contacts",
          description: "Map people, ops numbers, and phones.",
        },
        whatsapp: {
          label: "WhatsApp",
          description: "Manage trusted and dismissed sources.",
        },
      },
    };
  }

  return {
    title: "Mesa de trabajo del directorio",
    subtitle:
      "Trabaja una capa a la vez para mantener el foco: define la empresa, ubica el punto y después mapea personas y teléfonos.",
    tabs: {
      organizations: {
        label: "Organizaciones",
        description: "Primero crea las empresas.",
      },
      locations: {
        label: "Ubicaciones",
        description: "Liga puntos reales de recolección y entrega.",
      },
      contacts: {
        label: "Contactos",
        description: "Mapea personas, números operativos y teléfonos.",
      },
      whatsapp: {
        label: "WhatsApp",
        description: "Administra fuentes confiables y descartadas.",
      },
    },
  };
}

export function PartnerDirectoryWorkbench({
  locale,
  canManage,
  organizations,
  locations,
  contacts,
  whatsappSources,
  activeSection,
  onSectionChange,
  selectedOrganizationId,
  selectedLocationId,
  selectedContactId,
  onDirtyChange,
}: PartnerDirectoryWorkbenchProps) {
  const copy = copyForLocale(locale);

  const tabs = [
    {
      id: "organizations" as const,
      icon: Building2,
      count: organizations.length,
      copy: copy.tabs.organizations,
    },
    {
      id: "locations" as const,
      icon: MapPinned,
      count: locations.length,
      copy: copy.tabs.locations,
    },
    {
      id: "contacts" as const,
      icon: UsersRound,
      count: contacts.length,
      copy: copy.tabs.contacts,
    },
    {
      id: "whatsapp" as const,
      icon: MessageCircle,
      count: whatsappSources.directorySources.length,
      copy: copy.tabs.whatsapp,
    },
  ];

  return (
    <article className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-sm">
      <div className="flex-shrink-0 border-b border-line-2 px-5 py-3.5">
        <h2 className="font-display text-base font-semibold text-ink">
          {copy.title}
        </h2>
      </div>

      {/* Compact horizontal tab strip — replaces the tall 3-card grid to free up form space */}
      <div className="flex flex-shrink-0 gap-1 overflow-x-auto border-b border-line-2 bg-tint px-4 py-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSection === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSectionChange(tab.id)}
              className={`flex flex-shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${
                isActive
                  ? "bg-card text-accent shadow-sm"
                  : "text-muted hover:bg-card/70 hover:text-ink"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.copy.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  isActive ? "bg-surface text-accent" : "bg-surface text-muted"
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
        {activeSection === "organizations" ? (
          <OrganizationDirectoryForm
            canManage={canManage}
            key={`organizations-${selectedOrganizationId ?? "default"}`}
            locale={locale}
            onDirtyChange={onDirtyChange}
            organizations={organizations}
            selectedOrganizationId={selectedOrganizationId}
          />
        ) : null}

        {activeSection === "locations" ? (
          <LocationDirectoryForm
            canManage={canManage}
            key={`locations-${selectedLocationId ?? "default"}`}
            locale={locale}
            locations={locations}
            onDirtyChange={onDirtyChange}
            organizations={organizations}
            selectedLocationId={selectedLocationId}
          />
        ) : null}

        {activeSection === "contacts" ? (
          <ContactDirectoryForm
            canManage={canManage}
            contacts={contacts}
            key={`contacts-${selectedContactId ?? "default"}`}
            locale={locale}
            onDirtyChange={onDirtyChange}
            organizations={organizations}
            selectedContactId={selectedContactId}
          />
        ) : null}

        {activeSection === "whatsapp" ? (
          <WhatsappSourcesDirectoryPanel
            canManage={canManage}
            locale={locale}
            snapshot={whatsappSources}
          />
        ) : null}
      </div>
    </article>
  );
}
