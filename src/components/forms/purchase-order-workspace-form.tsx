"use client";

import { Plus, Rows3, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type Dispatch, type FormEvent, type SetStateAction } from "react";

import { RegionalDateInput } from "@/components/ui/regional-date-input";
import { useDirtyFormRegistry } from "@/hooks/use-dirty-form-registry";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { formatIsoDateForField } from "@/lib/dates";
import type {
  ManualPurchaseOrderLineRecord,
  ManualPurchaseOrderRecord,
  WorkspaceLocationOption,
  WorkspaceOrganizationOption,
} from "@/lib/operations/repository";
import { enumLabel } from "@/lib/i18n/enum-labels";

const purchaseOrderStatuses = ["draft", "open", "confirmed", "closed", "cancelled"] as const;

type PurchaseOrderWorkspaceFormProps = {
  locale: string;
  canManage: boolean;
  purchaseOrders: ManualPurchaseOrderRecord[];
  organizations: WorkspaceOrganizationOption[];
  locations: WorkspaceLocationOption[];
};

type PurchaseOrderLineDraft = {
  id: string;
  lineNumber: string;
  externalProductCode: string;
  description: string;
  qtyOrdered: string;
  uom: string;
  unitPrice: string;
  lineTotal: string;
  requestedDeliveryDate: string;
};

type PurchaseOrderLineEditorProps = {
  locale: string;
  localeCopy: ReturnType<typeof copyForLocale>;
  lines: PurchaseOrderLineDraft[];
  disabled: boolean;
  onAddLine: () => void;
  onRemoveLine: (lineId: string) => void;
  onUpdateLine: (lineId: string, field: keyof Omit<PurchaseOrderLineDraft, "id">, value: string) => void;
};

function createDraftId() {
  return globalThis.crypto?.randomUUID?.() ?? `line-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createEmptyLineDraft(lineNumber?: number): PurchaseOrderLineDraft {
  return {
    id: createDraftId(),
    lineNumber: lineNumber ? String(lineNumber) : "",
    externalProductCode: "",
    description: "",
    qtyOrdered: "",
    uom: "",
    unitPrice: "",
    lineTotal: "",
    requestedDeliveryDate: "",
  };
}

function createLineDraftsFromRecord(lines: ManualPurchaseOrderLineRecord[]) {
  return lines.length > 0
    ? lines.map((line, index) => ({
        id: line.id,
        lineNumber: line.lineNumber ? String(line.lineNumber) : String(index + 1),
        externalProductCode: line.externalProductCode ?? "",
        description: line.description,
        qtyOrdered: line.qtyOrdered ?? "",
        uom: line.uom ?? "",
        unitPrice: line.unitPrice ?? "",
        lineTotal: line.lineTotal ?? "",
        requestedDeliveryDate: line.requestedDeliveryDate ?? "",
      }))
    : [createEmptyLineDraft(1)];
}

function lineHasContent(line: PurchaseOrderLineDraft) {
  return [
    line.externalProductCode,
    line.description,
    line.qtyOrdered,
    line.uom,
    line.unitPrice,
    line.lineTotal,
    line.requestedDeliveryDate,
  ].some((value) => value.trim().length > 0);
}

function serializeLineDrafts(copy: ReturnType<typeof copyForLocale>, lines: PurchaseOrderLineDraft[]) {
  const serialized = [];

  for (const line of lines) {
    if (!lineHasContent(line)) {
      continue;
    }

    if (!line.description.trim()) {
      throw new Error(copy.lineItems.descriptionRequired);
    }

    serialized.push({
      lineNumber: line.lineNumber.trim(),
      externalProductCode: line.externalProductCode.trim(),
      description: line.description.trim(),
      qtyOrdered: line.qtyOrdered.trim(),
      uom: line.uom.trim(),
      unitPrice: line.unitPrice.trim(),
      lineTotal: line.lineTotal.trim(),
      requestedDeliveryDate: line.requestedDeliveryDate.trim(),
    });
  }

  return serialized;
}

function totalExpectedQuantity(lines: ManualPurchaseOrderLineRecord[]) {
  const total = lines.reduce((sum, line) => {
    const value = Number.parseFloat(line.qtyOrdered ?? "");
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);

  return total > 0 ? total.toLocaleString(undefined, { maximumFractionDigits: 3 }) : null;
}

function copyForLocale(locale: string) {
  if (locale === "en") {
    return {
      title: "Purchase orders",
      subtitle:
        "Create purchase orders manually when the team gets the information by phone, email, or chat before a file is available.",
      save: "Save purchase order",
      update: "Save changes",
      saving: "Saving...",
      empty: "No purchase orders have been added yet.",
      readOnly: "You can review purchase orders here, but only admins and operators can edit them.",
      noOrganization: "Select organization",
      noLocation: "No location",
      lineItems: {
        title: "Expected line items",
        subtitle:
          "Capture the expected item-level quantities now so shipments, documents, and future evidence can reconcile against the same units later.",
        add: "Add line item",
        remove: "Remove line",
        rowTitle: "Line",
        descriptionRequired: "Each line item needs a description before it can be saved.",
        summary: "line items",
        expectedTotal: "expected units",
        fields: {
          lineNumber: "Line #",
          externalProductCode: "Item code",
          description: "Description",
          qtyOrdered: "Expected qty",
          uom: "UOM",
          unitPrice: "Unit price",
          lineTotal: "Line total",
          requestedDeliveryDate: "Requested date",
        },
      },
      fields: {
        poNumber: "PO number",
        externalPoNumber: "External reference",
        issuerOrgId: "Issuer organization",
        supplierOrgId: "Supplier organization",
        shipToLocationId: "Ship-to location",
        billToLocationId: "Bill-to location",
        poDate: "PO date",
        requestedDeliveryDate: "Requested delivery",
        status: "Status",
        note: "Operator note",
      },
      successCreate: "Purchase order created.",
      successUpdate: "Purchase order updated.",
      unsavedChangesPrompt:
        "You have unsaved purchase order changes. Leave this page and discard them?",
    };
  }

  return {
    title: "Órdenes de compra",
    subtitle:
      "Crea órdenes de compra manualmente cuando el equipo recibe la información por llamada, correo o chat antes de tener un archivo.",
    save: "Guardar orden de compra",
    update: "Guardar cambios",
    saving: "Guardando...",
    empty: "Todavía no se han agregado órdenes de compra.",
    readOnly: "Aquí puedes revisar órdenes de compra, pero solo admins y operadores pueden editarlas.",
    noOrganization: "Selecciona organización",
    noLocation: "Sin ubicación",
    lineItems: {
      title: "Partidas esperadas",
      subtitle:
        "Captura ahora las cantidades esperadas por artículo para que embarques, documentos y evidencia futura se reconcilien contra las mismas unidades.",
      add: "Agregar partida",
      remove: "Quitar partida",
      rowTitle: "Partida",
      descriptionRequired: "Cada partida necesita una descripción antes de guardarse.",
      summary: "partidas",
      expectedTotal: "unidades esperadas",
      fields: {
        lineNumber: "Línea #",
        externalProductCode: "Código del artículo",
        description: "Descripción",
        qtyOrdered: "Cantidad esperada",
        uom: "UM",
        unitPrice: "Precio unitario",
        lineTotal: "Total de línea",
        requestedDeliveryDate: "Fecha solicitada",
      },
    },
    fields: {
      poNumber: "Número de OC",
      externalPoNumber: "Referencia externa",
      issuerOrgId: "Organización emisora",
      supplierOrgId: "Organización proveedora",
      shipToLocationId: "Ubicación de entrega",
      billToLocationId: "Ubicación de facturación",
      poDate: "Fecha de la OC",
      requestedDeliveryDate: "Entrega solicitada",
      status: "Estatus",
      note: "Nota operativa",
    },
    successCreate: "Orden de compra creada.",
    successUpdate: "Orden de compra actualizada.",
    unsavedChangesPrompt:
      "Tienes cambios sin guardar en la orden de compra. ¿Quieres salir de la página y descartarlos?",
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

function PurchaseOrderLineEditor({
  locale,
  localeCopy,
  lines,
  disabled,
  onAddLine,
  onRemoveLine,
  onUpdateLine,
}: PurchaseOrderLineEditorProps) {
  return (
    <div className="rounded-2xl border border-line bg-tint p-4 md:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Rows3 className="h-4 w-4 text-accent" />
            <p className="text-sm font-semibold text-ink">{localeCopy.lineItems.title}</p>
          </div>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-muted/78">{localeCopy.lineItems.subtitle}</p>
        </div>

        <button
          className="inline-flex items-center gap-2 rounded-xl border border-line bg-card px-3 py-2 text-xs font-semibold text-ink-2 transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-70"
          disabled={disabled}
          onClick={onAddLine}
          type="button"
        >
          <Plus className="h-3.5 w-3.5" />
          {localeCopy.lineItems.add}
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {lines.map((line, index) => (
          <div key={line.id} className="rounded-xl border border-line bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-ink">
                {localeCopy.lineItems.rowTitle} {index + 1}
              </p>

              <button
                className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-70"
                disabled={disabled || lines.length === 1}
                onClick={() => onRemoveLine(line.id)}
                type="button"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {localeCopy.lineItems.remove}
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-ink">{localeCopy.lineItems.fields.lineNumber}</span>
                <input
                  className="rounded-xl border border-line px-3 py-2.5"
                  inputMode="numeric"
                  onChange={(event) => onUpdateLine(line.id, "lineNumber", event.target.value)}
                  value={line.lineNumber}
                />
              </label>

              <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-ink">{localeCopy.lineItems.fields.externalProductCode}</span>
                <input
                  className="rounded-xl border border-line px-3 py-2.5"
                  onChange={(event) => onUpdateLine(line.id, "externalProductCode", event.target.value)}
                  value={line.externalProductCode}
                />
              </label>

              <label className="grid gap-1.5 text-sm xl:col-span-2">
                <span className="font-medium text-ink">{localeCopy.lineItems.fields.description}</span>
                <input
                  className="rounded-xl border border-line px-3 py-2.5"
                  onChange={(event) => onUpdateLine(line.id, "description", event.target.value)}
                  value={line.description}
                />
              </label>

              <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-ink">{localeCopy.lineItems.fields.qtyOrdered}</span>
                <input
                  className="rounded-xl border border-line px-3 py-2.5"
                  inputMode="decimal"
                  onChange={(event) => onUpdateLine(line.id, "qtyOrdered", event.target.value)}
                  value={line.qtyOrdered}
                />
              </label>

              <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-ink">{localeCopy.lineItems.fields.uom}</span>
                <input
                  className="rounded-xl border border-line px-3 py-2.5"
                  onChange={(event) => onUpdateLine(line.id, "uom", event.target.value)}
                  value={line.uom}
                />
              </label>

              <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-ink">{localeCopy.lineItems.fields.unitPrice}</span>
                <input
                  className="rounded-xl border border-line px-3 py-2.5"
                  inputMode="decimal"
                  onChange={(event) => onUpdateLine(line.id, "unitPrice", event.target.value)}
                  value={line.unitPrice}
                />
              </label>

              <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-ink">{localeCopy.lineItems.fields.lineTotal}</span>
                <input
                  className="rounded-xl border border-line px-3 py-2.5"
                  inputMode="decimal"
                  onChange={(event) => onUpdateLine(line.id, "lineTotal", event.target.value)}
                  value={line.lineTotal}
                />
              </label>

              <RegionalDateInput
                key={`${line.id}-${line.requestedDeliveryDate || "blank"}`}
                label={localeCopy.lineItems.fields.requestedDeliveryDate}
                locale={locale}
                onChangeValue={(value) => onUpdateLine(line.id, "requestedDeliveryDate", value)}
                value={line.requestedDeliveryDate}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PurchaseOrderWorkspaceForm({
  locale,
  canManage,
  purchaseOrders,
  organizations,
  locations,
}: PurchaseOrderWorkspaceFormProps) {
  const copy = copyForLocale(locale);
  const router = useRouter();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [createFormKey, setCreateFormKey] = useState(0);
  const [createLines, setCreateLines] = useState<PurchaseOrderLineDraft[]>(() => [createEmptyLineDraft(1)]);
  const [lineDraftsByPurchaseOrderId, setLineDraftsByPurchaseOrderId] = useState<
    Record<string, PurchaseOrderLineDraft[]>
  >(() =>
    Object.fromEntries(
      purchaseOrders.map((purchaseOrder) => [purchaseOrder.id, createLineDraftsFromRecord(purchaseOrder.lines)]),
    ),
  );
  const { hasDirtyForms, setFormDirty } = useDirtyFormRegistry();
  useUnsavedChangesGuard({
    isDirty: hasDirtyForms,
    message: copy.unsavedChangesPrompt,
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Keep the connected editing draft synchronized with refreshed external state.
    setLineDraftsByPurchaseOrderId(
      Object.fromEntries(
        purchaseOrders.map((purchaseOrder) => [purchaseOrder.id, createLineDraftsFromRecord(purchaseOrder.lines)]),
      ),
    );
  }, [purchaseOrders]);

  const isBusy = isSubmitting || isPending;

  function updateLineCollection(
    setter: Dispatch<SetStateAction<PurchaseOrderLineDraft[]>>,
    lineId: string,
    field: keyof Omit<PurchaseOrderLineDraft, "id">,
    value: string,
  ) {
    setter((current) =>
      current.map((line) =>
        line.id === lineId
          ? {
              ...line,
              [field]: value,
            }
          : line,
      ),
    );
  }

  function addCreateLine() {
    setFormDirty("create", true);
    setCreateLines((current) => [...current, createEmptyLineDraft(current.length + 1)]);
  }

  function removeCreateLine(lineId: string) {
    setFormDirty("create", true);
    setCreateLines((current) => (current.length > 1 ? current.filter((line) => line.id !== lineId) : current));
  }

  function addPurchaseOrderLine(purchaseOrderId: string) {
    setFormDirty(purchaseOrderId, true);
    setLineDraftsByPurchaseOrderId((current) => {
      const existingLines = current[purchaseOrderId] ?? [createEmptyLineDraft(1)];
      return {
        ...current,
        [purchaseOrderId]: [...existingLines, createEmptyLineDraft(existingLines.length + 1)],
      };
    });
  }

  function removePurchaseOrderLine(purchaseOrderId: string, lineId: string) {
    setFormDirty(purchaseOrderId, true);
    setLineDraftsByPurchaseOrderId((current) => {
      const existingLines = current[purchaseOrderId] ?? [createEmptyLineDraft(1)];
      return {
        ...current,
        [purchaseOrderId]:
          existingLines.length > 1 ? existingLines.filter((line) => line.id !== lineId) : existingLines,
      };
    });
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setError("");

    try {
      const form = event.currentTarget;
      const formData = new FormData(form);
      const payload = {
        poNumber: String(formData.get("poNumber") ?? ""),
        externalPoNumber: String(formData.get("externalPoNumber") ?? ""),
        issuerOrgId: String(formData.get("issuerOrgId") ?? ""),
        supplierOrgId: String(formData.get("supplierOrgId") ?? ""),
        shipToLocationId: String(formData.get("shipToLocationId") ?? ""),
        billToLocationId: String(formData.get("billToLocationId") ?? ""),
        poDate: String(formData.get("poDate") ?? ""),
        requestedDeliveryDate: String(formData.get("requestedDeliveryDate") ?? ""),
        status: String(formData.get("status") ?? "open"),
        note: String(formData.get("note") ?? ""),
        lines: serializeLineDrafts(copy, createLines),
      };

      setIsSubmitting(true);
      const response = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        setError(
          await readError(
            response,
            locale === "en" ? "Unable to create purchase order." : "No se pudo crear la orden de compra.",
          ),
        );
        return;
      }

      setNotice(copy.successCreate);
      setFormDirty("create", false);
      form.reset();
      setCreateFormKey((current) => current + 1);
      setCreateLines([createEmptyLineDraft(1)]);
      startTransition(() => router.refresh());
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : locale === "en"
            ? "Unable to create purchase order."
            : "No se pudo crear la orden de compra.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>, purchaseOrderId: string) {
    event.preventDefault();
    setNotice("");
    setError("");

    try {
      const form = event.currentTarget;
      const formData = new FormData(form);
      const payload = {
        id: String(formData.get("id") ?? ""),
        poNumber: String(formData.get("poNumber") ?? ""),
        externalPoNumber: String(formData.get("externalPoNumber") ?? ""),
        issuerOrgId: String(formData.get("issuerOrgId") ?? ""),
        supplierOrgId: String(formData.get("supplierOrgId") ?? ""),
        shipToLocationId: String(formData.get("shipToLocationId") ?? ""),
        billToLocationId: String(formData.get("billToLocationId") ?? ""),
        poDate: String(formData.get("poDate") ?? ""),
        requestedDeliveryDate: String(formData.get("requestedDeliveryDate") ?? ""),
        status: String(formData.get("status") ?? "open"),
        note: String(formData.get("note") ?? ""),
        lines: serializeLineDrafts(copy, lineDraftsByPurchaseOrderId[purchaseOrderId] ?? [createEmptyLineDraft(1)]),
      };

      setIsSubmitting(true);
      const response = await fetch("/api/purchase-orders", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        setError(
          await readError(
            response,
            locale === "en" ? "Unable to update purchase order." : "No se pudo actualizar la orden de compra.",
          ),
        );
        return;
      }

      setNotice(copy.successUpdate);
      setFormDirty(purchaseOrderId, false);
      startTransition(() => router.refresh());
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : locale === "en"
            ? "Unable to update purchase order."
            : "No se pudo actualizar la orden de compra.",
      );
    } finally {
      setIsSubmitting(false);
    }
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
              <span className="font-medium text-ink">{copy.fields.poNumber}</span>
              <input className="rounded-xl border border-line px-3 py-2.5" name="poNumber" required />
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-ink">{copy.fields.externalPoNumber}</span>
              <input className="rounded-xl border border-line px-3 py-2.5" name="externalPoNumber" />
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-ink">{copy.fields.issuerOrgId}</span>
              <select className="rounded-xl border border-line px-3 py-2.5" defaultValue="" name="issuerOrgId" required>
                <option value="">{copy.noOrganization}</option>
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-ink">{copy.fields.supplierOrgId}</span>
              <select className="rounded-xl border border-line px-3 py-2.5" defaultValue="" name="supplierOrgId">
                <option value="">{copy.noOrganization}</option>
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-ink">{copy.fields.shipToLocationId}</span>
              <select className="rounded-xl border border-line px-3 py-2.5" defaultValue="" name="shipToLocationId">
                <option value="">{copy.noLocation}</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-ink">{copy.fields.billToLocationId}</span>
              <select className="rounded-xl border border-line px-3 py-2.5" defaultValue="" name="billToLocationId">
                <option value="">{copy.noLocation}</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.label}
                  </option>
                ))}
              </select>
            </label>

            <RegionalDateInput label={copy.fields.poDate} locale={locale} name="poDate" />

            <RegionalDateInput
              label={copy.fields.requestedDeliveryDate}
              locale={locale}
              name="requestedDeliveryDate"
            />

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-ink">{copy.fields.status}</span>
              <select className="rounded-xl border border-line px-3 py-2.5" defaultValue="open" name="status">
                {purchaseOrderStatuses.map((status) => (
                  <option key={status} value={status}>
                    {enumLabel(locale, status)}
                  </option>
                ))}
              </select>
            </label>

            <PurchaseOrderLineEditor
              disabled={isBusy}
              lines={createLines}
              locale={locale}
              localeCopy={copy}
              onAddLine={addCreateLine}
              onRemoveLine={removeCreateLine}
              onUpdateLine={(lineId, field, value) => updateLineCollection(setCreateLines, lineId, field, value)}
            />

            <label className="grid gap-1.5 text-sm md:col-span-2">
              <span className="font-medium text-ink">{copy.fields.note}</span>
              <textarea className="min-h-24 rounded-xl border border-line px-3 py-2.5" name="note" />
            </label>

            <div className="md:col-span-2">
              <button
                className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-contrast shadow-lg shadow-accent/25 transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-70"
                disabled={isBusy}
                type="submit"
              >
                {isBusy ? copy.saving : copy.save}
              </button>
            </div>
          </form>
        )}

        {notice && <p className="mt-4 text-sm text-emerald-700">{notice}</p>}
        {error && <p className="mt-4 text-sm text-rose-700">{error}</p>}
      </article>

      <article className="rounded-2xl border border-line bg-card p-6 shadow-sm">
        <div className="space-y-3">
          {purchaseOrders.length > 0 ? (
            purchaseOrders.map((purchaseOrder) => {
              const lineDrafts = lineDraftsByPurchaseOrderId[purchaseOrder.id] ?? createLineDraftsFromRecord(purchaseOrder.lines);
              const expectedTotal = totalExpectedQuantity(purchaseOrder.lines);

              return (
                <details key={purchaseOrder.id} className="rounded-xl border border-line bg-tint px-4 py-3">
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-ink">{purchaseOrder.poNumber}</p>
                        <p className="mt-1 text-xs text-muted/78">
                          {purchaseOrder.issuerName || copy.noOrganization}
                          {purchaseOrder.requestedDeliveryDate
                            ? ` / ${formatIsoDateForField(purchaseOrder.requestedDeliveryDate)}`
                            : ""}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-medium text-muted/78">
                          <span className="rounded-full bg-card px-2.5 py-1">
                            {purchaseOrder.lines.length} {copy.lineItems.summary}
                          </span>
                          {expectedTotal && (
                            <span className="rounded-full bg-card px-2.5 py-1">
                              {expectedTotal} {copy.lineItems.expectedTotal}
                            </span>
                          )}
                        </div>
                      </div>

                      <span className="rounded-full bg-card px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                        {enumLabel(locale, purchaseOrder.status ?? "open")}
                      </span>
                    </div>
                  </summary>

                  {canManage && (
                    <form
                      className="mt-4 grid gap-4 md:grid-cols-2"
                      onChangeCapture={() => setFormDirty(purchaseOrder.id, true)}
                      onSubmit={(event) => void handleUpdate(event, purchaseOrder.id)}
                    >
                      <input name="id" type="hidden" value={purchaseOrder.id} />

                      <label className="grid gap-1.5 text-sm">
                        <span className="font-medium text-ink">{copy.fields.poNumber}</span>
                        <input
                          className="rounded-xl border border-line px-3 py-2.5"
                          defaultValue={purchaseOrder.poNumber}
                          name="poNumber"
                          required
                        />
                      </label>

                      <label className="grid gap-1.5 text-sm">
                        <span className="font-medium text-ink">{copy.fields.externalPoNumber}</span>
                        <input
                          className="rounded-xl border border-line px-3 py-2.5"
                          defaultValue={purchaseOrder.externalPoNumber ?? ""}
                          name="externalPoNumber"
                        />
                      </label>

                      <label className="grid gap-1.5 text-sm">
                        <span className="font-medium text-ink">{copy.fields.issuerOrgId}</span>
                        <select
                          className="rounded-xl border border-line px-3 py-2.5"
                          defaultValue={purchaseOrder.issuerOrgId}
                          name="issuerOrgId"
                          required
                        >
                          <option value="">{copy.noOrganization}</option>
                          {organizations.map((organization) => (
                            <option key={organization.id} value={organization.id}>
                              {organization.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="grid gap-1.5 text-sm">
                        <span className="font-medium text-ink">{copy.fields.supplierOrgId}</span>
                        <select
                          className="rounded-xl border border-line px-3 py-2.5"
                          defaultValue={purchaseOrder.supplierOrgId ?? ""}
                          name="supplierOrgId"
                        >
                          <option value="">{copy.noOrganization}</option>
                          {organizations.map((organization) => (
                            <option key={organization.id} value={organization.id}>
                              {organization.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="grid gap-1.5 text-sm">
                        <span className="font-medium text-ink">{copy.fields.shipToLocationId}</span>
                        <select
                          className="rounded-xl border border-line px-3 py-2.5"
                          defaultValue={purchaseOrder.shipToLocationId ?? ""}
                          name="shipToLocationId"
                        >
                          <option value="">{copy.noLocation}</option>
                          {locations.map((location) => (
                            <option key={location.id} value={location.id}>
                              {location.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="grid gap-1.5 text-sm">
                        <span className="font-medium text-ink">{copy.fields.billToLocationId}</span>
                        <select
                          className="rounded-xl border border-line px-3 py-2.5"
                          defaultValue={purchaseOrder.billToLocationId ?? ""}
                          name="billToLocationId"
                        >
                          <option value="">{copy.noLocation}</option>
                          {locations.map((location) => (
                            <option key={location.id} value={location.id}>
                              {location.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <RegionalDateInput
                        defaultValue={purchaseOrder.poDate ?? ""}
                        label={copy.fields.poDate}
                        locale={locale}
                        name="poDate"
                      />

                      <RegionalDateInput
                        defaultValue={purchaseOrder.requestedDeliveryDate ?? ""}
                        label={copy.fields.requestedDeliveryDate}
                        locale={locale}
                        name="requestedDeliveryDate"
                      />

                      <label className="grid gap-1.5 text-sm">
                        <span className="font-medium text-ink">{copy.fields.status}</span>
                        <select
                          className="rounded-xl border border-line px-3 py-2.5"
                          defaultValue={purchaseOrder.status ?? "open"}
                          name="status"
                        >
                          {purchaseOrderStatuses.map((status) => (
                            <option key={status} value={status}>
                              {enumLabel(locale, status)}
                            </option>
                          ))}
                        </select>
                      </label>

                      <PurchaseOrderLineEditor
                        disabled={isBusy}
                        lines={lineDrafts}
                        locale={locale}
                        localeCopy={copy}
                        onAddLine={() => addPurchaseOrderLine(purchaseOrder.id)}
                        onRemoveLine={(lineId) => removePurchaseOrderLine(purchaseOrder.id, lineId)}
                        onUpdateLine={(lineId, field, value) =>
                          setLineDraftsByPurchaseOrderId((current) => ({
                            ...current,
                            [purchaseOrder.id]: (
                              current[purchaseOrder.id] ?? createLineDraftsFromRecord(purchaseOrder.lines)
                            ).map((line) =>
                              line.id === lineId
                                ? {
                                    ...line,
                                    [field]: value,
                                  }
                                : line,
                            ),
                          }))
                        }
                      />

                      <label className="grid gap-1.5 text-sm md:col-span-2">
                        <span className="font-medium text-ink">{copy.fields.note}</span>
                        <textarea
                          className="min-h-24 rounded-xl border border-line px-3 py-2.5"
                          defaultValue={purchaseOrder.note ?? ""}
                          name="note"
                        />
                      </label>

                      <div className="md:col-span-2">
                        <button
                          className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink-2 transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-70"
                          disabled={isBusy}
                          type="submit"
                        >
                          {isBusy ? copy.saving : copy.update}
                        </button>
                      </div>
                    </form>
                  )}
                </details>
              );
            })
          ) : (
            <p className="rounded-xl bg-surface px-4 py-3 text-sm text-muted">{copy.empty}</p>
          )}
        </div>
      </article>
    </div>
  );
}
