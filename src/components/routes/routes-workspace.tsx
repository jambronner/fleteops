"use client";

import { CalendarDays, ChevronRight, FileText, Pencil, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";

import { StatusPill } from "@/components/dashboard/status-pill";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { Drawer } from "@/components/ui/drawer";
import { RegionalDateInput } from "@/components/ui/regional-date-input";
import { SearchableMultiSelectInput } from "@/components/ui/searchable-multi-select-input";
import {
  SearchableSelectInput,
  type SearchableSelectOption,
} from "@/components/ui/searchable-select-input";
import { useDirtyFormRegistry } from "@/hooks/use-dirty-form-registry";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { formatRegionalDateTime } from "@/lib/dates";
import { enumLabel } from "@/lib/i18n/enum-labels";
import type {
  ManualShipmentRecord,
  WorkspaceLocationOption,
  WorkspaceOrganizationOption,
  WorkspacePurchaseOrderOption,
} from "@/lib/operations/repository";

const shipmentStatuses = [
  "draft",
  "planned",
  "in_transit",
  "delivered",
  "delivered_with_exception",
  "cancelled",
] as const;

export type RouteReadiness = {
  tone: "inTransit" | "pendingDocs" | "needsReview" | "ready" | "blocked";
  label: string;
  evidence: number;
};

type RoutesWorkspaceProps = {
  locale: string;
  canManage: boolean;
  defaultRouteDate: string;
  initialCreate?: boolean;
  initialEditId?: string;
  readiness?: Record<string, RouteReadiness>;
  shipments: ManualShipmentRecord[];
  organizations: WorkspaceOrganizationOption[];
  locations: WorkspaceLocationOption[];
  purchaseOrders: WorkspacePurchaseOrderOption[];
};

type OrganizationFieldName = "brokerOrgId" | "shipperOrgId" | "carrierOrgId" | "customerOrgId";
type LocationFieldName = "pickupLocationId" | "deliveryLocationId";
type DirectoryCreateRequest =
  | { kind: "organization"; fieldName: OrganizationFieldName; query: string }
  | { kind: "location"; fieldName: LocationFieldName; query: string };

type DirectoryCreateResolver = {
  resolve: (option: SearchableSelectOption) => void;
  reject: (error: Error) => void;
};

type RouteFilter = "all" | "review" | "missing" | "ready" | "hold";
type DrawerState = { mode: "create" } | { mode: "edit"; record: ManualShipmentRecord } | null;

const organizationTypes = [
  "broker",
  "shipper",
  "carrier",
  "retailer",
  "vendor",
  "warehouse_operator",
  "other",
] as const;

const locationTypes = ["billing", "pickup", "delivery", "warehouse", "store", "cedis", "office", "other"] as const;

const subscribeNoop = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

function copyForLocale(locale: string) {
  if (locale === "en") {
    return {
      save: "Save route",
      update: "Save changes",
      saving: "Saving...",
      empty: "No routes yet.",
      emptyCta: "Create the first route",
      filteredEmpty: "No routes in this view.",
      readOnly: "Only admins and operators can edit routes.",
      newRoute: "New route",
      editRoute: "Edit route",
      searchPlaceholder: "Search reference, client, carrier…",
      noOrg: "No organization selected",
      noLocation: "No location selected",
      noPurchaseOrder: "No commercial reference linked",
      advancedTitle: "More route context",
      tabs: {
        all: "All",
        review: "Needs review",
        missing: "Missing info",
        ready: "Matched",
        hold: "On hold",
      },
      table: {
        reference: "Reference",
        customer: "Client",
        route: "Route",
        date: "Date",
        carrier: "Carrier",
        evidence: "Evidence",
        status: "Status",
        actions: "Actions",
      },
      importReview: "Review import",
      openRoute: "Open",
      reviewRoute: "Review",
      edit: "Edit",
      fields: {
        internalShipmentNumber: "Route reference",
        externalShipmentReference: "Client or carrier reference",
        brokerOrgId: "Operating entity",
        shipperOrgId: "Requesting brand / shipper",
        carrierOrgId: "Assigned carrier",
        customerOrgId: "Client account",
        pickupLocationId: "Pickup origin",
        deliveryLocationId: "Delivery points",
        serviceDate: "Delivery date",
        purchaseOrderId: "Commercial reference",
        pickupDate: "Service date",
        deliveryDateExpected: "Expected completion",
        deliveryDateActual: "Actual completion",
        status: "Route status",
        notes: "Ops note / exception context",
        temperatureControlled: "Special handling",
      },
      successCreate: "Route created.",
      successUpdate: "Route updated.",
      successDelete: "Route deleted.",
      importedLocation: "Imported location",
      importedAddress: "Imported address",
      importedBrand: "Imported brand",
      importedRoute: "Imported route",
      importedRefs: "Imported refs",
      pickerNoMatches: "No matches yet.",
      createOrganization: "Add new organization",
      createLocation: "Add new location",
      modal: {
        createOrganizationTitle: "Add organization to the directory",
        createLocationTitle: "Add location to the directory",
        save: "Save and select",
        cancel: "Cancel",
        fields: {
          legalName: "Legal name",
          displayName: "Display name",
          organizationType: "Type",
          taxId: "Tax ID",
          locationName: "Location name",
          locationType: "Location type",
          organization: "Organization",
          address1: "Address line 1",
          city: "City",
          state: "State",
          postalCode: "Postal code",
          country: "Country",
          active: "Active",
        },
      },
      unsavedChangesPrompt: "You have unsaved route changes. Leave and discard them?",
      delete: "Delete",
      deleting: "Deleting...",
      cancel: "Cancel",
      deleteTitle: "Delete route",
      deleteBody:
        "This removes the route from the workspace. If the route is already linked to evidence, finance, or reconciliation history, we will block the delete.",
      deleteWarning: "Use delete only for duplicate or mistaken route entries.",
    };
  }

  return {
    save: "Guardar ruta",
    update: "Guardar cambios",
    saving: "Guardando...",
    empty: "Todavía no hay rutas.",
    emptyCta: "Crear la primera ruta",
    filteredEmpty: "No hay rutas en esta vista.",
    readOnly: "Solo admins y operadores pueden editar rutas.",
    newRoute: "Nueva ruta",
    editRoute: "Editar ruta",
    searchPlaceholder: "Buscar referencia, cliente, carrier…",
    noOrg: "Sin organización",
    noLocation: "Sin ubicación",
    noPurchaseOrder: "Sin referencia comercial",
    advancedTitle: "Más contexto de la ruta",
    tabs: {
      all: "Todas",
      review: "Por revisar",
      missing: "Falta info",
      ready: "Cuadradas",
      hold: "En hold",
    },
    table: {
      reference: "Referencia",
      customer: "Cliente",
      route: "Ruta",
      date: "Fecha",
      carrier: "Carrier",
      evidence: "Evidencia",
      status: "Estado",
      actions: "Acciones",
    },
    importReview: "Revisar import",
    openRoute: "Abrir",
    reviewRoute: "Revisar",
    edit: "Editar",
    fields: {
      internalShipmentNumber: "Referencia de la ruta",
      externalShipmentReference: "Referencia del cliente o carrier",
      brokerOrgId: "Entidad operativa",
      shipperOrgId: "Marca / solicitante",
      carrierOrgId: "Carrier asignado",
      customerOrgId: "Cuenta cliente",
      pickupLocationId: "Origen de recolección",
      deliveryLocationId: "Puntos de entrega",
      serviceDate: "Fecha de entrega",
      purchaseOrderId: "Referencia comercial",
      pickupDate: "Fecha de servicio",
      deliveryDateExpected: "Cierre esperado",
      deliveryDateActual: "Cierre real",
      status: "Estatus de la ruta",
      notes: "Nota operativa / contexto",
      temperatureControlled: "Manejo especial",
    },
    successCreate: "Ruta creada.",
    successUpdate: "Ruta actualizada.",
    successDelete: "Ruta eliminada.",
    importedLocation: "Ubicación importada",
    importedAddress: "Dirección importada",
    importedBrand: "Marca importada",
    importedRoute: "Ruta importada",
    importedRefs: "Referencias importadas",
    pickerNoMatches: "Todavía no hay coincidencias.",
    createOrganization: "Agregar organización",
    createLocation: "Agregar ubicación",
    modal: {
      createOrganizationTitle: "Agregar organización al directorio",
      createLocationTitle: "Agregar ubicación al directorio",
      save: "Guardar y seleccionar",
      cancel: "Cancelar",
      fields: {
        legalName: "Razón social",
        displayName: "Nombre visible",
        organizationType: "Tipo",
        taxId: "RFC o identificador fiscal",
        locationName: "Nombre de la ubicación",
        locationType: "Tipo de ubicación",
        organization: "Organización",
        address1: "Dirección",
        city: "Ciudad",
        state: "Estado",
        postalCode: "Código postal",
        country: "País",
        active: "Activo",
      },
    },
    unsavedChangesPrompt: "Tienes cambios sin guardar en la ruta. ¿Quieres salir y descartarlos?",
    delete: "Eliminar",
    deleting: "Eliminando...",
    cancel: "Cancelar",
    deleteTitle: "Eliminar ruta",
    deleteBody:
      "Esto elimina la ruta del espacio de trabajo. Si la ruta ya está ligada a evidencia, finanzas o historial de conciliación, bloquearemos la eliminación.",
    deleteWarning: "Usa eliminar solo para rutas duplicadas o creadas por error.",
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

export function RoutesWorkspace({
  locale,
  readiness,
  canManage,
  defaultRouteDate,
  initialCreate,
  initialEditId,
  shipments,
  organizations,
  locations,
  purchaseOrders,
}: RoutesWorkspaceProps) {
  const copy = copyForLocale(locale);
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [organizationOptions, setOrganizationOptions] = useState(organizations);
  const [locationOptions, setLocationOptions] = useState(locations);
  const [purchaseOrderOptions, setPurchaseOrderOptions] = useState(purchaseOrders);
  const [shipmentRecords, setShipmentRecords] = useState(shipments);
  const [drawerState, setDrawerState] = useState<DrawerState>(null);
  const [filter, setFilter] = useState<RouteFilter>("all");
  const [search, setSearch] = useState("");
  const [dateSortAsc, setDateSortAsc] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const directoryCreateResolverRef = useRef<DirectoryCreateResolver | null>(null);
  const [directoryCreateRequest, setDirectoryCreateRequest] = useState<DirectoryCreateRequest | null>(null);
  const [directoryCreateError, setDirectoryCreateError] = useState<string | null>(null);
  const [isDirectoryCreateSaving, setIsDirectoryCreateSaving] = useState(false);
  const mounted = useSyncExternalStore(subscribeNoop, getClientSnapshot, getServerSnapshot);
  const { hasDirtyForms, setFormDirty, clearAllDirty } = useDirtyFormRegistry();
  useUnsavedChangesGuard({
    isDirty: hasDirtyForms,
    message: copy.unsavedChangesPrompt,
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Keep the connected editing draft synchronized with refreshed external state.
    setOrganizationOptions(organizations);
  }, [organizations]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Keep the connected editing draft synchronized with refreshed external state.
    setLocationOptions(locations);
  }, [locations]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Keep the connected editing draft synchronized with refreshed external state.
    setPurchaseOrderOptions(purchaseOrders);
  }, [purchaseOrders]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Keep the connected editing draft synchronized with refreshed external state.
    setShipmentRecords(shipments);
  }, [shipments]);

  const initialDrawerHandledRef = useRef(false);

  useEffect(() => {
    if (!canManage || initialDrawerHandledRef.current) {
      return;
    }

    if (initialCreate) {
      initialDrawerHandledRef.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Honor the initial server-provided drawer request once after mount.
      setDrawerState({ mode: "create" });
      return;
    }

    if (!initialEditId) {
      return;
    }

    const record = shipments.find((shipment) => shipment.id === initialEditId);

    if (record) {
      initialDrawerHandledRef.current = true;
      setDrawerState({ mode: "edit", record });
    }
  }, [initialCreate, initialEditId, canManage, shipments]);

  const organizationPickerOptions: SearchableSelectOption[] = organizationOptions.map((organization) => ({
    value: organization.id,
    label: organization.label,
    description: enumLabel(locale, organization.type),
  }));

  const locationPickerOptions: SearchableSelectOption[] = locationOptions.map((location) => ({
    value: location.id,
    label: location.label,
    description: [
      enumLabel(locale, location.type),
      location.organizationId
        ? organizationOptions.find((option) => option.id === location.organizationId)?.label ?? null
        : null,
    ]
      .filter(Boolean)
      .join(" · "),
  }));

  const purchaseOrderPickerOptions: SearchableSelectOption[] = purchaseOrderOptions.map((purchaseOrder) => ({
    value: purchaseOrder.id,
    label: purchaseOrder.label,
    description: purchaseOrder.poNumber,
  }));

  function normalizeText(value: string) {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  function findOrganizationLabel(id: string | null) {
    if (!id) return null;
    return organizationOptions.find((organization) => organization.id === id)?.label ?? null;
  }

  function findLocationLabel(id: string | null) {
    if (!id) return null;
    return locationOptions.find((location) => location.id === id)?.label ?? null;
  }

  function findPurchaseOrderNumber(id: string | null) {
    if (!id) return null;
    return purchaseOrderOptions.find((purchaseOrder) => purchaseOrder.id === id)?.poNumber ?? null;
  }

  function hasImportReviewAction(shipment: ManualShipmentRecord) {
    return Boolean(
      shipment.importReview?.needsLocationReview || shipment.importReview?.needsOrganizationReview,
    );
  }

  function buildUpdatedImportReview(
    shipment: ManualShipmentRecord["importReview"],
    next: {
      customerOrgId: string | null;
      shipperOrgId: string | null;
      deliveryLocationIds: string[];
    },
  ) {
    if (!shipment) {
      return null;
    }

    return {
      ...shipment,
      needsLocationReview: Boolean(
        (shipment.locationName || shipment.address) && next.deliveryLocationIds.length === 0,
      ),
      needsOrganizationReview: Boolean(shipment.brand && !next.customerOrgId && !next.shipperOrgId),
    };
  }

  function buildOptimisticShipmentRecord(
    id: string,
    payload: {
      internalShipmentNumber: string;
      externalShipmentReference: string;
      brokerOrgId: string;
      shipperOrgId: string;
      carrierOrgId: string;
      customerOrgId: string;
      pickupLocationId: string;
      deliveryLocationId: string;
      deliveryLocationIds: string[];
      purchaseOrderId: string;
      pickupDate: string;
      deliveryDateExpected: string;
      deliveryDateActual: string;
      status: string;
      temperatureControlled: boolean;
      notes: string;
    },
    existingRecord?: ManualShipmentRecord | null,
  ): ManualShipmentRecord {
    const internalShipmentNumber = normalizeText(payload.internalShipmentNumber);
    const externalReference = normalizeText(payload.externalShipmentReference);
    const brokerOrgId = normalizeText(payload.brokerOrgId);
    const shipperOrgId = normalizeText(payload.shipperOrgId);
    const carrierOrgId = normalizeText(payload.carrierOrgId);
    const customerOrgId = normalizeText(payload.customerOrgId);
    const pickupLocationId = normalizeText(payload.pickupLocationId);
    const deliveryLocationId = normalizeText(payload.deliveryLocationId);
    const deliveryLocationIds = payload.deliveryLocationIds
      .map((value) => normalizeText(value))
      .filter((value): value is string => Boolean(value));
    const purchaseOrderId = normalizeText(payload.purchaseOrderId);
    const pickupDate = normalizeText(payload.pickupDate);
    const expectedDeliveryDate = normalizeText(payload.deliveryDateExpected);
    const actualDeliveryDate = normalizeText(payload.deliveryDateActual);
    const notes = normalizeText(payload.notes);

    return {
      id,
      shipmentReference:
        internalShipmentNumber ?? externalReference ?? existingRecord?.shipmentReference ?? id,
      internalShipmentNumber,
      externalReference,
      brokerOrgId,
      shipperOrgId,
      carrierOrgId,
      customerOrgId,
      pickupLocationId,
      deliveryLocationId: deliveryLocationIds[0] ?? deliveryLocationId,
      deliveryLocationIds,
      deliveryStops: deliveryLocationIds.map((locationId, index) => ({
        id: locationId,
        name: findLocationLabel(locationId) ?? locationId,
        sequenceNo: index + 1,
      })),
      purchaseOrderId,
      status: payload.status as ManualShipmentRecord["status"],
      pickupDate,
      expectedDeliveryDate,
      actualDeliveryDate,
      shipperName: findOrganizationLabel(shipperOrgId),
      carrierName: findOrganizationLabel(carrierOrgId),
      customerName: findOrganizationLabel(customerOrgId),
      pickupLocationName: findLocationLabel(pickupLocationId),
      deliveryLocationName: findLocationLabel(deliveryLocationIds[0] ?? deliveryLocationId),
      purchaseOrderNumber: findPurchaseOrderNumber(purchaseOrderId),
      notes,
      temperatureControlled: payload.temperatureControlled,
      importReview: buildUpdatedImportReview(existingRecord?.importReview ?? null, {
        customerOrgId,
        shipperOrgId,
        deliveryLocationIds,
      }),
      deliveryStopCount: deliveryLocationIds.length || existingRecord?.deliveryStopCount || null,
      decision: existingRecord?.decision ?? null,
      folio: existingRecord?.folio ?? null,
      createdAt: existingRecord?.createdAt ?? new Date().toISOString(),
    };
  }

  function inferOrganizationType(fieldName: OrganizationFieldName) {
    switch (fieldName) {
      case "brokerOrgId":
        return "broker";
      case "shipperOrgId":
        return "shipper";
      case "carrierOrgId":
        return "carrier";
      case "customerOrgId":
        return "retailer";
      default:
        return "other";
    }
  }

  function inferLocationType(fieldName: LocationFieldName) {
    return fieldName === "pickupLocationId" ? "pickup" : "delivery";
  }

  function createAbortError() {
    const abortError = new Error(locale === "en" ? "Creation canceled." : "Creación cancelada.");
    abortError.name = "AbortError";
    return abortError;
  }

  function cleanOptional(value: FormDataEntryValue | null) {
    const stringValue = String(value ?? "").trim();
    return stringValue.length > 0 ? stringValue : "";
  }

  function requestDirectoryRecord(request: DirectoryCreateRequest) {
    directoryCreateResolverRef.current?.reject(createAbortError());
    setDirectoryCreateError(null);
    setDirectoryCreateRequest(request);

    return new Promise<SearchableSelectOption>((resolve, reject) => {
      directoryCreateResolverRef.current = { resolve, reject };
    });
  }

  function createOrganizationInline(fieldName: OrganizationFieldName, query: string) {
    return requestDirectoryRecord({ kind: "organization", fieldName, query });
  }

  function createLocationInline(fieldName: LocationFieldName, query: string) {
    return requestDirectoryRecord({ kind: "location", fieldName, query });
  }

  function cancelDirectoryCreate() {
    directoryCreateResolverRef.current?.reject(createAbortError());
    directoryCreateResolverRef.current = null;
    setDirectoryCreateRequest(null);
    setDirectoryCreateError(null);
    setIsDirectoryCreateSaving(false);
  }

  async function handleDirectoryCreateSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!directoryCreateRequest || !directoryCreateResolverRef.current) {
      return;
    }

    setDirectoryCreateError(null);
    setIsDirectoryCreateSaving(true);

    const formData = new FormData(event.currentTarget);

    if (directoryCreateRequest.kind === "organization") {
      const legalName = cleanOptional(formData.get("legalName"));
      const displayName = cleanOptional(formData.get("displayName"));
      const organizationType =
        cleanOptional(formData.get("organizationType")) || inferOrganizationType(directoryCreateRequest.fieldName);

      const response = await fetch("/api/partners/organizations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          legalName,
          displayName,
          organizationType,
          taxId: cleanOptional(formData.get("taxId")),
          active: formData.get("active") === "on",
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        organization?: { id: string; legalName: string };
      };

      if (!response.ok || !payload.organization) {
        setDirectoryCreateError(
          payload.error ??
            (locale === "en" ? "Unable to create organization." : "No se pudo crear la organización."),
        );
        setIsDirectoryCreateSaving(false);
        return;
      }

      const nextOption = {
        id: payload.organization.id,
        label: displayName || legalName || payload.organization.legalName,
        type: organizationType,
      } satisfies WorkspaceOrganizationOption;

      setOrganizationOptions((current) =>
        [...current, nextOption].sort((left, right) => left.label.localeCompare(right.label)),
      );

      directoryCreateResolverRef.current.resolve({
        value: nextOption.id,
        label: displayName || nextOption.label,
        description: enumLabel(locale, nextOption.type),
      });
    } else {
      const name = cleanOptional(formData.get("name"));
      const locationType =
        cleanOptional(formData.get("locationType")) || inferLocationType(directoryCreateRequest.fieldName);
      const organizationId = cleanOptional(formData.get("organizationId"));

      const response = await fetch("/api/partners/locations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          locationType,
          organizationId,
          addressLine1: cleanOptional(formData.get("addressLine1")),
          city: cleanOptional(formData.get("city")),
          state: cleanOptional(formData.get("state")),
          postalCode: cleanOptional(formData.get("postalCode")),
          country: cleanOptional(formData.get("country")) || "MX",
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        location?: { id: string; name: string };
      };

      if (!response.ok || !payload.location) {
        setDirectoryCreateError(
          payload.error ?? (locale === "en" ? "Unable to create location." : "No se pudo crear la ubicación."),
        );
        setIsDirectoryCreateSaving(false);
        return;
      }

      const nextOption = {
        id: payload.location.id,
        label: name || payload.location.name,
        type: locationType,
        organizationId: organizationId || null,
      } satisfies WorkspaceLocationOption;

      setLocationOptions((current) =>
        [...current, nextOption].sort((left, right) => left.label.localeCompare(right.label)),
      );

      directoryCreateResolverRef.current.resolve({
        value: nextOption.id,
        label: nextOption.label,
        description: [
          enumLabel(locale, nextOption.type),
          organizationId
            ? organizationOptions.find((option) => option.id === organizationId)?.label ?? null
            : null,
        ]
          .filter(Boolean)
          .join(" · "),
      });
    }

    directoryCreateResolverRef.current = null;
    setDirectoryCreateRequest(null);
    setDirectoryCreateError(null);
    setIsDirectoryCreateSaving(false);
  }

  function closeDrawer(options?: { skipDirtyCheck?: boolean }) {
    if (!options?.skipDirtyCheck && hasDirtyForms && !window.confirm(copy.unsavedChangesPrompt)) {
      return;
    }

    clearAllDirty();
    setDrawerState(null);
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setError("");

    const formData = new FormData(event.currentTarget);
    const serviceDate = String(formData.get("serviceDate") ?? "");
    const customerOrgId = String(formData.get("customerOrgId") ?? "");
    const payload = {
      internalShipmentNumber: "",
      externalShipmentReference: String(formData.get("externalShipmentReference") ?? ""),
      brokerOrgId: String(formData.get("brokerOrgId") ?? ""),
      shipperOrgId: customerOrgId,
      carrierOrgId: String(formData.get("carrierOrgId") ?? ""),
      customerOrgId,
      pickupLocationId: String(formData.get("pickupLocationId") ?? ""),
      deliveryLocationId: "",
      deliveryLocationIds: formData.getAll("deliveryLocationIds").map(String),
      purchaseOrderId: String(formData.get("purchaseOrderId") ?? ""),
      pickupDate: serviceDate,
      deliveryDateExpected: serviceDate,
      deliveryDateActual: "",
      status: "planned",
      temperatureControlled: formData.get("temperatureControlled") === "on",
      notes: String(formData.get("notes") ?? ""),
    };

    const response = await fetch("/api/shipments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const responsePayload = (await response.json()) as { error?: string; shipmentId?: string };

    if (!response.ok) {
      setError(
        responsePayload.error ?? (locale === "en" ? "Unable to create route." : "No se pudo crear la ruta."),
      );
      return;
    }

    if (responsePayload.shipmentId) {
      const optimisticShipment = buildOptimisticShipmentRecord(responsePayload.shipmentId, payload);
      setShipmentRecords((current) => [optimisticShipment, ...current]);
    }

    setNotice(copy.successCreate);
    closeDrawer({ skipDirtyCheck: true });
    startTransition(() => router.refresh());
  }

  async function handleUpdate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setError("");

    const formData = new FormData(event.currentTarget);
    const payload = {
      id: String(formData.get("id") ?? ""),
      internalShipmentNumber: String(formData.get("internalShipmentNumber") ?? ""),
      externalShipmentReference: String(formData.get("externalShipmentReference") ?? ""),
      brokerOrgId: String(formData.get("brokerOrgId") ?? ""),
      shipperOrgId: String(formData.get("shipperOrgId") ?? ""),
      carrierOrgId: String(formData.get("carrierOrgId") ?? ""),
      customerOrgId: String(formData.get("customerOrgId") ?? ""),
      pickupLocationId: String(formData.get("pickupLocationId") ?? ""),
      deliveryLocationId: "",
      deliveryLocationIds: formData.getAll("deliveryLocationIds").map(String),
      purchaseOrderId: String(formData.get("purchaseOrderId") ?? ""),
      pickupDate: String(formData.get("pickupDate") ?? ""),
      deliveryDateExpected: String(formData.get("deliveryDateExpected") ?? ""),
      deliveryDateActual: String(formData.get("deliveryDateActual") ?? ""),
      status: String(formData.get("status") ?? "draft"),
      temperatureControlled: formData.get("temperatureControlled") === "on",
      notes: String(formData.get("notes") ?? ""),
    };

    const response = await fetch("/api/shipments", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const responsePayload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(
        responsePayload.error ?? (locale === "en" ? "Unable to update route." : "No se pudo actualizar la ruta."),
      );
      return;
    }

    setShipmentRecords((current) =>
      current.map((shipment) =>
        shipment.id === payload.id ? buildOptimisticShipmentRecord(payload.id, payload, shipment) : shipment,
      ),
    );
    setNotice(copy.successUpdate);
    closeDrawer({ skipDirtyCheck: true });
    startTransition(() => router.refresh());
  }

  async function handleDelete() {
    if (!deleteTarget) {
      return;
    }

    setNotice(null);
    setError(null);
    setIsDeleting(true);

    const response = await fetch("/api/shipments", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: deleteTarget.id }),
    });

    if (!response.ok) {
      setError(
        await readError(
          response,
          locale === "en" ? "Unable to delete route." : "No se pudo eliminar la ruta.",
        ),
      );
      setIsDeleting(false);
      return;
    }

    setShipmentRecords((current) => current.filter((shipment) => shipment.id !== deleteTarget.id));
    setDeleteTarget(null);
    setIsDeleting(false);
    setNotice(copy.successDelete);
    startTransition(() => router.refresh());
  }

  function routeFilterOf(shipment: ManualShipmentRecord): RouteFilter | null {
    if (hasImportReviewAction(shipment)) {
      return "review";
    }

    const tone = readiness?.[shipment.id]?.tone;

    switch (tone) {
      case "needsReview":
        return "review";
      case "pendingDocs":
        return "missing";
      case "ready":
        return "ready";
      case "blocked":
        return "hold";
      default:
        return null;
    }
  }

  const filterCounts = useMemo(() => {
    const counts: Record<RouteFilter, number> = { all: shipmentRecords.length, review: 0, missing: 0, ready: 0, hold: 0 };

    for (const shipment of shipmentRecords) {
      const bucket = routeFilterOf(shipment);

      if (bucket) {
        counts[bucket] += 1;
      }
    }

    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipmentRecords, readiness]);

  const visibleRecords = useMemo(() => {
    const term = search.trim().toLowerCase();

    const filtered = shipmentRecords.filter((shipment) => {
      if (filter !== "all" && routeFilterOf(shipment) !== filter) {
        return false;
      }

      if (!term) {
        return true;
      }

      const haystack = [
        shipment.shipmentReference,
        shipment.externalReference,
        shipment.customerName,
        shipment.carrierName,
        shipment.pickupLocationName,
        ...shipment.deliveryStops.map((stop) => stop.name),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(term);
    });

    return filtered.sort((left, right) => {
      const leftDate = left.pickupDate ?? left.expectedDeliveryDate ?? left.createdAt;
      const rightDate = right.pickupDate ?? right.expectedDeliveryDate ?? right.createdAt;
      const delta = leftDate.localeCompare(rightDate);

      return dateSortAsc ? delta : -delta;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipmentRecords, filter, search, dateSortAsc, readiness]);

  function routeLine(shipment: ManualShipmentRecord) {
    const stops =
      shipment.deliveryStops.length > 1
        ? `${shipment.deliveryStops[0].name} +${shipment.deliveryStops.length - 1}`
        : shipment.deliveryStops[0]?.name ?? shipment.deliveryLocationName;

    return [shipment.pickupLocationName, stops].filter(Boolean).join(" → ") || null;
  }

  function formatDate(value: string | null) {
    if (!value) {
      return "—";
    }

    return formatRegionalDateTime(value, locale, { day: "numeric", month: "short" });
  }

  const editingRecord = drawerState?.mode === "edit" ? drawerState.record : null;
  const importedRefs = editingRecord
    ? [editingRecord.importReview?.orderNumber, editingRecord.importReview?.invoiceNumber]
        .filter(Boolean)
        .join(" / ")
    : "";

  const tabDefs: Array<{ id: RouteFilter; label: string }> = [
    { id: "all", label: copy.tabs.all },
    { id: "review", label: copy.tabs.review },
    { id: "missing", label: copy.tabs.missing },
    { id: "ready", label: copy.tabs.ready },
    { id: "hold", label: copy.tabs.hold },
  ];

  const inputClass =
    "rounded-xl border border-line px-3 py-2.5 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15";

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {notice ? (
        <p className="flex-shrink-0 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">{notice}</p>
      ) : null}
      {error ? (
        <p className="flex-shrink-0 rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{error}</p>
      ) : null}

      <div className="flex flex-shrink-0 flex-wrap items-center gap-2.5">
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-line bg-card p-1">
          {tabDefs.map((tab) => (
            <button
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                filter === tab.id ? "bg-ink text-surface" : "text-muted hover:bg-surface hover:text-ink"
              }`}
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              type="button"
            >
              {tab.label}
              <span className={`ml-1.5 tabular-nums ${filter === tab.id ? "text-surface/70" : "text-muted/50"}`}>
                {filterCounts[tab.id]}
              </span>
            </button>
          ))}
        </div>

        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted/50" />
          <input
            className="h-9 w-full rounded-xl border border-line bg-card pl-9 pr-3 text-sm text-ink outline-none transition placeholder:text-muted/50 focus:border-accent focus:ring-2 focus:ring-accent/15"
            onChange={(event) => setSearch(event.target.value)}
            placeholder={copy.searchPlaceholder}
            type="search"
            value={search}
          />
        </div>

        {canManage ? (
          <button
            className="ml-auto flex h-9 items-center gap-1.5 rounded-xl bg-accent px-3.5 text-sm font-semibold text-accent-contrast shadow-lg shadow-accent/25 transition hover:bg-accent-strong"
            onClick={() => setDrawerState({ mode: "create" })}
            type="button"
          >
            <Plus className="h-4 w-4" />
            {copy.newRoute}
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto md:overflow-auto md:rounded-2xl md:border md:border-line md:bg-card md:shadow-sm">
        {visibleRecords.length > 0 ? (
          <>
            <div className="space-y-2 md:hidden" data-route-mobile-list="true">
              {visibleRecords.map((shipment) => {
                const routeReadiness = readiness?.[shipment.id];
                const needsImportReview = hasImportReviewAction(shipment);
                const needsReview =
                  routeReadiness?.tone === "pendingDocs" ||
                  routeReadiness?.tone === "needsReview" ||
                  routeReadiness?.tone === "blocked";

                return (
                  <article
                    className="rounded-2xl border border-line bg-card p-4 shadow-sm"
                    data-route-mobile-card={shipment.id}
                    key={shipment.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          className="block truncate rounded-sm font-semibold text-ink outline-none transition hover:text-accent focus-visible:ring-2 focus-visible:ring-accent/30"
                          href={`/routes/${shipment.id}`}
                        >
                          {shipment.shipmentReference}
                        </Link>
                        {shipment.externalReference && shipment.externalReference !== shipment.shipmentReference ? (
                          <span className="mt-0.5 block truncate text-xs text-muted/60">
                            {shipment.externalReference}
                          </span>
                        ) : null}
                      </div>
                      {routeReadiness ? (
                        <StatusPill label={routeReadiness.label} tone={routeReadiness.tone} />
                      ) : (
                        <span className="text-xs text-muted/70">{enumLabel(locale, shipment.status)}</span>
                      )}
                    </div>

                    <div className="mt-3 min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{shipment.customerName ?? "—"}</p>
                      <p className="mt-0.5 truncate text-xs text-muted">{routeLine(shipment) ?? "—"}</p>
                      {needsImportReview ? (
                        <span className="mt-2 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                          {copy.importReview}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
                      <span className="inline-flex items-center gap-1.5 tabular-nums">
                        <CalendarDays className="h-3.5 w-3.5 text-muted/55" />
                        <span className="sr-only">{copy.table.date}</span>
                        {formatDate(shipment.pickupDate ?? shipment.expectedDeliveryDate)}
                      </span>
                      <span className="inline-flex items-center gap-1.5 tabular-nums">
                        <FileText className="h-3.5 w-3.5 text-muted/55" />
                        <span>{copy.table.evidence}</span>
                        <span className="font-semibold text-ink">{routeReadiness ? routeReadiness.evidence : "—"}</span>
                      </span>
                      {shipment.carrierName ? <span className="ml-auto truncate">{shipment.carrierName}</span> : null}
                    </div>

                    <div className="mt-3 flex items-center gap-2 border-t border-line-2 pt-3">
                      <Link
                        className="inline-flex h-8 flex-1 items-center justify-between rounded-lg px-2 text-xs font-semibold text-accent transition hover:bg-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                        href={`/routes/${shipment.id}`}
                      >
                        {needsReview ? copy.reviewRoute : copy.openRoute}
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                      {canManage ? (
                        <>
                          <button
                            aria-label={`${copy.edit} ${shipment.shipmentReference}`}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-card text-muted transition hover:border-accent/40 hover:text-accent"
                            onClick={() => setDrawerState({ mode: "edit", record: shipment })}
                            type="button"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            aria-label={`${copy.delete} ${shipment.shipmentReference}`}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-card text-muted transition hover:border-rose-300 hover:text-rose-600"
                            onClick={() => setDeleteTarget({ id: shipment.id, label: shipment.shipmentReference })}
                            type="button"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>

            <table className="hidden w-full min-w-[820px] border-collapse text-sm md:table">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-line text-left">
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted/60">
                  {copy.table.reference}
                </th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted/60">
                  {copy.table.customer}
                </th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted/60">
                  {copy.table.route}
                </th>
                <th className="px-4 py-3">
                  <button
                    className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted/60 transition hover:text-accent"
                    onClick={() => setDateSortAsc((current) => !current)}
                    type="button"
                  >
                    {copy.table.date} {dateSortAsc ? "↑" : "↓"}
                  </button>
                </th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted/60">
                  {copy.table.carrier}
                </th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted/60">
                  {copy.table.evidence}
                </th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted/60">
                  {copy.table.status}
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {visibleRecords.map((shipment) => {
                const routeReadiness = readiness?.[shipment.id];
                const needsImportReview = hasImportReviewAction(shipment);

                return (
                  <tr
                    className="cursor-pointer border-b border-line-2 transition-colors last:border-b-0 hover:bg-tint"
                    key={shipment.id}
                    onClick={() => router.push(`/routes/${shipment.id}`)}
                  >
                    <td className="px-4 py-3">
                      <Link
                        className="rounded-sm font-semibold text-ink outline-none transition hover:text-accent focus-visible:ring-2 focus-visible:ring-accent/30"
                        href={`/routes/${shipment.id}`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {shipment.shipmentReference}
                      </Link>
                      {shipment.externalReference && shipment.externalReference !== shipment.shipmentReference ? (
                        <span className="mt-0.5 block text-xs text-muted/60">{shipment.externalReference}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-ink">{shipment.customerName ?? "—"}</td>
                    <td className="max-w-56 px-4 py-3">
                      <span className="block truncate text-muted">{routeLine(shipment) ?? "—"}</span>
                      {needsImportReview ? (
                        <span className="mt-1 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                          {copy.importReview}
                        </span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted">
                      {formatDate(shipment.pickupDate ?? shipment.expectedDeliveryDate)}
                    </td>
                    <td className="px-4 py-3 text-muted">{shipment.carrierName ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">
                      {routeReadiness ? routeReadiness.evidence : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {routeReadiness ? (
                        <StatusPill label={routeReadiness.label} tone={routeReadiness.tone} />
                      ) : (
                        <span className="text-xs text-muted/70">{enumLabel(locale, shipment.status)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {canManage ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            aria-label={`${copy.edit} ${shipment.shipmentReference}`}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-card text-muted transition hover:border-accent/40 hover:text-accent"
                            onClick={(event) => {
                              event.stopPropagation();
                              setDrawerState({ mode: "edit", record: shipment });
                            }}
                            type="button"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            aria-label={`${copy.delete} ${shipment.shipmentReference}`}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-card text-muted transition hover:border-rose-300 hover:text-rose-600"
                            onClick={(event) => {
                              event.stopPropagation();
                              setDeleteTarget({ id: shipment.id, label: shipment.shipmentReference });
                            }}
                            type="button"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            </table>
          </>
        ) : shipmentRecords.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-card px-6 py-14 text-center shadow-sm md:rounded-none md:border-0 md:shadow-none">
            <p className="text-sm text-muted">{copy.empty}</p>
            {canManage ? (
              <button
                className="flex h-9 items-center gap-1.5 rounded-xl bg-accent px-3.5 text-sm font-semibold text-accent-contrast shadow-lg shadow-accent/25 transition hover:bg-accent-strong"
                onClick={() => setDrawerState({ mode: "create" })}
                type="button"
              >
                <Plus className="h-4 w-4" />
                {copy.emptyCta}
              </button>
            ) : null}
          </div>
        ) : (
          <p className="rounded-2xl border border-line bg-card px-6 py-10 text-center text-sm text-muted shadow-sm md:rounded-none md:border-0 md:shadow-none">
            {copy.filteredEmpty}
          </p>
        )}
      </div>

      <Drawer
        onClose={() => closeDrawer()}
        open={drawerState !== null}
        subtitle={editingRecord?.shipmentReference}
        title={drawerState?.mode === "edit" ? copy.editRoute : copy.newRoute}
      >
        {!canManage ? (
          <p className="text-sm text-muted">{copy.readOnly}</p>
        ) : drawerState?.mode === "edit" && editingRecord ? (
          <form
            className="grid gap-4"
            key={editingRecord.id}
            onChangeCapture={() => setFormDirty(editingRecord.id, true)}
            onSubmit={handleUpdate}
          >
            <input name="id" type="hidden" value={editingRecord.id} />

            {editingRecord.importReview ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
                <div className="grid gap-2">
                  {editingRecord.importReview.locationName ? (
                    <p>
                      <span className="font-semibold">{copy.importedLocation}:</span>{" "}
                      {editingRecord.importReview.locationName}
                    </p>
                  ) : null}
                  {editingRecord.importReview.brand ? (
                    <p>
                      <span className="font-semibold">{copy.importedBrand}:</span> {editingRecord.importReview.brand}
                    </p>
                  ) : null}
                  {editingRecord.importReview.address ? (
                    <p>
                      <span className="font-semibold">{copy.importedAddress}:</span>{" "}
                      {editingRecord.importReview.address}
                    </p>
                  ) : null}
                  {editingRecord.importReview.routeName ? (
                    <p>
                      <span className="font-semibold">{copy.importedRoute}:</span>{" "}
                      {editingRecord.importReview.routeName}
                    </p>
                  ) : null}
                  {importedRefs ? (
                    <p>
                      <span className="font-semibold">{copy.importedRefs}:</span> {importedRefs}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-ink">{copy.fields.internalShipmentNumber}</span>
              <input className={inputClass} defaultValue={editingRecord.internalShipmentNumber ?? ""} name="internalShipmentNumber" />
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-ink">{copy.fields.externalShipmentReference}</span>
              <input className={inputClass} defaultValue={editingRecord.externalReference ?? ""} name="externalShipmentReference" />
            </label>

            <SearchableSelectInput
              createLabel={copy.createOrganization}
              defaultValue={editingRecord.customerOrgId ?? ""}
              emptyMessage={copy.pickerNoMatches}
              label={copy.fields.customerOrgId}
              locale={locale}
              name="customerOrgId"
              onCreateOption={(query) => createOrganizationInline("customerOrgId", query)}
              options={organizationPickerOptions}
              placeholder={copy.noOrg}
            />

            <SearchableSelectInput
              createLabel={copy.createOrganization}
              defaultValue={editingRecord.shipperOrgId ?? ""}
              emptyMessage={copy.pickerNoMatches}
              label={copy.fields.shipperOrgId}
              locale={locale}
              name="shipperOrgId"
              onCreateOption={(query) => createOrganizationInline("shipperOrgId", query)}
              options={organizationPickerOptions}
              placeholder={copy.noOrg}
            />

            <SearchableSelectInput
              createLabel={copy.createOrganization}
              defaultValue={editingRecord.carrierOrgId ?? ""}
              emptyMessage={copy.pickerNoMatches}
              label={copy.fields.carrierOrgId}
              locale={locale}
              name="carrierOrgId"
              onCreateOption={(query) => createOrganizationInline("carrierOrgId", query)}
              options={organizationPickerOptions}
              placeholder={copy.noOrg}
            />

            <SearchableSelectInput
              createLabel={copy.createOrganization}
              defaultValue={editingRecord.brokerOrgId ?? ""}
              emptyMessage={copy.pickerNoMatches}
              label={copy.fields.brokerOrgId}
              locale={locale}
              name="brokerOrgId"
              onCreateOption={(query) => createOrganizationInline("brokerOrgId", query)}
              options={organizationPickerOptions}
              placeholder={copy.noOrg}
            />

            <SearchableSelectInput
              createLabel={copy.createLocation}
              defaultValue={editingRecord.pickupLocationId ?? ""}
              emptyMessage={copy.pickerNoMatches}
              label={copy.fields.pickupLocationId}
              locale={locale}
              name="pickupLocationId"
              onCreateOption={(query) => createLocationInline("pickupLocationId", query)}
              options={locationPickerOptions}
              placeholder={copy.noLocation}
            />

            <SearchableMultiSelectInput
              createLabel={copy.createLocation}
              defaultValues={
                editingRecord.deliveryLocationIds.length > 0
                  ? editingRecord.deliveryLocationIds
                  : editingRecord.deliveryLocationId
                    ? [editingRecord.deliveryLocationId]
                    : []
              }
              emptyMessage={copy.pickerNoMatches}
              label={copy.fields.deliveryLocationId}
              locale={locale}
              name="deliveryLocationIds"
              onCreateOption={(query) => createLocationInline("deliveryLocationId", query)}
              options={locationPickerOptions}
              placeholder={copy.noLocation}
            />

            <SearchableSelectInput
              defaultValue={editingRecord.purchaseOrderId ?? ""}
              emptyMessage={copy.pickerNoMatches}
              label={copy.fields.purchaseOrderId}
              locale={locale}
              name="purchaseOrderId"
              options={purchaseOrderPickerOptions}
              placeholder={copy.noPurchaseOrder}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <RegionalDateInput
                defaultValue={editingRecord.pickupDate ?? ""}
                label={copy.fields.pickupDate}
                locale={locale}
                name="pickupDate"
              />

              <RegionalDateInput
                defaultValue={editingRecord.expectedDeliveryDate ?? ""}
                label={copy.fields.deliveryDateExpected}
                locale={locale}
                name="deliveryDateExpected"
              />

              <RegionalDateInput
                defaultValue={editingRecord.actualDeliveryDate ?? ""}
                label={copy.fields.deliveryDateActual}
                locale={locale}
                name="deliveryDateActual"
              />

              <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-ink">{copy.fields.status}</span>
                <select className={inputClass} defaultValue={editingRecord.status} name="status">
                  {shipmentStatuses.map((status) => (
                    <option key={status} value={status}>
                      {enumLabel(locale, status)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="inline-flex items-center gap-2 text-sm text-ink">
              <input
                className="h-4 w-4 rounded border-blue-200"
                defaultChecked={editingRecord.temperatureControlled}
                name="temperatureControlled"
                type="checkbox"
              />
              {copy.fields.temperatureControlled}
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-ink">{copy.fields.notes}</span>
              <textarea className={`min-h-24 ${inputClass}`} defaultValue={editingRecord.notes ?? ""} name="notes" />
            </label>

            <div className="sticky bottom-0 -mx-6 flex gap-3 border-t border-line bg-card px-6 py-4">
              <button
                className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-contrast shadow-lg shadow-accent/25 transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-70"
                disabled={isPending}
                type="submit"
              >
                {isPending ? copy.saving : copy.update}
              </button>
              <button
                className="rounded-xl border border-line bg-card px-5 py-2.5 text-sm font-semibold text-ink-2 transition hover:bg-surface"
                onClick={() => closeDrawer()}
                type="button"
              >
                {copy.cancel}
              </button>
            </div>
          </form>
        ) : (
          <form
            className="grid gap-4"
            onChangeCapture={() => setFormDirty("create", true)}
            onSubmit={handleCreate}
          >
            <SearchableSelectInput
              createLabel={copy.createOrganization}
              defaultValue=""
              emptyMessage={copy.pickerNoMatches}
              label={copy.fields.customerOrgId}
              locale={locale}
              name="customerOrgId"
              onCreateOption={(query) => createOrganizationInline("customerOrgId", query)}
              options={organizationPickerOptions}
              placeholder={copy.noOrg}
            />

            <SearchableMultiSelectInput
              createLabel={copy.createLocation}
              defaultValues={[]}
              emptyMessage={copy.pickerNoMatches}
              label={copy.fields.deliveryLocationId}
              locale={locale}
              name="deliveryLocationIds"
              onCreateOption={(query) => createLocationInline("deliveryLocationId", query)}
              options={locationPickerOptions}
              placeholder={copy.noLocation}
            />

            <RegionalDateInput
              defaultValue={defaultRouteDate}
              label={copy.fields.serviceDate}
              locale={locale}
              name="serviceDate"
            />

            <details className="rounded-xl border border-line bg-tint px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-ink">{copy.advancedTitle}</summary>
              <div className="mt-4 grid gap-4">
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium text-ink">{copy.fields.externalShipmentReference}</span>
                  <input className={`${inputClass} bg-card`} name="externalShipmentReference" />
                </label>

                <SearchableSelectInput
                  createLabel={copy.createOrganization}
                  defaultValue=""
                  emptyMessage={copy.pickerNoMatches}
                  label={copy.fields.carrierOrgId}
                  locale={locale}
                  name="carrierOrgId"
                  onCreateOption={(query) => createOrganizationInline("carrierOrgId", query)}
                  options={organizationPickerOptions}
                  placeholder={copy.noOrg}
                />

                <SearchableSelectInput
                  createLabel={copy.createLocation}
                  defaultValue=""
                  emptyMessage={copy.pickerNoMatches}
                  label={copy.fields.pickupLocationId}
                  locale={locale}
                  name="pickupLocationId"
                  onCreateOption={(query) => createLocationInline("pickupLocationId", query)}
                  options={locationPickerOptions}
                  placeholder={copy.noLocation}
                />

                <SearchableSelectInput
                  defaultValue=""
                  emptyMessage={copy.pickerNoMatches}
                  label={copy.fields.purchaseOrderId}
                  locale={locale}
                  name="purchaseOrderId"
                  options={purchaseOrderPickerOptions}
                  placeholder={copy.noPurchaseOrder}
                />
              </div>
            </details>

            <label className="inline-flex items-center gap-2 text-sm text-ink">
              <input className="h-4 w-4 rounded border-blue-200" name="temperatureControlled" type="checkbox" />
              {copy.fields.temperatureControlled}
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-ink">{copy.fields.notes}</span>
              <textarea className={`min-h-24 ${inputClass}`} name="notes" />
            </label>

            <div className="sticky bottom-0 -mx-6 flex gap-3 border-t border-line bg-card px-6 py-4">
              <button
                className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-contrast shadow-lg shadow-accent/25 transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-70"
                disabled={isPending}
                type="submit"
              >
                {isPending ? copy.saving : copy.save}
              </button>
              <button
                className="rounded-xl border border-line bg-card px-5 py-2.5 text-sm font-semibold text-ink-2 transition hover:bg-surface"
                onClick={() => closeDrawer()}
                type="button"
              >
                {copy.cancel}
              </button>
            </div>
          </form>
        )}
      </Drawer>

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

      {directoryCreateRequest && mounted
        ? createPortal(
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-ink/35 px-4 py-6 backdrop-blur-sm">
          <div
            aria-labelledby="directory-create-title"
            aria-modal="true"
            className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-line bg-card p-6 shadow-2xl shadow-ink/20"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4">
              <h3 className="font-display text-xl font-semibold text-ink" id="directory-create-title">
                {directoryCreateRequest.kind === "organization"
                  ? copy.modal.createOrganizationTitle
                  : copy.modal.createLocationTitle}
              </h3>
              <button
                className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted transition hover:bg-surface"
                disabled={isDirectoryCreateSaving}
                onClick={cancelDirectoryCreate}
                type="button"
              >
                {copy.modal.cancel}
              </button>
            </div>

            <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={handleDirectoryCreateSubmit}>
              {directoryCreateRequest.kind === "organization" ? (
                <>
                  <label className="grid gap-1.5 text-sm">
                    <span className="font-medium text-ink">{copy.modal.fields.legalName}</span>
                    <input className={inputClass} defaultValue={directoryCreateRequest.query} name="legalName" required />
                  </label>

                  <label className="grid gap-1.5 text-sm">
                    <span className="font-medium text-ink">{copy.modal.fields.displayName}</span>
                    <input className={inputClass} defaultValue={directoryCreateRequest.query} name="displayName" />
                  </label>

                  <label className="grid gap-1.5 text-sm">
                    <span className="font-medium text-ink">{copy.modal.fields.organizationType}</span>
                    <select
                      className={inputClass}
                      defaultValue={inferOrganizationType(directoryCreateRequest.fieldName)}
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
                    <span className="font-medium text-ink">{copy.modal.fields.taxId}</span>
                    <input className={inputClass} name="taxId" />
                  </label>

                  <label className="inline-flex items-center gap-2 text-sm text-ink">
                    <input defaultChecked className="h-4 w-4 rounded border-blue-200" name="active" type="checkbox" />
                    {copy.modal.fields.active}
                  </label>
                </>
              ) : (
                <>
                  <label className="grid gap-1.5 text-sm">
                    <span className="font-medium text-ink">{copy.modal.fields.locationName}</span>
                    <input className={inputClass} defaultValue={directoryCreateRequest.query} name="name" required />
                  </label>

                  <label className="grid gap-1.5 text-sm">
                    <span className="font-medium text-ink">{copy.modal.fields.locationType}</span>
                    <select
                      className={inputClass}
                      defaultValue={inferLocationType(directoryCreateRequest.fieldName)}
                      name="locationType"
                      required
                    >
                      {locationTypes.map((type) => (
                        <option key={type} value={type}>
                          {enumLabel(locale, type)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-1.5 text-sm">
                    <span className="font-medium text-ink">{copy.modal.fields.organization}</span>
                    <select className={inputClass} defaultValue="" name="organizationId">
                      <option value="">{copy.noOrg}</option>
                      {organizationOptions.map((organization) => (
                        <option key={organization.id} value={organization.id}>
                          {organization.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-1.5 text-sm">
                    <span className="font-medium text-ink">{copy.modal.fields.address1}</span>
                    <input className={inputClass} name="addressLine1" />
                  </label>

                  <label className="grid gap-1.5 text-sm">
                    <span className="font-medium text-ink">{copy.modal.fields.city}</span>
                    <input className={inputClass} name="city" />
                  </label>

                  <label className="grid gap-1.5 text-sm">
                    <span className="font-medium text-ink">{copy.modal.fields.state}</span>
                    <input className={inputClass} name="state" />
                  </label>

                  <label className="grid gap-1.5 text-sm">
                    <span className="font-medium text-ink">{copy.modal.fields.postalCode}</span>
                    <input className={inputClass} name="postalCode" />
                  </label>

                  <label className="grid gap-1.5 text-sm">
                    <span className="font-medium text-ink">{copy.modal.fields.country}</span>
                    <input className={inputClass} defaultValue="MX" name="country" />
                  </label>
                </>
              )}

              {directoryCreateError ? (
                <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 md:col-span-2">
                  {directoryCreateError}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center gap-3 md:col-span-2">
                <button
                  className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-contrast shadow-lg shadow-accent/25 transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={isDirectoryCreateSaving}
                  type="submit"
                >
                  {isDirectoryCreateSaving ? copy.saving : copy.modal.save}
                </button>
                <button
                  className="rounded-xl border border-line bg-card px-5 py-2.5 text-sm font-semibold text-ink-2 transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={isDirectoryCreateSaving}
                  onClick={cancelDirectoryCreate}
                  type="button"
                >
                  {copy.modal.cancel}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
        )
        : null}
    </div>
  );
}
