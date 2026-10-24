"use client";
import { useEffect, useRef, useState } from "react";
import { dictionaries } from "@/lib/demo/dictionaries";
import { initialState, canApprove, importCsv, sampleCsv, setSourceStatus, simulateIntake, reviewEvidence, decide, type Locale, type DemoEvent } from "@/lib/demo/model";
import { evaluateShipmentPacket } from "@/lib/reconciliation/engine";
import type { ShipmentPacket } from "@/lib/reconciliation/types";
import { FleteOpsMark } from "./fleteops-mark";
import s from "./workspace.module.css";

export default function DemoWorkspace() {
  const [locale, setLocale] = useState<Locale>("en");
  const [state, setState] = useState(initialState);
  const [tab, setTab] = useState<"routes" | "sources" | "activity">("routes");
  const [selected, setSelected] = useState("demo-route-1");
  const [sourceId, setSourceId] = useState("demo-dispatch");
  const [csv, setCsv] = useState(sampleCsv);
  const [error, setError] = useState<"format" | "duplicate" | "limit" | null>(null);
  const [notice, setNotice] = useState("");
  const [mobileDetail, setMobileDetail] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const about = useRef<HTMLDialogElement>(null);
  const t = dictionaries[locale];
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  const packet = state.packets.find(p => p.id === selected) ?? state.packets[0];
  const evaluation = evaluateShipmentPacket(packet, locale);
  const status = (p: ShipmentPacket) => p.decision?.verdict === "approved" ? "approved" : p.decision?.verdict === "hold" ? "hold" : p.deliveredQuantity !== p.expectedQuantity ? "mismatch" : !canApprove(p) ? "missing" : "review";
  const badge = (kind: string) => `${s.badge} ${kind === "approved" || kind === "matched" ? s.good : kind === "blocked" || kind === "mismatch" || kind === "rejected" ? s.bad : s.neutral}`;
  const eventText = (e: DemoEvent) => ({ reset: t.resetEvent, imported: t.imported, sourceApproved: t.sourceApproved, sourceBlocked: t.sourceBlocked, intakeHeld: t.intakeHeld, suggested: t.suggested, evidenceReviewed: t.evidenceReviewed, approved: t.approvedEvent, hold: t.holdEvent })[e.action];
  const sourceName = (id: string) => t.sourceNames[state.sources.findIndex(x => x.id === id)] ?? id;
  const requirementNames = { purchase_order: t.po, delivery_proof: t.pod, carrier_invoice: t.invoice, quantity_match: t.qty, folio_return: t.folio };
  function reset() { if (window.confirm(t.resetConfirm)) { setState(initialState()); setSelected("demo-route-1"); setTab("routes"); setNotice(t.resetEvent); setMobileDetail(false); } }
  return <div className={s.shell}>
    <aside className={s.sidebar}>
      <a className={s.brand} href="/demo" aria-label="FleteOps"><FleteOpsMark className={s.mark} />FleteOps</a>
      <span className={s.demoTag}>{t.demo}</span>
      <nav aria-label={t.title} className={s.nav}>{(["routes", "sources", "activity"] as const).map((name, i) => <button key={name} aria-current={tab === name ? "page" : undefined} onClick={() => {setTab(name); setMobileDetail(false);}}><span aria-hidden="true">{["▤", "◎", "↗"][i]}</span>{t[name]}</button>)}</nav>
      <div className={s.sideBottom}><p>{t.origin}</p><button onClick={() => about.current?.showModal()}>{t.about} ↗</button></div>
    </aside>
    <main className={s.main}>
      <header className={s.header}><div><span className={s.eyebrow}>DEMO FREIGHT</span><h1>{tab === "routes" ? t.title : t[tab]}</h1></div><div className={s.actions}><label className={s.srOnly} htmlFor="locale">{t.language}</label><select id="locale" value={locale} onChange={e => {setLocale(e.target.value as Locale); setNotice("");}}><option value="en">English</option><option value="es-MX">Español</option></select><button onClick={reset}>{t.reset}</button>{tab === "routes" && <button className={s.primary} onClick={() => {setError(null); dialog.current?.showModal();}}>{t.import} +</button>}</div></header>
      <div className={s.safety}>{t.synthetic}<span role="status" aria-live="polite">{notice}</span></div>
      <section className={s.metrics} aria-label={t.status}>{[[t.routeCount,state.packets.length],[t.readyCount,state.packets.filter(p => canApprove(p) && !p.decision).length],[t.gapCount,state.packets.filter(p => !canApprove(p)).length],[t.approvedCount,state.packets.filter(p => p.decision?.verdict === "approved").length]].map(([label,value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</section>
      {tab === "routes" && <div className={`${s.workbench} ${mobileDetail ? s.showDetail : ""}`}>
        <section className={s.listPanel} aria-label={t.routes}><div className={s.panelHead}><h2>{t.routes}</h2><span>{state.packets.length.toString().padStart(2,"0")}</span></div><div className={s.routeList}>{state.packets.map(p => <button className={`${s.routeRow} ${p.id === packet.id ? s.selected : ""}`} key={p.id} aria-pressed={p.id === packet.id} onClick={() => {setSelected(p.id);setMobileDetail(true);}}><span className={s.routeIcon} aria-hidden="true">↗</span><span><strong>{p.shipmentReference}</strong><small>{t.quantity}: {p.expectedQuantity}</small></span><span className={badge(status(p))}>{t[status(p)]}</span></button>)}</div></section>
        <section className={s.detailPanel} aria-label={t.details}><div className={s.detailHead}><button className={s.mobileBack} onClick={() => setMobileDetail(false)}>← {t.return}</button><span className={s.eyebrow}>{t.details}</span><div className={s.detailTitle}><h2>{packet.shipmentReference}</h2><span className={badge(status(packet))}>{t[status(packet)]}</span></div><div className={s.quantity}><div><span>{t.expected}</span><strong>{packet.expectedQuantity}</strong></div><span aria-hidden="true">→</span><div><span>{t.delivered}</span><strong>{packet.deliveredQuantity ?? "—"}</strong></div></div></div>
          <div className={s.detailScroll}><h3>{t.requirements}</h3><ul className={s.requirements}>{evaluation.requirements.map(r => <li key={r.code}><span>{requirementNames[r.code]}</span><span className={badge(r.status)}>{r.status === "missing" ? t.missing : t[r.status]}</span></li>)}</ul>
            <div className={s.intake}><label htmlFor="source">{t.sourceLabel}</label><div><select id="source" value={sourceId} onChange={e => setSourceId(e.target.value)}>{state.sources.map(source => <option key={source.id} value={source.id}>{sourceName(source.id)}</option>)}</select><button onClick={() => {setState(old => simulateIntake(old,sourceId,packet.id));setNotice(state.sources.find(x => x.id === sourceId)?.status === "approved" ? t.suggested : t.intakeHeld);}}>{t.simulate}</button></div></div>
            {state.proposals.includes(packet.id) && <div className={s.proposal}><h3>{t.draft}</h3><p>{t.draftHelp}</p><button className={s.primary} onClick={() => {setState(old => reviewEvidence(old,packet.id));setNotice(t.received);}}>{t.accept}</button></div>}
          </div><footer className={s.decision}><p>{canApprove(packet) ? t.noPayment : t.approveHelp}</p><div><button onClick={() => {setState(old => decide(old,packet.id,"hold"));setNotice(t.holdEvent);}}>{t.holdAction}</button><button className={s.primary} disabled={!canApprove(packet)} onClick={() => {setState(old => decide(old,packet.id,"approved"));setNotice(t.approvedEvent);}}>{t.approve}</button></div></footer>
        </section>
      </div>}
      {tab === "sources" && <section className={s.fullPanel}><div className={s.panelHead}><h2>{t.sources}</h2></div><p className={s.panelIntro}>{t.sourceHelp}</p>{state.sources.map(source => <div className={s.sourceRow} key={source.id}><div><h3>{sourceName(source.id)}</h3><span className={badge(source.status)}>{source.status === "approved" ? t.approvedSource : t[source.status]}</span></div><div className={s.actions}><button disabled={source.status === "approved"} onClick={() => setState(old => setSourceStatus(old,source.id,"approved"))}>{t.approveSource}</button><button disabled={source.status === "blocked"} onClick={() => setState(old => setSourceStatus(old,source.id,"blocked"))}>{t.blockSource}</button></div></div>)}</section>}
      {tab === "activity" && <section className={s.fullPanel}><div className={s.panelHead}><h2>{t.audit}</h2></div><ol className={s.events}>{state.events.map(e => <li key={e.id}><span>{String(e.id).padStart(2,"0")}</span><div><strong>{eventText(e)}</strong><small>{e.reference.startsWith("demo-") ? sourceName(e.reference) : e.reference}</small></div></li>)}</ol></section>}
    </main>
    <dialog className={s.dialog} ref={dialog}><form onSubmit={e => {e.preventDefault();const result=importCsv(state,csv);if(result.error){setError(result.error);return;}setState(result.state);setNotice(`${t.imported}: ${result.count}`);dialog.current?.close();}}><div className={s.panelHead}><h2>{t.import}</h2><button type="button" aria-label={t.close} onClick={() => dialog.current?.close()}>×</button></div><p>{t.importHelp}</p><label htmlFor="csv">{t.csv}</label><textarea id="csv" spellCheck={false} value={csv} onChange={e => setCsv(e.target.value)} maxLength={20000}/>{error && <p className={s.error} role="alert">{t[error]}</p>}<div className={s.actions}><button type="button" onClick={() => {setCsv(sampleCsv);setError(null);}}>{t.sample}</button><button className={s.primary}>{t.confirmImport}</button></div></form></dialog>
    <dialog className={s.dialog} ref={about}><div className={s.panelHead}><h2>{t.about}</h2><button aria-label={t.close} onClick={() => about.current?.close()}>×</button></div><p>{t.aboutText}</p><button onClick={() => about.current?.close()}>{t.close}</button></dialog>
  </div>;
}
