import { daysSince, triageScore } from "@/lib/reconciliation/triage";
import { getIntakeReviewTaskAction } from "@/lib/review-tasks/actions";

export const DIGEST_PENDING_LIMIT = 5;

export type DigestRouteStatus = "blocked" | "needsReview" | "pendingDocs";

export type DigestRouteInput = {
  id: string;
  reference: string;
  customerName: string;
  status: DigestRouteStatus;
  expectedDeliveryDate?: string | null;
  missingLabels?: string[];
};

export type DigestIntakeInput = {
  id: string;
  title: string;
  createdAt: string;
  subjectId: string;
  metadata: Record<string, unknown> | null;
};

export type DigestWhatsappInput = {
  id: string;
  label: string;
  lastSeenAt: string | null;
};

export type DigestItem =
  | {
      kind: "route";
      score: number;
      href: string;
      reference: string;
      customerName: string;
      status: DigestRouteStatus;
      daysWaiting: number;
      missingLabels: string[];
    }
  | { kind: "intake"; score: number; href: string; title: string; receivedAt: string }
  | { kind: "whatsapp"; score: number; href: string; label: string; daysWaiting: number };

export type DigestContent = {
  counts: {
    routesAwaitingDecision: number;
    evidenceToLink: number;
    newWhatsappSources: number;
  };
  items: DigestItem[];
  totalPending: number;
  resolvedCount: number;
};

export type TenantDigestInputs = {
  routes: DigestRouteInput[];
  intakeTasks: DigestIntakeInput[];
  whatsappSources: DigestWhatsappInput[];
};

/** Send rule: nothing pending and nothing changed → no email. */
export function hasDigestContent(content: DigestContent) {
  return content.totalPending > 0 || content.resolvedCount > 0;
}

export function assembleDigestContent(
  inputs: TenantDigestInputs & { resolvedCount: number; now?: number },
): DigestContent {
  const now = inputs.now ?? Date.now();

  const items: DigestItem[] = [
    ...inputs.whatsappSources.map((source): DigestItem => ({
      kind: "whatsapp",
      score: triageScore("inbound", source.lastSeenAt, now),
      href: "/partners#whatsapp-source-review",
      label: source.label,
      daysWaiting: daysSince(source.lastSeenAt, now),
    })),
    ...inputs.intakeTasks.map((task): DigestItem => ({
      kind: "intake",
      score: triageScore("inbound", task.createdAt, now),
      href: getIntakeReviewTaskAction(task).href,
      title: task.title,
      receivedAt: task.createdAt,
    })),
    ...inputs.routes.map((route): DigestItem => ({
      kind: "route",
      score: triageScore(route.status, route.expectedDeliveryDate, now),
      href: `/routes/${route.id}`,
      reference: route.reference,
      customerName: route.customerName,
      status: route.status,
      daysWaiting: daysSince(route.expectedDeliveryDate, now),
      missingLabels: route.missingLabels ?? [],
    })),
  ].sort((left, right) => right.score - left.score);

  return {
    counts: {
      routesAwaitingDecision: inputs.routes.filter((route) => route.status !== "pendingDocs").length,
      evidenceToLink: inputs.intakeTasks.length,
      newWhatsappSources: inputs.whatsappSources.length,
    },
    items: items.slice(0, DIGEST_PENDING_LIMIT),
    totalPending: items.length,
    resolvedCount: inputs.resolvedCount,
  };
}
