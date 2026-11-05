'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { AlertTriangle, Boxes, Clock3, PackageCheck, ShoppingBag, ShoppingCart, Store, Truck, Warehouse } from 'lucide-react';
import { ActivityFeed, FieldList, ProcessTracker, ResourceList, StatusBadge, ValueMeter, type MetricAction } from '@opsorama/react/ui';
import type { HudMetric } from '../example-hud';
import {
  AREAS, CAGE_CAPACITY, CARRIERS, CHANNEL_LABELS, COLLECT_CAPACITY, DEPARTMENTS, FACINGS_PER_GONDOLA, HOLD_CAPACITY, LOCATIONS, LOCATION_UNITS, LOCKER_CAPACITY, ORDER_STAGES, PUT_WALL_CAPACITY, SKUS, STAGING_CAPACITY,
  alertStatus, alertsAt, area, areaStatus, cageCounts, carrier, cutoffRisk, departmentFacings, departmentLow, ecommerceMetrics, location, locationState, minutesOf, orderArea, ordersIn, shoppers, stage, stagedFor,
  type AreaId, type CarrierId, type CheckoutId, type DepartmentId, type Dock, type DockId, type EcommerceSnapshot, type LocationId, type Order, type OrderStage, type PackStationId, type PutWallId, type UnitRecord,
} from './model';

type Inspect = (orderId: string) => void;
const TONES = { critical: 'critical', warning: 'warning', busy: 'info', normal: 'success', inactive: 'neutral' } as const;
const money = (value: number) => `€${value.toLocaleString('en-US')}`;

export type EcommerceMetricId = 'orders' | 'cutoff' | 'stock' | 'shoppers';
/** Four short panels for the top of the floating HUD. The viewport supplies the detail each one opens. */
export function ecommerceHudMetrics(snapshot: EcommerceSnapshot, actions: Readonly<Record<EcommerceMetricId, MetricAction>>): readonly HudMetric[] {
  const m = ecommerceMetrics(snapshot), left = m.nextCutoff ? minutesOf(m.nextCutoff.cutoff) - minutesOf(snapshot.time) : null;
  return [
    { id: 'orders', title: 'Open orders', value: m.open, tone: 'info', comparison: `${m.ready} ready · ${snapshot.shippedToday} of ${snapshot.ordersToday} shipped today`, action: actions.orders, icon: <ShoppingBag size={16} /> },
    { id: 'cutoff', title: 'Cut-off risk', value: m.atRisk, tone: m.atRisk ? 'critical' : 'success', comparison: m.nextCutoff ? `${m.nextCutoff.name} ${m.nextCutoff.cutoff} · ${left} min left` : 'No collection today', action: actions.cutoff, icon: m.atRisk ? <AlertTriangle size={16} /> : <Clock3 size={16} /> },
    { id: 'stock', title: 'Stock alerts', value: m.alerts, tone: m.out ? 'critical' : m.alerts ? 'warning' : 'success', comparison: m.alerts ? `${m.out} out of stock in forward picking` : 'All pick faces above minimum', action: actions.stock, icon: <Boxes size={16} /> },
    { id: 'shoppers', title: 'Shoppers in store', value: m.shoppers, tone: snapshot.shopOpen ? 'info' : 'neutral', comparison: snapshot.shopOpen ? `${m.lanesOpen} of 3 checkouts open · queue ${m.queue}` : 'Shop closed', action: actions.shoppers, icon: <ShoppingCart size={16} /> },
  ];
}

/** Process areas with their most urgent condition; choosing one filters the orders and opens its inspector. */
export function AreaList({ snapshot, selected, onSelect }: { snapshot: EcommerceSnapshot; selected: AreaId | null; onSelect: (id: AreaId) => void }) {
  return <ResourceList className="ec-area-list" label="Process areas" density="compact" selectedId={selected} onSelect={id => onSelect(id as AreaId)} items={AREAS.map(value => {
    const status = areaStatus(snapshot, value.id), orders = ordersIn(snapshot, value.id).length;
    return { id: value.id, label: value.label, description: `${value.site}${orders ? ` · ${orders} ${orders === 1 ? 'order' : 'orders'}` : ''}`, status: status.label, tone: status.tone };
  })} />;
}
export function ActivityList({ snapshot }: { snapshot: EcommerceSnapshot }) {
  return <ActivityFeed className="ec-activity" title="Latest events" label="Latest events" density="compact" items={snapshot.events.map(event => ({ id: event.id, timeLabel: event.time, content: event.text, meta: event.tone && event.tone !== 'info' ? <StatusBadge label={event.tone === 'critical' ? 'Action' : event.tone === 'warning' ? 'Watch' : 'Done'} tone={event.tone} /> : undefined }))} />;
}

/** What the working agents are doing right now. */
export function TaskList({ snapshot }: { snapshot: EcommerceSnapshot }) {
  return <section className="ec-tasks" aria-label="Current work"><h3>Current work</h3>{snapshot.tasks.length ? <ul className="ec-mini">{snapshot.tasks.map(task => <li key={task.id}><strong>{task.who}</strong><span>{task.what}</span></li>)}</ul> : <p className="ec-empty">Everyone is waiting for work.</p>}</section>;
}

export function StageBadge({ value }: { value: OrderStage }) {
  const item = stage(value);
  return <span className="ec-stage"><i style={{ background: item.color }} aria-hidden="true" />{item.label}</span>;
}
const cutoffLabel = (snapshot: EcommerceSnapshot, order: Order) => {
  if (!order.carrier) return order.channel === 'click-collect' ? 'Counter pickup' : order.channel === 'store' ? 'To the shop floor' : '—';
  const value = carrier(order.carrier), risk = cutoffRisk(snapshot, order);
  return <>{value.name} {value.cutoff}{risk !== null && <small className="ec-risk">At risk · {risk} min</small>}</>;
};
const picked = (order: Order) => order.lines.reduce((sum, item) => sum + item.picked, 0), units = (order: Order) => order.lines.reduce((sum, item) => sum + item.quantity, 0);

/** Open orders in the current scope; the order number opens the order inspector. */
export function OrderTable({ snapshot, orders, onInspect }: { snapshot: EcommerceSnapshot; orders: readonly Order[]; onInspect: Inspect }) {
  return <div className="hud-table ec-table-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Stage</th><th>Picked</th><th>Carrier · cut-off</th><th>Value</th></tr></thead><tbody>{orders.map(order => {
    const risk = cutoffRisk(snapshot, order) !== null;
    return <tr key={order.id} data-alert={order.issue && order.stage !== 'released' ? 'critical' : risk ? 'warning' : undefined}><td><button type="button" onClick={() => onInspect(order.id)} aria-label={`Inspect order ${order.id}`}>{order.id}</button></td><td>{order.customer}<small>{CHANNEL_LABELS[order.channel]}</small></td><td><StageBadge value={order.stage} />{order.issue && <small className="ec-issue">{order.issue.split(':')[0].split('.')[0]}</small>}</td><td>{picked(order)} / {units(order)}</td><td>{cutoffLabel(snapshot, order)}</td><td>{order.value ? money(order.value) : '—'}</td></tr>;
  })}</tbody></table>{orders.length === 0 && <p className="ec-empty">No open orders in this scope.</p>}</div>;
}

/** Stock alerts first, then every storage location with its occupancy. */
export function StockPanel({ snapshot, onSelect }: { snapshot: EcommerceSnapshot; onSelect: (nodeId: string) => void }) {
  return <div className="ec-stock">
    <h3>Forward-pick alerts</h3>
    {snapshot.alerts.length ? <ul className="ec-alerts">{snapshot.alerts.map(alert => <li key={alert.sku} data-status={alertStatus(alert)}>
      <div><strong>{alert.sku}</strong> {SKUS[alert.sku].name}<StatusBadge label={alertStatus(alert) === 'out' ? 'Out of stock' : 'Low'} tone={alertStatus(alert) === 'out' ? 'critical' : 'warning'} /></div>
      <span>{alert.onHand} on hand · minimum {alert.min} · pick face <button type="button" onClick={() => onSelect(locationNode(SKUS[alert.sku].pick))}>{SKUS[alert.sku].pick}</button> · reserve <button type="button" onClick={() => onSelect(locationNode(SKUS[alert.sku].reserve))}>{SKUS[alert.sku].reserve}</button></span>
      <small>{alert.task}</small></li>)}</ul> : <p className="ec-empty">No SKU below its minimum.</p>}
    <h3>Locations</h3>
    <div className="hud-table ec-table-wrap"><table><thead><tr><th>Location</th><th>Family</th><th>Occupied</th><th>Status</th></tr></thead><tbody>{LOCATIONS.map(value => {
      const state = locationState(snapshot, value.id);
      return <tr key={value.id}><td><button type="button" onClick={() => onSelect(locationNode(value.id))} aria-label={`Inspect location ${value.id}`}>{value.id}</button></td><td>{value.family}</td><td><span className="ec-fill"><i style={{ width: `${snapshot.occupancy[value.id] / value.capacity * 100}%` }} /></span>{snapshot.occupancy[value.id]} / {value.capacity} {LOCATION_UNITS[value.kind]}</td><td><StatusBadge label={state === 'critical' ? 'Empty lane' : state === 'warning' ? 'Low SKU' : state === 'busy' ? 'Replenishing' : state === 'inactive' ? 'Empty' : 'OK'} tone={TONES[state as keyof typeof TONES] ?? 'neutral'} /></td></tr>;
    })}</tbody></table></div>
  </div>;
}
export const locationNode = (id: LocationId) => `${location(id).kind}:${id}`;

const DOCK_STATUS: Readonly<Record<Dock['status'], string>> = { free: 'Free', expected: 'Expected', unloading: 'Unloading', loading: 'Loading', departed: 'Departed' };
function DockCard({ dock, onSelect }: { dock: Dock; onSelect?: (nodeId: string) => void }) {
  return <article className="ec-dock" data-late={dock.late || undefined}>
    <div><strong>{onSelect ? <button type="button" onClick={() => onSelect(`dock:${dock.id}`)} aria-label={`Inspect dock ${dock.id}`}>Dock {dock.id}</button> : `Dock ${dock.id}`}</strong><span>{dock.direction === 'inbound' ? 'Inbound' : 'Outbound'}</span><StatusBadge label={dock.late ? 'Late' : DOCK_STATUS[dock.status]} tone={dock.late ? 'warning' : dock.status === 'unloading' || dock.status === 'loading' ? 'info' : 'neutral'} /></div>
    <p>{dock.partner} · {dock.reference}{dock.time !== '—' && ` · ${dock.direction === 'inbound' ? 'slot' : 'cut-off'} ${dock.time}`}</p>
    {dock.pallets && <ValueMeter label="Pallets received" value={dock.pallets.done} max={dock.pallets.total} tone={dock.late ? 'warning' : 'info'} />}
    <small>{dock.note}</small>
  </article>;
}
/** Inbound and outbound docks plus the carrier cut-offs. */
export function DockPanel({ snapshot, onSelect }: { snapshot: EcommerceSnapshot; onSelect: (nodeId: string) => void }) {
  return <div className="ec-docks">
    {snapshot.docks.map(dock => <DockCard key={dock.id} dock={dock} onSelect={onSelect} />)}
    <h3>Carrier cut-offs</h3>
    <ul className="ec-carriers">{CARRIERS.map(value => {
      const staged = stagedFor(snapshot, value.id).length, risk = snapshot.orders.filter(order => order.carrier === value.id && cutoffRisk(snapshot, order) !== null).length;
      return <li key={value.id}><button type="button" onClick={() => onSelect(value.cages.length ? `cage:${value.cages[0]}` : 'wrapper')} aria-label={`Inspect carrier ${value.name}`}><Truck size={15} aria-hidden="true" /><strong>{value.name}</strong><span>{value.service} · {value.cutoff}</span><span>{staged} staged{risk ? ` · ${risk} at risk` : ''}</span></button></li>;
    })}</ul>
    <p className="ec-note">Staging lanes: {snapshot.staging} {snapshot.staging === 1 ? 'pallet' : 'pallets'} waiting for put-away (the lanes show up to {STAGING_CAPACITY}).</p>
  </div>;
}

/* ── Inspectors ─────────────────────────────────────────────────────────── */

function Inspector({ label, eyebrow, title, icon, badge, children, note }: { label: string; eyebrow: string; title: string; icon?: ReactNode; badge?: ReactNode; children?: ReactNode; note?: string }) {
  return <aside className="ec-inspector" aria-label={label}><div className="ec-eyebrow">{eyebrow}</div><h2>{icon}{title}</h2>{badge}{children}{note && <div className="ec-host-note">{note}</div>}</aside>;
}
function OrderButtons({ orders, onInspect, empty }: { orders: readonly Order[]; onInspect: Inspect; empty: string }) {
  return orders.length ? <ul className="ec-order-links">{orders.slice(0, 12).map(order => <li key={order.id}><button type="button" onClick={() => onInspect(order.id)} aria-label={`Inspect order ${order.id}`}>{order.id}</button><span>{order.customer}</span><StageBadge value={order.stage} /></li>)}{orders.length > 12 && <li className="ec-more">+{orders.length - 12} more in the Orders panel</li>}</ul> : <p className="ec-empty">{empty}</p>;
}
const fields = (items: readonly [string, ReactNode][]) => <FieldList fields={items.map(([label, value]) => ({ id: label, label, value }))} />;

const DELIVERY_STEPS: readonly (OrderStage | 'shipped')[] = ['released', 'picking', 'sorting', 'packing', 'staged', 'shipped'];
const COLLECT_STEPS: readonly (OrderStage | 'collected')[] = ['released', 'picking', 'sorting', 'packing', 'collect', 'collected'];
const TRANSFER_STEPS: readonly (OrderStage | 'shelved')[] = ['released', 'picking', 'shelved'];
export function OrderInspector({ order, snapshot, onLocate }: { order: Order; snapshot: EcommerceSnapshot; onLocate: () => void }) {
  const steps = order.channel === 'click-collect' ? COLLECT_STEPS : order.channel === 'store' ? TRANSFER_STEPS : DELIVERY_STEPS;
  const current = steps.indexOf(order.stage), risk = cutoffRisk(snapshot, order), problem = order.issue && order.stage !== 'released';
  return <Inspector label="Order inspector" eyebrow={`${CHANNEL_LABELS[order.channel].toUpperCase()} / PLACED ${order.placed}`} title={`Order ${order.id}`} badge={<StageBadge value={order.stage} />}
    note="Release, reprioritise or reroute orders in your order management system. The scene shows where the order is, not a command.">
    <ProcessTracker className="ec-order-steps" label="Order progress" density="compact" steps={steps.map((id, index) => ({ id, label: id in { shipped: 1, collected: 1, shelved: 1 } ? ({ shipped: 'Shipped', collected: 'Collected', shelved: 'On the shelf' } as Record<string, string>)[id] : stage(id as OrderStage).label, current: index === current, tone: index < current ? 'success' : index === current ? problem ? 'critical' : risk !== null ? 'warning' : 'info' : 'neutral' }))} />
    {fields([['Customer', order.customer], ['Value', order.value ? money(order.value) : 'Internal'], ['Carrier', order.carrier ? `${carrier(order.carrier).name} · ${carrier(order.carrier).cutoff}` : '—'], ['Area', area(orderArea(order)).label]])}
    {risk !== null && <p className="ec-alert-text">Cut-off in {risk} minutes and not yet staged.</p>}
    {order.issue && <p className={problem ? 'ec-alert-text' : undefined}>{order.issue}</p>}
    <table className="ec-lines"><thead><tr><th>SKU</th><th>Item</th><th>Picked</th></tr></thead><tbody>{order.lines.map(item => <tr key={item.sku} data-short={item.picked < item.quantity && order.stage !== 'released' ? true : undefined}><td>{item.sku}</td><td>{SKUS[item.sku].name}</td><td>{item.picked} / {item.quantity}</td></tr>)}</tbody></table>
    <button type="button" className="ec-text-button" onClick={onLocate}>Show in the scene</button>
  </Inspector>;
}

export function AreaInspector({ id, snapshot, onInspect }: { id: AreaId; snapshot: EcommerceSnapshot; onInspect: Inspect }) {
  const value = area(id), status = areaStatus(snapshot, id), orders = ordersIn(snapshot, id);
  const meter = (() => {
    const kinds = id === 'storage' ? ['rack'] : id === 'picking' ? ['flow', 'shelf'] : null;
    if (kinds) { const list = LOCATIONS.filter(item => kinds.includes(item.kind)); return <ValueMeter label={id === 'storage' ? 'Pallet positions occupied' : 'Pick lanes and bins stocked'} value={list.reduce((sum, item) => sum + snapshot.occupancy[item.id], 0)} max={list.reduce((sum, item) => sum + item.capacity, 0)} />; }
    if (id === 'dispatch') return <ValueMeter label="Parcels in roll cages" value={CARRIERS.reduce((sum, item) => sum + cageCounts(snapshot, item.id).reduce((a, b) => a + b, 0), 0)} max={CARRIERS.reduce((sum, item) => sum + item.cages.length, 0) * CAGE_CAPACITY} />;
    if (id === 'receiving') return <ValueMeter label="Staging lanes in use" value={Math.min(STAGING_CAPACITY, snapshot.staging)} max={STAGING_CAPACITY} unit="pallets" />;
    if (id === 'returns') return <ValueMeter label="Quarantine cage" value={snapshot.returns.held} max={HOLD_CAPACITY} unit="items" tone={snapshot.returns.held ? 'warning' : 'info'} />;
    return null;
  })();
  const crew = id in snapshot.crew ? snapshot.crew[id as keyof EcommerceSnapshot['crew']] : undefined;
  const extra: [string, ReactNode][] = id === 'shop' ? [['Browsing', snapshot.shop.browsing], ['Sales today', money(snapshot.shop.sales)]] : id === 'checkout' ? [['Lanes open', `${snapshot.shop.checkouts.filter(lane => lane.open && snapshot.shopOpen).length} of 3`], ['Queue', ecommerceMetrics(snapshot).queue]] : id === 'collect' ? [['Customers waiting', snapshot.shop.collectWaiting], ['Lockers occupied', `${snapshot.shop.lockers} of ${LOCKER_CAPACITY}`]] : id === 'sorting' ? [['Robots running', snapshot.robots], ['On put walls', snapshot.orders.filter(order => order.stage === 'sorting').length]] : id === 'returns' ? [['To inspect', snapshot.returns.awaiting], ['Inspected today', snapshot.returns.inspected]] : id === 'receiving' ? [['Inbound docks', snapshot.docks.filter(dock => dock.direction === 'inbound' && dock.status !== 'free').length], ['To put away', snapshot.staging]] : [];
  return <Inspector label="Area inspector" eyebrow={`${value.site.toUpperCase()} / PROCESS AREA`} title={value.label} badge={<StatusBadge label={status.label} tone={status.tone} />} note="Areas are illustrative process zones, not measured floor plans.">
    <p>{value.description}</p>
    {fields([['Orders here', orders.length], ...(crew !== undefined ? [['People working', crew] as [string, ReactNode]] : []), ...extra])}
    {meter}
    {id !== 'shop' && id !== 'checkout' && id !== 'storage' && <><h3>Orders</h3><OrderButtons orders={orders} onInspect={onInspect} empty="No open orders in this area." /></>}
    {id === 'storage' && <StockMini snapshot={snapshot} kinds={['rack']} />}
    {id === 'shop' && <DepartmentList snapshot={snapshot} />}
  </Inspector>;
}
function StockMini({ snapshot, kinds }: { snapshot: EcommerceSnapshot; kinds: readonly string[] }) {
  return <ul className="ec-mini">{LOCATIONS.filter(item => kinds.includes(item.kind)).map(item => <li key={item.id}><strong>{item.id}</strong><span>{item.family}</span><span>{snapshot.occupancy[item.id]} / {item.capacity}</span></li>)}</ul>;
}
function DepartmentList({ snapshot }: { snapshot: EcommerceSnapshot }) {
  return <ul className="ec-mini">{DEPARTMENTS.map(item => <li key={item.id} data-low={departmentLow(snapshot, item.id) || undefined}><strong>{item.label}</strong><span>{departmentLow(snapshot, item.id) ? 'Shelf gaps' : 'Stocked'}</span><span>{departmentFacings(snapshot, item.id)} / {FACINGS_PER_GONDOLA * 2}</span></li>)}</ul>;
}

export function LocationInspector({ id, snapshot }: { id: LocationId; snapshot: EcommerceSnapshot }) {
  const value = location(id), state = locationState(snapshot, id), alerts = alertsAt(snapshot, id), count = snapshot.occupancy[id];
  return <Inspector label="Location inspector" eyebrow={`${value.kind === 'rack' ? 'RESERVE STORAGE' : 'FORWARD PICKING'} / ${value.kind.toUpperCase()}`} title={`${id} · ${value.family}`} icon={<Warehouse size={19} aria-hidden="true" />}
    badge={<StatusBadge label={state === 'critical' ? 'Empty lane' : state === 'warning' ? 'Low SKU' : state === 'busy' ? 'Replenishing' : state === 'inactive' ? 'Empty' : 'OK'} tone={TONES[state as keyof typeof TONES] ?? 'neutral'} />}
    note={value.kind === 'rack' ? 'Each pallet in the bay is one object: select it to see its SKU. It leaves the rack on the reach truck.' : `Each ${value.kind === 'flow' ? 'filled lane' : 'stored box'} on the model is one occupied ${value.kind === 'flow' ? 'lane' : 'bin'}; SKU quantities stay in your WMS.`}>
    <ValueMeter label={`Occupied ${LOCATION_UNITS[value.kind]}`} value={count} max={value.capacity} tone={state === 'critical' ? 'critical' : state === 'warning' ? 'warning' : 'info'} />
    <h3>SKUs needing attention</h3>
    {alerts.length ? <ul className="ec-alerts">{alerts.map(alert => <li key={alert.sku} data-status={alertStatus(alert)}><div><strong>{alert.sku}</strong> {SKUS[alert.sku].name}</div><span>{alert.onHand} on hand · minimum {alert.min} · {SKUS[alert.sku].pick === id ? 'picked here' : 'reserve stock here'}</span><small>{alert.task}</small></li>)}</ul> : <p className="ec-empty">No alerts for this location.</p>}
    {fields([['SKUs stored', Object.entries(SKUS).filter(([, sku]) => sku.pick === id || sku.reserve === id).map(([code]) => code).join(', ') || '—']])}
  </Inspector>;
}

export function DockInspector({ id, snapshot }: { id: DockId; snapshot: EcommerceSnapshot }) {
  const dock = snapshot.docks.find(item => item.id === id)!;
  return <Inspector label="Dock inspector" eyebrow={`${dock.direction.toUpperCase()} DOCK`} title={`Dock ${id}`} icon={<Truck size={19} aria-hidden="true" />} note="Yard bookings and gate events come from your yard or transport system; the truck drives in when it docks and leaves when it is done.">
    <DockCard dock={dock} />
  </Inspector>;
}

export function PackInspector({ id, snapshot, onInspect }: { id: PackStationId; snapshot: EcommerceSnapshot; onInspect: Inspect }) {
  const index = (['K1', 'K2', 'K3'] as const).indexOf(id), staffed = index < snapshot.crew.packing, orders = snapshot.orders.filter(order => order.at === id);
  return <Inspector label="Packing bench inspector" eyebrow="PACKING / BENCH" title={`Packing bench ${id}`} icon={<PackageCheck size={19} aria-hidden="true" />} badge={<StatusBadge label={!staffed ? 'Unstaffed' : orders.length ? 'Packing' : 'Waiting for work'} tone={!staffed ? 'neutral' : orders.length ? 'info' : 'success'} />} note="An open carton on the bench shows the order being packed.">
    {fields([['Packer', staffed ? `Packer ${id}` : 'None'], ['Packing benches staffed', `${snapshot.crew.packing} of 3`]])}
    <h3>On the bench</h3><OrderButtons orders={orders} onInspect={onInspect} empty="No order on this bench." />
  </Inspector>;
}

export function PutWallInspector({ id, snapshot, onInspect }: { id: PutWallId; snapshot: EcommerceSnapshot; onInspect: Inspect }) {
  const orders = snapshot.orders.filter(order => order.at === id);
  return <Inspector label="Put wall inspector" eyebrow="SORTATION / PUT WALL" title={`Put wall ${id}`} note="Each filled cubby is one order being consolidated. Robots deliver totes from the conveyor to the put side; packers take complete orders from the other side.">
    <ValueMeter label="Cubbies in use" value={orders.length} max={PUT_WALL_CAPACITY} />
    <h3>Orders</h3><OrderButtons orders={orders} onInspect={onInspect} empty="No orders on this wall." />
  </Inspector>;
}

export function CarrierInspector({ id, snapshot, onInspect }: { id: CarrierId; snapshot: EcommerceSnapshot; onInspect: Inspect }) {
  const value = carrier(id), staged = stagedFor(snapshot, id), counts = cageCounts(snapshot, id), shown = counts.reduce((a, b) => a + b, 0);
  const pending = snapshot.orders.filter(order => order.carrier === id && order.stage !== 'staged'), left = minutesOf(value.cutoff) - minutesOf(snapshot.time);
  const risk = pending.filter(order => cutoffRisk(snapshot, order) !== null).length;
  return <Inspector label="Carrier inspector" eyebrow={`DISPATCH / ${value.service.toUpperCase()}`} title={value.name} icon={<Truck size={19} aria-hidden="true" />} badge={<StatusBadge label={risk ? `${risk} at risk` : left < 0 ? 'Cut-off passed' : `${left} min to cut-off`} tone={risk ? 'warning' : 'neutral'} />}
    note={value.cages.length ? `Each roll cage shows up to ${CAGE_CAPACITY} parcels, one per staged order.${staged.length > shown ? ` ${staged.length - shown} more are staged on the floor.` : ''}` : 'Pallet orders are wrapped on the stretch wrapper before the collection.'}>
    {fields([['Cut-off', value.cutoff], ['Staged', staged.length], ...(value.cages.length ? [['Roll cages', counts.map((count, i) => `${i + 1}: ${count}`).join(' · ')] as [string, ReactNode]] : []), ['Still in the warehouse', pending.length]])}
    <h3>Not yet staged</h3><OrderButtons orders={pending} onInspect={onInspect} empty="Everything for this carrier is staged." />
  </Inspector>;
}

export function CheckoutInspector({ id, snapshot }: { id: CheckoutId; snapshot: EcommerceSnapshot }) {
  const lane = snapshot.shop.checkouts.find(item => item.id === id)!, open = snapshot.shopOpen && lane.open;
  return <Inspector label="Checkout inspector" eyebrow="SHOP / CHECKOUT" title={`Checkout ${id.slice(1)}`} icon={<Store size={19} aria-hidden="true" />} badge={<StatusBadge label={open ? 'Open' : 'Closed'} tone={open ? 'success' : 'neutral'} />} note="Each figure in the lane is one customer; open or close lanes in your point-of-sale system.">
    {fields([['Cashier', lane.cashier ?? '—'], ['Queue', open ? lane.queue : '—'], ['Shoppers in store', shoppers(snapshot)]])}
  </Inspector>;
}

export function CollectInspector({ snapshot, onInspect }: { snapshot: EcommerceSnapshot; onInspect: Inspect }) {
  const ready = ordersIn(snapshot, 'collect'), coming = snapshot.orders.filter(order => order.channel === 'click-collect' && order.stage !== 'collect');
  return <Inspector label="Click and collect inspector" eyebrow="SHOP / ONLINE ORDERS" title="Click & collect" icon={<ShoppingBag size={19} aria-hidden="true" />} note={`The counter shows up to ${COLLECT_CAPACITY} parcels, one per ready order; the lockers show occupied compartments.`}>
    <ValueMeter label="Parcels on the counter" value={Math.min(COLLECT_CAPACITY, ready.length)} max={COLLECT_CAPACITY} />
    <ValueMeter label="Locker compartments occupied" value={snapshot.shop.lockers} max={LOCKER_CAPACITY} />
    {fields([['Customers waiting', snapshot.shop.collectWaiting]])}
    <h3>Ready to collect</h3><OrderButtons orders={ready} onInspect={onInspect} empty="No orders waiting." />
    <h3>On the way from the warehouse</h3><OrderButtons orders={coming} onInspect={onInspect} empty="No click & collect orders in progress." />
  </Inspector>;
}

export function ReturnsInspector({ snapshot }: { snapshot: EcommerceSnapshot }) {
  const { awaiting, held, inspected } = snapshot.returns;
  return <Inspector label="Returns inspector" eyebrow="WAREHOUSE / RETURNS" title="Returns" badge={<StatusBadge label={held ? `${held} on hold` : 'No holds'} tone={held ? 'warning' : 'success'} />} note="Returns arrive by carrier and through the drop box at the shop entrance. The tote shows items to inspect, the hold cage quarantined items.">
    {fields([['To inspect', awaiting], ['On hold', held], ['Inspected today', inspected]])}
    <ValueMeter label="Quarantine cage" value={held} max={HOLD_CAPACITY} unit="items" tone={held ? 'warning' : 'info'} />
  </Inspector>;
}

const UNIT_LABELS: Readonly<Record<UnitRecord['kind'], string>> = { pallet: 'Pallet', tote: 'Tote', carton: 'Carton', parcel: 'Parcel', bag: 'Shopping bag' };
/** One moving object: what it carries and where it is now. */
export function UnitInspector({ id, snapshot, onInspect }: { id: string; snapshot: EcommerceSnapshot; onInspect: Inspect }) {
  const unit = snapshot.units.find(item => item.id === id)!;
  return <Inspector label="Unit inspector" eyebrow="MOVING OBJECT" title={`${UNIT_LABELS[unit.kind]} ${id.split(':')[1]}`} icon={<Boxes size={19} aria-hidden="true" />} note="Every unit is one object in the shared handling state; it changes place when an agent moves it.">
    {fields([['Where', unit.at], ...(unit.sku ? [['SKU', `${unit.sku} · ${SKUS[unit.sku].name}`] as [string, ReactNode]] : [])])}
    {unit.orderId && <button type="button" className="ec-text-button" onClick={() => onInspect(unit.orderId!)}>Open order {unit.orderId}</button>}
  </Inspector>;
}
/** A vehicle or worker: the job it is on. */
export function AgentInspector({ id, snapshot }: { id: string; snapshot: EcommerceSnapshot }) {
  const task = snapshot.tasks.find(item => item.id === id);
  return <Inspector label="Agent inspector" eyebrow="SITE / AGENT" title={task?.who ?? 'Waiting for work'} icon={<Truck size={19} aria-hidden="true" />} note="Jobs come from the simulated feed; a real host sends them from its WMS.">
    {fields([['Current job', task?.what ?? 'None']])}
  </Inspector>;
}

const DEPARTMENT_SKUS: Readonly<Record<DepartmentId, string>> = { garden: 'OUT', bath: 'HOM', party: 'GFT', audio: 'TEC', kitchen: 'KIT', home: 'HOM', outdoor: 'OUT', toys: 'TOY', tech: 'TEC', gifts: 'GFT' };
export function DepartmentInspector({ id, snapshot, onInspect }: { id: DepartmentId; snapshot: EcommerceSnapshot; onInspect: Inspect }) {
  const value = DEPARTMENTS.find(item => item.id === id)!, facings = departmentFacings(snapshot, id), low = departmentLow(snapshot, id);
  const prefix = DEPARTMENT_SKUS[id], transfers = snapshot.orders.filter(order => order.channel === 'store' && order.lines.some(item => item.sku.startsWith(prefix)));
  const alerts = snapshot.alerts.filter(alert => alert.sku.startsWith(prefix));
  return <Inspector label="Department inspector" eyebrow="SHOP FLOOR / DEPARTMENT" title={value.label} icon={<Store size={19} aria-hidden="true" />} badge={<StatusBadge label={low ? 'Shelf gaps' : 'Stocked'} tone={low ? 'warning' : 'success'} />} note="Facings are stocked product fronts on the two gondolas, from the shop's shelf scan.">
    <ValueMeter label="Stocked facings" value={facings} max={FACINGS_PER_GONDOLA * 2} tone={low ? 'warning' : 'info'} />
    {alerts.length > 0 && <p className="ec-alert-text">The warehouse is also short: {alerts.map(alert => `${alert.sku} (${alert.onHand} on hand)`).join(', ')}.</p>}
    <h3>Transfers from the warehouse</h3><OrderButtons orders={transfers} onInspect={onInspect} empty="No shop transfer in progress." />
  </Inspector>;
}

export function EmptyInspector() {
  return <div className="ec-inspector"><div className="ec-eyebrow">INSPECTOR</div><h2>Select something</h2><p>Choose an area, rack, pallet, pick face, dock, put wall, packing bench, roll cage, vehicle, checkout or gondola in the scene, or open an order from the Orders panel.</p><StageLegend /></div>;
}
export function StageLegend() {
  return <div className="ec-legend" aria-label="Order stage legend">{ORDER_STAGES.map(item => <StageBadge key={item.id} value={item.id} />)}</div>;
}

export const ECOMMERCE_CATALOG = [
  ['store-shelving', 'Store shelving'], ['checkout-counter', 'Checkout counter'], ['click-collect-counter', 'Click & collect counter'], ['parcel-locker', 'Parcel locker'], ['returns-drop-box', 'Returns drop box'],
  ['shopping-cart', 'Shopping cart'], ['hand-basket', 'Hand basket'], ['worker', 'Worker'], ['information-board', 'Information board'], ['sign', 'Sign'],
  ['pallet-rack', 'Pallet rack'], ['reach-truck', 'Reach truck'], ['carton-flow-rack', 'Carton flow rack'], ['shelf', 'Storage shelf'], ['picking-cart', 'Picking cart'],
  ['conveyor', 'Conveyor'], ['tote', 'Tote'], ['mobile-robot', 'Mobile robot'], ['put-wall', 'Put wall'], ['station', 'Workstation'], ['packaging-supply', 'Packaging supply'],
  ['parcel', 'Parcel'], ['roll-cage', 'Roll cage'], ['stretch-wrapper', 'Stretch wrapper'], ['pallet', 'Pallet'], ['pallet-stack', 'Pallet stack'], ['pallet-jack', 'Pallet jack'],
  ['forklift', 'Forklift'], ['loading-dock', 'Loading dock'], ['truck', 'Delivery truck'], ['delivery-van', 'Delivery van'], ['hold-cage', 'Hold cage'], ['safety-barrier', 'Safety barrier'],
] as const;
/** Links to the shared catalog pages of the models in the scene. */
export function EcommerceLibrary() {
  return <section className="ec-library" aria-label="Catalog objects"><h3><Boxes size={15} aria-hidden="true" /> {ECOMMERCE_CATALOG.length} shared catalog objects</h3>
    <ul>{ECOMMERCE_CATALOG.map(([asset, name]) => <li key={asset}><Link href={`/docs/objects/${asset}`}>{name}</Link></li>)}</ul></section>;
}
