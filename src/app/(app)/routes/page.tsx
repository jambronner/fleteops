import { Upload } from "lucide-react";
import { redirect } from "next/navigation";

import { RoutesWorkspace } from "@/components/routes/routes-workspace";
import { ShipmentImportForm } from "@/components/forms/shipment-import-form";
import { CollapsibleInfoPanel } from "@/components/ui/collapsible-info-panel";
import { getSession } from "@/lib/auth/session";
import { getDictionary } from "@/lib/i18n/config";
import { getLatestRoutePreviewDraft } from "@/lib/imports/route-preview-draft-records";
import { getDashboardSnapshot } from "@/lib/reconciliation/queries";
import { buildImportReviewPath } from "@/lib/imports/route-review-navigation";
import { getImportMaxFileSizeMb } from "@/lib/imports/server";
import { canManageOperationalRecords } from "@/lib/operations/policy";
import { getManualShipments, getOperationalFormOptions } from "@/lib/operations/repository";

export default async function ShipmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; new?: string }>;
}) {
  const session = await getSession();
  const { edit, new: createNew } = await searchParams;
  const dictionary = getDictionary(session.tenant.locale);
  const copy = dictionary.routesPage;
  const canManage = canManageOperationalRecords(session);
  const maxFileSizeMb = getImportMaxFileSizeMb();

  if (canManage) {
    const pendingRouteImport = await getLatestRoutePreviewDraft(session.tenant.id);

    if (pendingRouteImport) {
      redirect(buildImportReviewPath(pendingRouteImport.id));
    }
  }

  const [shipments, options, snapshot] = await Promise.all([
    getManualShipments(session.tenant.id),
    getOperationalFormOptions(session.tenant.id),
    getDashboardSnapshot(session.tenant.id, session.tenant.locale),
  ]);
  const readiness = Object.fromEntries(
    snapshot.shipments.map((shipment) => [
      shipment.packet.id,
      {
        tone: shipment.evaluation.controlTowerStatus,
        label: dictionary.statuses[shipment.evaluation.controlTowerStatus],
        evidence: shipment.packet.documents.length,
      },
    ]),
  );

  return (
    // Mobile: natural scroll column. xl+: viewport-fit with internal panel scrolling.
    <div className="flex flex-col gap-4 overflow-y-auto xl:h-full xl:min-h-0 xl:overflow-hidden">
      <header className="flex-shrink-0">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted/50">
          {session.tenant.name}
        </p>
        <h1 className="mt-0.5 font-display text-2xl font-bold tracking-tight text-ink">
          {copy.title}
        </h1>
      </header>

      {canManage ? (
        <div className="flex-shrink-0">
          <CollapsibleInfoPanel
            className="min-w-0"
            contentClassName="max-h-[min(68dvh,720px)] overflow-y-auto px-3 pb-4 sm:px-6 sm:pb-6"
            defaultOpen={false}
            icon={<Upload className="h-4 w-4" />}
            locale={session.tenant.locale}
            storageKey="routes-upload"
            title={copy.uploadTitle}
          >
            <ShipmentImportForm
              allowedImportTypes={["shipment_tracker"]}
              compact
              defaultImportType="shipment_tracker"
              introBody={copy.uploadBody}
              introTitle={copy.uploadTitle}
              locale={session.tenant.locale}
              maxFileSizeMb={maxFileSizeMb}
              rulesOverride={[...copy.uploadRules]}
              submitLabelOverride={copy.uploadSubmit}
            />
          </CollapsibleInfoPanel>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden">
        <RoutesWorkspace
          canManage={canManage}
          initialCreate={createNew === "1"}
          initialEditId={edit}
          defaultRouteDate={new Date().toISOString().slice(0, 10)}
          locale={session.tenant.locale}
          readiness={readiness}
          shipments={shipments}
          organizations={options.organizations}
          locations={options.locations}
          purchaseOrders={options.purchaseOrders}
        />
      </div>
    </div>
  );
}
