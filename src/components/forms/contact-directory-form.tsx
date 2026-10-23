"use client";

import { CheckCircle2, Phone, Search, Trash2, Unlink2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";

import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { useDirtyFormRegistry } from "@/hooks/use-dirty-form-registry";
import { getDirectoryContactLabel } from "@/lib/partners/display";
import type { PartnerContactRecord, PartnerOrganizationRecord } from "@/lib/partners/repository";
import { enumLabel } from "@/lib/i18n/enum-labels";

const contactRoles = [
  "driver",
  "carrier_ops",
  "shipper_ops",
  "customer_contact",
  "retailer_contact",
  "other",
] as const;

type ContactDirectoryFormProps = {
  locale: string;
  canManage: boolean;
  contacts: PartnerContactRecord[];
  organizations: PartnerOrganizationRecord[];
  selectedContactId?: string | null;
  onDirtyChange?: (dirty: boolean) => void;
};

function copyForLocale(locale: string) {
  if (locale === "en") {
    return {
      title: "Contacts and phone identities",
      subtitle:
        "Use contacts to identify real people, shared ops numbers, and WhatsApp participants. A phone can be mapped after the contact already exists.",
      createTitle: "Add contact",
      save: "Save contact",
      update: "Save changes",
      saving: "Saving...",
      addPhone: "Add phone number",
      updatePhone: "Save phone settings",
      empty: "No contacts have been added yet.",
      unnamed: "Unnamed contact",
      noPhones: "No phone numbers linked yet.",
      readOnly: "You can view contacts here, but only admins and operators can edit them.",
      fields: {
        fullName: "Full name",
        displayName: "Display name",
        organization: "Organization",
        role: "Role",
        language: "Language",
        notes: "Notes",
        active: "Active",
        primaryPhone: "Primary phone number",
        phoneLabel: "Phone label",
        phonePrimary: "Primary number",
        phoneActive: "Active mapping",
      },
      successCreate: "Contact created.",
      successUpdate: "Contact updated.",
      successPhone: "Phone assignment saved.",
      successRemovePhone: "Phone mapping removed.",
      successDelete: "Contact deleted.",
      delete: "Delete",
      deleting: "Deleting...",
      removeMapping: "Remove mapping",
      removingMapping: "Removing...",
      removeMappingTitle: "Remove phone mapping",
      removeMappingBody:
        "This stops this phone number from resolving to this contact. The contact remains in the directory.",
      removeMappingWarning:
        "Use this when a WhatsApp number was mapped to the wrong person or should no longer identify this contact.",
      cancel: "Cancel",
      deleteTitle: "Delete contact",
      deleteBody: "This removes the contact and any saved phone mappings from the directory. If the contact is already tied to WhatsApp thread history, we will block the delete.",
      deleteWarning: "Use delete only for duplicate or mistaken contacts.",
      searchPlaceholder: "Search contacts...",
      noSearchResults: "No contacts match that search.",
    };
  }

  return {
    title: "Contactos e identidades telefónicas",
    subtitle:
      "Usa los contactos para identificar personas reales, números compartidos de operación y participantes de WhatsApp. Un teléfono se puede asignar después de crear el contacto.",
    createTitle: "Agregar contacto",
    save: "Guardar contacto",
    update: "Guardar cambios",
    saving: "Guardando...",
    addPhone: "Agregar teléfono",
    updatePhone: "Guardar teléfono",
    empty: "Todavía no se han agregado contactos.",
    unnamed: "Contacto sin nombre",
    noPhones: "Todavía no hay teléfonos ligados.",
    readOnly: "Aquí puedes consultar contactos, pero solo admins y operadores pueden editarlos.",
    fields: {
      fullName: "Nombre completo",
      displayName: "Nombre visible",
      organization: "Organización",
      role: "Rol",
      language: "Idioma",
      notes: "Notas",
      active: "Activo",
      primaryPhone: "Teléfono principal",
      phoneLabel: "Etiqueta del teléfono",
      phonePrimary: "Número principal",
      phoneActive: "Mapeo activo",
    },
    successCreate: "Contacto creado.",
    successUpdate: "Contacto actualizado.",
    successPhone: "Asignación telefónica guardada.",
    successRemovePhone: "Mapeo telefónico removido.",
    successDelete: "Contacto eliminado.",
    delete: "Eliminar",
    deleting: "Eliminando...",
    removeMapping: "Remover mapeo",
    removingMapping: "Removiendo...",
    removeMappingTitle: "Remover mapeo telefónico",
    removeMappingBody:
      "Esto evita que el teléfono resuelva a este contacto. El contacto permanece en el directorio.",
    removeMappingWarning:
      "Úsalo cuando un número de WhatsApp se mapeó a la persona incorrecta o ya no debe identificar a este contacto.",
    cancel: "Cancelar",
    deleteTitle: "Eliminar contacto",
    deleteBody: "Esto elimina el contacto y los teléfonos guardados del directorio. Si el contacto ya está ligado al historial de WhatsApp, bloquearemos la eliminación.",
    deleteWarning: "Usa eliminar solo para contactos duplicados o creados por error.",
    searchPlaceholder: "Buscar contactos...",
    noSearchResults: "Ningún contacto coincide con la búsqueda.",
  };
}

async function readError(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? fallback;
  } catch {
    return fallback;
  }
}

export function ContactDirectoryForm({
  locale,
  canManage,
  contacts,
  organizations,
  selectedContactId,
  onDirtyChange,
}: ContactDirectoryFormProps) {
  const copy = copyForLocale(locale);
  const router = useRouter();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
  const [removePhoneTarget, setRemovePhoneTarget] = useState<{ id: string; label: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRemovingPhone, setIsRemovingPhone] = useState(false);
  const [createFormKey, setCreateFormKey] = useState(0);
  const [openContactId, setOpenContactId] = useState<string | null>(selectedContactId ?? null);
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const { hasDirtyForms, setFormDirty } = useDirtyFormRegistry();

  const filteredContacts = useMemo(() => {
    const normalizedQuery = deferredSearchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return contacts;
    }

    return contacts.filter((contact) =>
      [
        contact.fullName,
        contact.displayName,
        contact.organizationName,
        contact.role,
        contact.language,
        contact.primaryPhoneNumber,
        contact.notes,
        ...contact.phoneNumbers.map((phone) => `${phone.phoneNumber} ${phone.label ?? ""}`),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [contacts, deferredSearchQuery]);

  useEffect(() => {
    onDirtyChange?.(hasDirtyForms);
  }, [hasDirtyForms, onDirtyChange]);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setError("");

    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      fullName: String(formData.get("fullName") ?? ""),
      displayName: String(formData.get("displayName") ?? ""),
      organizationId: String(formData.get("organizationId") ?? ""),
      role: String(formData.get("role") ?? ""),
      language: String(formData.get("language") ?? locale),
      notes: String(formData.get("notes") ?? ""),
      active: formData.get("active") === "on",
      primaryPhoneNumber: String(formData.get("primaryPhoneNumber") ?? ""),
    };

    const response = await fetch("/api/partners/contacts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setError(await readError(response, locale === "en" ? "Unable to create contact." : "No se pudo crear el contacto."));
      return;
    }

    setNotice(copy.successCreate);
    setFormDirty("create", false);
    form.reset();
    setCreateFormKey((current) => current + 1);
    startTransition(() => {
      router.refresh();
    });
  }

  async function handleUpdate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setError("");

    const formData = new FormData(event.currentTarget);
    const payload = {
      id: String(formData.get("id") ?? ""),
      fullName: String(formData.get("fullName") ?? ""),
      displayName: String(formData.get("displayName") ?? ""),
      organizationId: String(formData.get("organizationId") ?? ""),
      role: String(formData.get("role") ?? ""),
      language: String(formData.get("language") ?? locale),
      notes: String(formData.get("notes") ?? ""),
      active: formData.get("active") === "on",
    };

    const response = await fetch("/api/partners/contacts", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setError(await readError(response, locale === "en" ? "Unable to update contact." : "No se pudo actualizar el contacto."));
      return;
    }

    setNotice(copy.successUpdate);
    setFormDirty(payload.id, false);
    startTransition(() => {
      router.refresh();
    });
  }

  async function handleAddPhone(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setError("");

    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      externalParticipantId: String(formData.get("externalParticipantId") ?? ""),
      phoneNumber: String(formData.get("phoneNumber") ?? ""),
      label: String(formData.get("label") ?? ""),
      channel: "whatsapp",
      isPrimary: formData.get("isPrimary") === "on",
      active: formData.get("active") === "on",
    };

    const response = await fetch("/api/partners/contacts/phones", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setError(await readError(response, locale === "en" ? "Unable to add phone number." : "No se pudo agregar el teléfono."));
      return;
    }

    setNotice(copy.successPhone);
    setFormDirty(`${payload.externalParticipantId}-new-phone`, false);
    form.reset();
    startTransition(() => {
      router.refresh();
    });
  }

  async function handleDelete() {
    if (!deleteTarget) {
      return;
    }

    setNotice("");
    setError("");
    setIsDeleting(true);

    const response = await fetch("/api/partners/contacts", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: deleteTarget.id }),
    });

    if (!response.ok) {
      setError(
        await readError(
          response,
          locale === "en" ? "Unable to delete contact." : "No se pudo eliminar el contacto.",
        ),
      );
      setIsDeleting(false);
      return;
    }

    setDeleteTarget(null);
    setIsDeleting(false);
    setFormDirty(deleteTarget.id, false);
    if (openContactId === deleteTarget.id) {
      setOpenContactId(null);
    }
    setNotice(copy.successDelete);
    startTransition(() => {
      router.refresh();
    });
  }

  async function handleUpdatePhone(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setError("");

    const formData = new FormData(event.currentTarget);
    const payload = {
      phoneRecordId: String(formData.get("phoneRecordId") ?? ""),
      label: String(formData.get("label") ?? ""),
      isPrimary: formData.get("isPrimary") === "on",
      active: formData.get("active") === "on",
    };

    const response = await fetch("/api/partners/contacts/phones", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setError(await readError(response, locale === "en" ? "Unable to update phone number." : "No se pudo actualizar el teléfono."));
      return;
    }

    setNotice(copy.successPhone);
    setFormDirty(payload.phoneRecordId, false);
    startTransition(() => {
      router.refresh();
    });
  }

  async function handleRemovePhoneMapping() {
    if (!removePhoneTarget) {
      return;
    }

    setNotice("");
    setError("");
    setIsRemovingPhone(true);

    const response = await fetch("/api/partners/contacts/phones", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        phoneRecordId: removePhoneTarget.id,
        isPrimary: false,
        active: false,
      }),
    });

    if (!response.ok) {
      setError(
        await readError(
          response,
          locale === "en" ? "Unable to remove phone mapping." : "No se pudo remover el mapeo telefónico.",
        ),
      );
      setIsRemovingPhone(false);
      return;
    }

    setFormDirty(removePhoneTarget.id, false);
    setRemovePhoneTarget(null);
    setIsRemovingPhone(false);
    setNotice(copy.successRemovePhone);
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <article className="rounded-2xl border border-line bg-card p-6 shadow-sm">
        <h2 className="font-display text-xl font-semibold text-ink">
          {copy.title}
        </h2>
        <p className="mt-2 text-sm text-muted/75">{copy.subtitle}</p>
        {!canManage && <p className="mt-3 text-xs text-muted/70">{copy.readOnly}</p>}

        {canManage && (
          <form
            key={createFormKey}
            className="mt-5 grid gap-4 md:grid-cols-2"
            onChangeCapture={() => setFormDirty("create", true)}
            onSubmit={handleCreate}
          >
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-ink">{copy.fields.fullName}</span>
              <input className="rounded-xl border border-line px-3 py-2.5" name="fullName" />
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-ink">{copy.fields.displayName}</span>
              <input className="rounded-xl border border-line px-3 py-2.5" name="displayName" />
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-ink">{copy.fields.organization}</span>
              <select className="rounded-xl border border-line px-3 py-2.5" defaultValue="" name="organizationId">
                <option value="">{locale === "en" ? "No organization yet" : "Sin organización todavía"}</option>
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.displayName || organization.legalName}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-ink">{copy.fields.role}</span>
              <select className="rounded-xl border border-line px-3 py-2.5" name="role" required>
                {contactRoles.map((role) => (
                  <option key={role} value={role}>
                    {enumLabel(locale, role)}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-ink">{copy.fields.primaryPhone}</span>
              <input className="rounded-xl border border-line px-3 py-2.5" name="primaryPhoneNumber" />
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-ink">{copy.fields.language}</span>
              <select className="rounded-xl border border-line px-3 py-2.5" defaultValue={locale} name="language">
                <option value="es-MX">{locale === "en" ? "Spanish" : "Español"}</option>
                <option value="en">{locale === "en" ? "English" : "Inglés"}</option>
              </select>
            </label>

            <label className="grid gap-1.5 text-sm md:col-span-2">
              <span className="font-medium text-ink">{copy.fields.notes}</span>
              <textarea className="min-h-24 rounded-xl border border-line px-3 py-2.5" name="notes" />
            </label>

            <label className="inline-flex items-center gap-2 text-sm text-ink">
              <input defaultChecked className="h-4 w-4 rounded border-blue-200" name="active" type="checkbox" />
              {copy.fields.active}
            </label>

            <div className="md:col-span-2">
              <button
                className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-contrast shadow-lg shadow-accent/25 transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-70"
                disabled={isPending}
                type="submit"
              >
                {isPending ? copy.saving : copy.save}
              </button>
            </div>
          </form>
        )}

        {notice && <p className="mt-4 text-sm text-emerald-700">{notice}</p>}
        {error && <p className="mt-4 text-sm text-rose-700">{error}</p>}
      </article>

      <article className="rounded-2xl border border-line bg-card p-6 shadow-sm">
        <label className="block">
          <span className="sr-only">{copy.searchPlaceholder}</span>
          <span className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted/45" />
            <input
              className="w-full rounded-xl border border-line bg-tint px-10 py-2.5 text-sm text-ink outline-none transition placeholder:text-muted/45 focus:border-accent focus:bg-card focus:ring-2 focus:ring-accent/15"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={copy.searchPlaceholder}
              type="search"
              value={searchQuery}
            />
          </span>
        </label>
        <div className="mt-4 space-y-3">
          {filteredContacts.length > 0 ? (
            filteredContacts.map((contact) => {
              const contactName = getDirectoryContactLabel(contact) ?? copy.unnamed;

              return (
                <details
                  key={contact.id}
                  className={`rounded-xl border border-line bg-tint px-4 py-3 ${
                    openContactId === contact.id ? "ring-1 ring-accent/18" : ""
                  }`}
                  open={openContactId === contact.id}
                >
                  <summary
                    className="cursor-pointer list-none"
                    onClick={(event) => {
                      event.preventDefault();
                      setOpenContactId((current) => (current === contact.id ? null : contact.id));
                    }}
                  >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        {contactName}
                      </p>
                      <p className="mt-1 text-xs text-muted/78">
                        {contact.organizationName || (locale === "en" ? "Unassigned organization" : "Sin organización")}
                        {" / "}
                        {enumLabel(locale, contact.role)}
                      </p>
                    </div>
                    <div className="ml-auto flex items-center gap-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          contact.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {contact.active ? (locale === "en" ? "Active" : "Activo") : locale === "en" ? "Inactive" : "Inactivo"}
                      </span>
                      {canManage ? (
                        <button
                          aria-label={`${copy.delete} ${contactName}`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-rose-200 bg-card text-rose-600 transition hover:bg-rose-50"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setDeleteTarget({
                              id: contact.id,
                              label: contactName,
                            });
                          }}
                          type="button"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                  </summary>

                {canManage && openContactId === contact.id && (
                  <form
                    className="mt-4 grid gap-4 md:grid-cols-2"
                    onChangeCapture={() => setFormDirty(contact.id, true)}
                    onSubmit={handleUpdate}
                  >
                    <input name="id" type="hidden" value={contact.id} />
                    <label className="grid gap-1.5 text-sm">
                      <span className="font-medium text-ink">{copy.fields.fullName}</span>
                      <input
                        className="rounded-xl border border-line px-3 py-2.5"
                        defaultValue={contact.fullName ?? ""}
                        name="fullName"
                      />
                    </label>

                    <label className="grid gap-1.5 text-sm">
                      <span className="font-medium text-ink">{copy.fields.displayName}</span>
                      <input
                        className="rounded-xl border border-line px-3 py-2.5"
                        defaultValue={contact.displayName ?? ""}
                        name="displayName"
                      />
                    </label>

                    <label className="grid gap-1.5 text-sm">
                      <span className="font-medium text-ink">{copy.fields.organization}</span>
                      <select
                        className="rounded-xl border border-line px-3 py-2.5"
                        defaultValue={contact.organizationId ?? ""}
                        name="organizationId"
                      >
                        <option value="">{locale === "en" ? "No organization yet" : "Sin organización todavía"}</option>
                        {organizations.map((organization) => (
                          <option key={organization.id} value={organization.id}>
                            {organization.displayName || organization.legalName}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-1.5 text-sm">
                      <span className="font-medium text-ink">{copy.fields.role}</span>
                      <select
                        className="rounded-xl border border-line px-3 py-2.5"
                        defaultValue={contact.role}
                        name="role"
                        required
                      >
                        {contactRoles.map((role) => (
                          <option key={role} value={role}>
                            {enumLabel(locale, role)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-1.5 text-sm">
                      <span className="font-medium text-ink">{copy.fields.language}</span>
                      <select
                        className="rounded-xl border border-line px-3 py-2.5"
                        defaultValue={contact.language}
                        name="language"
                      >
                        <option value="es-MX">{locale === "en" ? "Spanish" : "Español"}</option>
                        <option value="en">{locale === "en" ? "English" : "Inglés"}</option>
                      </select>
                    </label>

                    <label className="inline-flex items-center gap-2 text-sm text-ink">
                      <input
                        className="h-4 w-4 rounded border-blue-200"
                        defaultChecked={contact.active}
                        name="active"
                        type="checkbox"
                      />
                      {copy.fields.active}
                    </label>

                    <label className="grid gap-1.5 text-sm md:col-span-2">
                      <span className="font-medium text-ink">{copy.fields.notes}</span>
                      <textarea
                        className="min-h-24 rounded-xl border border-line px-3 py-2.5"
                        defaultValue={contact.notes ?? ""}
                        name="notes"
                      />
                    </label>

                    <div className="md:col-span-2">
                      <button
                        className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink-2 transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-70"
                        disabled={isPending}
                        type="submit"
                      >
                        {isPending ? copy.saving : copy.update}
                      </button>
                    </div>
                  </form>
                )}

                {openContactId === contact.id ? (
                  <div className="mt-4 space-y-3">
                    {contact.phoneNumbers.length > 0 ? (
                      contact.phoneNumbers.map((phone) => (
                        <form
                          key={phone.id}
                          className="rounded-xl border border-line bg-card p-4 shadow-sm"
                          onChangeCapture={() => setFormDirty(phone.id, true)}
                          onSubmit={handleUpdatePhone}
                        >
                          <input name="phoneRecordId" type="hidden" value={phone.id} />
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-3">
                              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-line bg-tint text-accent">
                                <Phone className="h-4 w-4" />
                              </span>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-ink">
                                  {phone.phoneNumber}
                                </p>
                                <p className="mt-1 text-xs text-muted/70">
                                  {phone.label || enumLabel(locale, phone.channel)}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-wrap justify-end gap-2">
                              {phone.isPrimary && phone.active ? (
                                <span className="rounded-full bg-surface px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                                  {locale === "en" ? "Primary" : "Principal"}
                                </span>
                              ) : null}
                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                  phone.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                                }`}
                              >
                                {phone.active ? <CheckCircle2 className="h-3 w-3" /> : null}
                                {phone.active
                                  ? locale === "en"
                                    ? "Mapped"
                                    : "Mapeado"
                                  : locale === "en"
                                    ? "Removed"
                                    : "Removido"}
                              </span>
                            </div>
                          </div>

                          {canManage ? (
                            <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                              <label className="grid gap-1.5 text-sm">
                                <span className="font-medium text-ink">{copy.fields.phoneLabel}</span>
                                <input
                                  className="rounded-xl border border-line bg-card px-3 py-2.5 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15"
                                  defaultValue={phone.label ?? ""}
                                  name="label"
                                />
                              </label>

                              <div className="flex flex-wrap items-end gap-4 text-sm text-ink">
                                <label className="inline-flex items-center gap-2 pb-2.5">
                                  <input
                                    className="h-4 w-4 rounded border-blue-200"
                                    defaultChecked={phone.isPrimary}
                                    name="isPrimary"
                                    type="checkbox"
                                  />
                                  {copy.fields.phonePrimary}
                                </label>

                                <label className="inline-flex items-center gap-2 pb-2.5">
                                  <input
                                    className="h-4 w-4 rounded border-blue-200"
                                    defaultChecked={phone.active}
                                    name="active"
                                    type="checkbox"
                                  />
                                  {copy.fields.phoneActive}
                                </label>
                              </div>

                              <div className="flex flex-wrap gap-2 md:col-span-2">
                                <button
                                  className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink-2 transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-70"
                                  disabled={isPending}
                                  type="submit"
                                >
                                  {isPending ? copy.saving : copy.updatePhone}
                                </button>
                                {phone.active ? (
                                  <button
                                    className="inline-flex items-center gap-2 rounded-xl border border-rose-100 bg-card px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-70"
                                    disabled={isPending || isRemovingPhone}
                                    onClick={() =>
                                      setRemovePhoneTarget({
                                        id: phone.id,
                                        label: phone.phoneNumber,
                                      })
                                    }
                                    type="button"
                                  >
                                    <Unlink2 className="h-4 w-4" />
                                    {copy.removeMapping}
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          ) : null}
                        </form>
                      ))
                    ) : (
                      <p className="rounded-xl bg-card px-4 py-3 text-sm text-muted">{copy.noPhones}</p>
                    )}

                    {canManage ? (
                      <form
                        className="rounded-xl border border-dashed border-blue-200 bg-card px-4 py-4"
                        onChangeCapture={() => setFormDirty(`${contact.id}-new-phone`, true)}
                        onSubmit={handleAddPhone}
                      >
                        <input name="externalParticipantId" type="hidden" value={contact.id} />
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="grid gap-1.5 text-sm">
                            <span className="font-medium text-ink">{copy.fields.primaryPhone}</span>
                            <input className="rounded-xl border border-line px-3 py-2.5" name="phoneNumber" required />
                          </label>

                          <label className="grid gap-1.5 text-sm">
                            <span className="font-medium text-ink">{copy.fields.phoneLabel}</span>
                            <input className="rounded-xl border border-line px-3 py-2.5" name="label" />
                          </label>

                          <label className="inline-flex items-center gap-2 text-sm text-ink">
                            <input className="h-4 w-4 rounded border-blue-200" defaultChecked name="active" type="checkbox" />
                            {copy.fields.phoneActive}
                          </label>

                          <label className="inline-flex items-center gap-2 text-sm text-ink">
                            <input className="h-4 w-4 rounded border-blue-200" name="isPrimary" type="checkbox" />
                            {copy.fields.phonePrimary}
                          </label>
                        </div>

                        <button
                          className="mt-4 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink-2 transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-70"
                          disabled={isPending}
                          type="submit"
                        >
                          {isPending ? copy.saving : copy.addPhone}
                        </button>
                      </form>
                    ) : null}
                  </div>
                ) : null}
                </details>
              );
            })
          ) : (
            <p className="rounded-xl bg-surface px-4 py-3 text-sm text-muted">
              {contacts.length > 0 ? copy.noSearchResults : copy.empty}
            </p>
          )}
        </div>
      </article>

      {deleteTarget ? (
        <ConfirmDeleteDialog
          body={copy.deleteBody}
          cancelLabel={copy.cancel}
          confirmLabel={copy.delete}
          deletingLabel={copy.deleting}
          isDeleting={isDeleting}
          onCancel={() => {
            if (!isDeleting) {
              setDeleteTarget(null);
            }
          }}
          onConfirm={() => void handleDelete()}
          recordLabel={deleteTarget.label}
          title={copy.deleteTitle}
          warning={copy.deleteWarning}
        />
      ) : null}

      {removePhoneTarget ? (
        <ConfirmDeleteDialog
          body={copy.removeMappingBody}
          cancelLabel={copy.cancel}
          confirmLabel={copy.removeMapping}
          deletingLabel={copy.removingMapping}
          isDeleting={isRemovingPhone}
          onCancel={() => {
            if (!isRemovingPhone) {
              setRemovePhoneTarget(null);
            }
          }}
          onConfirm={() => void handleRemovePhoneMapping()}
          recordLabel={removePhoneTarget.label}
          title={copy.removeMappingTitle}
          warning={copy.removeMappingWarning}
        />
      ) : null}
    </div>
  );
}
