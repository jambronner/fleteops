import Link from "next/link";
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  FileUp,
  Mail,
  MessageCircle,
  Truck,
} from "lucide-react";
import { redirect } from "next/navigation";

import { MetricCard } from "@/components/dashboard/metric-card";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { RouteChangeDecisionCard } from "@/components/dashboard/route-change-decision-card";
import { StatusPill } from "@/components/dashboard/status-pill";
import { hasPermission } from "@/lib/auth/roles";
import { getOptionalSession } from "@/lib/auth/session";
import { canManageCounterparties } from "@/lib/partners/policy";
import { formatRegionalDateTime } from "@/lib/dates";
import { getDictionary } from "@/lib/i18n/config";
import { getOnboardingChecklist } from "@/lib/onboarding/checklist";
import { getDashboardSnapshot } from "@/lib/reconciliation/queries";
import { severityWeight, daysSince } from "@/lib/reconciliation/triage";
import type { DashboardSnapshot } from "@/lib/reconciliation/types";
import { getIntakeReviewTaskAction } from "@/lib/review-tasks/actions";
import { parseRouteChangeProposal } from "@/lib/review-tasks/route-change-proposal";
import {
  getReviewTaskSourceContext,
  type ReviewTaskSourceContext,
  type ReviewTaskSourceKind,
} from "@/lib/review-tasks/source-context";
import { getWhatsappSourceReviewSnapshot } from "@/lib/whatsapp/sources";

function truncateMiddle(value: string, maxLength = 56) {
  if (value.length <= maxLength) {
    return value;
  }

  const sliceLength = Math.floor((maxLength - 3) / 2);
  return `${value.slice(0, sliceLength)}...${value.slice(-sliceLength)}`;
}

function IntakeSourceIcon({ kind }: { kind: ReviewTaskSourceKind }) {
  if (kind === "whatsapp") {
    return <MessageCircle className="h-3 w-3" />;
  }

  if (kind === "upload" || kind === "manual" || kind === "import") {
    return <FileUp className="h-3 w-3" />;
  }

  return <Mail className="h-3 w-3" />;
}

function sourceSummary(
  source: ReviewTaskSourceContext,
  labels: { from: string; subject: string; conversation: string; event: string },
) {
  const parts = [
    source.sender ? `${labels.from}: ${source.sender}` : null,
    source.subject ? `${labels.subject}: ${source.subject}` : null,
    !source.subject && source.conversationId ? `${labels.conversation}: ${source.conversationId}` : null,
    !source.subject && !source.conversationId && source.eventId ? `${labels.event}: ${source.eventId}` : null,
  ];

  return parts.filter(Boolean).join(" · ");
}

type SnapshotShipment = DashboardSnapshot["shipments"][number];
type IntakeTask = DashboardSnapshot["intakeActionQueue"][number];
type WhatsappSource = Awaited<ReturnType<typeof getWhatsappSourceReviewSnapshot>>["sources"][number];

type QueueItem =
  | { kind: "whatsapp"; score: number; source: WhatsappSource }
  | { kind: "intake"; score: number; task: IntakeTask }
  | { kind: "route"; score: number; shipment: SnapshotShipment; missingLabels: string[]; ageDays: number };

export default async function HomePage() {
  const session = await getOptionalSession();

  if (!session) {
    redirect("/login");
  }

  const dictionary = getDictionary(session.tenant.locale);
  const tenantLocale = session.tenant.locale;
  const intakeReceivedLabel = dictionary.overview.received;
  const stuckLabel = (days: number) => dictionary.overview.daysWaiting.replace("{days}", String(days));
  const [snapshot, whatsappSources, onboarding] = await Promise.all([
    getDashboardSnapshot(session.tenant.id, tenantLocale),
    getWhatsappSourceReviewSnapshot(session.tenant.id, {
      includeHeldMessages: canManageCounterparties(session),
    }),
    getOnboardingChecklist(session.tenant.id, session.user.id),
  ]);
  const whatsappSourceCopy = dictionary.overview.whatsappSource;
  const canDecideRouteChanges = hasPermission(session.permissions, "shipment.write");

  const missingLabelsByShipment = new Map(
    snapshot.documentQueue.map((entry) => [entry.shipmentId, entry.missingLabels]),
  );

  const unclaimedWhatsappSources = whatsappSources.sources.filter((source) => source.status === "unclaimed");

  // One decision queue: everything blocked, inbound, or incomplete, ranked by
  // severity plus how long it has been waiting.
  const queueItems: QueueItem[] = [
    ...unclaimedWhatsappSources.map((source): QueueItem => ({
      kind: "whatsapp",
      score: severityWeight.inbound + daysSince(source.lastSeenAt),
      source,
    })),
    ...snapshot.intakeActionQueue.map((task): QueueItem => {
      const proposal = parseRouteChangeProposal(task.metadata);

      return {
        kind: "intake",
        // Explicit human decisions outrank passive intake notices so a user
        // never has to hunt for an AI-proposed route change.
        score: (proposal ? severityWeight.blocked : severityWeight.inbound) + daysSince(task.createdAt),
        task,
      };
    }),
    ...snapshot.shipments
      .filter((shipment) =>
        ["blocked", "needsReview", "pendingDocs"].includes(shipment.evaluation.controlTowerStatus),
      )
      .map((shipment): QueueItem => {
        const status = shipment.evaluation.controlTowerStatus as "blocked" | "needsReview" | "pendingDocs";
        const ageDays = daysSince(shipment.packet.expectedDeliveryDate);

        return {
          kind: "route",
          score: severityWeight[status] + ageDays,
          shipment,
          missingLabels: missingLabelsByShipment.get(shipment.packet.id) ?? [],
          ageDays,
        };
      }),
  ].sort((left, right) => right.score - left.score);

  const recentShipments = [...snapshot.shipments].sort((a, b) => {
    const aTime = new Date(a.packet.actualDeliveryDate ?? a.packet.expectedDeliveryDate).valueOf();
    const bTime = new Date(b.packet.actualDeliveryDate ?? b.packet.expectedDeliveryDate).valueOf();

    return bTime - aTime;
  });
  const readyShipments = recentShipments.filter((shipment) => shipment.evaluation.controlTowerStatus === "ready");
  const isEmptyWorkspace = snapshot.shipments.length === 0;
  const firstRun = {
    line: dictionary.overview.firstRun.line,
    actions: [
      { href: "/routes" as const, label: dictionary.overview.firstRun.createRoute, icon: "truck" as const },
      { href: "/routes" as const, label: dictionary.overview.firstRun.uploadList, icon: "file" as const },
      { href: "/settings" as const, label: dictionary.overview.firstRun.connectChannels, icon: "chat" as const },
    ],
  };

  function formatDate(value?: string, includeTime = true) {
    if (!value) {
      return dictionary.dashboard.copy.pendingLabel;
    }

    return formatRegionalDateTime(value, tenantLocale, includeTime
      ? {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }
      : {
          month: "short",
          day: "numeric",
        });
  }

  return (
    // On mobile: scrollable column. On xl+: viewport-fit with internal panel scrolling.
    <div className="flex flex-col gap-4 overflow-y-auto xl:h-full xl:min-h-0 xl:overflow-hidden">

      <header className="flex-shrink-0">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted/50">
          {session.tenant.name}
        </p>
        <h1 className="mt-0.5 font-display text-2xl font-bold tracking-tight text-ink">
          {dictionary.overview.title}
        </h1>
      </header>

      {onboarding ? (
        <OnboardingChecklist
          completed={onboarding.completed}
          locale={tenantLocale}
          steps={onboarding.steps}
          total={onboarding.total}
        />
      ) : null}

      {/* Metric strip */}
      <div className="grid flex-shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard
          href="/routes"
          label={dictionary.dashboard.metrics.activeShipments}
          value={String(snapshot.metrics.activeShipments)}
          variant="default"
        />
        <MetricCard
          href="/routes"
          label={dictionary.dashboard.metrics.reviewQueue}
          value={String(snapshot.metrics.reviewQueue)}
          variant="warning"
        />
        <MetricCard
          href="/evidence"
          label={dictionary.dashboard.metrics.documentsMissing}
          value={String(snapshot.metrics.documentsMissing)}
          variant="accent"
        />
        <MetricCard
          href="/routes"
          label={dictionary.dashboard.metrics.readyToInvoice}
          value={String(snapshot.metrics.readyToInvoice)}
          variant="success"
        />
      </div>

      {/* Main work area: single ranked decision queue + supporting column */}
      <div className="grid gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[1.6fr_1fr] xl:overflow-hidden">

        <article className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-sm">
          <div className="flex flex-shrink-0 items-center justify-between border-b border-line-2 px-5 py-3.5">
            <h2 className="font-display text-base font-semibold text-ink">
              {dictionary.overview.urgentTitle}
            </h2>
            {queueItems.length > 0 && (
              <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600">
                {queueItems.length}
              </span>
            )}
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {queueItems.length > 0 ? (
              queueItems.slice(0, 12).map((item) => {
                if (item.kind === "whatsapp") {
                  const heldPreview = item.source.heldMessages[0] ?? null;
                  const heldBody = heldPreview
                    ? heldPreview.textBody ??
                      heldPreview.mediaCaption ??
                      (heldPreview.mediaKind
                        ? `${whatsappSourceCopy.attachment} · ${heldPreview.mediaKind}`
                        : whatsappSourceCopy.attachment)
                    : null;
                  const heldCountLabel =
                    item.source.heldMessageCount > 0
                      ? item.source.heldMessageCount === 1
                        ? whatsappSourceCopy.heldCountOne
                        : whatsappSourceCopy.heldCount.replace(
                            "{count}",
                            String(item.source.heldMessageCount),
                          )
                      : null;

                  return (
                    <Link
                      key={`whatsapp-${item.source.id}`}
                      href="/partners#whatsapp-source-review"
                      className="group flex gap-3 rounded-xl border border-l-[3px] border-line border-l-sky-400 bg-sky-50/40 px-4 py-3 transition-all hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-sm"
                    >
                      <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                        <MessageCircle className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-ink">{whatsappSourceCopy.title}</p>
                          <StatusPill label={dictionary.statuses.needsReview} tone="needsReview" />
                          {heldCountLabel ? (
                            <span className="rounded-full bg-card/80 px-2 py-0.5 text-[11px] font-semibold text-sky-800 ring-1 ring-sky-100">
                              {heldCountLabel}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted/75">
                          {item.source.displayName ?? item.source.externalConversationId}
                        </p>
                        {heldBody ? (
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-ink/80">
                            “{heldBody}”
                          </p>
                        ) : null}
                        <p className="mt-2 text-[11px] font-medium text-accent">
                          {whatsappSourceCopy.cta}
                        </p>
                      </div>
                      <ArrowUpRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted/30 transition group-hover:text-accent" />
                    </Link>
                  );
                }

                if (item.kind === "intake") {
                  const routeChangeProposal = parseRouteChangeProposal(item.task.metadata);

                  if (routeChangeProposal) {
                    return (
                      <RouteChangeDecisionCard
                        canManage={canDecideRouteChanges}
                        key={`intake-${item.task.id}`}
                        locale={tenantLocale}
                        task={item.task}
                      />
                    );
                  }

                  const action = getIntakeReviewTaskAction(item.task);
                  const source = getReviewTaskSourceContext(item.task.metadata, tenantLocale);
                  const sourceDetail = sourceSummary(source, dictionary.overview.sourceLabels);

                  return (
                    <Link
                      key={`intake-${item.task.id}`}
                      href={action.href}
                      className="group flex gap-3 rounded-xl border border-l-[3px] border-line border-l-amber-400 bg-amber-50/40 px-4 py-3 transition-all hover:-translate-y-0.5 hover:border-amber-200 hover:shadow-sm"
                    >
                      <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                        <IntakeSourceIcon kind={source.kind} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-ink">{item.task.title}</p>
                          <StatusPill label={dictionary.statuses.needsReview} tone="needsReview" />
                          <span className="inline-flex items-center gap-1 rounded-full bg-card/80 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-100">
                            <IntakeSourceIcon kind={source.kind} />
                            {source.label}
                          </span>
                        </div>
                        {item.task.details && (
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted/75">
                            {item.task.details}
                          </p>
                        )}
                        {sourceDetail ? (
                          <p className="mt-1 line-clamp-1 text-[11px] leading-5 text-muted/65">
                            {truncateMiddle(sourceDetail)}
                          </p>
                        ) : null}
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-medium">
                          <span className="text-muted/55">
                            {intakeReceivedLabel} {formatDate(item.task.createdAt)}
                          </span>
                          <span className="text-accent">{action.label}</span>
                        </div>
                      </div>
                      <ArrowUpRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted/30 transition group-hover:text-accent" />
                    </Link>
                  );
                }

                const { shipment, missingLabels, ageDays } = item;
                const status = shipment.evaluation.controlTowerStatus;
                const isBlocked = status === "blocked";
                const isPendingDocs = status === "pendingDocs";

                return (
                  <Link
                    key={`route-${shipment.packet.id}`}
                    href={`/routes/${shipment.packet.id}`}
                    // Left border accent gives instant severity at-a-glance
                    className={`group flex gap-3 rounded-xl border bg-card px-4 py-3 transition-all hover:-translate-y-0.5 hover:shadow-sm ${
                      isBlocked
                        ? "border-l-[3px] border-l-rose-400 border-line hover:border-rose-200"
                        : isPendingDocs
                          ? "border-l-[3px] border-l-orange-300 border-line hover:border-orange-200"
                          : "border-l-[3px] border-l-amber-400 border-line hover:border-amber-200"
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
                        isBlocked ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600"
                      }`}
                    >
                      <AlertCircle className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-ink">
                          {shipment.packet.shipmentReference}
                        </p>
                        <StatusPill label={dictionary.statuses[status]} tone={status} />
                        {ageDays > 0 ? (
                          <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted/70">
                            {stuckLabel(ageDays)}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-sm text-muted">{shipment.packet.customerName}</p>
                      {missingLabels.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {missingLabels.map((label) => (
                            <span
                              key={`${shipment.packet.id}-${label}`}
                              className="rounded-full border border-amber-100 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700"
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                      ) : shipment.evaluation.summary.nextAction ? (
                        <p className="mt-2 text-xs leading-5 text-muted/70">
                          {shipment.evaluation.summary.nextAction}
                        </p>
                      ) : null}
                    </div>
                    <ArrowUpRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted/30 transition group-hover:text-accent" />
                  </Link>
                );
              })
            ) : isEmptyWorkspace ? (
              <div className="space-y-2">
                <p className="px-1 text-sm text-muted">{firstRun.line}</p>
                {firstRun.actions.map((action) => (
                  <Link
                    key={action.label}
                    href={action.href}
                    className="group flex items-center gap-3 rounded-xl border border-line bg-card px-4 py-3 transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-sm"
                  >
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-surface text-accent">
                      {action.icon === "truck" ? (
                        <Truck className="h-3.5 w-3.5" />
                      ) : action.icon === "file" ? (
                        <FileUp className="h-3.5 w-3.5" />
                      ) : (
                        <MessageCircle className="h-3.5 w-3.5" />
                      )}
                    </span>
                    <span className="flex-1 text-sm font-semibold text-ink">{action.label}</span>
                    <ArrowUpRight className="h-4 w-4 flex-shrink-0 text-muted/30 transition group-hover:text-accent" />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="rounded-xl bg-surface px-4 py-3 text-sm text-muted">
                {dictionary.overview.urgentEmpty}
              </p>
            )}
          </div>
        </article>

        {/* Supporting column: what's done + what moved */}
        <div className="grid gap-4 xl:min-h-0 xl:grid-rows-[1fr_1fr] xl:overflow-hidden">

          <article className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-sm">
            <div className="flex flex-shrink-0 items-center justify-between border-b border-line-2 px-5 py-3.5">
              <h2 className="font-display text-base font-semibold text-ink">
                {dictionary.overview.readyTitle}
              </h2>
              {readyShipments.length > 0 && (
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  {readyShipments.length}
                </span>
              )}
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              {readyShipments.length > 0 ? (
                readyShipments.slice(0, 6).map((shipment) => (
                  <Link
                    key={shipment.packet.id}
                    href={`/routes/${shipment.packet.id}`}
                    className="group flex items-center gap-3 rounded-xl border border-line bg-card px-4 py-3 transition-all hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-emerald-50/30"
                  >
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-sm font-semibold text-ink">{shipment.packet.shipmentReference}</p>
                        <StatusPill
                          label={dictionary.statuses[shipment.evaluation.controlTowerStatus]}
                          tone={shipment.evaluation.controlTowerStatus}
                        />
                      </div>
                      <p className="truncate text-xs text-muted/65">
                        {shipment.packet.customerName}
                        {shipment.packet.routeLabel ? ` · ${shipment.packet.routeLabel}` : ""}
                      </p>
                    </div>
                    <ArrowUpRight className="h-4 w-4 flex-shrink-0 text-muted/30 transition group-hover:text-accent" />
                  </Link>
                ))
              ) : (
                <p className="rounded-xl bg-surface px-4 py-3 text-sm text-muted">
                  {dictionary.overview.readyEmpty}
                </p>
              )}
            </div>
          </article>

          <article className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-sm">
            <div className="flex flex-shrink-0 items-center justify-between border-b border-line-2 px-5 py-3.5">
              <h2 className="font-display text-base font-semibold text-ink">
                {dictionary.overview.activityTitle}
              </h2>
              <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-muted">
                {recentShipments.length}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {recentShipments.length > 0 ? (
                recentShipments.slice(0, 8).map((shipment) => {
                  const isReady = shipment.evaluation.controlTowerStatus === "ready";
                  return (
                    <Link
                      key={shipment.packet.id}
                      href={`/routes/${shipment.packet.id}`}
                      className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all hover:bg-tint"
                    >
                      <span
                        className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ${
                          isReady ? "bg-emerald-50 text-emerald-700" : "bg-surface text-accent"
                        }`}
                      >
                        {isReady ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <Truck className="h-3.5 w-3.5" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-sm font-semibold text-ink">
                            {shipment.packet.shipmentReference}
                          </p>
                          <StatusPill
                            label={dictionary.statuses[shipment.evaluation.controlTowerStatus]}
                            tone={shipment.evaluation.controlTowerStatus}
                          />
                        </div>
                        <p className="truncate text-[11px] text-muted/65">
                          {shipment.packet.customerName}
                          {shipment.packet.routeLabel ? ` · ${shipment.packet.routeLabel}` : ""}
                        </p>
                      </div>
                      <p className="shrink-0 text-right text-xs font-medium text-muted/50">
                        {formatDate(
                          shipment.packet.actualDeliveryDate ?? shipment.packet.expectedDeliveryDate,
                          false,
                        )}
                      </p>
                    </Link>
                  );
                })
              ) : (
                <p className="rounded-xl bg-surface px-4 py-3 text-sm text-muted">
                  {dictionary.overview.activityEmpty}
                </p>
              )}
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}
