import { formatRegionalDateTime } from "@/lib/dates";

type TimelineEvent = {
  key: string;
  label: string;
  detail?: string | null;
  date: Date;
  tone: "done" | "planned" | "evidence" | "activity";
  withTime?: boolean;
};

type RouteTimelineProps = {
  locale: string;
  title: string;
  createdLabel: string;
  serviceLabel: string;
  expectedLabel: string;
  actualLabel: string;
  evidenceLabel: string;
  shipment: {
    createdAt: string;
    pickupDate: string | null;
    expectedDeliveryDate: string | null;
    actualDeliveryDate: string | null;
  };
  evidence: Array<{ id: string; name: string | null; linkedAt: Date | null }>;
  activity?: Array<{ id: string; label: string; detail?: string | null; date: Date }>;
};

function parseDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  // Date-only values (YYYY-MM-DD) must anchor to local midnight, not UTC,
  // or they render one day early in western timezones.
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

const toneStyles: Record<TimelineEvent["tone"], string> = {
  done: "border-emerald-300 bg-emerald-500",
  planned: "border-line bg-card",
  evidence: "border-accent/50 bg-accent",
  activity: "border-slate-300 bg-slate-400",
};

export function RouteTimeline({
  locale,
  title,
  createdLabel,
  serviceLabel,
  expectedLabel,
  actualLabel,
  evidenceLabel,
  shipment,
  evidence,
  activity = [],
}: RouteTimelineProps) {
  const now = new Date();
  const events: TimelineEvent[] = [];
  const created = parseDate(shipment.createdAt);
  const service = parseDate(shipment.pickupDate);
  const expected = parseDate(shipment.expectedDeliveryDate);
  const actual = parseDate(shipment.actualDeliveryDate);

  if (created) {
    events.push({ key: "created", label: createdLabel, date: created, tone: "done" });
  }

  if (service) {
    events.push({
      key: "service",
      label: serviceLabel,
      date: service,
      tone: service <= now ? "done" : "planned",
    });
  }

  if (expected && (!service || expected.valueOf() !== service.valueOf())) {
    events.push({
      key: "expected",
      label: expectedLabel,
      date: expected,
      tone: expected <= now ? "done" : "planned",
    });
  }

  if (actual) {
    events.push({ key: "actual", label: actualLabel, date: actual, tone: "done" });
  }

  for (const item of evidence) {
    if (item.linkedAt) {
      events.push({
        key: `evidence-${item.id}`,
        label: evidenceLabel,
        detail: item.name,
        date: item.linkedAt,
        tone: "evidence",
      });
    }
  }

  for (const item of activity) {
    events.push({
      key: `activity-${item.id}`,
      label: item.label,
      detail: item.detail,
      date: item.date,
      tone: "activity",
      withTime: true,
    });
  }

  events.sort((left, right) => left.date.valueOf() - right.date.valueOf());

  if (events.length === 0) {
    return null;
  }

  return (
    <article className="rounded-2xl border border-line bg-card p-6 shadow-sm">
      <h2 className="font-display text-sm font-semibold text-ink">{title}</h2>
      <ol className="mt-4 space-y-0">
        {events.map((event, index) => (
          <li className="relative flex gap-3 pb-5 last:pb-0" key={event.key}>
            {index < events.length - 1 ? (
              <span aria-hidden className="absolute left-[5px] top-4 h-full w-px bg-line" />
            ) : null}
            <span
              aria-hidden
              className={`relative mt-1 h-[11px] w-[11px] flex-shrink-0 rounded-full border-2 ${toneStyles[event.tone]}`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="text-sm font-medium text-ink">{event.label}</p>
                <p className="text-xs tabular-nums text-muted/70">
                  {formatRegionalDateTime(
                    event.date.toISOString(),
                    locale,
                    event.withTime
                      ? { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }
                      : { day: "numeric", month: "short", year: "numeric" },
                  )}
                </p>
              </div>
              {event.detail ? <p className="mt-0.5 truncate text-xs text-muted/70">{event.detail}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </article>
  );
}
