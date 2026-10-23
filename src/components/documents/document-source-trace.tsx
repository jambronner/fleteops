import { Mail } from "lucide-react";

import { formatRegionalDateTime } from "@/lib/dates";

export type DocumentProvenanceTrace = {
  provider: string | null;
  inboxAddress: string | null;
  senderLabel: string | null;
  senderAddress: string | null;
  subject: string | null;
  sentAt: string | null;
  receivedAt: string | null;
  originalSenderLabel: string | null;
  originalSenderAddress: string | null;
  originalSubject: string | null;
  originalSentAt: string | null;
} | null;

type DocumentSourceTraceProps = {
  locale: string;
  sourceChannel: string;
  provenance: DocumentProvenanceTrace;
};

function copyForLocale(locale: string) {
  if (locale === "en") {
    return {
      title: "Email source",
      from: "From",
      forwardedFrom: "Forwarded from",
      subject: "Subject",
      originalSubject: "Forwarded subject",
      sent: "Sent",
      received: "Received",
      inbox: "Inbox",
      provider: "Provider",
    };
  }

  return {
    title: "Origen del correo",
    from: "De",
    forwardedFrom: "Reenviado de",
    subject: "Asunto",
    originalSubject: "Asunto reenviado",
    sent: "Enviado",
    received: "Recibido",
    inbox: "Buzón",
    provider: "Proveedor",
  };
}

function formatMaybeDate(value: string | null, locale: string) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return value;
  }

  return formatRegionalDateTime(parsed, locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function SourceField({ label, value }: { label: string; value: string | null }) {
  if (!value) {
    return null;
  }

  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted/60">{label}</dt>
      <dd className="mt-0.5 break-words text-xs font-medium leading-5 text-ink">{value}</dd>
    </div>
  );
}

export function DocumentSourceTrace({ locale, sourceChannel, provenance }: DocumentSourceTraceProps) {
  if (sourceChannel !== "email" || !provenance) {
    return null;
  }

  const copy = copyForLocale(locale);

  return (
    <div className="mt-3 rounded-xl border border-line bg-card px-3 py-3">
      <div className="mb-2 flex items-center gap-2 text-accent">
        <Mail className="h-3.5 w-3.5" />
        <p className="text-xs font-semibold text-ink">{copy.title}</p>
      </div>
      <dl className="grid gap-2 sm:grid-cols-2">
        <SourceField label={copy.from} value={provenance.senderLabel} />
        <SourceField label={copy.forwardedFrom} value={provenance.originalSenderLabel} />
        <SourceField label={copy.subject} value={provenance.subject} />
        <SourceField label={copy.originalSubject} value={provenance.originalSubject} />
        <SourceField label={copy.sent} value={formatMaybeDate(provenance.sentAt, locale)} />
        <SourceField label={copy.received} value={formatMaybeDate(provenance.receivedAt, locale)} />
        <SourceField label={copy.inbox} value={provenance.inboxAddress} />
        <SourceField label={copy.provider} value={provenance.provider} />
      </dl>
    </div>
  );
}
