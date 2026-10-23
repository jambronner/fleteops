"use client";

import {
  Ban,
  CheckCircle2,
  Link2,
  MessageCircle,
  ShieldCheck,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { useToast } from "@/components/ui/toast-provider";
import { formatRegionalDateTime } from "@/lib/dates";
import { getWhatsappParticipantDisplayName } from "@/lib/partners/display";
import type { PartnerContactRecord, PartnerOrganizationRecord } from "@/lib/partners/repository";
import type {
  WhatsappHeldMessagePreview,
  WhatsappSourceRecord,
  WhatsappSourceReviewSnapshot,
} from "@/lib/whatsapp/sources";
import { enumLabel } from "@/lib/i18n/enum-labels";

type WhatsappSourceReviewPanelProps = {
  locale: string;
  canManage: boolean;
  snapshot: WhatsappSourceReviewSnapshot;
  contacts: PartnerContactRecord[];
  organizations: PartnerOrganizationRecord[];
};

const roleValues = [
  "driver",
  "carrier_ops",
  "shipper_ops",
  "customer_contact",
  "retailer_contact",
  "other",
];

function copyForLocale(locale: string) {
  if (locale === "en") {
    return {
      emptyTitle: "No WhatsApp sources need review",
      emptyBody: "Trusted, ignored, and blocked sources are listed in the WhatsApp tab.",
      sourceStatus: {
        active: "Trusted",
        unclaimed: "Needs review",
        ignored: "Ignored",
        blocked: "Blocked",
      },
      metrics: {
        sources: "Sources",
        groups: "Groups",
        participants: "Participants",
        mapped: "Mapped",
      },
      claim: "Trust source",
      ignore: "Ignore",
      block: "Block",
      direct: "Direct chat",
      group: "Group",
      participants: "Participants",
      noParticipants: "No participants have been reported for this source yet.",
      mapped: "Mapped",
      unmatched: "Unmatched",
      admin: "Admin",
      superAdmin: "Owner",
      linkExisting: "Link",
      linkAndTrust: "Link & trust",
      createContact: "Create",
      createAndTrust: "Create & trust",
      contactPlaceholder: "Select contact",
      namePlaceholder: "Name",
      organizationPlaceholder: "Organization",
      rolePlaceholder: "Role",
      sourceUpdated: "WhatsApp source updated.",
      linked: "Phone linked to contact.",
      linkedAndTrusted: "Phone linked and source trusted.",
      created: "Contact created from WhatsApp participant.",
      createdAndTrusted: "Contact created and source trusted.",
      readOnly: "Only admins and operators can approve sources or map participants.",
      unknownName: "Unknown participant",
      heldCount: "{count} messages held",
      heldCountOne: "1 message held",
      showMessages: "Show messages",
      hideMessages: "Hide messages",
      attachment: "Attachment",
    };
  }

  return {
    emptyTitle: "No hay fuentes de WhatsApp por revisar",
    emptyBody: "Las fuentes confiables, ignoradas y bloqueadas aparecen en la pestaña de WhatsApp.",
    sourceStatus: {
      active: "Confiable",
      unclaimed: "Requiere revisión",
      ignored: "Ignorada",
      blocked: "Bloqueada",
    },
    metrics: {
      sources: "Fuentes",
      groups: "Grupos",
      participants: "Participantes",
      mapped: "Mapeados",
    },
    claim: "Confiar fuente",
    ignore: "Ignorar",
    block: "Bloquear",
    direct: "Chat directo",
    group: "Grupo",
    participants: "Participantes",
    noParticipants: "Todavía no se han reportado participantes para esta fuente.",
    mapped: "Mapeado",
    unmatched: "Sin mapear",
    admin: "Admin",
    superAdmin: "Owner",
    linkExisting: "Ligar",
    linkAndTrust: "Ligar y confiar",
    createContact: "Crear",
    createAndTrust: "Crear y confiar",
    contactPlaceholder: "Seleccionar contacto",
    namePlaceholder: "Nombre",
    organizationPlaceholder: "Organización",
    rolePlaceholder: "Rol",
    sourceUpdated: "Fuente de WhatsApp actualizada.",
    linked: "Teléfono ligado al contacto.",
    linkedAndTrusted: "Teléfono ligado y fuente confiable.",
    created: "Contacto creado desde participante de WhatsApp.",
    createdAndTrusted: "Contacto creado y fuente confiable.",
    readOnly: "Solo admins y operadores pueden aprobar fuentes o mapear participantes.",
    unknownName: "Participante desconocido",
    heldCount: "{count} mensajes retenidos",
    heldCountOne: "1 mensaje retenido",
    showMessages: "Ver mensajes",
    hideMessages: "Ocultar mensajes",
    attachment: "Adjunto",
  };
}

function statusClasses(status: WhatsappSourceRecord["status"]) {
  switch (status) {
    case "active":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "blocked":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "ignored":
      return "border-slate-200 bg-slate-100 text-slate-600";
    default:
      return "border-amber-200 bg-amber-50 text-amber-700";
  }
}

function contactLabel(locale: string, contact: PartnerContactRecord, fallback: string) {
  return [
    contact.fullName || contact.displayName || fallback,
    contact.organizationName,
    enumLabel(locale, contact.role),
  ]
    .filter(Boolean)
    .join(" - ");
}

function heldMessageBody(copy: ReturnType<typeof copyForLocale>, message: WhatsappHeldMessagePreview) {
  if (message.textBody) {
    return message.textBody;
  }

  if (message.mediaCaption) {
    return message.mediaCaption;
  }

  return message.mediaKind ? `${copy.attachment} · ${message.mediaKind}` : copy.attachment;
}

function heldMessageSender(message: WhatsappHeldMessagePreview) {
  return message.senderName ?? message.senderKey?.split("@")[0] ?? null;
}

async function readError(response: Response, fallback: string) {
  try {
    const payload = await response.json();
    return String(payload.error ?? fallback);
  } catch {
    return fallback;
  }
}

export function WhatsappSourceReviewPanel({
  locale,
  canManage,
  snapshot,
  contacts,
  organizations,
}: WhatsappSourceReviewPanelProps) {
  const copy = copyForLocale(locale);
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [openMessageSources, setOpenMessageSources] = useState<Record<string, boolean>>({});
  const activeContacts = useMemo(() => contacts.filter((contact) => contact.active), [contacts]);

  async function updateSourceStatus(sourceId: string, status: WhatsappSourceRecord["status"]) {
    setBusyKey(`${sourceId}:${status}`);

    try {
      const response = await fetch(`/api/whatsapp/sources/${sourceId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        throw new Error(await readError(response, "Unable to update WhatsApp source."));
      }

      showToast({ title: copy.sourceUpdated, variant: "success" });
      startTransition(() => router.refresh());
    } catch (error) {
      showToast({
        title: error instanceof Error ? error.message : "Unable to update WhatsApp source.",
        variant: "error",
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function linkParticipant(
    formData: FormData,
    source: WhatsappSourceRecord,
    participantKey: string,
    phoneNumber: string,
  ) {
    const contactId = String(formData.get("contactId") ?? "");

    if (!contactId) {
      return;
    }

    const shouldTrustSource = source.status === "unclaimed";
    setBusyKey(`${source.id}:${participantKey}:link`);

    try {
      const response = await fetch("/api/partners/contacts/phones", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          externalParticipantId: contactId,
          phoneNumber,
          channel: "whatsapp",
          label: "WhatsApp",
          active: true,
          trustWhatsappSourceId: shouldTrustSource ? source.id : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(await readError(response, "Unable to link phone."));
      }

      showToast({ title: shouldTrustSource ? copy.linkedAndTrusted : copy.linked, variant: "success" });
      startTransition(() => router.refresh());
    } catch (error) {
      showToast({
        title: error instanceof Error ? error.message : "Unable to link phone.",
        variant: "error",
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function createParticipantContact(
    formData: FormData,
    source: WhatsappSourceRecord,
    participantKey: string,
    phoneNumber: string,
  ) {
    const fullName = String(formData.get("fullName") ?? "").trim();
    const organizationId = String(formData.get("organizationId") ?? "").trim();
    const role = String(formData.get("role") ?? "other");

    const shouldTrustSource = source.status === "unclaimed";
    setBusyKey(`${source.id}:${participantKey}:create`);

    try {
      const response = await fetch("/api/partners/contacts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fullName,
          organizationId: organizationId || undefined,
          role,
          language: locale,
          active: true,
          primaryPhoneNumber: phoneNumber,
          trustWhatsappSourceId: shouldTrustSource ? source.id : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(await readError(response, "Unable to create contact."));
      }

      showToast({ title: shouldTrustSource ? copy.createdAndTrusted : copy.created, variant: "success" });
      startTransition(() => router.refresh());
    } catch (error) {
      showToast({
        title: error instanceof Error ? error.message : "Unable to create contact.",
        variant: "error",
      });
    } finally {
      setBusyKey(null);
    }
  }

  const metricItems = [
    { label: copy.metrics.sources, value: snapshot.reviewMetrics.totalSources },
    { label: copy.metrics.groups, value: snapshot.reviewMetrics.groupSources },
    { label: copy.metrics.participants, value: snapshot.reviewMetrics.observedParticipants },
    { label: copy.metrics.mapped, value: snapshot.reviewMetrics.mappedParticipants },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {metricItems.map((item) => (
          <div key={item.label} className="rounded-xl border border-line bg-tint px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted/55">
              {item.label}
            </p>
            <p className="mt-1 text-xl font-bold text-ink">{item.value}</p>
          </div>
        ))}
      </div>

      {!canManage ? (
        <p className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {copy.readOnly}
        </p>
      ) : null}

      {snapshot.sources.length === 0 ? (
        <div className="rounded-xl border border-dashed border-blue-200 bg-tint px-5 py-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-card text-accent shadow-sm">
              <MessageCircle className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-ink">{copy.emptyTitle}</h3>
              <p className="mt-1 text-sm leading-6 text-muted/75">{copy.emptyBody}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {snapshot.sources.map((source) => {
            const SourceIcon = source.isGroup ? UsersRound : MessageCircle;
            const canTrustSource = source.status === "unclaimed";
            const canDismissSource = source.status === "unclaimed";

            return (
              <section
                key={source.id}
                className="overflow-hidden rounded-xl border border-line bg-card shadow-sm"
              >
                <div className="flex flex-col gap-3 border-b border-line-2 bg-tint px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-card text-accent shadow-sm">
                        <SourceIcon className="h-4 w-4" />
                      </span>
                      <h3 className="min-w-0 truncate text-sm font-semibold text-ink">
                        {source.displayName ?? source.externalConversationId}
                      </h3>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusClasses(source.status)}`}>
                        {copy.sourceStatus[source.status]}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted/60">
                      {source.isGroup ? copy.group : copy.direct} · {source.externalConversationId}
                    </p>
                    {source.heldMessages.length > 0 ? (
                      <div className="mt-2 rounded-lg border border-line-2 bg-card px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted/55">
                            {source.heldMessageCount === 1
                              ? copy.heldCountOne
                              : copy.heldCount.replace("{count}", String(source.heldMessageCount))}
                          </p>
                          {source.heldMessages.length > 1 ? (
                            <button
                              className="text-[11px] font-semibold text-accent transition hover:text-accent-strong"
                              onClick={() =>
                                setOpenMessageSources((open) => ({ ...open, [source.id]: !open[source.id] }))
                              }
                              type="button"
                            >
                              {openMessageSources[source.id] ? copy.hideMessages : copy.showMessages}
                            </button>
                          ) : null}
                        </div>
                        <ul className="mt-1.5 space-y-2">
                          {(openMessageSources[source.id]
                            ? source.heldMessages
                            : source.heldMessages.slice(0, 1)
                          ).map((message) => (
                            <li key={message.id}>
                              <p className="text-sm leading-5 text-ink [overflow-wrap:anywhere]">
                                {heldMessageBody(copy, message)}
                              </p>
                              <p className="mt-0.5 text-[11px] text-muted/60">
                                {[
                                  heldMessageSender(message),
                                  formatRegionalDateTime(message.receivedAt, locale, {
                                    month: "short",
                                    day: "numeric",
                                    hour: "numeric",
                                    minute: "2-digit",
                                  }),
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>

                  {canManage && (canTrustSource || canDismissSource) ? (
                    <div className="flex flex-wrap gap-2">
                      {canTrustSource ? (
                        <button
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={isPending || busyKey === `${source.id}:active`}
                          onClick={() => updateSourceStatus(source.id, "active")}
                          type="button"
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                          {copy.claim}
                        </button>
                      ) : null}
                      {canDismissSource ? (
                        <>
                          <button
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-card px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={isPending || busyKey === `${source.id}:ignored`}
                            onClick={() => updateSourceStatus(source.id, "ignored")}
                            type="button"
                          >
                            {copy.ignore}
                          </button>
                          <button
                            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-card px-3 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={isPending || busyKey === `${source.id}:blocked`}
                            onClick={() => updateSourceStatus(source.id, "blocked")}
                            type="button"
                          >
                            <Ban className="h-3.5 w-3.5" />
                            {copy.block}
                          </button>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="space-y-2 p-3">
                  <div className="flex items-center justify-between gap-3 px-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted/55">
                      {copy.participants}
                    </p>
                    <p className="text-xs font-medium text-muted/55">
                      {source.mappedParticipantCount}/{source.participantCount}
                    </p>
                  </div>

                  {source.participants.length === 0 ? (
                    <p className="rounded-lg bg-tint px-4 py-3 text-sm text-muted/70">
                      {copy.noParticipants}
                    </p>
                  ) : (
                    source.participants.map((participant) => {
                      const phoneNumber = participant.phoneNumber ?? participant.participantKey;
                      const participantBusyPrefix = `${source.id}:${participant.participantKey}`;
                      const participantDisplayName = getWhatsappParticipantDisplayName({
                        unknownLabel: copy.unknownName,
                        participant,
                      });

                      return (
                        <div
                          key={participant.participantKey}
                          className="grid gap-3 rounded-lg border border-line-2 bg-card px-3 py-3 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.45fr)] md:items-start"
                        >
                          <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-2">
                              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                                {participantDisplayName}
                              </p>
                              {participant.isSuperAdmin ? (
                                <span className="flex-shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                  {copy.superAdmin}
                                </span>
                              ) : participant.isAdmin ? (
                                <span className="flex-shrink-0 rounded-full bg-surface px-2 py-0.5 text-[10px] font-semibold text-accent">
                                  {copy.admin}
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 truncate font-mono text-xs text-muted/65">{phoneNumber}</p>
                          </div>

                          <div className={canManage && !participant.contact ? "md:col-start-1 md:row-start-2" : "md:col-span-2"}>
                            {participant.contact ? (
                              <div className="rounded-lg border border-emerald-100 bg-tint px-3 py-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    {copy.mapped}
                                  </div>
                                  <p className="truncate text-xs text-emerald-800/70">
                                    {enumLabel(locale, participant.contact.role)}
                                  </p>
                                </div>
                                <p className="mt-1 text-sm font-semibold text-emerald-950">
                                  {participant.contact.label}
                                </p>
                                {participant.contact.organizationName ? (
                                  <p className="mt-0.5 truncate text-xs text-emerald-800/70">
                                    {participant.contact.organizationName}
                                  </p>
                                ) : null}
                              </div>
                            ) : (
                              <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                                {copy.unmatched}
                              </div>
                            )}
                          </div>

                          {canManage && !participant.contact ? (
                            <div className="space-y-2 md:col-start-2 md:row-span-2 md:row-start-1">
                              <form
                                action={(formData) =>
                                  linkParticipant(formData, source, participant.participantKey, phoneNumber)
                                }
                                className="flex flex-col gap-2 sm:flex-row"
                              >
                                <select
                                  aria-label={copy.contactPlaceholder}
                                  className="min-w-0 flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                                  name="contactId"
                                >
                                  <option value="">{copy.contactPlaceholder}</option>
                                  {activeContacts.map((contact) => (
                                    <option key={contact.id} value={contact.id}>
                                      {contactLabel(locale, contact, phoneNumber)}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-surface transition hover:bg-ink-2 disabled:cursor-not-allowed disabled:opacity-60"
                                  disabled={Boolean(busyKey?.startsWith(participantBusyPrefix))}
                                  type="submit"
                                >
                                  <Link2 className="h-3.5 w-3.5" />
                                  {canTrustSource ? copy.linkAndTrust : copy.linkExisting}
                                </button>
                              </form>

                              <form
                                action={(formData) =>
                                  createParticipantContact(formData, source, participant.participantKey, phoneNumber)
                                }
                                className="grid gap-2 sm:grid-cols-2"
                              >
                                <input
                                  className="rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink outline-none focus:border-accent sm:col-span-2"
                                  name="fullName"
                                  placeholder={copy.namePlaceholder}
                                />
                                <select
                                  aria-label={copy.organizationPlaceholder}
                                  className="rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                                  name="organizationId"
                                >
                                  <option value="">{copy.organizationPlaceholder}</option>
                                  {organizations.map((organization) => (
                                    <option key={organization.id} value={organization.id}>
                                      {organization.displayName || organization.legalName}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  aria-label={copy.rolePlaceholder}
                                  className="rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                                  defaultValue="other"
                                  name="role"
                                >
                                  {roleValues.map((role) => (
                                    <option key={role} value={role}>
                                      {enumLabel(locale, role)}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-contrast transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-2"
                                  disabled={Boolean(busyKey?.startsWith(participantBusyPrefix))}
                                  type="submit"
                                >
                                  <UserPlus className="h-3.5 w-3.5" />
                                  {canTrustSource ? copy.createAndTrust : copy.createContact}
                                </button>
                              </form>
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
