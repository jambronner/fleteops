import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  Link2,
  MapPin,
  MessageSquareText,
  ShieldCheck,
  TriangleAlert,
  Users,
} from "lucide-react";
import { notFound } from "next/navigation";

import { RouteDecisionActions } from "@/components/routes/route-decision-actions";
import { RouteFolioControl } from "@/components/routes/route-folio-control";
import { RouteTimeline } from "@/components/routes/route-timeline";
import { StatusPill } from "@/components/dashboard/status-pill";
import { hasPermission } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";
import { formatRegionalDateTime, getRegionalDateLocale } from "@/lib/dates";
import { getDictionary } from "@/lib/i18n/config";
import { getShipmentAuditTrail } from "@/lib/operations/audit";
import { evaluateRouteApprovalReadiness } from "@/lib/operations/decisions";
import { getManualShipmentDetail } from "@/lib/operations/repository";
import { getDashboardSnapshot, getShipmentDetail } from "@/lib/reconciliation/queries";
import type { RequirementEvaluation } from "@/lib/reconciliation/types";
import { enumLabel } from "@/lib/i18n/enum-labels";

function formatDate(locale: string, pendingLabel: string, value?: string) {
  if (!value) return pendingLabel;

  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);

  return formatRegionalDateTime(value, locale, {
    dateStyle: "medium",
    ...(dateOnly ? {} : { timeStyle: "short" as const }),
  });
}

function formatCurrency(locale: string, value?: number) {
  if (typeof value !== "number") {
    return null;
  }

  return new Intl.NumberFormat(getRegionalDateLocale(locale), {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);
}

function requirementStyles(status: RequirementEvaluation["status"]) {
  const styles = {
    matched: {
      icon: "bg-emerald-100 text-emerald-700",
      badge: "bg-card text-emerald-700",
      Icon: CheckCircle2,
    },
    missing: {
      icon: "bg-amber-100 text-amber-700",
      badge: "bg-card text-amber-700",
      Icon: AlertCircle,
    },
    rejected: {
      icon: "bg-rose-100 text-rose-700",
      badge: "bg-card text-rose-700",
      Icon: TriangleAlert,
    },
    not_required_yet: {
      icon: "bg-surface text-muted",
      badge: "bg-card text-muted",
      Icon: Clock,
    },
  } as const;

  return styles[status];
}

function actionPanelStyles(tone: "inTransit" | "pendingDocs" | "needsReview" | "ready" | "blocked") {
  const styles = {
    inTransit: {
      shell: "border-line bg-card",
      icon: "bg-blue-50 text-accent",
      accent: "text-accent",
    },
    pendingDocs: {
      shell: "border-orange-100 bg-orange-50/40",
      icon: "bg-orange-100 text-orange-700",
      accent: "text-orange-700",
    },
    needsReview: {
      shell: "border-amber-100 bg-amber-50/40",
      icon: "bg-amber-100 text-amber-700",
      accent: "text-amber-700",
    },
    ready: {
      shell: "border-emerald-100 bg-emerald-50/40",
      icon: "bg-emerald-100 text-emerald-700",
      accent: "text-emerald-700",
    },
    blocked: {
      shell: "border-rose-100 bg-rose-50/40",
      icon: "bg-rose-100 text-rose-700",
      accent: "text-rose-700",
    },
  } as const;

  return styles[tone];
}

function buildEvidenceWorkspaceHref(options: {
  shipmentId: string;
  shipmentReference: string;
  documentType?: "customer_po" | "pod" | "carrier_invoice";
}) {
  const params = new URLSearchParams({
    shipmentId: options.shipmentId,
    shipmentReference: options.shipmentReference,
  });

  if (options.documentType) {
    params.set("documentType", options.documentType);
  }

  return `/evidence?${params.toString()}`;
}

function requirementActionDocumentType(
  requirementCode: RequirementEvaluation["code"],
): "customer_po" | "pod" | "carrier_invoice" | null {
  switch (requirementCode) {
    case "purchase_order":
      return "customer_po";
    case "delivery_proof":
      return "pod";
    case "carrier_invoice":
      return "carrier_invoice";
    default:
      return null;
  }
}

function requirementActionLabel(
  actions: Record<string, string>,
  requirementCode: RequirementEvaluation["code"],
) {
  return actions[requirementCode] ?? null;
}

export default async function ShipmentDetailPage({
  params,
}: {
  params: Promise<{ shipmentId: string }>;
}) {
  const { shipmentId } = await params;
  const session = await getSession();
  const dictionary = getDictionary(session.tenant.locale);
  const [workspaceDetail, auditTrail] = await Promise.all([
    getManualShipmentDetail(session.tenant.id, shipmentId),
    getShipmentAuditTrail(session.tenant.id, shipmentId),
  ]);
  const actorDetail = (event: (typeof auditTrail)[number]) =>
    event.actorName ?? (event.actorType === "system" ? dictionary.routeDetail.activity.automatic : null);
  const createdAudit = auditTrail.find((event) => event.action === "created");
  const auditActivity = auditTrail
    .filter((event) => event.action !== "created" && event.action !== "deleted")
    .map((event) => ({
      id: event.id,
      label:
        event.action === "updated"
          ? dictionary.routeDetail.activity.updated
          : event.action === "update_route"
            ? dictionary.routeDetail.activity.updatedFromIntake
            : event.action === "decision.approved"
              ? dictionary.routeDetail.activity.decisionApproved
              : event.action === "decision.hold"
                ? dictionary.routeDetail.activity.decisionHold
                : event.action === "decision.cleared"
                  ? dictionary.routeDetail.activity.decisionCleared
                  : event.summary ?? event.action,
      detail: actorDetail(event),
      date: event.createdAt,
    }));

  if (workspaceDetail) {
    const copy = dictionary.routeDetail;
    const dashboardSnapshot = await getDashboardSnapshot(session.tenant.id, session.tenant.locale);
    const routeReview = dashboardSnapshot.shipments.find((shipment) => shipment.packet.id === shipmentId);
    const evaluation = routeReview?.evaluation;
    const routeDecision = workspaceDetail.shipment.decision;
    const canDecide =
      hasPermission(session.permissions, "review.resolve") ||
      hasPermission(session.permissions, "finance.write");
    const reviewTone = evaluation?.controlTowerStatus ?? "inTransit";
    const approvalReadiness = evaluation
      ? evaluateRouteApprovalReadiness({
          lifecycle: routeReview?.packet.lifecycle ?? "planned",
          evaluation,
        })
      : { canApprove: false, blockers: ["evaluation_unavailable"] };
    const reviewStyles = actionPanelStyles(reviewTone);
    const missingRequirements =
      evaluation?.requirements.filter((requirement) =>
        ["missing", "rejected"].includes(requirement.status),
      ) ?? [];
    const visibleRequirements =
      evaluation?.requirements.filter((requirement) => requirement.status !== "not_required_yet") ?? [];
    const satisfiedRequirements = visibleRequirements.filter(
      (requirement) => requirement.status === "matched",
    ).length;
    const evidenceProgress = visibleRequirements.length > 0
      ? Math.round((satisfiedRequirements / visibleRequirements.length) * 100)
      : null;
    const genericEvidenceHref = buildEvidenceWorkspaceHref({
      shipmentId,
      shipmentReference: workspaceDetail.shipment.shipmentReference,
    });
    const deliveryStopNames = workspaceDetail.shipment.deliveryStops.length > 0
      ? workspaceDetail.shipment.deliveryStops.map((stop) => stop.name)
      : workspaceDetail.shipment.deliveryLocationName
        ? [workspaceDetail.shipment.deliveryLocationName]
        : [];

    return (
      <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
        <header className="flex flex-shrink-0 flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <Link
              href="/routes"
              className="inline-flex items-center gap-2 text-xs font-semibold text-muted/70 transition hover:text-ink"
            >
              <ArrowLeft className="h-4 w-4" />
              {copy.detailBack}
            </Link>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
                {workspaceDetail.shipment.shipmentReference}
              </h1>
            </div>
            <div className="mt-1 flex min-w-0 items-center gap-2 text-sm text-muted">
              <span className="truncate">{workspaceDetail.shipment.pickupLocationName ?? copy.noValue}</span>
              <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-muted/45" />
              <span className="truncate">{deliveryStopNames.join(" · ") || copy.noValue}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-full border border-line bg-card px-2.5 py-1 text-[11px] font-semibold text-muted">
              {enumLabel(session.tenant.locale, workspaceDetail.shipment.status)}
            </span>
            <Link
              className="rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-accent/40 hover:text-accent"
              href={`/routes?edit=${shipmentId}`}
            >
              {copy.editRoute}
            </Link>
          </div>
        </header>

        <article
          className={`flex-shrink-0 overflow-hidden rounded-[22px] border p-4 shadow-[0_22px_70px_-48px_rgba(1,26,98,0.65)] ${reviewStyles.shell}`}
          data-route-readiness-region="summary"
        >
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
            <div className="flex min-w-0 items-start gap-3.5">
              <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl ${reviewStyles.icon}`}>
                {reviewTone === "ready" ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : reviewTone === "blocked" ? (
                  <TriangleAlert className="h-5 w-5" />
                ) : (
                  <AlertCircle className="h-5 w-5" />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-base font-semibold text-ink">
                    {copy.readinessTitle}
                  </h2>
                  <StatusPill label={dictionary.statuses[reviewTone]} tone={reviewTone} />
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-muted/85">
                  {evaluation?.summary.nextAction ?? copy.readinessUnavailable}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
                  <div className="min-w-36">
                    <div className="mb-1 flex items-center justify-between gap-3 text-[10px] font-semibold uppercase tracking-wide text-muted/60">
                      <span>{copy.readinessProgress}</span>
                      <span className={reviewStyles.accent}>{evidenceProgress == null ? "—" : `${evidenceProgress}%`}</span>
                    </div>
                    <div
                      aria-label={copy.readinessProgress}
                      aria-valuemax={100}
                      aria-valuemin={0}
                      aria-valuenow={evidenceProgress ?? undefined}
                      className="h-1.5 overflow-hidden rounded-full bg-card/80"
                      role="progressbar"
                    >
                      <div
                        className="h-full rounded-full bg-accent transition-[width]"
                        style={{ width: `${evidenceProgress ?? 0}%` }}
                      />
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-muted">
                    <TriangleAlert className="h-3.5 w-3.5" />
                    <strong className="text-ink">{approvalReadiness.blockers.length}</strong>
                    {approvalReadiness.blockers.length === 1 ? copy.blockerLabel : copy.blockersLabel}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-muted">
                    <FileText className="h-3.5 w-3.5" />
                    <strong className="text-ink">{workspaceDetail.linkedEvidence.length}</strong>
                    {copy.filesLabel}
                  </span>
                </div>
              </div>
            </div>

            {!evaluation || canDecide || routeDecision ? (
              <div className="border-t border-line/70 pt-3 xl:min-w-[17rem] xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0 [&>div]:mt-0">
                {evaluation ? (
                  <RouteDecisionActions
                    approvalBlockedReason={copy.decision.approveBlocked}
                    canApprove={approvalReadiness.canApprove}
                    canDecide={canDecide}
                    copy={copy.decision}
                    decidedAtLabel={
                      routeDecision
                        ? formatDate(session.tenant.locale, copy.noValue, routeDecision.decidedAt)
                        : null
                    }
                    decision={routeDecision}
                    shipmentId={shipmentId}
                  />
                ) : (
                  <p className="text-xs text-muted">{copy.readinessUnavailable}</p>
                )}
              </div>
            ) : null}
          </div>
        </article>

        <div
          className="min-h-0 flex-1 overflow-y-auto pr-1 xl:grid xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-4 xl:overflow-hidden xl:pr-0"
          data-route-readiness-region="work"
        >
          <section className="subtle-scrollbar space-y-4 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
            {evaluation ? (
              <article className="rounded-[22px] border border-line bg-card p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-accent" />
                    <h2 className="font-display text-sm font-semibold text-ink">
                      {copy.requirementsTitle}
                    </h2>
                    <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted">
                      {missingRequirements.length} {missingRequirements.length === 1 ? copy.blockerLabel : copy.blockersLabel}
                    </span>
                  </div>
                  <Link
                    href={genericEvidenceHref}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-accent/20 px-2.5 py-1.5 text-xs font-semibold text-accent transition hover:border-accent/40 hover:bg-tint"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    {copy.openEvidencePage}
                  </Link>
                </div>

                <div className="mt-4 overflow-hidden rounded-2xl border border-line">
                  {visibleRequirements.length > 0 ? (
                    <div className="divide-y divide-line-2">
                      {visibleRequirements.map((requirement) => {
                        const styles = requirementStyles(requirement.status);
                        const Icon = styles.Icon;
                        const actionDocumentType = requirementActionDocumentType(requirement.code);
                        const actionHref =
                          ["missing", "rejected"].includes(requirement.status) && actionDocumentType
                            ? buildEvidenceWorkspaceHref({
                                shipmentId,
                                shipmentReference: workspaceDetail.shipment.shipmentReference,
                                documentType: actionDocumentType,
                              })
                            : null;
                        const actionLabel = actionHref
                          ? requirementActionLabel(dictionary.routeDetail.requirementActions, requirement.code)
                          : null;

                        return (
                          <div className="flex items-start gap-3 bg-card px-4 py-3" key={requirement.code}>
                            <span className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ${styles.icon}`}>
                              <Icon className="h-3.5 w-3.5" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-ink">{requirement.label}</p>
                                <div className="flex items-center gap-2">
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles.badge}`}>
                                    {enumLabel(session.tenant.locale, requirement.status)}
                                  </span>
                                  {actionHref && actionLabel ? (
                                    <Link
                                      href={actionHref}
                                      className="rounded-lg border border-accent/20 px-2 py-1 text-[11px] font-semibold text-accent transition hover:border-accent/40 hover:bg-tint"
                                    >
                                      {actionLabel}
                                    </Link>
                                  ) : null}
                                  {requirement.code === "folio_return" && requirement.status !== "not_required_yet" ? (
                                    <RouteFolioControl
                                      canRecord={canDecide}
                                      folio={workspaceDetail.shipment.folio}
                                      locale={session.tenant.locale}
                                      shipmentId={shipmentId}
                                    />
                                  ) : null}
                                </div>
                              </div>
                              {requirement.status !== "matched" ? (
                                <p className="mt-1 text-xs leading-5 text-muted/80">{requirement.reason}</p>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" />
                      {copy.allClear}
                    </div>
                  )}
                </div>
              </article>
            ) : null}

            <article className="rounded-[22px] border border-line bg-card p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-accent" />
                  <h2 className="font-display text-sm font-semibold text-ink">{copy.evidence}</h2>
                  <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted">
                    {workspaceDetail.linkedEvidence.length}
                  </span>
                </div>
                <Link className="text-xs font-semibold text-accent" href={genericEvidenceHref}>
                  {copy.openEvidence}
                </Link>
              </div>

              <div className="mt-4 overflow-hidden rounded-2xl border border-line">
                {workspaceDetail.linkedEvidence.length > 0 ? (
                  <div className="divide-y divide-line-2">
                    {workspaceDetail.linkedEvidence.map((document) => (
                      <div className="flex flex-wrap items-start gap-3 bg-card px-4 py-3" key={document.id}>
                        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-surface text-accent">
                          <FileText className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-ink">{document.originalFileName}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted/75">
                            <span>{enumLabel(session.tenant.locale, document.documentType)}</span>
                            {document.linkedAt ? (
                              <span>
                                {copy.linkedAt} {formatDate(session.tenant.locale, copy.noValue, document.linkedAt.toISOString())}
                              </span>
                            ) : null}
                          </div>
                          {document.statusDetail ? (
                            <p className="mt-1 text-xs text-amber-700">{document.statusDetail}</p>
                          ) : null}
                        </div>
                        {document.signedReadUrl ? (
                          <a
                            className="text-xs font-semibold text-accent"
                            href={document.signedReadUrl}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {copy.openStoredFile}
                          </a>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="bg-surface px-4 py-3 text-sm text-muted">{copy.noEvidence}</p>
                )}
              </div>
            </article>

            <RouteTimeline
              activity={auditActivity}
              actualLabel={copy.actualDelivery}
              createdLabel={
                createdAudit && actorDetail(createdAudit)
                  ? `${copy.createdAt} · ${actorDetail(createdAudit)}`
                  : copy.createdAt
              }
              evidenceLabel={copy.evidenceLinked}
              expectedLabel={copy.expectedDelivery}
              locale={session.tenant.locale}
              serviceLabel={copy.pickupDate}
              shipment={{
                createdAt: workspaceDetail.shipment.createdAt,
                pickupDate: workspaceDetail.shipment.pickupDate,
                expectedDeliveryDate: workspaceDetail.shipment.expectedDeliveryDate,
                actualDeliveryDate: workspaceDetail.shipment.actualDeliveryDate,
              }}
              title={copy.history}
              evidence={workspaceDetail.linkedEvidence.map((document) => ({
                id: document.id,
                name: document.originalFileName,
                linkedAt: document.linkedAt,
              }))}
            />
          </section>

          <aside
            aria-label={copy.factsTitle}
            className="subtle-scrollbar mt-4 xl:mt-0 xl:min-h-0 xl:overflow-y-auto xl:pl-1"
            data-route-readiness-region="facts"
          >
            <div className="overflow-hidden rounded-[22px] border border-line bg-card shadow-sm">
              <div className="border-b border-line-2 px-4 py-3.5">
                <h2 className="font-display text-sm font-semibold text-ink">{copy.factsTitle}</h2>
              </div>

              <section className="border-b border-line-2 p-4">
                <div className="mb-3 flex items-center gap-2 text-muted">
                  <CalendarDays className="h-3.5 w-3.5 text-accent" />
                  <h3 className="text-xs font-semibold uppercase tracking-wide">{copy.timingTitle}</h3>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-4">
                  {[
                    [copy.createdAt, workspaceDetail.shipment.createdAt],
                    [copy.pickupDate, workspaceDetail.shipment.pickupDate ?? undefined],
                    [copy.expectedDelivery, workspaceDetail.shipment.expectedDeliveryDate ?? undefined],
                    [copy.actualDelivery, workspaceDetail.shipment.actualDeliveryDate ?? undefined],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted/55">{label}</dt>
                      <dd className="mt-1 text-xs font-semibold leading-5 text-ink">
                        {formatDate(session.tenant.locale, copy.noValue, value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section className="border-b border-line-2 p-4">
                <div className="flex items-center gap-2 text-muted">
                  <MapPin className="h-3.5 w-3.5 text-accent" />
                  <h3 className="text-xs font-semibold uppercase tracking-wide">{copy.route}</h3>
                </div>
                <div className="mt-3 space-y-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted/55">{copy.pickupLocation}</p>
                    <p className="mt-1 text-sm font-semibold text-ink">{workspaceDetail.shipment.pickupLocationName ?? copy.noValue}</p>
                  </div>
                  <ol className="space-y-2">
                    {deliveryStopNames.length > 0 ? (
                      deliveryStopNames.map((name, index) => (
                        <li className="flex items-center gap-2 text-sm text-ink" key={`${name}-${index}`}>
                          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-surface text-[10px] font-bold text-accent">
                            {index + 1}
                          </span>
                          <span className="truncate">{name}</span>
                        </li>
                      ))
                    ) : (
                      <li className="text-sm text-muted">{copy.noValue}</li>
                    )}
                  </ol>
                </div>
              </section>

              <section className="border-b border-line-2 p-4">
                <div className="flex items-center gap-2 text-muted">
                  <Users className="h-3.5 w-3.5 text-accent" />
                  <h3 className="text-xs font-semibold uppercase tracking-wide">{copy.parties}</h3>
                </div>
                <dl className="mt-3 space-y-3">
                  {[
                    [copy.shipper, workspaceDetail.shipment.shipperName],
                    [copy.carrier, workspaceDetail.shipment.carrierName],
                    [copy.customer, workspaceDetail.shipment.customerName],
                  ].map(([label, value]) => (
                    <div className="flex items-start justify-between gap-3" key={label}>
                      <dt className="text-xs text-muted/70">{label}</dt>
                      <dd className="max-w-[11rem] text-right text-xs font-semibold text-ink">{value ?? copy.noValue}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section className="border-b border-line-2 p-4">
                <div className="flex items-center gap-2 text-muted">
                  <Link2 className="h-3.5 w-3.5 text-accent" />
                  <h3 className="text-xs font-semibold uppercase tracking-wide">{copy.purchaseOrders}</h3>
                </div>
                <div className="mt-3 space-y-2">
                  {workspaceDetail.linkedPurchaseOrders.length > 0 ? (
                    workspaceDetail.linkedPurchaseOrders.map((purchaseOrder) => (
                      <p className="rounded-lg bg-surface px-3 py-2 text-xs font-semibold text-ink" key={purchaseOrder.id}>
                        {purchaseOrder.label}
                      </p>
                    ))
                  ) : (
                    <p className="text-xs text-muted">{copy.noPurchaseOrders}</p>
                  )}
                </div>
              </section>

              <section className="p-4">
                <div className="flex items-center gap-2 text-muted">
                  <MessageSquareText className="h-3.5 w-3.5 text-accent" />
                  <h3 className="text-xs font-semibold uppercase tracking-wide">{copy.notes}</h3>
                </div>
                <p className="mt-3 text-xs leading-5 text-ink">{workspaceDetail.shipment.notes ?? copy.noNotes}</p>
              </section>
            </div>
          </aside>
        </div>
      </div>
    );
  }

  const detail = await getShipmentDetail(shipmentId, session.tenant.locale);

  if (!detail) {
    notFound();
  }

  const { packet, evaluation } = detail;
  const copy = dictionary.routeDetail;
  const reviewStyles = actionPanelStyles(evaluation.controlTowerStatus);
  const visibleRequirements = evaluation.requirements.filter(
    (requirement) => requirement.status !== "not_required_yet",
  );
  const missingRequirements = visibleRequirements.filter((requirement) =>
    ["missing", "rejected"].includes(requirement.status),
  );
  const evidenceProgress = visibleRequirements.length > 0
    ? Math.round(
        (visibleRequirements.filter((requirement) => requirement.status === "matched").length /
          visibleRequirements.length) *
          100,
      )
    : null;
  const approvalReadiness = evaluateRouteApprovalReadiness({
    lifecycle: packet.lifecycle,
    evaluation,
  });

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <header className="flex flex-shrink-0 flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link href="/routes" className="inline-flex items-center gap-2 text-xs font-semibold text-muted/70 transition hover:text-ink">
            <ArrowLeft className="h-4 w-4" />
            {copy.detailBack}
          </Link>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-ink">{packet.shipmentReference}</h1>
          <p className="mt-1 truncate text-sm text-muted">{packet.customerName} · {packet.routeLabel}</p>
        </div>
        <span className="rounded-full border border-line bg-card px-2.5 py-1 text-[11px] font-semibold text-muted">
          {enumLabel(session.tenant.locale, packet.lifecycle)}
        </span>
      </header>

      <article
        className={`flex-shrink-0 overflow-hidden rounded-[22px] border p-4 shadow-[0_22px_70px_-48px_rgba(1,26,98,0.65)] ${reviewStyles.shell}`}
        data-route-readiness-region="summary"
      >
        <div className="flex min-w-0 items-start gap-3.5">
          <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl ${reviewStyles.icon}`}>
            {evaluation.controlTowerStatus === "ready" ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : evaluation.controlTowerStatus === "blocked" ? (
              <TriangleAlert className="h-5 w-5" />
            ) : (
              <AlertCircle className="h-5 w-5" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-base font-semibold text-ink">{copy.readinessTitle}</h2>
              <StatusPill label={dictionary.statuses[evaluation.controlTowerStatus]} tone={evaluation.controlTowerStatus} />
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-muted/85">{evaluation.summary.nextAction}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
              <div className="min-w-36">
                <div className="mb-1 flex items-center justify-between gap-3 text-[10px] font-semibold uppercase tracking-wide text-muted/60">
                  <span>{copy.readinessProgress}</span>
                  <span className={reviewStyles.accent}>{evidenceProgress == null ? "—" : `${evidenceProgress}%`}</span>
                </div>
                <div
                  aria-label={copy.readinessProgress}
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={evidenceProgress ?? undefined}
                  className="h-1.5 overflow-hidden rounded-full bg-card/80"
                  role="progressbar"
                >
                  <div className="h-full rounded-full bg-accent" style={{ width: `${evidenceProgress ?? 0}%` }} />
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 text-muted">
                <TriangleAlert className="h-3.5 w-3.5" />
                <strong className="text-ink">{approvalReadiness.blockers.length}</strong>{" "}
                {approvalReadiness.blockers.length === 1 ? copy.blockerLabel : copy.blockersLabel}
              </span>
              <span className="inline-flex items-center gap-1.5 text-muted">
                <FileText className="h-3.5 w-3.5" />
                <strong className="text-ink">{packet.documents.length}</strong> {copy.filesLabel}
              </span>
            </div>
          </div>
        </div>
      </article>

      <div
        className="min-h-0 flex-1 overflow-y-auto pr-1 xl:grid xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-4 xl:overflow-hidden xl:pr-0"
        data-route-readiness-region="work"
      >
        <section className="subtle-scrollbar space-y-4 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
          <article className="rounded-[22px] border border-line bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-accent" />
              <h2 className="font-display text-sm font-semibold text-ink">{copy.requirementsTitle}</h2>
              <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-semibold text-muted">
                {missingRequirements.length} {missingRequirements.length === 1 ? copy.blockerLabel : copy.blockersLabel}
              </span>
            </div>
            <div className="mt-4 overflow-hidden rounded-2xl border border-line divide-y divide-line-2">
              {visibleRequirements.map((requirement) => {
                const styles = requirementStyles(requirement.status);
                const Icon = styles.Icon;
                return (
                  <div className="flex items-start gap-3 bg-card px-4 py-3" key={requirement.code}>
                    <span className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ${styles.icon}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-ink">{requirement.label}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles.badge}`}>
                          {enumLabel(session.tenant.locale, requirement.status)}
                        </span>
                      </div>
                      {requirement.status !== "matched" ? (
                        <p className="mt-1 text-xs leading-5 text-muted/80">{requirement.reason}</p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="rounded-[22px] border border-line bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-accent" />
              <h2 className="font-display text-sm font-semibold text-ink">{copy.evidence}</h2>
              <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-semibold text-muted">{packet.documents.length}</span>
            </div>
            <div className="mt-4 overflow-hidden rounded-2xl border border-line divide-y divide-line-2">
              {packet.documents.map((document) => (
                <div className="flex items-start gap-3 bg-card px-4 py-3" key={document.id}>
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-surface text-accent">
                    <FileText className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{document.title}</p>
                    <p className="mt-1 text-xs text-muted">
                      {enumLabel(session.tenant.locale, document.sourceChannel)} · {document.issuingParty}
                    </p>
                  </div>
                  <span className="text-[11px] text-muted/70">
                    {formatDate(session.tenant.locale, dictionary.dashboard.copy.pendingLabel, document.uploadedAt)}
                  </span>
                </div>
              ))}
            </div>
          </article>

          {packet.messages.length > 0 ? (
            <article className="rounded-[22px] border border-line bg-card p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <MessageSquareText className="h-4 w-4 text-accent" />
                <h2 className="font-display text-sm font-semibold text-ink">{dictionary.dashboard.sections.timeline}</h2>
              </div>
              <div className="mt-4 space-y-3">
                {packet.messages.map((message) => (
                  <div className="rounded-xl bg-surface px-4 py-3" key={message.id}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold text-ink">{message.senderName}</p>
                      <span className="text-[11px] text-muted/70">
                        {formatDate(session.tenant.locale, dictionary.dashboard.copy.pendingLabel, message.sentAt)}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted/80">{message.body}</p>
                  </div>
                ))}
              </div>
            </article>
          ) : null}
        </section>

        <aside
          aria-label={copy.factsTitle}
          className="subtle-scrollbar mt-4 xl:mt-0 xl:min-h-0 xl:overflow-y-auto xl:pl-1"
          data-route-readiness-region="facts"
        >
          <div className="overflow-hidden rounded-[22px] border border-line bg-card shadow-sm">
            <div className="border-b border-line-2 px-4 py-3.5">
              <h2 className="font-display text-sm font-semibold text-ink">{copy.factsTitle}</h2>
            </div>
            <section className="border-b border-line-2 p-4">
              <div className="flex items-center gap-2 text-muted">
                <CalendarDays className="h-3.5 w-3.5 text-accent" />
                <h3 className="text-xs font-semibold uppercase tracking-wide">{copy.timingTitle}</h3>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted/55">{copy.expectedDelivery}</dt>
                  <dd className="mt-1 text-xs font-semibold leading-5 text-ink">
                    {formatDate(session.tenant.locale, copy.noValue, packet.expectedDeliveryDate)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted/55">{copy.actualDelivery}</dt>
                  <dd className="mt-1 text-xs font-semibold leading-5 text-ink">
                    {formatDate(session.tenant.locale, copy.noValue, packet.actualDeliveryDate)}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-xs leading-5 text-muted">{packet.routeLabel}</p>
            </section>
            <section className="border-b border-line-2 p-4">
              <div className="flex items-center gap-2 text-muted">
                <Users className="h-3.5 w-3.5 text-accent" />
                <h3 className="text-xs font-semibold uppercase tracking-wide">{copy.parties}</h3>
              </div>
              <dl className="mt-3 space-y-3">
                {[
                  [copy.customer, packet.customerName],
                  [copy.shipper, packet.shipperName],
                  [copy.deliveryLocation, packet.destinationName],
                ].map(([label, value]) => (
                  <div className="flex items-start justify-between gap-3" key={label}>
                    <dt className="text-xs text-muted/70">{label}</dt>
                    <dd className="max-w-[11rem] text-right text-xs font-semibold text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <section className="border-b border-line-2 p-4">
              <div className="flex items-center gap-2 text-muted">
                <Link2 className="h-3.5 w-3.5 text-accent" />
                <h3 className="text-xs font-semibold uppercase tracking-wide">{copy.carrierInvoice}</h3>
              </div>
              <dl className="mt-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-xs text-muted/70">{copy.expectedCarrierAmount}</dt>
                  <dd className="text-xs font-semibold text-ink">
                    {formatCurrency(session.tenant.locale, packet.expectedCarrierInvoiceAmount) ?? copy.noValue}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-xs text-muted/70">{copy.claimedCarrierAmount}</dt>
                  <dd className="text-xs font-semibold text-ink">
                    {formatCurrency(session.tenant.locale, packet.carrierInvoiceAmount) ?? copy.noValue}
                  </dd>
                </div>
              </dl>
            </section>
            <section className="p-4">
              <div className="flex items-center gap-2 text-muted">
                <TriangleAlert className="h-3.5 w-3.5 text-amber-600" />
                <h3 className="text-xs font-semibold uppercase tracking-wide">{dictionary.dashboard.copy.detectedExceptionsLabel}</h3>
              </div>
              <div className="mt-3 space-y-2">
                {evaluation.exceptions.length > 0 ? (
                  evaluation.exceptions.map((exception) => (
                    <div className="rounded-lg bg-amber-50 px-3 py-2" key={exception.id}>
                      <p className="text-xs font-semibold text-amber-800">{exception.summary}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted">{dictionary.dashboard.copy.noShipmentExceptions}</p>
                )}
              </div>
            </section>
          </div>
        </aside>
      </div>
    </div>
  );
}
