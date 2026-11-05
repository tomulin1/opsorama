import { createNavGraph, createSceneStore, resolveSceneSlots, toNodeRoute, type AssetNode, type NodeRoute, type ResolvedSlot, type SceneNode, type SceneStore, type Vec3, type WaypointStop } from '@opsorama/core';
import { assetInteractionSlots, assetMotionProfiles } from '@opsorama/objects';
import {
  AREAS, EMPLOYEES, FOCUS_PODS, HOT_DESKS, KITCHEN_SEATS, ROOMS, SCENARIOS, TEAMS, TEAM_DESKS,
  areaStatus, boardNotes, currentBooking, currentTicket, employee, hotDeskUser, inOffice, nextBooking, peopleAt, podOccupant, presence, project, projectColor, stateOf,
  type AreaId, type Employee, type FocusPodId, type OfficeScenario, type OfficeSnapshot, type RoomId, type TeamId, type Ticket,
} from './model';

const p = (x: number, z: number, y = 0): Vec3 => [x, y, z];
const yaw = (value: number): Vec3 => [0, value, 0];
const HALF = Math.PI / 2, BACK = Math.PI;
const fixture = (id: string, asset: string, position: Vec3, extra: Partial<AssetNode> = {}): AssetNode => ({ id, kind: 'asset', asset, position, selectable: false, ...extra });
const selectable = (id: string, entityId: string, asset: string, position: Vec3, label: string, extra: Partial<AssetNode> = {}): AssetNode =>
  ({ id, entityId, kind: 'asset', asset, position, label, labelMode: 'active', selectable: true, ...extra });

/* ── Fixed layout ───────────────────────────────────────────────────────── */

/** Team pods stand in the front half of each neighbourhood; the team board stands behind them, facing the pod. */
const POD_Z = 2.4, BOARD_Z = -2.5, HUDDLE_Z = -1.5;
export const TEAM_X: Readonly<Record<TeamId, number>> = { platform: -14, web: -6, mobile: 2, design: 10 };
const HOT_X = 16;
export const TABLE_X: Readonly<Record<RoomId, number>> = { M1: -14.5, M2: -8 };
const TABLE_Z = -8;
export const FOCUS_X: Readonly<Record<FocusPodId, number>> = { P1: -3.9, P2: -2.5, P3: -1.1 };
const FOCUS_Z = -9.6;
const KITCHEN_TABLES: readonly Vec3[] = [p(2.4, -6.5), p(6.6, -6.5)];
/** Free floor spots where each space's status pin stands. */
const AREA_PINS: Readonly<Record<AreaId, Vec3>> = {
  M1: p(-17.2, -5.8), M2: p(-5.8, -10.2), focus: p(-.6, -6.4), kitchen: p(8.4, -6), reception: p(10, -6),
  platform: p(-11.2, -1.6), web: p(-3.2, -1.6), mobile: p(4.8, -1.6), design: p(12.8, -1.6), hot: p(16, -1.6),
};

/** Furniture that people sit at; it also supplies the seat slots where seated figures are placed. */
export const podNodes: readonly AssetNode[] = [
  ...TEAMS.map(value => selectable(`pod:${value.id}`, value.id, 'desk-pod', p(TEAM_X[value.id], POD_Z), `${value.label} desks`, { count: TEAM_DESKS, color: '#5b6f8a' })),
  selectable('pod:hot', 'hot', 'desk-pod', p(HOT_X, POD_Z), 'Hot desks', { count: HOT_DESKS.length, color: '#7b8798' }),
];
export const tableNodes: readonly AssetNode[] = ROOMS.map(value => selectable(`room:${value.id}`, value.id, 'meeting-table', p(TABLE_X[value.id], TABLE_Z), `${value.name} room`, { count: value.seats, color: '#435b77' }));
export const focusNodes: readonly AssetNode[] = FOCUS_PODS.map(id => selectable(`focus:${id}`, id, 'focus-pod', p(FOCUS_X[id], FOCUS_Z), `Focus pod ${id}`, { color: '#3f8f7a' }));
const kitchenTableNodes: readonly AssetNode[] = KITCHEN_TABLES.map((position, i) => selectable(`kitchen:table-${i + 1}`, 'kitchen', 'dining-table', position, `Kitchen table ${i + 1}`, { variant: 'round', count: 0, color: '#c07a52' }));
const benchNode = selectable('reception:bench', 'reception', 'bench', p(15.6, -10.3), 'Waiting bench');
const seats = resolveSceneSlots([...podNodes, ...tableNodes, ...focusNodes, ...kitchenTableNodes, benchNode], assetInteractionSlots);
const seatsOf = (nodeId: string): ResolvedSlot[] => seats.filter(slot => slot.nodeId === nodeId && slot.group === 'seat');
/** World seat of a desk id: `${team}-${n}` sits at seat n − 1 of the team pod, `H${n}` at seat n − 1 of the hot-desk pod. */
export function deskSeat(desk: string): ResolvedSlot {
  const [pod, index] = desk.startsWith('H') ? ['pod:hot', Number(desk.slice(1)) - 1] : [`pod:${desk.split('-')[0]}`, Number(desk.split('-')[1]) - 1];
  const slot = seatsOf(pod)[index];
  if (!slot) throw new Error(`Desk ${desk} has no seat. Use <team>-1 … <team>-${TEAM_DESKS} for team desks or H1 … H${HOT_DESKS.length} for hot desks.`);
  return slot;
}

const wall = (id: string, x: number, z: number, variant: 'solid' | 'window' | 'door', extra: Partial<AssetNode> = {}) => fixture(id, 'wall-segment', [x, 0, z], { variant, color: '#e6ebf0', ...extra });
/** Low partitions (1.1 m) separate the rooms without hiding them from the camera. */
const partition = (id: string, x: number, z: number, length: number, along: 'x' | 'z') => wall(id, x, z, 'solid', { scale: [length / 4, .42, 1], color: '#cfd9e3', ...(along === 'z' ? { rotation: yaw(HALF) } : {}) });
const floor = (id: string, rect: readonly [number, number, number, number], variant: string, color?: string) =>
  fixture(id, 'floor', p((rect[0] + rect[1]) / 2, (rect[2] + rect[3]) / 2), { variant, footprint: [rect[1] - rect[0], rect[3] - rect[2]], ...(color ? { color } : {}) });

/** Ground, floors, walls and decoration that do not depend on the snapshot. */
export const officeBase: readonly SceneNode[] = [
  { id: 'ground', kind: 'ground', size: [44, 26], position: [0, 0, -1.5], color: '#d9e1d6' },
  // Floor finishes name the spaces: carpet per team neighbourhood, wood in the aisle and reception, tiles in the kitchen.
  ...TEAMS.map(value => floor(`floor:${value.id}`, AREAS.find(item => item.id === value.id)!.rect, 'carpet', value.floor)),
  floor('floor:hot', [14, 18, -3.5, 7], 'carpet', '#d3d8de'),
  floor('floor:aisle', [-18, 18, -5, -3.5], 'wood'),
  floor('floor:rooms', [-18, -5, -11, -5], 'carpet', '#c7ced8'),
  floor('floor:focus', [-5, 0, -11, -5], 'wood'),
  floor('floor:kitchen', [0, 9, -11, -5], 'tiles'),
  floor('floor:reception', [9, 18, -11, -5], 'wood'),
  // Back and side walls frame the cutaway; the camera side stays open.
  ...[-16, -12, -8, -4, 0, 4, 8, 12, 16].map((x, i) => wall(`wall-back-${i}`, x, -11.1, x === 4 ? 'solid' : 'window')),
  ...[-9, -5, -1, 3].map((z, i) => wall(`wall-west-${i}`, -18.1, z, 'window', { rotation: yaw(HALF) })),
  wall('wall-west-4', -18.1, 6, 'solid', { rotation: yaw(HALF), scale: [.5, 1, 1] }),
  wall('wall-east-0', 18.1, -9, 'door', { rotation: yaw(HALF) }),
  ...[-5, -1, 3].map((z, i) => wall(`wall-east-${i + 1}`, 18.1, z, i ? 'window' : 'solid', { rotation: yaw(HALF) })),
  wall('wall-east-4', 18.1, 6, 'solid', { rotation: yaw(HALF), scale: [.5, 1, 1] }),
  // Meeting rooms: low fronts with a door gap, and side partitions toward the focus pods.
  partition('partition-m1-0', -16, -5, 4, 'x'), partition('partition-m1-1', -12, -5, 2, 'x'),
  partition('partition-m2-0', -10, -5, 2, 'x'), partition('partition-m2-1', -6.5, -5, 3, 'x'),
  partition('partition-x11-0', -11, -9, 4, 'z'), partition('partition-x11-1', -11, -6, 2, 'z'),
  partition('partition-x5-0', -5, -9, 4, 'z'), partition('partition-x5-1', -5, -6, 2, 'z'),
  // Kitchen and reception.
  fixture('kitchen:waste', 'waste-bin', p(.6, -10.4), { variant: 'recycling', scale: [.8, .8, .8] }),
  fixture('reception:welcome', 'information-board', p(10.6, -10.5), { surfaceLabel: { kind: 'text', layout: 'multiline', text: 'WELCOME TO\nFERNHILL\nSTUDIO\n\nCheck in at\nthe tablet', color: '#eef4f8' } }),
  benchNode,
  ...([[-17.3, -10.3], [.5, -5.6], [8.5, -10.3], [17.3, -6], [-17.3, 6.3], [-10, 6.3], [-2, 6.3], [6, 6.3], [14, 6.3], [17.3, 6.3]] as const).map(([x, z], i) => fixture(`plant-${i}`, 'potted-plant', p(x, z))),
];

/* ── Movement graph ─────────────────────────────────────────────────────── */

const AISLE_Z = -4.6, AISLE_RETURN_Z = -3.95;
const ROBOT_STOPS = { M1: -14.5, kitchen: 4.5, reception: 13 } as const;
const chain = (ids: readonly string[], lane: string) => ids.slice(1).map((to, i) => ({ from: ids[i], to, lane, oneWay: true }));
/**
 * Where agents may move. The office robot circulates one way along the central
 * aisle and returns on the far side of it; people have no lane here, so a
 * planned person route on the aisle fails with a named rule.
 */
export const officeNavigation = createNavGraph({
  points: [
    { id: 'aisle-west', position: p(-17, AISLE_Z) }, ...Object.entries(ROBOT_STOPS).map(([id, x]) => ({ id: `aisle:${id}`, position: p(x, AISLE_Z) })),
    { id: 'aisle-east', position: p(17, AISLE_Z) }, { id: 'aisle-return-east', position: p(17, AISLE_RETURN_Z) }, { id: 'aisle-return-west', position: p(-17, AISLE_RETURN_Z) },
  ],
  edges: chain(['aisle-west', 'aisle:M1', 'aisle:kitchen', 'aisle:reception', 'aisle-east', 'aisle-return-east', 'aisle-return-west', 'aisle-west'], 'robot-loop'),
  lanes: { 'robot-loop': { allow: ['robot'] } },
  agents: { robot: { ...assetMotionProfiles['mobile-robot'], speed: 1 }, person: assetMotionProfiles.worker },
});
/** Plan a looping route and turn it into a renderer route; a rejected plan names the rule it broke. */
export function loopRoute(agent: string, stops: readonly [string, ...string[]], seconds: readonly (number | Omit<WaypointStop, 'waypoint'>)[]): NodeRoute {
  const [from, ...via] = stops, plan = officeNavigation.plan({ agent, from, via, to: from });
  if (!plan.ok) throw new Error(`No ${agent} route through ${stops.join(' → ')}: ${plan.violations.map(violation => violation.message).join(' ')}`);
  return toNodeRoute(plan.route, { loop: true, stops: seconds.map((stop, waypoint) => typeof stop === 'number' ? { waypoint, seconds: stop } : { ...stop, waypoint }) });
}
/** The supply robot restocks the kitchen, collects mail at reception and drops it at the meeting rooms. */
export const ROBOT_ROUTE = loopRoute('robot', ['aisle:kitchen', 'aisle:reception', 'aisle:M1'], [{ seconds: 5, yaw: BACK }, { seconds: 4, yaw: BACK }, { seconds: 3, yaw: BACK }]);

/* ── Snapshot-dependent nodes ───────────────────────────────────────────── */

const VISITOR = '#c4ad8f';
export const personNodeId = (id: string) => `person:${id}`;
function personNode(snapshot: OfficeSnapshot, person: Employee, position: Vec3, heading: number, variant: 'seated' | 'idle' | 'working'): AssetNode {
  const value = currentTicket(snapshot, person.id);
  return {
    id: personNodeId(person.id), entityId: person.id, kind: 'asset', asset: 'worker', variant, color: projectColor(snapshot, person.id), position, rotation: yaw(heading),
    label: `${person.name} · ${value ? value.id : presence(stateOf(snapshot, person.id)).label}`, labelMode: 'active', selectable: true,
  };
}
const seated = (snapshot: OfficeSnapshot, person: Employee, slot: ResolvedSlot) => personNode(snapshot, person, slot.position, slot.yaw, 'seated');
const visitorNode = (id: string, name: string, company: string, slot: ResolvedSlot): AssetNode =>
  ({ id, entityId: name, kind: 'asset', asset: 'worker', variant: 'seated', color: VISITOR, position: slot.position, rotation: yaw(slot.yaw), label: `${name} · ${company}`, labelMode: 'active', selectable: true });

export function officeNodes(snapshot: OfficeSnapshot): SceneNode[] {
  const nodes: SceneNode[] = [...officeBase];

  // Each space is named by a status pin; the pin turns amber or red with the space status.
  for (const value of AREAS) {
    const status = areaStatus(snapshot, value.id), state = status.tone === 'critical' ? 'critical' : status.tone === 'warning' ? 'warning' : undefined;
    nodes.push({ id: `pin:${value.id}`, entityId: value.id, kind: 'asset', asset: 'map-pin', position: AREA_PINS[value.id], color: value.kind === 'team' || value.kind === 'desks' ? '#4a62c4' : '#3f8a6d', state, label: value.label, labelMode: 'always', selectable: true });
  }

  // Team neighbourhoods: desks with whoever sits there, and the team board with one note per active ticket.
  for (const node of podNodes) {
    const members = node.id === 'pod:hot' ? HOT_DESKS.map(hotDeskUser).filter(Boolean) as Employee[] : EMPLOYEES.filter(person => person.team === node.entityId && !person.desk.startsWith('H'));
    const seatedNow = members.filter(person => stateOf(snapshot, person.id).where === 'desk');
    nodes.push({ ...node, label: `${node.label} · ${seatedNow.length} of ${node.count} in use`, state: seatedNow.length ? undefined : 'inactive' });
    for (const person of seatedNow) nodes.push(seated(snapshot, person, deskSeat(person.desk)));
  }
  for (const value of TEAMS) {
    const x = TEAM_X[value.id], notes = boardNotes(snapshot, value.id), status = areaStatus(snapshot, value.id);
    nodes.push(selectable(`board:${value.id}`, value.id, 'whiteboard', p(x - 2.6, BOARD_Z), `${value.label} board · ${notes} active`, { count: notes, state: status.tone === 'critical' || status.tone === 'warning' ? 'warning' : undefined, surfaceLabel: { kind: 'text', text: `${value.label.toUpperCase()} · SPRINT BOARD`, color: '#2a3646' } }));
    // A stand-up gathers in front of the board, facing it.
    const huddle = peopleAt(snapshot, 'huddle').filter(person => person.team === value.id);
    huddle.forEach((person, i) => nodes.push(personNode(snapshot, person, p(x - 2.6 + (i - (huddle.length - 1) / 2) * .78, HUDDLE_Z + Math.abs(i - (huddle.length - 1) / 2) * -.18), BACK, 'idle')));
  }

  // Meeting rooms: attendees and visitors take the table seats; the door screen shows the booking.
  for (const node of tableNodes) {
    const id = node.entityId as RoomId, booking = currentBooking(snapshot, id), slots = seatsOf(node.id), name = ROOMS.find(item => item.id === id)!.name;
    const inRoom = peopleAt(snapshot, id), visitors = snapshot.visitors.filter(visitor => visitor.status === 'arrived' && visitor.room === id && booking?.visitors?.includes(visitor.name));
    nodes.push({ ...node, label: `${name} room · ${booking ? booking.title : 'free'}`, state: booking ? 'busy' : undefined });
    inRoom.slice(0, slots.length).forEach((person, i) => nodes.push(seated(snapshot, person, slots[i])));
    visitors.slice(0, Math.max(0, slots.length - inRoom.length)).forEach((visitor, i) => nodes.push(visitorNode(`visitor:${id}:${i}`, visitor.name, visitor.company, slots[inRoom.length + i])));
    nodes.push(selectable(`roomboard:${id}`, id, 'information-board', p(TABLE_X[id] + (id === 'M1' ? 2.6 : 2.2), -5.6), `${name} booking screen`, {
      rotation: yaw(-.35), scale: [.8, .8, .8],
      surfaceLabel: { kind: 'text', layout: 'multiline', text: booking ? `${name.toUpperCase()}\nIN USE\n\n${booking.title}\n${booking.from}–${booking.to}` : `${name.toUpperCase()}\nFREE\n\nNext:\n${nextLabel(snapshot, id)}`, color: booking ? '#ffd9a8' : '#bff3df', background: '#14283c' },
    }));
  }

  // Focus pods: one occupant per booked pod.
  for (const node of focusNodes) {
    const id = node.entityId as FocusPodId, occupant = podOccupant(snapshot, id);
    nodes.push({ ...node, label: `Focus pod ${id} · ${occupant ? occupant.name : 'free'}`, state: occupant ? 'busy' : undefined });
    if (occupant) nodes.push(seated(snapshot, occupant, seatsOf(node.id)[0]));
  }

  // Kitchen: people on a break sit at the two tables; the espresso machine steams while anyone is there.
  const kitchen = peopleAt(snapshot, 'kitchen'), kitchenSlots = kitchenTableNodes.flatMap(node => seatsOf(node.id));
  kitchenTableNodes.forEach((node, i) => nodes.push({ ...node, count: Math.min(4, Math.max(0, kitchen.length - i * 4)) }));
  kitchen.slice(0, KITCHEN_SEATS).forEach((person, i) => nodes.push(seated(snapshot, person, kitchenSlots[i])));
  nodes.push(
    selectable('kitchen:counter', 'kitchen', 'bar-counter', p(4.5, -9.4), 'Coffee bar', { color: '#3a4c60' }),
    { id: 'kitchen:espresso', kind: 'asset', asset: 'espresso-machine', attachment: { nodeId: 'kitchen:counter', anchor: 'top' }, state: kitchen.length ? 'busy' : 'normal', selectable: false },
  );

  // Reception: the check-in stand faces the entrance; arrived visitors without a room wait on the bench.
  nodes.push(selectable('reception:checkin', 'reception', 'host-stand', p(13, -8.4), 'Visitor check-in', { rotation: yaw(HALF) }));
  const waiting = snapshot.visitors.filter(visitor => visitor.status === 'arrived' && !visitor.room), bench = seatsOf(benchNode.id);
  waiting.slice(0, bench.length).forEach((visitor, i) => nodes.push(visitorNode(`visitor:bench:${i}`, visitor.name, visitor.company, bench[i])));

  // The supply robot follows its planned aisle loop.
  nodes.push({ ...fixture('robot', 'mobile-robot', ROBOT_ROUTE.points[0], { variant: 'tote', color: '#5a7fd6' }), route: ROBOT_ROUTE });
  return nodes;
}
const nextLabel = (snapshot: OfficeSnapshot, id: RoomId) => { const next = nextBooking(snapshot, id); return next ? `${next.from} ${next.title}` : 'nothing today'; };

export const DEFAULT_ZOOM = 1.25;
export function createOfficeStore(scenario: OfficeScenario = 'planning'): SceneStore {
  return createSceneStore({ schemaVersion: 1, nodes: officeNodes(SCENARIOS[scenario]) }, { zoom: DEFAULT_ZOOM });
}
/** Replace with a confirmed host snapshot. Nothing in the UI changes people, tickets or bookings optimistically. */
export function applyOfficeSnapshot(store: SceneStore, snapshot: OfficeSnapshot): void { store.replace(officeNodes(snapshot)); }

/** Scene node for a person: the figure while they are in the office, otherwise their desk pod. */
export function personSceneNode(snapshot: OfficeSnapshot, id: string): string {
  const person = employee(id);
  return inOffice(stateOf(snapshot, id)) ? personNodeId(id) : person.desk.startsWith('H') ? 'pod:hot' : `pod:${person.team}`;
}
/** Scene node for a ticket: its assignee, or the board of the team that owns the project. */
export function ticketSceneNode(snapshot: OfficeSnapshot, value: Ticket): string {
  return value.assignee ? personSceneNode(snapshot, value.assignee) : `board:${project(value.project).owner}`;
}
