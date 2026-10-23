"use client";

import { Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";

import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { useDirtyFormRegistry } from "@/hooks/use-dirty-form-registry";
import type { PartnerOrganizationRecord } from "@/lib/partners/repository";
import type { PartnerLocationRecord } from "@/lib/partners/locations";
import { enumLabel } from "@/lib/i18n/enum-labels";

const locationTypes = ["billing", "pickup", "delivery", "warehouse", "store", "cedis", "office", "other"] as const;

type LocationDirectoryFormProps = {
  locale: string;
  canManage: boolean;
  locations: PartnerLocationRecord[];
  organizations: PartnerOrganizationRecord[];
  selectedLocationId?: string | null;
  onDirtyChange?: (dirty: boolean) => void;
};

function copyForLocale(locale: string) {
  if (locale === "en") {
    return {
      title: "Locations",
      subtitle:
        "Create the pickup, delivery, store, billing, and warehouse locations the workspace will reuse across purchase orders and shipments.",
      save: "Save location",
      update: "Save changes",
      saving: "Saving...",
      empty: "No locations have been added yet.",
      readOnly: "You can view locations here, but only admins and operators can edit them.",
      fields: {
        name: "Location name",
        type: "Location type",
        organization: "Organization",
        address1: "Address line 1",
        city: "City",
        state: "State",
        postalCode: "Postal code",
        country: "Country",
      },
      successCreate: "Location created.",
      successUpdate: "Location updated.",
      successDelete: "Location deleted.",
      delete: "Delete",
      deleting: "Deleting...",
      cancel: "Cancel",
      deleteTitle: "Delete location",
      deleteBody: "This removes the location from the directory. If it is already attached to routes or commercial records, we will block the delete and keep history intact.",
      deleteWarning: "Use delete only for duplicate or mistaken entries.",
      searchPlaceholder: "Search locations...",
      noSearchResults: "No locations match that search.",
    };
  }

  return {
    title: "Ubicaciones",
    subtitle:
      "Registra puntos de recolección, entrega, tienda, facturación y almacén para reutilizarlos en órdenes de compra y embarques.",
    save: "Guardar ubicación",
    update: "Guardar cambios",
    saving: "Guardando...",
    empty: "Todavía no se han agregado ubicaciones.",
    readOnly: "Aquí puedes consultar ubicaciones, pero solo admins y operadores pueden editarlas.",
    fields: {
      name: "Nombre de la ubicación",
      type: "Tipo de ubicación",
      organization: "Organización",
      address1: "Dirección",
      city: "Ciudad",
      state: "Estado",
      postalCode: "Código postal",
      country: "País",
    },
    successCreate: "Ubicación creada.",
    successUpdate: "Ubicación actualizada.",
    successDelete: "Ubicación eliminada.",
    delete: "Eliminar",
    deleting: "Eliminando...",
    cancel: "Cancelar",
    deleteTitle: "Eliminar ubicación",
    deleteBody: "Esto elimina la ubicación del directorio. Si ya está ligada a rutas o registros comerciales, bloquearemos la eliminación y conservaremos el historial.",
    deleteWarning: "Usa eliminar solo para registros duplicados o creados por error.",
    searchPlaceholder: "Buscar ubicaciones...",
    noSearchResults: "Ninguna ubicación coincide con la búsqueda.",
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

export function LocationDirectoryForm({
  locale,
  canManage,
  locations,
  organizations,
  selectedLocationId,
  onDirtyChange,
}: LocationDirectoryFormProps) {
  const copy = copyForLocale(locale);
  const router = useRouter();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [createFormKey, setCreateFormKey] = useState(0);
  const [openLocationId, setOpenLocationId] = useState<string | null>(selectedLocationId ?? null);
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const { hasDirtyForms, setFormDirty } = useDirtyFormRegistry();

  const filteredLocations = useMemo(() => {
    const normalizedQuery = deferredSearchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return locations;
    }

    return locations.filter((location) =>
      [
        location.name,
        location.locationType,
        location.organizationName,
        location.addressLine1,
        location.city,
        location.state,
        location.postalCode,
        location.country,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [locations, deferredSearchQuery]);

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
      name: String(formData.get("name") ?? ""),
      locationType: String(formData.get("locationType") ?? ""),
      organizationId: String(formData.get("organizationId") ?? ""),
      addressLine1: String(formData.get("addressLine1") ?? ""),
      city: String(formData.get("city") ?? ""),
      state: String(formData.get("state") ?? ""),
      postalCode: String(formData.get("postalCode") ?? ""),
      country: String(formData.get("country") ?? ""),
    };

    const response = await fetch("/api/partners/locations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setError(await readError(response, locale === "en" ? "Unable to create location." : "No se pudo crear la ubicación."));
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
      name: String(formData.get("name") ?? ""),
      locationType: String(formData.get("locationType") ?? ""),
      organizationId: String(formData.get("organizationId") ?? ""),
      addressLine1: String(formData.get("addressLine1") ?? ""),
      city: String(formData.get("city") ?? ""),
      state: String(formData.get("state") ?? ""),
      postalCode: String(formData.get("postalCode") ?? ""),
      country: String(formData.get("country") ?? ""),
    };

    const response = await fetch("/api/partners/locations", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setError(await readError(response, locale === "en" ? "Unable to update location." : "No se pudo actualizar la ubicación."));
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

    const response = await fetch("/api/partners/locations", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: deleteTarget.id }),
    });

    if (!response.ok) {
      setError(
        await readError(
          response,
          locale === "en" ? "Unable to delete location." : "No se pudo eliminar la ubicación.",
        ),
      );
      setIsDeleting(false);
      return;
    }

    setDeleteTarget(null);
    setIsDeleting(false);
    setFormDirty(deleteTarget.id, false);
    if (openLocationId === deleteTarget.id) {
      setOpenLocationId(null);
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
              <span className="font-medium text-ink">{copy.fields.name}</span>
              <input className="rounded-xl border border-line px-3 py-2.5" name="name" required />
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-ink">{copy.fields.type}</span>
              <select className="rounded-xl border border-line px-3 py-2.5" name="locationType" required>
                {locationTypes.map((type) => (
                  <option key={type} value={type}>
                    {enumLabel(locale, type)}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-ink">{copy.fields.organization}</span>
              <select className="rounded-xl border border-line px-3 py-2.5" defaultValue="" name="organizationId">
                <option value="">{locale === "en" ? "No organization" : "Sin organización"}</option>
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.displayName || organization.legalName}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-ink">{copy.fields.address1}</span>
              <input className="rounded-xl border border-line px-3 py-2.5" name="addressLine1" />
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-ink">{copy.fields.city}</span>
              <input className="rounded-xl border border-line px-3 py-2.5" name="city" />
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-ink">{copy.fields.state}</span>
              <input className="rounded-xl border border-line px-3 py-2.5" name="state" />
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-ink">{copy.fields.postalCode}</span>
              <input className="rounded-xl border border-line px-3 py-2.5" name="postalCode" />
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-ink">{copy.fields.country}</span>
              <input className="rounded-xl border border-line px-3 py-2.5" defaultValue="MX" name="country" />
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
          {filteredLocations.length > 0 ? (
            filteredLocations.map((location) => (
              <details
                key={location.id}
                className={`rounded-xl border border-line bg-tint px-4 py-3 ${
                  openLocationId === location.id ? "ring-1 ring-accent/18" : ""
                }`}
                open={openLocationId === location.id}
              >
                <summary
                  className="cursor-pointer list-none"
                  onClick={(event) => {
                    event.preventDefault();
                    setOpenLocationId((current) => (current === location.id ? null : location.id));
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">{location.name}</p>
                      <p className="mt-1 text-xs text-muted/78">
                        {enumLabel(locale, location.locationType)}
                        {location.organizationName ? ` / ${location.organizationName}` : ""}
                      </p>
                    </div>
                    <div className="ml-auto flex items-center gap-3">
                      {location.city ? (
                        <span className="rounded-full bg-card px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                          {location.city}
                        </span>
                      ) : null}
                      {canManage ? (
                        <button
                          aria-label={`${copy.delete} ${location.name}`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-rose-200 bg-card text-rose-600 transition hover:bg-rose-50"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setDeleteTarget({
                              id: location.id,
                              label: location.name,
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

                {canManage && openLocationId === location.id && (
                  <form
                    className="mt-4 grid gap-4 md:grid-cols-2"
                    onChangeCapture={() => setFormDirty(location.id, true)}
                    onSubmit={handleUpdate}
                  >
                    <input name="id" type="hidden" value={location.id} />
                    <label className="grid gap-1.5 text-sm">
                      <span className="font-medium text-ink">{copy.fields.name}</span>
                      <input className="rounded-xl border border-line px-3 py-2.5" defaultValue={location.name} name="name" required />
                    </label>

                    <label className="grid gap-1.5 text-sm">
                      <span className="font-medium text-ink">{copy.fields.type}</span>
                      <select className="rounded-xl border border-line px-3 py-2.5" defaultValue={location.locationType} name="locationType" required>
                        {locationTypes.map((type) => (
                          <option key={type} value={type}>
                            {enumLabel(locale, type)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-1.5 text-sm">
                      <span className="font-medium text-ink">{copy.fields.organization}</span>
                      <select className="rounded-xl border border-line px-3 py-2.5" defaultValue={location.organizationId ?? ""} name="organizationId">
                        <option value="">{locale === "en" ? "No organization" : "Sin organización"}</option>
                        {organizations.map((organization) => (
                          <option key={organization.id} value={organization.id}>
                            {organization.displayName || organization.legalName}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-1.5 text-sm">
                      <span className="font-medium text-ink">{copy.fields.address1}</span>
                      <input className="rounded-xl border border-line px-3 py-2.5" defaultValue={location.addressLine1 ?? ""} name="addressLine1" />
                    </label>

                    <label className="grid gap-1.5 text-sm">
                      <span className="font-medium text-ink">{copy.fields.city}</span>
                      <input className="rounded-xl border border-line px-3 py-2.5" defaultValue={location.city ?? ""} name="city" />
                    </label>

                    <label className="grid gap-1.5 text-sm">
                      <span className="font-medium text-ink">{copy.fields.state}</span>
                      <input className="rounded-xl border border-line px-3 py-2.5" defaultValue={location.state ?? ""} name="state" />
                    </label>

                    <label className="grid gap-1.5 text-sm">
                      <span className="font-medium text-ink">{copy.fields.postalCode}</span>
                      <input className="rounded-xl border border-line px-3 py-2.5" defaultValue={location.postalCode ?? ""} name="postalCode" />
                    </label>

                    <label className="grid gap-1.5 text-sm">
                      <span className="font-medium text-ink">{copy.fields.country}</span>
                      <input className="rounded-xl border border-line px-3 py-2.5" defaultValue={location.country ?? "MX"} name="country" />
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
              {locations.length > 0 ? copy.noSearchResults : copy.empty}
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
