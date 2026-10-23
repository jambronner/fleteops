import { Upload } from "lucide-react";

import { StatBar } from "@/components/ui/stat-bar";
import { PartnerDirectoryWorkspace } from "@/components/partners/partner-directory-workspace";
import { DirectoryUploadPanel } from "@/components/partners/directory-upload-panel";
import { CollapsibleInfoPanel } from "@/components/ui/collapsible-info-panel";
import { getSession } from "@/lib/auth/session";
import { getDictionary } from "@/lib/i18n/config";
import { getPartnerLocations } from "@/lib/partners/locations";
import { canManageCounterparties } from "@/lib/partners/policy";
import { getPartnerDirectorySnapshot } from "@/lib/partners/repository";
import { getWhatsappSourceReviewSnapshot } from "@/lib/whatsapp/sources";

export default async function PartnersPage() {
  const session = await getSession();
  const copy = getDictionary(session.tenant.locale).partnersPage;
  const directory = await getPartnerDirectorySnapshot(session.tenant.id);
  const locations = await getPartnerLocations(session.tenant.id);
  const canManage = canManageCounterparties(session);
  const whatsappSources = await getWhatsappSourceReviewSnapshot(session.tenant.id, {
    includeHeldMessages: canManage,
  });

  return (
    // Mobile: natural scroll. xl+: viewport-fit.
    <div className="flex flex-col gap-4 overflow-y-auto xl:h-full xl:min-h-0 xl:overflow-clip">
      <header className="flex-shrink-0">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted/50">
          {session.tenant.name}
        </p>
        <h1 className="mt-0.5 font-display text-2xl font-bold tracking-tight text-ink">
          {copy.title}
        </h1>
      </header>

      <StatBar
        items={[
          { label: copy.metrics.organizations, value: directory.metrics.organizations },
          { label: copy.metrics.locations, value: locations.length },
          { label: copy.metrics.contacts, value: directory.metrics.contacts },
          { label: copy.metrics.mappedPhones, value: directory.metrics.mappedPhoneNumbers },
        ]}
      />

      {canManage ? (
        <div className="flex-shrink-0">
          <CollapsibleInfoPanel
            defaultOpen={false}
            icon={<Upload className="h-4 w-4" />}
            locale={session.tenant.locale}
            storageKey="directory-upload"
            title={copy.uploadTitle}
            contentClassName="max-h-[68dvh] overflow-y-auto px-4 pb-4 xl:max-h-[18dvh] 2xl:max-h-[22dvh]"
          >
            <DirectoryUploadPanel locale={session.tenant.locale} />
          </CollapsibleInfoPanel>
        </div>
      ) : null}

      <PartnerDirectoryWorkspace
        canManage={canManage}
        contacts={directory.contacts}
        coverageEmpty={copy.coverageEmpty}
        coverageGroups={copy.coverageGroups}
        coverageTitle={copy.coverageTitle}
        coverageUnnamedContact={copy.coverageUnnamedContact}
        locale={session.tenant.locale}
        locations={locations}
        organizations={directory.organizations}
        sourceReviewTitle={copy.whatsappTitle}
        whatsappSources={whatsappSources}
      />
    </div>
  );
}
