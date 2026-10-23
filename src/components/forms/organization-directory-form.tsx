"use client";

import { Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";

import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { useDirtyFormRegistry } from "@/hooks/use-dirty-form-registry";
import type { PartnerOrganizationRecord } from "@/lib/partners/repository";
import { enumLabel } from "@/lib/i18n/enum-labels";

const organizationTypes = [
  "broker",
  "shipper",
  "carrier",
  "retailer",
  "vendor",
  "warehouse_operator",
  "other",
] as const;

type OrganizationDirectoryFormProps = {
  locale: string;
  canManage: boolean;
  organizations: PartnerOrganizationRecord[];
  selectedOrganizationId?: string | null;
  onDirtyChange?: (dirty: boolean) => void;
};

function copyForLocale(locale: string) {
  if (locale === "en") {
    return {
      title: "Organizations",
      subtitle:
        "Create the companies involved in shipments first. Documents, contacts, and invoices should attach back to these records over time.",
      createTitle: "Add organization",
      save: "Save organization",
      update: "Save changes",
      saving: "Saving...",
      editTitle: "Edit organization",
      empty: "No organizations have been added yet.",
      fields: {
        legalName: "Legal name",
        displayName: "Display name",
        organizationType: "Type",
        taxId: "Tax ID",
        active: "Active",
      },
      successCreate: "Organization created.",
      successUpdate: "Organization updated.",
      successDelete: "Organization deleted.",
      readOnly: "You can view organizations here, but only admins and operators can edit them.",
      delete: "Delete",
      deleting: "Deleting...",
      cancel: "Cancel",
      deleteTitle: "Delete organization",
      deleteBody: "This removes the organization from the directory. If it is already tied to routes, contacts, or documents, we will block the delete and tell you why.",
      deleteWarning: "Use delete only for records that were added by mistake.",
      searchPlaceholder: "Search organizations...",
      noSearchResults: "No organizations match that search.",
    };
  }

  return {
    title: "Organizaciones",
    subtitle:
      "Primero registra las empresas involucradas en el flujo. Documentos, contactos y facturas deben quedar ligados a estos registros con el tiempo.",
    createTitle: "Agregar organización",
    save: "Guardar organización",
    update: "Guardar cambios",
    saving: "Guardando...",
    editTitle: "Editar organización",
    empty: "Todavía no se han agregado organizaciones.",
    fields: {
      legalName: "Razón social",
      displayName: "Nombre visible",
      organizationType: "Tipo",
      taxId: "RFC o identificador fiscal",
      active: "Activo",
    },
    successCreate: "Organización creada.",
    successUpdate: "Organización actualizada.",
    successDelete: "Organización eliminada.",
    readOnly: "Aquí puedes consultar las organizaciones, pero solo admins y operadores pueden editarlas.",
    delete: "Eliminar",
    deleting: "Eliminando...",
    cancel: "Cancelar",
    deleteTitle: "Eliminar organización",
    deleteBody: "Esto elimina la organización del directorio. Si ya está ligada a rutas, contactos o documentos, bloquearemos la eliminación y te diremos por qué.",
    deleteWarning: "Usa eliminar solo para registros creados por error.",
    searchPlaceholder: "Buscar organizaciones...",
    noSearchResults: "Ninguna organización coincide con la búsqueda.",
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

export function OrganizationDirectoryForm({
  locale,
  canManage,
  organizations,
  selectedOrganizationId,
  onDirtyChange,
}: OrganizationDirectoryFormProps) {
  const copy = copyForLocale(locale);
  const router = useRouter();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [createFormKey, setCreateFormKey] = useState(0);
  const [openOrganizationId, setOpenOrganizationId] = useState<string | null>(selectedOrganizationId ?? null);
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const { hasDirtyForms, setFormDirty } = useDirtyFormRegistry();

  const filteredOrganizations = useMemo(() => {
    const normalizedQuery = deferredSearchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return organizations;
    }

    return organizations.filter((organization) =>
      [
        organization.legalName,
        organization.displayName,
        organization.organizationType,
        organization.taxId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [organizations, deferredSearchQuery]);

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
      legalName: String(formData.get("legalName") ?? ""),
      displayName: String(formData.get("displayName") ?? ""),
      organizationType: String(formData.get("organizationType") ?? ""),
      taxId: String(formData.get("taxId") ?? ""),
      active: formData.get("active") === "on",
    };

    const response = await fetch("/api/partners/organizations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setError(await readError(response, locale === "en" ? "Unable to create organization." : "No se pudo crear la organización."));
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
      legalName: String(formData.get("legalName") ?? ""),
      displayName: String(formData.get("displayName") ?? ""),
      organizationType: String(formData.get("organizationType") ?? ""),
      taxId: String(formData.get("taxId") ?? ""),
      active: formData.get("active") === "on",
    };

    const response = await fetch("/api/partners/organizations", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setError(await readError(response, locale === "en" ? "Unable to update organization." : "No se pudo actualizar la organización."));
      return;
    }

    setNotice(copy.successUpdate);
    setFormDirty(payload.id, false);
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

    const response = await fetch("/api/partners/organizations", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: deleteTarget.id }),
    });

    if (!response.ok) {
      setError(
        await readError(
          response,
          locale === "en" ? "Unable to delete organization." : "No se pudo eliminar la organización.",
        ),
      );
      setIsDeleting(false);
      return;
    }

    setDeleteTarget(null);
    setIsDeleting(false);
    setFormDirty(deleteTarget.id, false);
    if (openOrganizationId === deleteTarget.id) {
      setOpenOrganizationId(null);
    }
    setNotice(copy.successDelete);
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
              <span className="font-medium text-ink">{copy.fields.legalName}</span>
              <input className="rounded-xl border border-line px-3 py-2.5" name="legalName" required />
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-ink">{copy.fields.displayName}</span>
              <input className="rounded-xl border border-line px-3 py-2.5" name="displayName" />
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-ink">{copy.fields.organizationType}</span>
              <select className="rounded-xl border border-line px-3 py-2.5" name="organizationType" required>
                {organizationTypes.map((type) => (
                  <option key={type} value={type}>
                    {enumLabel(locale, type)}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-ink">{copy.fields.taxId}</span>
              <input className="rounded-xl border border-line px-3 py-2.5" name="taxId" />
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
        <h3 className="font-display text-lg font-semibold text-ink">
          {copy.editTitle}
        </h3>
        <label className="mt-4 block">
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
          {filteredOrganizations.length > 0 ? (
            filteredOrganizations.map((organization) => (
              <details
                key={organization.id}
                className={`rounded-xl border border-line bg-tint px-4 py-3 ${
                  openOrganizationId === organization.id ? "ring-1 ring-accent/18" : ""
                }`}
                open={openOrganizationId === organization.id}
              >
                <summary
                  className="cursor-pointer list-none"
                  onClick={(event) => {
                    event.preventDefault();
                    setOpenOrganizationId((current) => (current === organization.id ? null : organization.id));
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        {organization.displayName || organization.legalName}
                      </p>
                      <p className="mt-1 text-xs text-muted/78">
                        {enumLabel(locale, organization.organizationType)}
                        {" / "}
                        {organization.contactCount} {locale === "en" ? "contacts" : "contactos"}
                      </p>
                    </div>
                    <div className="ml-auto flex items-center gap-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          organization.active
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {organization.active ? (locale === "en" ? "Active" : "Activa") : locale === "en" ? "Inactive" : "Inactiva"}
                      </span>
                      {canManage ? (
                        <button
                          aria-label={`${copy.delete} ${organization.displayName || organization.legalName}`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-rose-200 bg-card text-rose-600 transition hover:bg-rose-50"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setDeleteTarget({
                              id: organization.id,
                              label: organization.displayName || organization.legalName,
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

                {canManage && openOrganizationId === organization.id && (
                  <form
                    className="mt-4 grid gap-4 md:grid-cols-2"
                    onChangeCapture={() => setFormDirty(organization.id, true)}
                    onSubmit={handleUpdate}
                  >
                    <input name="id" type="hidden" value={organization.id} />
                    <label className="grid gap-1.5 text-sm">
                      <span className="font-medium text-ink">{copy.fields.legalName}</span>
                      <input
                        className="rounded-xl border border-line px-3 py-2.5"
                        defaultValue={organization.legalName}
                        name="legalName"
                        required
                      />
                    </label>

                    <label className="grid gap-1.5 text-sm">
                      <span className="font-medium text-ink">{copy.fields.displayName}</span>
                      <input
                        className="rounded-xl border border-line px-3 py-2.5"
                        defaultValue={organization.displayName ?? ""}
                        name="displayName"
                      />
                    </label>

                    <label className="grid gap-1.5 text-sm">
                      <span className="font-medium text-ink">{copy.fields.organizationType}</span>
                      <select
                        className="rounded-xl border border-line px-3 py-2.5"
                        defaultValue={organization.organizationType}
                        name="organizationType"
                        required
                      >
                        {organizationTypes.map((type) => (
                          <option key={type} value={type}>
                            {enumLabel(locale, type)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-1.5 text-sm">
                      <span className="font-medium text-ink">{copy.fields.taxId}</span>
                      <input
                        className="rounded-xl border border-line px-3 py-2.5"
                        defaultValue={organization.taxId ?? ""}
                        name="taxId"
                      />
                    </label>

                    <label className="inline-flex items-center gap-2 text-sm text-ink">
                      <input
                        className="h-4 w-4 rounded border-blue-200"
                        defaultChecked={organization.active}
                        name="active"
                        type="checkbox"
                      />
                      {copy.fields.active}
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
              </details>
            ))
          ) : (
            <p className="rounded-xl bg-surface px-4 py-3 text-sm text-muted">
              {organizations.length > 0 ? copy.noSearchResults : copy.empty}
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
    </div>
  );
}
