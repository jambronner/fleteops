export type IntakeReviewTaskActionKind = "route_update" | "intake_review";

export type IntakeReviewTaskAction = {
  href: string;
  label: string;
  kind: IntakeReviewTaskActionKind;
};

type IntakeReviewTaskInput = {
  id: string;
  subjectId: string;
  metadata: Record<string, unknown> | null;
};

function readRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readRouteResolutionShipmentId(metadata: Record<string, unknown> | null) {
  const routeResolution = readRecord(metadata?.routeResolution);
  const actionResult = readRecord(metadata?.actionResult);
  const nestedRouteResolution = readRecord(actionResult?.routeResolution);

  return readString(routeResolution?.shipmentId) ?? readString(nestedRouteResolution?.shipmentId);
}

export function getIntakeReviewTaskAnchor(taskId: string) {
  return `review-task-${taskId}`;
}

export function getIntakeReviewTaskAction(task: IntakeReviewTaskInput): IntakeReviewTaskAction {
  const action = readString(task.metadata?.action);

  if (action === "update_route") {
    const shipmentId = readRouteResolutionShipmentId(task.metadata);

    if (shipmentId) {
      return {
        href: `/routes/${shipmentId}`,
        label: "Open route",
        kind: "route_update",
      };
    }

    return {
      href: `/evidence#${getIntakeReviewTaskAnchor(task.id)}`,
      label: "Review route update",
      kind: "route_update",
    };
  }

  return {
    href: `/evidence#${getIntakeReviewTaskAnchor(task.id)}`,
    label: "Review intake item",
    kind: "intake_review",
  };
}
