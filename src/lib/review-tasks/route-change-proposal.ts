import { z } from "zod";

const dateValueSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();

export const routeDateValuesSchema = z.object({
  pickupDate: dateValueSchema,
  deliveryDateExpected: dateValueSchema,
  deliveryDateActual: dateValueSchema,
});

export type RouteDateValues = z.infer<typeof routeDateValuesSchema>;

const routeChangeProposalSchema = z.object({
  proposalVersion: z.literal(1),
  requiresHumanApproval: z.literal(true),
  action: z.literal("update_route"),
  routeResolution: z.object({
    shipmentId: z.string().uuid(),
    reason: z.string().min(1),
  }),
  routeReference: z.string().min(1),
  routeStatus: z.string().min(1),
  currentValues: routeDateValuesSchema,
  proposedUpdates: routeDateValuesSchema.refine(
    (values) => Object.values(values).some((value) => value !== null),
    "At least one route date change is required.",
  ),
  confidence: z.number().min(0).max(1),
  classification: z.record(z.string(), z.unknown()).optional(),
  source: z.record(z.string(), z.unknown()).optional(),
});

export type RouteChangeProposal = z.infer<typeof routeChangeProposalSchema>;

export type RouteChangeDecision = "approve" | "reject";

export function shouldRequireHumanRouteChangeApproval(status: string) {
  return status !== "draft";
}

export function parseRouteChangeProposal(metadata: unknown): RouteChangeProposal | null {
  const result = routeChangeProposalSchema.safeParse(metadata);
  return result.success ? result.data : null;
}

export function routeDateValuesMatch(left: RouteDateValues, right: RouteDateValues) {
  return (
    left.pickupDate === right.pickupDate &&
    left.deliveryDateExpected === right.deliveryDateExpected &&
    left.deliveryDateActual === right.deliveryDateActual
  );
}

export function hasProposedRouteDateChanges(
  currentValues: RouteDateValues,
  proposedUpdates: RouteDateValues,
) {
  return (Object.keys(proposedUpdates) as Array<keyof RouteDateValues>).some((field) => {
    const proposed = proposedUpdates[field];
    return proposed !== null && proposed !== currentValues[field];
  });
}

export function changedRouteDateFields(proposal: RouteChangeProposal) {
  return (Object.keys(proposal.proposedUpdates) as Array<keyof RouteDateValues>)
    .filter((field) => {
      const proposed = proposal.proposedUpdates[field];
      return proposed !== null && proposed !== proposal.currentValues[field];
    })
    .map((field) => ({
      field,
      current: proposal.currentValues[field],
      proposed: proposal.proposedUpdates[field],
    }));
}
