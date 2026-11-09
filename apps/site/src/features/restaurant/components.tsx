'use client';
import Link from 'next/link';
import { AlertTriangle, ChefHat, ClipboardList, CookingPot, Flame, GlassWater, ShoppingBag, Soup, Thermometer, Users, UtensilsCrossed } from 'lucide-react';
import type { MetricAction } from '@opsorama/react/ui';
import type { HudMetric } from '../example-hud';
import { PASS_CAPACITY, PICKUP_CAPACITY, STATIONS, TABLE_LAYOUT, TABLE_STATUS, TICKET_STATUS, isOccupied, restaurantMetrics, stationTickets, type KitchenTicket, type RestaurantSnapshot, type StationId, type TableSession, type TableStatus, type TicketStatus } from './model';

const STATION_ICONS = { grill: Flame, pizza: CookingPot, cold: Soup, bar: GlassWater, pass: ChefHat, pickup: ShoppingBag } as const;
export function StationIcon({ station, size = 20 }: { station: StationId; size?: number }) { const Icon = STATION_ICONS[station]; return <Icon size={size} aria-hidden="true" />; }

export function TableStatusBadge({ status }: { status: TableStatus }) {
  const value = TABLE_STATUS[status];
  return <span className="restaurant-status"><span aria-hidden="true" style={{ color: value.color }}>{value.symbol}</span>{value.label}</span>;
}
export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const value = TICKET_STATUS[status];
  return <span className="restaurant-status"><span aria-hidden="true" style={{ color: value.color }}>{value.symbol}</span>{value.label}</span>;
}

export type RestaurantMetricId = 'guests' | 'tickets' | 'late' | 'cooler';
/** Four short panels for the top of the floating HUD. The viewport supplies the detail each one opens. */
export function restaurantHudMetrics(snapshot: RestaurantSnapshot, actions: Readonly<Record<RestaurantMetricId, MetricAction>>): readonly HudMetric[] {
  const metrics = restaurantMetrics(snapshot), { celsius, limit } = snapshot.cooler, margin = celsius - limit, coolerTone = margin > 0 ? 'warning' : 'success';
  return [
    { id: 'guests', title: 'Guests seated', value: metrics.guests, tone: 'info', comparison: `${metrics.occupied} / ${metrics.tables} tables occupied`, action: actions.guests, icon: <Users size={16} /> },
    { id: 'tickets', title: 'Open tickets', value: metrics.tickets, tone: 'info', comparison: `${metrics.ready} ready to serve`, action: actions.tickets, icon: <ClipboardList size={16} /> },
    { id: 'late', title: 'Late tickets', value: metrics.late, tone: metrics.late ? 'critical' : 'success', comparison: metrics.late ? 'Over the station target' : 'All within target', action: actions.late, icon: metrics.late ? <AlertTriangle size={16} /> : <ChefHat size={16} /> },
    { id: 'cooler', title: 'Walk-in cooler', value: celsius, formatValue: value => Number(value).toFixed(1), unit: '°C', tone: coolerTone, delta: { label: `${Math.abs(margin).toFixed(1)} °C ${margin > 0 ? 'over' : 'under'} limit`, direction: margin > 0 ? 'up' : 'down', tone: coolerTone }, comparison: margin > 0 ? `Above the ${limit.toFixed(1)} °C limit` : 'Within limit', action: actions.cooler, icon: <Thermometer size={16} /> },
  ];
}

export function StationStrip({ snapshot, selected, onSelect }: { snapshot: RestaurantSnapshot; selected: StationId | null; onSelect: (station: StationId | null) => void }) {
  return <nav className="restaurant-stations" aria-label="Filter tickets by station">{STATIONS.map(station => {
    const tickets = stationTickets(snapshot, station.id), late = tickets.filter(ticket => ticket.status === 'late').length;
    const summary = station.id === 'pass' || station.id === 'pickup' ? `${tickets.length} ready` : `${tickets.length} open${late ? ` · ${late} late` : ''}`;
    return <button key={station.id} data-alert={late > 0 || undefined} aria-pressed={selected === station.id} aria-label={`${station.label}: ${summary}`} onClick={() => onSelect(selected === station.id ? null : station.id)}><span className="hud-symbol dp-tone" data-tone={late ? 'critical' : tickets.length ? 'info' : 'neutral'}><StationIcon station={station.id} /></span><strong>{station.label}</strong><span>{summary}</span></button>;
  })}</nav>;
}

export function TableChips({ snapshot, selectedId, onSelect }: { snapshot: RestaurantSnapshot; selectedId?: string; onSelect: (id: string) => void }) {
  return <nav className="restaurant-tables" aria-label="Floor tables">{TABLE_LAYOUT.map(layout => {
    const session = snapshot.tables.find(table => table.tableId === layout.id)!, status = TABLE_STATUS[session.status];
    return <button key={layout.id} aria-pressed={selectedId === layout.id} aria-label={`Inspect ${layout.label}: ${status.label}`} style={{ borderTopColor: status.color }} onClick={() => onSelect(layout.id)}><strong>{layout.id}</strong><span>{isOccupied(session) || session.status === 'reserved' ? `${session.party} ${session.party === 1 ? 'guest' : 'guests'}` : layout.area}</span><small style={{ color: status.color }}>{status.label}</small></button>;
  })}</nav>;
}

export function TableInspector({ session, snapshot }: { session: TableSession; snapshot: RestaurantSnapshot }) {
  const layout = TABLE_LAYOUT.find(table => table.id === session.tableId)!, tickets = snapshot.tickets.filter(ticket => ticket.tableId === session.tableId);
  return <aside className="restaurant-inspector" aria-label="Table inspector"><div className="restaurant-eyebrow">{layout.area.toUpperCase()} / {layout.seats} SEATS</div><h2>{layout.label}</h2><TableStatusBadge status={session.status} />
    <dl><dt>Party</dt><dd>{session.party || '—'}</dd><dt>Server</dt><dd>{session.server ?? '—'}</dd><dt>{session.status === 'reserved' ? 'Reservation' : 'Seated for'}</dt><dd>{session.status === 'reserved' ? session.guestName ?? '—' : session.minutes === undefined ? '—' : `${session.minutes} min`}</dd><dt>Open tickets</dt><dd>{tickets.length ? tickets.map(ticket => ticket.id).join(', ') : 'None'}</dd></dl>
    <p>{session.note}</p>{tickets.map(ticket => <TicketCard key={ticket.id} ticket={ticket} />)}
    <div className="restaurant-host-note">Seat guests, fire courses and close bills in your POS. The board shows covers laid as place settings and the status on each table tent.</div></aside>;
}
function TicketCard({ ticket }: { ticket: KitchenTicket }) {
  return <div className="restaurant-ticket" data-status={ticket.status}><div><strong>{ticket.id}</strong><TicketStatusBadge status={ticket.status} /></div><span>{ticket.items.join(' · ')}</span><small>{STATIONS.find(station => station.id === ticket.station)!.label} · {ticket.minutes} / {ticket.target} min</small></div>;
}

export function StationInspector({ station, snapshot }: { station: StationId; snapshot: RestaurantSnapshot }) {
  const value = STATIONS.find(item => item.id === station)!, tickets = stationTickets(snapshot, station), capacity = station === 'pass' ? PASS_CAPACITY : station === 'pickup' ? PICKUP_CAPACITY : undefined;
  return <aside className="restaurant-inspector" aria-label="Station inspector"><div className="restaurant-eyebrow">{station === 'pass' || station === 'pickup' ? 'READY ORDERS' : 'KITCHEN STATION'}</div><h2><StationIcon station={station} size={20} /> {value.label}</h2><p>{value.description}</p>
    <dl>{capacity === undefined ? (['queued', 'cooking', 'late'] as const).map(status => <div key={status}><dt>{TICKET_STATUS[status].label}</dt><dd>{tickets.filter(ticket => ticket.status === status).length}</dd></div>) : <><dt>Ready orders</dt><dd>{tickets.length}</dd><dt>Shown on the model</dt><dd>{Math.min(capacity, tickets.length)} of {capacity} slots</dd></>}{station === 'bar' && <><dt>Bar-seat guests</dt><dd>{snapshot.barGuests}</dd></>}</dl>
    {tickets.map(ticket => <TicketCard key={ticket.id} ticket={ticket} />)}{tickets.length === 0 && <p>No tickets at this station.</p>}
    <div className="restaurant-host-note">{capacity === undefined ? 'The model state follows the most urgent ticket. Kitchen display and bump actions remain in the host.' : `Each plate or bag is one ready order, up to ${capacity}; exact totals stay in this panel.`}</div></aside>;
}

export function CoolerInspector({ snapshot }: { snapshot: RestaurantSnapshot }) {
  const { celsius, limit } = snapshot.cooler, warm = celsius > limit;
  return <aside className="restaurant-inspector" aria-label="Cooler inspector"><div className="restaurant-eyebrow">EQUIPMENT / MOCK SENSOR</div><h2><Thermometer size={20} aria-hidden="true" /> Walk-in cooler</h2><span className="restaurant-status"><span aria-hidden="true" style={{ color: warm ? '#dca644' : '#38a88a' }}>{warm ? '!' : '✓'}</span>{warm ? 'Above limit' : 'Within limit'}</span>
    <dl><dt>Reading</dt><dd>{celsius.toFixed(1)} °C</dd><dt>Limit</dt><dd>{limit.toFixed(1)} °C</dd></dl>
    <p>{warm ? 'The door display shows the supplied reading in amber. Check the door seal and recent openings; the host decides whether to raise an alert.' : 'The supplied reading is within the configured limit.'}</p>
    <div className="restaurant-host-note">The door display is a surface label fed by host data. The model does not simulate refrigeration or alarms.</div></aside>;
}

export function EmptyInspector() {
  return <div className="restaurant-inspector"><div className="restaurant-eyebrow">FLOOR INSPECTOR</div><h2>Select a table</h2><p>Choose a table, booth, station or the walk-in cooler in the scene, or use the Floor, Tickets and Stations panels.</p><TableLegend /></div>;
}

/** Table-status colors and symbols shared by the table chips and the table tents. */
export function TableLegend() {
  return <div className="restaurant-legend" aria-label="Table status legend">{(Object.keys(TABLE_STATUS) as TableStatus[]).map(status => <TableStatusBadge key={status} status={status} />)}</div>;
}

/** Kitchen tickets in the current scope; a dine-in ticket links to its table. */
export function TicketTable({ snapshot, tickets, onSelectTable }: { snapshot: RestaurantSnapshot; tickets: readonly KitchenTicket[]; onSelectTable: (id: string) => void }) {
  return <div className="hud-table restaurant-table-wrap"><table><thead><tr><th>Ticket</th><th>Table / channel</th><th>Items</th><th>Station</th><th>Status</th><th>Elapsed / target</th></tr></thead><tbody>{tickets.map(ticket => {
    const table = ticket.tableId ? snapshot.tables.find(value => value.tableId === ticket.tableId) : undefined, over = ticket.minutes > ticket.target;
    return <tr key={ticket.id} data-status={ticket.status}><td><strong>{ticket.id}</strong></td><td>{ticket.tableId ? <button onClick={() => onSelectTable(ticket.tableId!)} aria-label={`Inspect ${TABLE_LAYOUT.find(value => value.id === ticket.tableId)!.label} for ticket ${ticket.id}`}>{ticket.tableId}</button> : <span className="restaurant-channel">{ticket.channel === 'takeout' ? 'Takeout' : 'Delivery'}</span>}{table && <small><TableStatusBadge status={table.status} /></small>}</td><td>{ticket.items.join(', ')}</td><td>{STATIONS.find(value => value.id === ticket.station)!.label}</td><td><TicketStatusBadge status={ticket.status} /></td><td className={over ? 'over' : ''}>{ticket.minutes} / {ticket.target} min</td></tr>;
  })}</tbody></table>{tickets.length === 0 && <p className="restaurant-empty">No open tickets in this scope.</p>}</div>;
}

export const RESTAURANT_CATALOG = [
  ['dining-table', 'Dining table', 'Square or round four-top; covers laid as 0–4 place settings.'],
  ['booth-seating', 'Booth seating', 'Upholstered booth for four with a status tent.'],
  ['bar-counter', 'Bar counter', 'Slatted bar with taps, foot rail and lit back bar.'],
  ['bar-stool', 'Bar stool', 'Chrome stool for bar-counter guest anchors.'],
  ['espresso-machine', 'Espresso machine', 'Two-group machine with grinder and rising steam.'],
  ['pizza-oven', 'Pizza oven', 'Wood-fired dome oven with a flickering fire.'],
  ['walk-in-cooler', 'Walk-in cooler', 'Cold room with a door display for host readings.'],
  ['heated-pass', 'Heated pass', 'Expo shelf with heat lamps and 0–6 ready plates.'],
  ['pickup-shelf', 'Pickup shelf', 'Takeout shelf with 0–9 bags and lit bays.'],
  ['host-stand', 'Host stand', 'Podium with tablet, menus and brass lamp.'],
  ['menu-board', 'Menu board', 'A-frame chalkboard with a menu surface label.'],
  ['dish-machine', 'Dish machine', 'Hood dishwasher with inlet and outlet tables.'],
  ['patio-umbrella', 'Patio umbrella', 'Striped market umbrella, open or furled.'],
  ['serving-plates', 'Serving plates', 'Two plates a server holds, full or cleared.'],
] as const;
/** Links to the shared catalog pages of every restaurant model in the scene. */
export function RestaurantLibrary() {
  return <section className="restaurant-library" aria-label="Restaurant objects"><h3><UtensilsCrossed size={15} aria-hidden="true" /> {RESTAURANT_CATALOG.length} shared restaurant objects</h3>
    <ul>{RESTAURANT_CATALOG.map(([asset, name, description]) => <li key={asset}><Link href={`/docs/objects/${asset}`} title={description}>{name}</Link></li>)}</ul></section>;
}
