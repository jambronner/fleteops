// Severity × days-waiting ranking shared by the dashboard decision queue and
// the notification digest, so both surfaces order pending work identically.
export const severityWeight = {
  blocked: 4000,
  inbound: 3000,
  needsReview: 2000,
  pendingDocs: 1000,
} as const;

export type TriageSeverity = keyof typeof severityWeight;

export function daysSince(value: string | undefined | null, now = Date.now()) {
  if (!value) {
    return 0;
  }

  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);

  if (Number.isNaN(parsed.valueOf())) {
    return 0;
  }

  return Math.max(0, Math.floor((now - parsed.valueOf()) / 86_400_000));
}

export function triageScore(
  severity: TriageSeverity,
  waitingSince: string | undefined | null,
  now = Date.now(),
) {
  return severityWeight[severity] + daysSince(waitingSince, now);
}
