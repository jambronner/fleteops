import { EvidenceInbox } from "@/components/documents/evidence-inbox";
import { EvidenceIntakeReviewPanel } from "@/components/documents/evidence-intake-review-panel";
import { RecentDocumentsPanel } from "@/components/documents/recent-documents-panel";
import {
  EvidenceWorkspaceShell,
  type EvidenceWorkspaceView,
} from "@/components/documents/evidence-workspace-shell";
import { StatBar } from "@/components/ui/stat-bar";
import { DocumentUploadForm } from "@/components/forms/document-upload-form";
import { hasPermission } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";
import {
  canLinkDocumentsToShipments,
  canWriteDocuments,
} from "@/lib/documents/policy";
import { listEvidenceWorkspaceForTenant } from "@/lib/documents/repository";
import { getDictionary } from "@/lib/i18n/config";

export default async function EvidencePage({
  searchParams,
}: {
  searchParams: Promise<{ shipmentId?: string }>;
}) {
  const session = await getSession();
  const { shipmentId } = await searchParams;
  const dictionary = getDictionary(session.tenant.locale);
  const evidenceWorkspace = await listEvidenceWorkspaceForTenant({
    tenantId: session.tenant.id,
    recentLimit: 12,
    unlinkedLimit: 20,
    archivedLimit: 12,
  });
  const canArchiveDocuments = canWriteDocuments(session);
  const inboxCount = evidenceWorkspace.unlinkedDocuments.length;
  const canManageDocuments = canLinkDocumentsToShipments(session);
  const canDecideRouteChanges = hasPermission(session.permissions, "shipment.write");
  const initialView: EvidenceWorkspaceView =
    shipmentId && canArchiveDocuments
      ? "upload"
      : inboxCount > 0
        ? "triage"
        : evidenceWorkspace.intakeReviewTasks.length > 0
          ? "review"
          : "recent";

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div className="flex flex-shrink-0 flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted/60">
            {session.tenant.name}
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink">
            {dictionary.documentsPage.title}
          </h1>
        </div>

        <StatBar
          items={[
            {
              label: dictionary.documentsPage.metrics.shipmentsMissing,
              value: evidenceWorkspace.metrics.unlinkedEvidence,
              tone: "accent",
            },
            {
              label: dictionary.documentsPage.metrics.missingItems,
              value: evidenceWorkspace.metrics.linkedEvidence,
              tone: "success",
            },
            {
              label: dictionary.documentsPage.metrics.uploadedEvidence,
              value: evidenceWorkspace.metrics.routesWithEvidence,
            },
            {
              label: dictionary.documentsPage.metrics.readyToInvoice,
              value: evidenceWorkspace.metrics.routesWaitingForEvidence,
              tone: "warning",
            },
          ]}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <EvidenceWorkspaceShell
          canUpload={canArchiveDocuments}
          inboxCount={inboxCount}
          initialView={initialView}
          locale={session.tenant.locale}
          recent={
            <RecentDocumentsPanel
              archivedDocuments={evidenceWorkspace.archivedDocuments}
              canArchive={canArchiveDocuments}
              canLink={canManageDocuments}
              documents={evidenceWorkspace.recentDocuments.slice(0, 9)}
              locale={session.tenant.locale}
              showAiProcessingDetails={canArchiveDocuments}
              shipmentOptions={evidenceWorkspace.shipmentOptions}
            />
          }
          recentCount={evidenceWorkspace.recentDocuments.length}
          review={
            <EvidenceIntakeReviewPanel
              canDecideRouteChanges={canDecideRouteChanges}
              canManage={canManageDocuments}
              locale={session.tenant.locale}
              tasks={evidenceWorkspace.intakeReviewTasks}
            />
          }
          reviewCount={evidenceWorkspace.intakeReviewTasks.length}
          triage={
            <EvidenceInbox
              canManage={canManageDocuments}
              documents={evidenceWorkspace.unlinkedDocuments}
              locale={session.tenant.locale}
              shipmentOptions={evidenceWorkspace.shipmentOptions}
            />
          }
          upload={
            canArchiveDocuments ? <DocumentUploadForm locale={session.tenant.locale} /> : null
          }
        />
      </div>
    </div>
  );
}
