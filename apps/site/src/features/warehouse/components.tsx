'use client';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { AlertTriangle, Boxes, Clock, Forklift, PackageCheck, Thermometer, Truck as TruckIcon, Warehouse, Wrench, Zap } from 'lucide-react';
import { StatusBadge, type MetricAction } from '@opsorama/react/ui';
import type { VisualState } from '@opsorama/core';
import { HUD_STATE_TONE, HudDockStatus, HudObjectLabel, type HudMetric } from '../example-hud';
import type { HudThumbnailModel } from '../hud-thumbnails';
import { VEHICLE_ASSET } from './scene';
import {
  AISLES, BAY_POSITIONS, DOCKS, LANE_CAPACITY, RULES, alertArea, aisleOf, aisleUsage, areaOf, areaState, bayCount, chilledState, deliveryLate, deliveryOf, deliveryStatus, dockOf, dockState,
  issueAt, loadAtRisk, loadDock, loadMinutesLeft, loadOf, loadStatus, loadWorkLeft, locationCode, stagedPallets, truckAt, truckFor, warehouseAlerts, warehouseMetrics, yardDwell,
  type AisleId, type AreaId, type DockId, type DockStatus, type Side, type Vehicle, type WarehouseSnapshot,
} from './model';

const STATE_TONE: Readonly<Record<VisualState, string>> = { normal: '#38a88a', busy: '#5088ec', warning: '#dca644', critical: '#df6470', inactive: '#91a0b5' };
const STATE_LABEL: Readonly<Record<VisualState, string>> = { normal: 'OK', busy: 'Working', warning: 'Needs attention', critical: 'Act now', inactive: 'Not staffed' };

export function StateBadge({ state, label }: { state: VisualState; label?: string }) {
  return <StatusBadge tone={HUD_STATE_TONE[state]} label={label ?? STATE_LABEL[state]} className="wh-status" />;
}
const pct = (value: number, total: number) => total ? Math.round(value / total * 100) : 0;
function Progress({ value, total, label }: { value: number; total: number; label: string }) {
  return <span className="wh-progress"><meter min={0} max={Math.max(1, total)} value={Math.min(value, total)} aria-label={label} /><span>{value}/{total}</span></span>;
}

export type WarehouseMetricId = 'docks' | 'putaway' | 'loads' | 'storage';
/** Four short panels for the top of the floating HUD. The viewport supplies the detail each one opens. */
export function warehouseHudMetrics(snapshot: WarehouseSnapshot, actions: Readonly<Record<WarehouseMetricId, MetricAction>>): readonly HudMetric[] {
  const m = warehouseMetrics(snapshot);
  return [
    { id: 'docks', title: 'Dock doors in use', value: m.occupied, tone: m.late ? 'warning' : 'info', visual: { kind: 'capacity', max: m.doors }, comparison: `${m.waiting} waiting in the yard${m.late ? ` · ${m.late} late` : ''}`, action: actions.docks, icon: <TruckIcon size={16} /> },
    { id: 'putaway', title: 'Putaway backlog', value: m.backlog, unit: 'pallets', tone: m.backlog > RULES.putawayBacklog ? 'warning' : 'success', comparison: `${m.received} of ${m.expected} ASN pallets received`, action: actions.putaway, icon: <Boxes size={16} /> },
    { id: 'loads', title: 'Loads at risk', value: m.atRisk, tone: m.atRisk ? 'critical' : 'success', comparison: `${m.loaded} of ${m.loads} loads loaded${m.shorts ? ` · ${m.shorts} short picks` : ''}`, action: actions.loads, icon: <PackageCheck size={16} /> },
    { id: 'storage', title: 'Rack utilisation', value: m.utilisation, unit: '%', tone: m.blocked ? 'critical' : m.utilisation > 90 ? 'warning' : 'info', visual: { kind: 'capacity', max: 100 }, comparison: `${m.blocked ? `${m.blocked} bay blocked · ` : ''}${m.replenish} pick faces to replenish`, action: actions.storage, icon: <Warehouse size={16} /> },
  ];
}

/* ── Panels ─────────────────────────────────────────────────────────────── */

const dockThumbnail = (status: DockStatus) => status === 'loading' || status === 'unloading' ? 'loading-dock-open' : 'loading-dock';
export function DockTable({ snapshot, onSelect }: { snapshot: WarehouseSnapshot; onSelect: (node: string) => void }) {
  const yard = snapshot.trucks.filter(value => value.stall !== undefined);
  return <>
    <div className="hud-table wh-table-wrap"><table><thead><tr><th>Door</th><th>Status</th><th>Truck</th><th>Delivery or load</th><th>Pallets</th><th>Lane</th></tr></thead><tbody>{DOCKS.map(value => {
      const state = dockState(snapshot, value.id), truck = truckAt(snapshot, value.id), delivery = deliveryOf(snapshot, state.ref), load = loadOf(snapshot, state.ref);
      const risk = load && loadAtRisk(snapshot, load), late = delivery && deliveryLate(snapshot, delivery);
      return <tr key={value.id} data-side={value.side} data-alert={risk || state.status === 'out-of-service' || late ? true : undefined}>
        <td><button onClick={() => onSelect(`dock:${value.id}`)} aria-label={`Inspect door ${value.id}`}><HudObjectLabel model={dockThumbnail(state.status)}>{value.id}</HudObjectLabel></button></td>
        <td><HudDockStatus status={state.status} /></td>
        <td>{truck ? <button className="wh-link" onClick={() => onSelect(`truck:${truck.id}`)}><HudObjectLabel model="truck">{truck.id}</HudObjectLabel></button> : '—'}</td>
        <td className="wh-dock-reference">{delivery ? `${delivery.id} · ${delivery.supplier}` : load ? `${load.id} · ${load.route}` : '—'}</td>
        <td>{delivery ? <Progress value={delivery.received} total={delivery.pallets} label={`${delivery.id} received`} /> : load ? <Progress value={load.loaded} total={load.pallets} label={`${load.id} loaded`} /> : '—'}</td>
        <td>{stagedPallets(snapshot, value.id) || '—'}</td>
      </tr>;
    })}</tbody></table></div>
    <h3 className="wh-subhead">Yard · {yard.length} truck{yard.length === 1 ? '' : 's'} in the stalls</h3>
    {yard.length ? <ol className="wh-list" aria-label="Yard queue">{yard.map(truck => {
      const dwell = yardDwell(snapshot, truck), delivery = deliveryOf(snapshot, truck.ref), late = delivery ? deliveryLate(snapshot, delivery) : 0;
      return <li key={truck.id} data-alert={dwell > RULES.yardDwellMinutes || late ? true : undefined}><button onClick={() => onSelect(`truck:${truck.id}`)}><HudObjectLabel model="truck"><strong>{truck.id} · stall {truck.stall! + 1}</strong><span>{truck.carrier} · {truck.ref} · {truck.dropped ? 'dropped trailer' : `arrived ${truck.arrived}`}</span></HudObjectLabel></button>
        <StatusBadge label={truck.dropped ? 'Parked' : late ? `${late} min late` : `${dwell} min`} tone={truck.dropped ? 'neutral' : late || dwell > RULES.yardDwellMinutes ? 'warning' : 'info'} icon={truck.dropped ? <TruckIcon /> : <Clock />} /></li>;
    })}</ol> : <p className="wh-quiet">No trucks waiting.</p>}
  </>;
}

export function StorageChips({ snapshot, onSelect }: { snapshot: WarehouseSnapshot; onSelect: (node: string) => void }) {
  return <>
    <nav className="wh-aisles" aria-label="Aisles">{AISLES.map(value => {
      const usage = aisleUsage(snapshot, value.id), share = pct(usage.used, usage.capacity), issues = snapshot.issues.filter(item => item.aisle === value.id);
      const state: VisualState = issues.some(item => item.kind === 'damaged') ? 'critical' : issues.length ? 'warning' : 'normal';
      return <button key={value.id} data-chilled={value.zone === 'chilled' || undefined} aria-label={`Inspect ${value.label}: ${share} % used, ${issues.length} open issues`} style={{ borderTopColor: STATE_TONE[state] }} onClick={() => onSelect(`aisle:${value.id}`)}>
        <HudObjectLabel model="pallet-rack"><strong>{value.id}</strong></HudObjectLabel><span>{usage.used}/{usage.capacity} pallets</span><meter min={0} max={100} high={90} optimum={70} value={share} aria-hidden="true" /><small>{share} %{issues.length ? ` · ${issues.length} issue${issues.length === 1 ? '' : 's'}` : ''}</small>
      </button>;
    })}</nav>
    <h3 className="wh-subhead">Location issues</h3>
    {snapshot.issues.length ? <ol className="wh-list" aria-label="Location issues">{snapshot.issues.map(value => {
      const code = locationCode(value.aisle, value.bay, value.side);
      return <li key={code} data-alert={value.kind === 'damaged' || undefined}><button onClick={() => onSelect(`rack:${value.aisle}:${value.bay}:${value.side}`)}><HudObjectLabel model="pallet-rack"><strong>{code} · {ISSUE_LABEL[value.kind]}</strong><span>{value.note}</span></HudObjectLabel></button></li>;
    })}</ol> : <p className="wh-quiet">No open location issues.</p>}
  </>;
}
const ISSUE_LABEL = { damaged: 'Rack damage', count: 'Count difference', replenish: 'Replenish pick face' } as const;

export function LoadTable({ snapshot, onSelect }: { snapshot: WarehouseSnapshot; onSelect: (node: string) => void }) {
  const lines = snapshot.picking, hours = lines.perHour;
  return <>
    <div className="wh-picking"><div><span>Lines picked</span><strong>{lines.linesPicked.toLocaleString('en')} / {lines.linesPlanned.toLocaleString('en')}</strong></div><div><span>Last hour</span><strong>{hours.at(-1)} lines</strong></div><div><span>Progress</span><strong>{pct(lines.linesPicked, lines.linesPlanned)} %</strong></div></div>
    <div className="hud-table wh-table-wrap"><table><thead><tr><th>Load</th><th>Route</th><th>Door</th><th>Departs</th><th>Picked</th><th>Loaded</th><th>Status</th></tr></thead><tbody>{snapshot.loads.map(load => {
      const dockId = loadDock(snapshot, load.id), risk = loadAtRisk(snapshot, load), truck = truckFor(snapshot, load.id);
      const node = dockId ? `dock:${dockId}` : truck ? `truck:${truck.id}` : 'pin:outbound';
      return <tr key={load.id} data-alert={risk || undefined}>
        <td><button onClick={() => onSelect(node)} aria-label={`Show ${load.id} in the scene`}><HudObjectLabel model={truck ? 'truck' : 'pallet'}>{load.id}</HudObjectLabel></button></td><td>{load.route}</td><td>{dockId ?? '—'}</td><td>{load.departure}</td>
        <td><Progress value={load.picked} total={load.pallets} label={`${load.id} picked`} /></td><td><Progress value={load.loaded} total={load.pallets} label={`${load.id} loaded`} /></td>
        <td><StateBadge state={risk ? 'critical' : loadStatus(snapshot, load) === 'Loaded' ? 'normal' : 'busy'} label={risk ? 'At risk' : loadStatus(snapshot, load)} /></td>
      </tr>;
    })}</tbody></table></div>
    <p className="wh-quiet">At risk: estimated work left ({RULES.loadMinutesPerPallet} min to load and {RULES.pickMinutesPerPallet} min to pick per pallet) exceeds the time to departure.</p>
  </>;
}

const VEHICLE_LABEL: Readonly<Record<Vehicle['kind'], string>> = { forklift: 'Forklift', 'reach-truck': 'Reach truck', amr: 'Mobile robot' };
const vehicleState = (value: Vehicle): VisualState => value.status === 'fault' ? 'critical' : value.status === 'working' && value.battery < RULES.lowBattery ? 'warning' : value.status === 'working' ? 'busy' : value.status === 'charging' ? 'normal' : 'inactive';
export function FleetList({ snapshot, onSelect }: { snapshot: WarehouseSnapshot; onSelect: (node: string) => void }) {
  return <ol className="wh-fleet" aria-label="Fleet">{snapshot.fleet.map(value => <li key={value.id} data-alert={vehicleState(value) === 'critical' || vehicleState(value) === 'warning' || undefined}>
    <button onClick={() => onSelect(`mhe:${value.id}`)} aria-label={`Inspect ${value.id}`}><HudObjectLabel model={VEHICLE_ASSET[value.kind]}><strong>{value.id}</strong><span>{VEHICLE_LABEL[value.kind]} · {value.aisle ?? areaOf(value.area).short}{value.operator ? ` · ${value.operator}` : ''}</span></HudObjectLabel></button>
    <span className="wh-battery"><meter min={0} max={100} low={RULES.lowBattery} high={60} optimum={100} value={value.battery} aria-label={`${value.id} battery`} /><small>{value.battery} %</small></span>
    <StateBadge state={vehicleState(value)} label={value.status} />
  </li>)}</ol>;
}

const ALERT_ICON = { clock: Clock, thermometer: Thermometer, wrench: Wrench, package: PackageCheck, alert: AlertTriangle, zap: Zap } as const;
const EVENT_MODELS: Readonly<Partial<Record<string, HudThumbnailModel>>> = { area: 'map-pin', pin: 'map-pin', aisle: 'pallet-rack', rack: 'pallet-rack', chilled: 'led-display', truck: 'truck' };
function eventModel(snapshot: WarehouseSnapshot, node: string): HudThumbnailModel {
  const [kind, id] = node.split(':');
  const vehicle = kind === 'mhe' ? snapshot.fleet.find(item => item.id === id) : undefined;
  if (vehicle) return VEHICLE_ASSET[vehicle.kind];
  const dock = kind === 'dock' ? snapshot.docks.find(item => item.id === id) : undefined;
  if (dock) return dockThumbnail(dock.status);
  return EVENT_MODELS[kind] ?? 'map-pin';
}
export function AlertList({ snapshot, onSelect }: { snapshot: WarehouseSnapshot; onSelect: (node: string) => void }) {
  const alerts = warehouseAlerts(snapshot);
  return <>
    {alerts.length ? <nav className="wh-alerts" aria-label="Alerts">{alerts.map(alert => { const Icon = ALERT_ICON[alert.icon]; return <button key={alert.id} data-severity={alert.severity} onClick={() => onSelect(alert.node)}><HudObjectLabel model={eventModel(snapshot, alert.node)}><strong>{alert.title}</strong><small>{alert.detail}</small></HudObjectLabel><StatusBadge label={alert.severity === 'critical' ? 'Critical' : 'Warning'} tone={alert.severity} icon={<Icon />} /></button>; })}</nav>
      : <p className="wh-quiet">No exceptions in this snapshot.</p>}
    <h3 className="wh-subhead">Recent events</h3>
    <ol className="wh-events" aria-label="Recent events">{snapshot.events.map(event => <li key={`${event.time}${event.text}`} data-tone={event.tone}><button onClick={() => onSelect(event.node)}><time>{event.time}</time><HudObjectLabel model={eventModel(snapshot, event.node)}>{event.text}</HudObjectLabel></button></li>)}</ol>
  </>;
}

/* ── Inspectors ─────────────────────────────────────────────────────────── */

function Inspector({ label, eyebrow, title, state, stateLabel, badge, children }: { label: string; eyebrow: string; title: string; state?: VisualState; stateLabel?: string; badge?: ReactNode; children: ReactNode }) {
  return <aside className="wh-inspector" aria-label={label}><div className="wh-eyebrow">{eyebrow}</div><h2>{title}</h2>{badge ?? (state && <StateBadge state={state} label={stateLabel} />)}{children}</aside>;
}
const Note = ({ children }: { children: ReactNode }) => <div className="wh-host-note">{children}</div>;

export function AreaInspector({ snapshot, id }: { snapshot: WarehouseSnapshot; id: AreaId }) {
  if (id === 'chilled') return <ChilledInspector snapshot={snapshot} />;
  const area = areaOf(id), state = areaState(snapshot, id), alerts = warehouseAlerts(snapshot).filter(alert => alertArea(snapshot, alert) === id);
  const fleet = snapshot.fleet.filter(value => value.area === id);
  return <Inspector label="Area inspector" eyebrow="AREA" title={area.label} state={state}>
    <p>{area.purpose}</p>
    <dl><dt>Crew</dt><dd>{snapshot.crew[id] ?? 0}</dd><dt>Vehicles here</dt><dd>{fleet.length ? fleet.map(value => value.id).join(', ') : '—'}</dd>
      {id === 'returns' && <><dt>Totes to inspect</dt><dd>{snapshot.returns.awaiting}</dd><dt>In quarantine</dt><dd>{snapshot.returns.held}</dd></>}
      {id === 'inbound' && <><dt>Putaway backlog</dt><dd>{warehouseMetrics(snapshot).backlog} pallets</dd><dt>Doors</dt><dd>D01–D08</dd></>}
      {id === 'outbound' && <><dt>Loads open</dt><dd>{warehouseMetrics(snapshot).open}</dd><dt>Doors</dt><dd>D09–D16</dd></>}
      {id === 'each-pick' && <><dt>Lines picked</dt><dd>{snapshot.picking.linesPicked.toLocaleString('en')}</dd><dt>Short picks</dt><dd>{snapshot.loads.reduce((sum, value) => sum + value.shorts, 0)}</dd></>}
      {id === 'reserve' && <><dt>Pallet positions</dt><dd>{AISLES.filter(value => value.zone === 'reserve').reduce((sum, value) => sum + aisleUsage(snapshot, value.id).capacity, 0)}</dd><dt>Replenishments</dt><dd>{snapshot.issues.filter(value => value.kind === 'replenish').length}</dd></>}
    </dl>
    {alerts.map(alert => <div key={alert.id} className="wh-card" data-severity={alert.severity}><strong>{alert.title}</strong><small>{alert.detail}</small></div>)}
    <Note>The pin takes the most severe state of the alerts in this area. Zones are drawn on the hall floor; a grey pin means nobody is rostered there.</Note>
  </Inspector>;
}

export function ChilledInspector({ snapshot }: { snapshot: WarehouseSnapshot }) {
  const value = snapshot.chilled, state = chilledState(snapshot);
  return <Inspector label="Chilled chamber inspector" eyebrow="AREA / MOCK TEMPERATURE PROBE" title="Chilled chamber" state={state} stateLabel={`${value.temperature.toFixed(1)} °C`}>
    <dl><dt>Setpoint</dt><dd>{value.setpoint} °C</dd><dt>Warning from</dt><dd>{RULES.chilledWarning} °C</dd><dt>Alarm from</dt><dd>{RULES.chilledCritical} °C</dd><dt>Door</dt><dd>{value.doorOpenMinutes ? `Open ${value.doorOpenMinutes} min` : 'Closed'}</dd>
      <dt>C01 / C02 used</dt><dd>{(['C01', 'C02'] as const).map(id => `${pct(aisleUsage(snapshot, id).used, aisleUsage(snapshot, id).capacity)} %`).join(' / ')}</dd><dt>Crew</dt><dd>{snapshot.crew.chilled ?? 0}</dd></dl>
    <p>{state === 'critical' ? 'Close the door and move incoming chilled pallets into the chamber; check product temperature if the alarm lasts more than 30 minutes.' : state === 'warning' ? 'Temperature is rising: check the door and the strip curtain.' : 'Within range.'}</p>
    <Note>The display at the door shows the host reading; the beacon beside it takes the same state. The model does not measure anything.</Note>
  </Inspector>;
}

export function DockInspector({ snapshot, id }: { snapshot: WarehouseSnapshot; id: DockId }) {
  const value = dockOf(id), state = dockState(snapshot, id), truck = truckAt(snapshot, id), delivery = deliveryOf(snapshot, state.ref), load = loadOf(snapshot, state.ref);
  const risk = load && loadAtRisk(snapshot, load);
  return <Inspector label="Dock inspector" eyebrow={`DOCK DOOR / ${value.side.toUpperCase()}`} title={`Door ${id}`} badge={risk ? <StateBadge state="critical" label="Load at risk" /> : <HudDockStatus status={state.status} />}>
    <dl><dt>Truck</dt><dd>{truck ? `${truck.id} · ${truck.carrier}` : '—'}</dd><dt>Lane</dt><dd>{stagedPallets(snapshot, id)} pallets</dd>
      {delivery && <><dt>ASN</dt><dd>{delivery.id}</dd><dt>Supplier</dt><dd>{delivery.supplier}</dd><dt>Slot</dt><dd>{delivery.appointment}{deliveryLate(snapshot, delivery) ? ` · ${deliveryLate(snapshot, delivery)} min late` : ''}</dd><dt>Received</dt><dd>{delivery.received} of {delivery.pallets}</dd>{(delivery.chilled || delivery.hazardous) && <><dt>Handling</dt><dd>{delivery.chilled ? 'Chilled' : 'Hazardous goods'}</dd></>}</>}
      {load && <><dt>Load</dt><dd>{load.id}</dd><dt>Route</dt><dd>{load.route} · {load.stops} stop{load.stops === 1 ? '' : 's'}</dd><dt>Departure</dt><dd>{load.departure} ({loadMinutesLeft(snapshot, load)} min)</dd><dt>Picked / loaded</dt><dd>{load.picked} / {load.loaded} of {load.pallets}</dd><dt>Work left</dt><dd>{Math.round(loadWorkLeft(load))} min</dd><dt>Short picks</dt><dd>{load.shorts}</dd></>}
    </dl>
    {state.note && <p>{state.note}</p>}
    <Note>Each lane shows up to {LANE_CAPACITY} pallets; the panels keep the exact count. The shutter is open while a truck is unloaded or loaded.</Note>
  </Inspector>;
}

export function TruckInspector({ snapshot, id }: { snapshot: WarehouseSnapshot; id: string }) {
  const truck = snapshot.trucks.find(value => value.id === id);
  if (!truck) return <Inspector label="Truck inspector" eyebrow="YARD / MOVING" title="Truck on the yard road" state="busy" stateLabel="Driving"><p>A decorative truck circling the yard: it enters through the in-gate, passes the docks and leaves through the out-gate. It is not a record.</p></Inspector>;
  const delivery = deliveryOf(snapshot, truck.ref), load = loadOf(snapshot, truck.ref), dwell = yardDwell(snapshot, truck), late = delivery ? deliveryLate(snapshot, delivery) : 0;
  return <Inspector label="Truck inspector" eyebrow={`TRUCK / ${truck.purpose.toUpperCase()}`} title={truck.id} state={late || dwell > RULES.yardDwellMinutes ? 'warning' : truck.dock ? 'busy' : 'normal'} stateLabel={truck.dock ? `At door ${truck.dock}` : truck.dropped ? 'Dropped trailer' : `Stall ${truck.stall! + 1}`}>
    <dl><dt>Carrier</dt><dd>{truck.carrier}</dd><dt>Arrived</dt><dd>{truck.arrived}</dd><dt>Reference</dt><dd>{truck.ref}</dd>{truck.stall !== undefined && !truck.dropped && <><dt>Waiting</dt><dd>{dwell} min</dd></>}
      {delivery && <><dt>Slot</dt><dd>{delivery.appointment}{late ? ` · ${late} min late` : ''}</dd><dt>Status</dt><dd>{deliveryStatus(snapshot, delivery)}</dd><dt>Pallets</dt><dd>{delivery.pallets}</dd></>}
      {load && <><dt>Route</dt><dd>{load.route}</dd><dt>Departure</dt><dd>{load.departure}</dd></>}
    </dl>
    <Note>Check-in times come from the gatehouse; the yard limit is {RULES.yardDwellMinutes} min and the grace period {RULES.graceMinutes} min. Cab and side colour show the carrier.</Note>
  </Inspector>;
}

export function AisleInspector({ snapshot, id }: { snapshot: WarehouseSnapshot; id: AisleId }) {
  const aisle = aisleOf(id), usage = aisleUsage(snapshot, id), issues = snapshot.issues.filter(value => value.aisle === id), trucks = snapshot.fleet.filter(value => value.aisle === id && value.status === 'working');
  return <Inspector label="Aisle inspector" eyebrow={`${aisle.zone === 'chilled' ? 'CHILLED' : 'RESERVE'} AISLE / ${aisle.bays} BAYS PER SIDE`} title={aisle.label} state={issues.some(value => value.kind === 'damaged') ? 'critical' : issues.length ? 'warning' : 'normal'}>
    <dl><dt>Pallets</dt><dd>{usage.used} of {usage.capacity}</dd><dt>Used</dt><dd>{pct(usage.used, usage.capacity)} %</dd><dt>Reach truck</dt><dd>{trucks.map(value => value.id).join(', ') || '—'}</dd><dt>Issues</dt><dd>{issues.length}</dd></dl>
    <div className="wh-bays" role="img" aria-label={`Pallets per bay in ${id}`}>{(['L', 'R'] as const).map(side => <div key={side}><span>{side}</span>{Array.from({ length: aisle.bays }, (_, bay) => {
      const count = bayCount(snapshot, id, bay, side), issue = issueAt(snapshot, id, bay, side);
      return <i key={bay} title={`${locationCode(id, bay, side)}: ${count}/${BAY_POSITIONS}`} data-issue={issue?.kind} style={{ '--fill': count / BAY_POSITIONS } as CSSProperties} />;
    })}</div>)}</div>
    {issues.map(value => <div key={locationCode(value.aisle, value.bay, value.side)} className="wh-card" data-severity={value.kind === 'damaged' ? 'critical' : 'warning'}><strong>{locationCode(value.aisle, value.bay, value.side)} · {ISSUE_LABEL[value.kind]}</strong><small>{value.note}</small></div>)}
    <Note>Bay 01 is nearest the cross aisle and holds the fastest movers. Every rack bay in the scene draws its exact pallet count (0–6).</Note>
  </Inspector>;
}

export function LocationInspector({ snapshot, aisle, bay, side }: { snapshot: WarehouseSnapshot; aisle: AisleId; bay: number; side: Side }) {
  const issue = issueAt(snapshot, aisle, bay, side), count = bayCount(snapshot, aisle, bay, side), code = locationCode(aisle, bay, side);
  return <Inspector label="Location inspector" eyebrow={`RACK BAY / ${aisleOf(aisle).label.toUpperCase()}`} title={code} state={issue ? issue.kind === 'damaged' ? 'critical' : 'warning' : 'normal'} stateLabel={issue ? ISSUE_LABEL[issue.kind] : undefined}>
    <dl><dt>Pallets</dt><dd>{count} of {BAY_POSITIONS}</dd><dt>Pick face (level 0)</dt><dd>{issue?.kind === 'replenish' ? 'Below minimum' : count ? 'Stocked' : 'Empty'}</dd><dt>Reserve (levels 1–2)</dt><dd>{Math.max(0, count - 2)} pallets</dd><dt>Slotting</dt><dd>{bay < 3 ? 'A movers' : bay < 7 ? 'B movers' : 'C movers'}</dd></dl>
    {issue && <p>{issue.note}</p>}
    <Note>Location codes read aisle, bay and side. A blocked bay is drawn empty with an alert marker until it is signed off.</Note>
  </Inspector>;
}

export function VehicleInspector({ snapshot, id }: { snapshot: WarehouseSnapshot; id: string }) {
  const value = snapshot.fleet.find(item => item.id === id);
  if (!value) return <EmptyInspector />;
  return <Inspector label="Vehicle inspector" eyebrow={`MHE / ${VEHICLE_LABEL[value.kind].toUpperCase()}`} title={value.id} state={vehicleState(value)} stateLabel={value.status}>
    <dl><dt>Battery</dt><dd>{value.battery} %</dd><dt>Operator</dt><dd>{value.operator ?? (value.kind === 'amr' ? 'Autonomous' : '—')}</dd><dt>Area</dt><dd>{areaOf(value.area).label}</dd><dt>Aisle</dt><dd>{value.aisle ?? '—'}</dd></dl>
    {value.note && <p>{value.note}</p>}
    <Note>Working vehicles follow fixed demonstration loops; the battery and status come from mock telematics, not from the route.</Note>
  </Inspector>;
}

export function EmptyInspector() {
  return <div className="wh-inspector"><div className="wh-eyebrow">WAREHOUSE INSPECTOR</div><h2>Select something</h2><p>Choose a dock door, a truck, an aisle sign, a rack bay, a vehicle or an area pin in the scene, or use the Docks, Loads, Storage, Fleet and Alerts panels.</p><p>Pins and markers: green OK, blue working, amber needs attention, red act now, grey not staffed.</p></div>;
}

export const WAREHOUSE_CATALOG = [
  ['pallet-rack', 'Pallet rack'], ['loading-dock', 'Loading dock'], ['truck', 'Truck'], ['forklift', 'Forklift'], ['reach-truck', 'Reach truck'], ['mobile-robot', 'Mobile robot'],
  ['pallet', 'Pallet'], ['pallet-stack', 'Pallet stack'], ['carton-flow-rack', 'Carton flow rack'], ['shelf', 'Shelf'], ['put-wall', 'Put wall'], ['conveyor', 'Conveyor'],
  ['station', 'Station'], ['packaging-supply', 'Packaging supply'], ['roll-cage', 'Roll cage'], ['hold-cage', 'Hold cage'], ['picking-cart', 'Picking cart'], ['tote', 'Tote'],
  ['stretch-wrapper', 'Stretch wrapper'], ['ibc-tank', 'IBC tank'], ['drum-pallet', 'Drum pallet'], ['bulk-bag', 'Bulk bag'], ['safety-barrier', 'Safety barrier'], ['fence-segment', 'Fence'],
  ['ev-charger', 'Charger'], ['led-display', 'LED display'], ['status-beacon', 'Status beacon'], ['digital-clock', 'Digital clock'], ['information-board', 'Information board'], ['desk-pod', 'Desk pod'],
  ['shipping-container', 'Shipping container'], ['gate', 'Gate'], ['building', 'Building'], ['wall-segment', 'Wall segment'], ['storage-tank', 'Storage tank'], ['pump-unit', 'Pump unit'],
  ['security-camera', 'Security camera'], ['sign', 'Sign'], ['map-pin', 'Map pin'], ['worker', 'Worker'], ['security-guard', 'Security guard'], ['floor', 'Floor'], ['terrain', 'Terrain'], ['road', 'Road'],
] as const;
/** Links to the shared catalog pages of the models in the scene. */
export function WarehouseLibrary() {
  return <section className="wh-library" aria-label="Warehouse objects"><h3><Forklift size={15} aria-hidden="true" /> {WAREHOUSE_CATALOG.length} shared objects in this scene</h3>
    <ul>{WAREHOUSE_CATALOG.map(([asset, name]) => <li key={asset}><Link href={`/docs/objects/${asset}`}>{name}</Link></li>)}</ul></section>;
}
