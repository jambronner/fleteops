import type { ShipmentPacket, ShipmentDocument } from "@/lib/reconciliation/types";
import { evaluateShipmentPacket } from "@/lib/reconciliation/engine";
export type Locale = "en" | "es-MX";
export type DemoSource = { id: string; label: string; status: "approved" | "unclaimed" | "blocked" };
export type DemoEvent = { id: number; action: "reset" | "imported" | "sourceApproved" | "sourceBlocked" | "intakeHeld" | "suggested" | "evidenceReviewed" | "approved" | "hold"; reference: string };
export type DemoState = { packets: ShipmentPacket[]; sources: DemoSource[]; proposals: string[]; events: DemoEvent[] };
const date = "2026-01-15T12:00:00.000Z";
const doc = (id: string, type: ShipmentDocument["type"]): ShipmentDocument => ({ id, type, title: `Synthetic ${type}`, sourceChannel: "manual", uploadedAt: date, issuingParty: "Demo Freight", extractedFacts: [] });
export function createPacket(reference: string, quantity: number, index: number): ShipmentPacket {
  return { id: `demo-route-${index}`, tenantId: "demo-workspace", shipmentReference: reference, brokerName: "Demo Freight", customerName: "Example Market", shipperName: "Example Produce", destinationName: "Demo Distribution Center", routeLabel: "Demo origin → Demo destination", lifecycle: "delivered", poNumber: `DEMO-PO-${index}`, expectedDeliveryDate: date, expectedQuantity: quantity, deliveredQuantity: quantity, expectedCarrierInvoiceAmount: 1000, carrierInvoiceAmount: 1000, documents: [doc(`demo-invoice-${index}`, "carrier_invoice")], messages: [] };
}
export function initialState(): DemoState {
  const first = createPacket("DEMO-001", 100, 1);
  const second = createPacket("DEMO-002", 80, 2); second.deliveredQuantity = 72; second.documents.push(doc("demo-pod-2", "pod"));
  const third = createPacket("DEMO-003", 60, 3); third.documents.push(doc("demo-pod-3", "pod"));
  return { packets: [first, second, third], sources: [{ id: "demo-dispatch", label: "Demo dispatch", status: "approved" }, { id: "demo-new-source", label: "New demo source", status: "unclaimed" }, { id: "demo-blocked", label: "Blocked demo source", status: "blocked" }], proposals: [], events: [{ id: 1, action: "reset", reference: "Demo Freight" }] };
}
export function canApprove(packet: ShipmentPacket): boolean {
  const result = evaluateShipmentPacket({ ...packet, decision: null }, "en");
  return packet.lifecycle === "delivered" && !result.requirements.some(x => x.status === "missing" || x.status === "rejected") && !result.exceptions.some(x => x.blocking);
}
function log(state: DemoState, action: DemoEvent["action"], reference: string): DemoState {
  return { ...state, events: [{ id: (state.events[0]?.id ?? 0) + 1, action, reference }, ...state.events].slice(0, 100) };
}
export function setSourceStatus(state: DemoState, id: string, status: "approved" | "blocked"): DemoState {
  if (!state.sources.some(s => s.id === id)) return state;
  return log({ ...state, sources: state.sources.map(s => s.id === id ? { ...s, status } : s) }, status === "approved" ? "sourceApproved" : "sourceBlocked", id);
}
export function simulateIntake(state: DemoState, sourceId: string, routeId: string): DemoState {
  const source = state.sources.find(s => s.id === sourceId);
  const route = state.packets.find(p => p.id === routeId);
  if (!source || !route) return state;
  if (source.status !== "approved") return log(state, "intakeHeld", source.id);
  if (state.proposals.includes(routeId)) return state;
  return log({ ...state, proposals: [...state.proposals, routeId] }, "suggested", route.shipmentReference);
}
export function reviewEvidence(state: DemoState, routeId: string): DemoState {
  if (!state.proposals.includes(routeId)) return state;
  const route = state.packets.find(p => p.id === routeId); if (!route) return state;
  // This is a deterministic synthetic receipt, never a real extraction result.
  const packets = state.packets.map(p => p.id === routeId ? { ...p, deliveredQuantity: p.expectedQuantity, decision: null, documents: p.documents.some(d => d.type === "pod") ? p.documents : [...p.documents, doc(`demo-pod-${p.id}`, "pod")] } : p);
  return log({ ...state, packets, proposals: state.proposals.filter(id => id !== routeId) }, "evidenceReviewed", route.shipmentReference);
}
export function decide(state: DemoState, id: string, verdict: "approved" | "hold"): DemoState {
  const packet = state.packets.find(p => p.id === id);
  if (!packet || (verdict === "approved" && !canApprove(packet))) return state;
  return log({ ...state, packets: state.packets.map(p => p.id === id ? { ...p, decision: { verdict, decidedByName: "Demo operator", decidedAt: date } } : p) }, verdict, packet.shipmentReference);
}
export const sampleCsv = "reference,quantity\nDEMO-004,40\nDEMO-005,25\n";
export function importCsv(state: DemoState, text: string): { state: DemoState; error?: "format" | "duplicate" | "limit"; count: number } {
  if (text.length > 20000) return { state, error: "limit", count: 0 };
  const lines = text.trim().split(/\r?\n/);
  if (lines.shift()?.trim() !== "reference,quantity" || lines.length < 1 || lines.length > 25) return { state, error: "format", count: 0 };
  const rows = lines.map(line => line.split(",").map(s => s.trim()));
  if (rows.some(([ref, qty, extra]) => extra !== undefined || !/^DEMO-[A-Z0-9-]{1,24}$/.test(ref ?? "") || !/^\d{1,5}$/.test(qty ?? "") || Number(qty) < 1)) return { state, error: "format", count: 0 };
  const names = rows.map(r => r[0]);
  if (new Set(names).size !== names.length || names.some(n => state.packets.some(p => p.shipmentReference === n))) return { state, error: "duplicate", count: 0 };
  if (state.packets.length + rows.length > 50) return { state, error: "limit", count: 0 };
  const packets = [...state.packets, ...rows.map(([ref, qty], i) => createPacket(ref, Number(qty), state.packets.length + i + 1))];
  return { state: log({ ...state, packets }, "imported", names.join(", ")), count: rows.length };
}
