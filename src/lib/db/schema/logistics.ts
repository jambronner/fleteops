import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { tenants } from "@/lib/db/schema/platform";
import { timestamps } from "@/lib/db/schema/shared";

export const organizationTypeEnum = pgEnum("organization_type", [
  "broker",
  "shipper",
  "carrier",
  "retailer",
  "vendor",
  "warehouse_operator",
  "other",
]);

export const locationTypeEnum = pgEnum("location_type", [
  "billing",
  "pickup",
  "delivery",
  "warehouse",
  "store",
  "cedis",
  "office",
  "other",
]);

export const shipmentStatusEnum = pgEnum("shipment_status", [
  "draft",
  "planned",
  "in_transit",
  "delivered",
  "delivered_with_exception",
  "cancelled",
]);

export const stopTypeEnum = pgEnum("stop_type", ["pickup", "delivery", "return", "transfer"]);
export const stopStatusEnum = pgEnum("stop_status", [
  "planned",
  "arrived",
  "completed",
  "completed_with_exception",
  "missed",
  "cancelled",
]);

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  legalName: text("legal_name").notNull(),
  displayName: text("display_name"),
  taxId: varchar("tax_id", { length: 64 }),
  organizationType: organizationTypeEnum("organization_type").notNull(),
  active: boolean("active").default(true).notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  ...timestamps,
});

export const locations = pgTable("locations", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  organizationId: uuid("organization_id").references(() => organizations.id),
  name: text("name").notNull(),
  locationType: locationTypeEnum("location_type").notNull(),
  addressLine1: text("address_line_1"),
  addressLine2: text("address_line_2"),
  city: text("city"),
  state: text("state"),
  postalCode: varchar("postal_code", { length: 32 }),
  country: varchar("country", { length: 2 }).default("MX"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  ...timestamps,
});

export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  brand: text("brand"),
  sku: varchar("sku", { length: 128 }),
  externalSku: varchar("external_sku", { length: 128 }),
  description: text("description").notNull(),
  uom: varchar("uom", { length: 32 }),
  casePack: varchar("case_pack", { length: 64 }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  ...timestamps,
});

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    issuerOrgId: uuid("issuer_org_id")
      .notNull()
      .references(() => organizations.id),
    supplierOrgId: uuid("supplier_org_id").references(() => organizations.id),
    shipToLocationId: uuid("ship_to_location_id").references(() => locations.id),
    billToLocationId: uuid("bill_to_location_id").references(() => locations.id),
    poNumber: varchar("po_number", { length: 128 }).notNull(),
    externalPoNumber: varchar("external_po_number", { length: 128 }),
    poDate: date("po_date"),
    requestedDeliveryDate: date("requested_delivery_date"),
    status: varchar("status", { length: 64 }).default("open"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (table) => ({
    poIdx: uniqueIndex("purchase_orders_tenant_issuer_po_idx").on(
      table.tenantId,
      table.issuerOrgId,
      table.poNumber,
    ),
  }),
);

export const purchaseOrderLines = pgTable("purchase_order_lines", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  purchaseOrderId: uuid("purchase_order_id")
    .notNull()
    .references(() => purchaseOrders.id),
  lineNumber: integer("line_number"),
  productId: uuid("product_id").references(() => products.id),
  externalProductCode: varchar("external_product_code", { length: 128 }),
  description: text("description").notNull(),
  qtyOrdered: numeric("qty_ordered", { precision: 14, scale: 3 }),
  uom: varchar("uom", { length: 32 }),
  unitPrice: numeric("unit_price", { precision: 14, scale: 4 }),
  lineTotal: numeric("line_total", { precision: 14, scale: 2 }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  ...timestamps,
});

export const shipments = pgTable(
  "shipments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    brokerOrgId: uuid("broker_org_id").references(() => organizations.id),
    shipperOrgId: uuid("shipper_org_id").references(() => organizations.id),
    carrierOrgId: uuid("carrier_org_id").references(() => organizations.id),
    customerOrgId: uuid("customer_org_id").references(() => organizations.id),
    internalShipmentNumber: varchar("internal_shipment_number", { length: 128 }),
    externalShipmentReference: varchar("external_shipment_reference", { length: 128 }),
    // First-class route identity: the operating day plus the normalized route
    // code (e.g. "ruta 3"). Together they are how operators, client route
    // plans, and carrier invoice lines all refer to one route execution.
    operationDate: date("operation_date"),
    routeCode: varchar("route_code", { length: 64 }),
    pickupDate: date("pickup_date"),
    deliveryDateExpected: date("delivery_date_expected"),
    deliveryDateActual: date("delivery_date_actual"),
    status: shipmentStatusEnum("status").default("draft").notNull(),
    temperatureControlled: boolean("temperature_controlled").default(false).notNull(),
    notes: text("notes"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (table) => ({
    routeIdentityIdx: uniqueIndex("shipments_tenant_operation_day_route_idx")
      .on(table.tenantId, table.operationDate, table.routeCode)
      .where(sql`${table.operationDate} is not null and ${table.routeCode} is not null`),
  }),
);

export const shipmentOrders = pgTable(
  "shipment_orders",
  {
    shipmentId: uuid("shipment_id")
      .notNull()
      .references(() => shipments.id),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id),
    ...timestamps,
  },
  (table) => ({
    pk: primaryKey({ columns: [table.shipmentId, table.purchaseOrderId] }),
  }),
);

export const shipmentStops = pgTable("shipment_stops", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  shipmentId: uuid("shipment_id")
    .notNull()
    .references(() => shipments.id),
  stopType: stopTypeEnum("stop_type").notNull(),
  sequenceNo: integer("sequence_no").notNull(),
  locationId: uuid("location_id").references(() => locations.id),
  status: stopStatusEnum("status").default("planned").notNull(),
  receiverName: text("receiver_name"),
  receiverSignatureText: text("receiver_signature_text"),
  notes: text("notes"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  ...timestamps,
});

export const shipmentLineItems = pgTable("shipment_line_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  shipmentId: uuid("shipment_id")
    .notNull()
    .references(() => shipments.id),
  shipmentStopId: uuid("shipment_stop_id").references(() => shipmentStops.id),
  purchaseOrderLineId: uuid("purchase_order_line_id").references(() => purchaseOrderLines.id),
  productId: uuid("product_id").references(() => products.id),
  qtyExpected: numeric("qty_expected", { precision: 14, scale: 3 }),
  qtyDelivered: numeric("qty_delivered", { precision: 14, scale: 3 }),
  qtyRejected: numeric("qty_rejected", { precision: 14, scale: 3 }),
  conditionStatus: varchar("condition_status", { length: 64 }),
  exceptionReason: text("exception_reason"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  ...timestamps,
});
