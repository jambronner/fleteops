"use client";

import { Building2, MapPinned, Phone } from "lucide-react";
import { useState } from "react";

import { PartnerDirectoryWorkbench, type DirectorySection } from "@/components/partners/partner-directory-workbench";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import type { PartnerLocationRecord } from "@/lib/partners/locations";
import type { PartnerContactRecord, PartnerOrganizationRecord } from "@/lib/partners/repository";
import type { WhatsappSourceReviewSnapshot } from "@/lib/whatsapp/sources";
import { enumLabel } from "@/lib/i18n/enum-labels";

type PartnerDirectoryShellProps = {
  locale: string;
  canManage: boolean;
  coverageTitle: string;
  coverageEmpty: string;
  coverageUnnamedContact: string;
  coverageGroups: {
    organizations: string;
    locations: string;
    contacts: string;
  };
  organizations: PartnerOrganizationRecord[];
  locations: PartnerLocationRecord[];
  contacts: PartnerContactRecord[];
  whatsappSources: WhatsappSourceReviewSnapshot;
};

function getInitialSection(args: {
  organizations: PartnerOrganizationRecord[];
  locations: PartnerLocationRecord[];
}): DirectorySection {
  if (args.organizations.length === 0) {
    return "organizations";
  }

  if (args.locations.length === 0) {
    return "locations";
  }

  return "contacts";
}

function promptForLocale(locale: string) {
  if (locale === "en") {
    return "You have unsaved directory changes. Leave this section and discard them?";
  }

  return "Tienes cambios sin guardar en el directorio. ¿Quieres salir de esta sección y descartarlos?";
}

export function PartnerDirectoryShell({
  locale,
  canManage,
  coverageTitle,
  coverageEmpty,
  coverageUnnamedContact,
  coverageGroups,
  organizations,
  locations,
  contacts,
  whatsappSources,
}: PartnerDirectoryShellProps) {
  const [activeSection, setActiveSection] = useState<DirectorySection>(
    getInitialSection({ organizations, locations }),
  );
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [isWorkbenchDirty, setIsWorkbenchDirty] = useState(false);
  const { confirmIfNeeded } = useUnsavedChangesGuard({
    isDirty: isWorkbenchDirty,
    message: promptForLocale(locale),
  });

  function clearSelection() {
    setSelectedOrganizationId(null);
    setSelectedLocationId(null);
    setSelectedContactId(null);
  }

  function handleSectionChange(section: DirectorySection, recordId?: string) {
    const isChangingSection = section !== activeSection;
    const currentSelectedRecordId =
      section === "organizations"
        ? selectedOrganizationId
        : section === "locations"
          ? selectedLocationId
          : section === "contacts"
            ? selectedContactId
            : null;
    const isChangingRecord = Boolean(recordId && recordId !== currentSelectedRecordId);

    if ((isChangingSection || isChangingRecord) && !confirmIfNeeded()) {
      return;
    }

    setIsWorkbenchDirty(false);
    setActiveSection(section);
    clearSelection();

    if (section === "organizations") {
      setSelectedOrganizationId(recordId ?? null);
    }

    if (section === "locations") {
      setSelectedLocationId(recordId ?? null);
    }

    if (section === "contacts") {
      setSelectedContactId(recordId ?? null);
    }
  }

  return (
    <div className="grid gap-4 xl:h-full xl:min-h-0 xl:grid-cols-[0.78fr_1.22fr] xl:overflow-hidden">
      <article className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-sm">
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-line-2 px-5 py-3.5">
          <MapPinned className="h-4 w-4 text-accent" />
          <h2 className="font-display text-base font-semibold text-ink">
            {coverageTitle}
          </h2>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-3">
          <section className="rounded-xl border border-line bg-tint p-3">
            <button
              className="flex w-full items-center justify-between gap-2 pb-2 text-left"
              onClick={() => handleSectionChange("organizations")}
              type="button"
            >
              <div className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-accent" />
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {coverageGroups.organizations}
                </h3>
              </div>
              <span className="rounded-full bg-card px-2 py-0.5 text-[11px] font-semibold text-muted">
                {organizations.length}
              </span>
            </button>
            <div className="space-y-1">
              {organizations.length > 0 ? (
                organizations.slice(0, 5).map((organization) => (
                  <button
                    key={organization.id}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg bg-card px-3 py-2 text-left transition hover:border-accent/30 hover:bg-surface ${
                      selectedOrganizationId === organization.id ? "ring-1 ring-accent/20" : ""
                    }`}
                    onClick={() => handleSectionChange("organizations", organization.id)}
                    type="button"
                  >
                    <p className="min-w-0 truncate text-sm font-medium text-ink">
                      {organization.displayName || organization.legalName}
                    </p>
                    <span className="shrink-0 rounded-full bg-surface px-1.5 py-0.5 text-[10px] font-medium text-muted">
                      {enumLabel(locale, organization.organizationType)}
                    </span>
                  </button>
                ))
              ) : (
                <p className="px-3 py-2 text-xs text-muted/60">{coverageEmpty}</p>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-line bg-tint p-3">
            <button
              className="flex w-full items-center justify-between gap-2 pb-2 text-left"
              onClick={() => handleSectionChange("locations")}
              type="button"
            >
              <div className="flex items-center gap-1.5">
                <MapPinned className="h-3.5 w-3.5 text-accent" />
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {coverageGroups.locations}
                </h3>
              </div>
              <span className="rounded-full bg-card px-2 py-0.5 text-[11px] font-semibold text-muted">
                {locations.length}
              </span>
            </button>
            <div className="space-y-1">
              {locations.length > 0 ? (
                locations.slice(0, 5).map((location) => (
                  <button
                    key={location.id}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg bg-card px-3 py-2 text-left transition hover:border-accent/30 hover:bg-surface ${
                      selectedLocationId === location.id ? "ring-1 ring-accent/20" : ""
                    }`}
                    onClick={() => handleSectionChange("locations", location.id)}
                    type="button"
                  >
                    <p className="min-w-0 truncate text-sm font-medium text-ink">{location.name}</p>
                    <span className="shrink-0 truncate text-right text-xs text-muted/60">
                      {[enumLabel(locale, location.locationType), location.organizationName || location.city]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </button>
                ))
              ) : (
                <p className="px-3 py-2 text-xs text-muted/60">{coverageEmpty}</p>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-line bg-tint p-3">
            <button
              className="flex w-full items-center justify-between gap-2 pb-2 text-left"
              onClick={() => handleSectionChange("contacts")}
              type="button"
            >
              <div className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-accent" />
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {coverageGroups.contacts}
                </h3>
              </div>
              <span className="rounded-full bg-card px-2 py-0.5 text-[11px] font-semibold text-muted">
                {contacts.length}
              </span>
            </button>
            <div className="space-y-1">
              {contacts.length > 0 ? (
                contacts.slice(0, 5).map((contact) => (
                  <button
                    key={contact.id}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg bg-card px-3 py-2 text-left transition hover:border-accent/30 hover:bg-surface ${
                      selectedContactId === contact.id ? "ring-1 ring-accent/20" : ""
                    }`}
                    onClick={() => handleSectionChange("contacts", contact.id)}
                    type="button"
                  >
                    <p className="min-w-0 truncate text-sm font-medium text-ink">
                      {contact.fullName || contact.displayName || coverageUnnamedContact}
                    </p>
                    <span className="shrink-0 text-right text-xs text-muted/60">
                      {[contact.organizationName, enumLabel(locale, contact.role)].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                ))
              ) : (
                <p className="px-3 py-2 text-xs text-muted/60">{coverageEmpty}</p>
              )}
            </div>
          </section>
        </div>
      </article>

      <PartnerDirectoryWorkbench
        activeSection={activeSection}
        canManage={canManage}
        contacts={contacts}
        locale={locale}
        locations={locations}
        onDirtyChange={setIsWorkbenchDirty}
        onSectionChange={(section) => handleSectionChange(section)}
        organizations={organizations}
        selectedContactId={selectedContactId}
        selectedLocationId={selectedLocationId}
        selectedOrganizationId={selectedOrganizationId}
        whatsappSources={whatsappSources}
      />
    </div>
  );
}
