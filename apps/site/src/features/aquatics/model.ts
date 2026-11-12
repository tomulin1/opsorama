import { personHairColor, createSceneStore, type AssetNode, type SceneNode, type SceneStore, type Vec3, type VisualState } from '@opsorama/core';
import { LAP_POOL, lapPoolLaneZ } from '@opsorama/objects';

/** What a lane is booked for, as reported by the host's booking or timetable source. */
export type LaneUse = 'public' | 'club' | 'lessons' | 'closed';
export type LaneSpeed = 'slow' | 'medium' | 'fast';
export type PostStatus = 'on-post' | 'break' | 'alert';
export type FilterStatus = 'running' | 'backwash' | 'off';
export type PoolId = 'main' | 'teaching';
export type AquaticsScenario = 'morning' | 'afternoon' | 'closed';

export const LANE_USE: Readonly<Record<LaneUse, { label: string; color: string }>> = {
  public: { label: 'Public lane', color: '#2f6fd6' },
  club: { label: 'Club training', color: '#7a5cc4' },
  lessons: { label: 'Swim school', color: '#2e9d84' },
  closed: { label: 'Closed', color: '#91a0b5' },
};
export const POST_STATUS: Readonly<Record<PostStatus, { label: string; state: VisualState }>> = {
  'on-post': { label: 'On post', state: 'normal' },
  break: { label: 'On break', state: 'warning' },
  alert: { label: 'Responding', state: 'critical' },
};
/** Mock limits for the example; real limits come from the operator and local regulations. */
export const WATER_LIMITS = Object.freeze({ ph: [7, 7.6] as const, chlorine: [.3, 1] as const });

export interface LaneSession { laneId: string; use: LaneUse; speed?: LaneSpeed; swimmers: number; capacity: number; until?: string; note: string; alert?: string; }
export interface LifeguardPost { id: 'north' | 'south' | 'teaching'; label: string; covers: PoolId; status: PostStatus; guard?: string; note: string; }
export interface WaterReading { ph: number; chlorine: number; temperature: number; }
export interface FilterRecord { id: 'F1' | 'F2'; status: FilterStatus; pressure: number; note: string; }
export interface AquaticsSnapshot {
  scenario: AquaticsScenario; time: string; open: boolean; lanes: readonly LaneSession[];
  teaching: { bathers: number; capacity: number; fountain: boolean };
  water: Readonly<Record<PoolId, WaterReading>>; posts: readonly LifeguardPost[]; filters: readonly FilterRecord[];
}

export const LANE_IDS = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'] as const;
export const POOL_LABELS: Readonly<Record<PoolId, string>> = { main: '25 m pool', teaching: 'Teaching pool' };
/** Visible swimmers per lane and children in the teaching pool; exact counts stay in the HTML. */
export const LANE_VISIBLE = 4, TEACHING_VISIBLE = 8;

const lane = (laneId: string, use: LaneUse, swimmers: number, capacity: number, note: string, extra: Partial<LaneSession> = {}): LaneSession => ({ laneId, use, swimmers, capacity, note, ...extra });
const closedLane = (laneId: string, note = 'Closed to swimmers.') => lane(laneId, 'closed', 0, 0, note);
export const SCENARIOS: Readonly<Record<AquaticsScenario, AquaticsSnapshot>> = {
  morning: { scenario: 'morning', time: '07:20', open: true, lanes: [
    lane('L1', 'public', 4, 6, 'Steady early lane swim.', { speed: 'slow' }),
    lane('L2', 'public', 6, 6, 'Full. Direct new arrivals to lane 3.', { speed: 'medium' }),
    lane('L3', 'public', 3, 6, 'Room for three more.', { speed: 'fast' }),
    lane('L4', 'club', 8, 10, 'Masters squad, main set.', { until: '08:00' }),
    lane('L5', 'club', 7, 10, 'Masters squad, drills.', { until: '08:00' }),
    closedLane('L6', 'Reserved for a school group from 08:30.'),
  ], teaching: { bathers: 0, capacity: 20, fountain: false },
  water: { main: { ph: 7.3, chlorine: .55, temperature: 27.4 }, teaching: { ph: 7.2, chlorine: .6, temperature: 30.1 } },
  posts: [
    { id: 'north', label: 'North chair', covers: 'main', status: 'on-post', guard: 'Eva', note: 'Watching lanes 4–6.' },
    { id: 'south', label: 'South chair', covers: 'main', status: 'on-post', guard: 'Marek', note: 'Watching lanes 1–3.' },
    { id: 'teaching', label: 'Teaching pool chair', covers: 'teaching', status: 'break', guard: 'Jana', note: 'Teaching pool opens at 09:00.' },
  ], filters: [{ id: 'F1', status: 'running', pressure: .8, note: 'Normal circulation.' }, { id: 'F2', status: 'running', pressure: .9, note: 'Normal circulation.' }] },
  afternoon: { scenario: 'afternoon', time: '16:40', open: true, lanes: [
    lane('L1', 'public', 6, 6, 'Full. Ask new arrivals to wait or use lane 5.', { speed: 'slow' }),
    lane('L2', 'public', 5, 6, 'Busy medium lane.', { speed: 'medium' }),
    lane('L3', 'lessons', 8, 8, 'Swim school, group B (age 7–9).', { until: '17:15' }),
    lane('L4', 'lessons', 6, 8, 'Swim school, group C.', { until: '17:15', alert: 'Instructor requested a lifeguard: child unwell at the wall.' }),
    lane('L5', 'public', 2, 6, 'Plenty of space.', { speed: 'fast' }),
    closedLane('L6', 'Lane rope repair until 17:00.'),
  ], teaching: { bathers: 14, capacity: 20, fountain: true },
  water: { main: { ph: 7.4, chlorine: .45, temperature: 27.6 }, teaching: { ph: 7.7, chlorine: .24, temperature: 30.4 } },
  posts: [
    { id: 'north', label: 'North chair', covers: 'main', status: 'alert', guard: 'Eva', note: 'Responding to lane 4.' },
    { id: 'south', label: 'South chair', covers: 'main', status: 'on-post', guard: 'Marek', note: 'Covering the whole main pool while Eva responds.' },
    { id: 'teaching', label: 'Teaching pool chair', covers: 'teaching', status: 'break', guard: 'Jana', note: 'On break until 16:50 with 14 bathers in the teaching pool: cover needed.' },
  ], filters: [{ id: 'F1', status: 'running', pressure: .9, note: 'Normal circulation.' }, { id: 'F2', status: 'backwash', pressure: 1.3, note: 'Pressure rose; backwash in progress.' }] },
  closed: { scenario: 'closed', time: '22:10', open: false, lanes: LANE_IDS.map(id => closedLane(id, 'Pool closed; thermal cover on.')),
    teaching: { bathers: 0, capacity: 20, fountain: false },
    water: { main: { ph: 7.3, chlorine: .5, temperature: 27.1 }, teaching: { ph: 7.3, chlorine: .55, temperature: 29.6 } },
    posts: [
      { id: 'north', label: 'North chair', covers: 'main', status: 'break', note: 'Off duty.' },
      { id: 'south', label: 'South chair', covers: 'main', status: 'break', note: 'Off duty.' },
      { id: 'teaching', label: 'Teaching pool chair', covers: 'teaching', status: 'break', note: 'Off duty.' },
    ], filters: [{ id: 'F1', status: 'running', pressure: .7, note: 'Night circulation.' }, { id: 'F2', status: 'off', pressure: 0, note: 'Standby overnight.' }] },
};

export const laneNumber = (laneId: string) => Number(laneId.slice(1));
export const bathers = (snapshot: AquaticsSnapshot, pool: PoolId) => pool === 'teaching' ? snapshot.teaching.bathers : snapshot.lanes.reduce((sum, value) => sum + value.swimmers, 0);
export function laneState(session: LaneSession): VisualState {
  if (session.use === 'closed') return 'inactive';
  if (session.alert) return 'critical';
  if (session.swimmers >= session.capacity) return 'warning';
  return session.swimmers ? 'busy' : 'normal';
}
export function waterState(reading: WaterReading): VisualState {
  const [phLow, phHigh] = WATER_LIMITS.ph, [clLow, clHigh] = WATER_LIMITS.chlorine;
  if (reading.chlorine < clLow / 2 || reading.chlorine > clHigh * 2) return 'critical';
  return reading.ph < phLow || reading.ph > phHigh || reading.chlorine < clLow || reading.chlorine > clHigh ? 'warning' : 'normal';
}
/** A post on break is a problem only while its pool has bathers. */
export function postState(snapshot: AquaticsSnapshot, post: LifeguardPost): VisualState {
  if (post.status === 'alert') return 'critical';
  if (post.status === 'on-post') return 'normal';
  return snapshot.open && bathers(snapshot, post.covers) > 0 ? 'warning' : 'inactive';
}
export const filterState = (filter: FilterRecord): VisualState => filter.status === 'off' ? 'inactive' : filter.status === 'backwash' ? 'busy' : 'normal';
export const waterLabel = (reading: WaterReading) => `pH ${reading.ph.toFixed(1)} · Cl ${reading.chlorine.toFixed(2)}`;

export function aquaticsMetrics(snapshot: AquaticsSnapshot) {
  const open = snapshot.lanes.filter(value => value.use !== 'closed');
  return {
    inWater: bathers(snapshot, 'main') + bathers(snapshot, 'teaching'),
    capacity: open.reduce((sum, value) => sum + value.capacity, 0) + (snapshot.open ? snapshot.teaching.capacity : 0),
    lanesOpen: open.length, lanes: snapshot.lanes.length,
    onPost: snapshot.posts.filter(post => post.status !== 'break').length, posts: snapshot.posts.length,
    alerts: snapshot.lanes.filter(value => value.alert).length + snapshot.posts.filter(post => postState(snapshot, post) !== 'normal' && postState(snapshot, post) !== 'inactive').length + (['main', 'teaching'] as const).filter(pool => waterState(snapshot.water[pool]) !== 'normal').length,
  };
}

const v = (x: number, z: number, y = 0): Vec3 => [x, y, z];
/** Pool placement on the board; lane geometry comes from the shared lap-pool definition. */
export const MAIN_POOL = v(-6, 0), TEACHING_POOL = v(14, 2.5);
const SWIM_Y = LAP_POOL.water - .08, SPEED: Readonly<Record<Exclude<LaneUse, 'closed'> | LaneSpeed, number>> = { slow: .7, medium: 1, fast: 1.35, public: 1, club: 1.25, lessons: .5 };
const CAPS = ['#e4553f', '#2f6fd6', '#f0c03c', '#2e9d84', '#ffffff', '#7a5cc4'] as const;
const STAFF = '#d9483b', CHILD: Vec3 = [.68, .68, .68];
const decor = (id: string, asset: string, position: Vec3, extra: Partial<AssetNode> = {}): AssetNode => ({ id, kind: 'asset', asset, position, selectable: false, ...extra });

/** A closed rectangular loop around the lane centre, started at `fraction` of its perimeter: swimmers keep right. */
export function laneLoop(laneIndex: number, fraction: number): Vec3[] {
  const z = MAIN_POOL[2] + lapPoolLaneZ(laneIndex), x0 = MAIN_POOL[0] - LAP_POOL.length / 2 + 1, x1 = MAIN_POOL[0] + LAP_POOL.length / 2 - 1;
  const corners: Vec3[] = [[x0, SWIM_Y, z + .45], [x1, SWIM_Y, z + .45], [x1, SWIM_Y, z - .45], [x0, SWIM_Y, z - .45]];
  const sides = corners.map((point, i) => Math.hypot(corners[(i + 1) % 4][0] - point[0], corners[(i + 1) % 4][2] - point[2])), total = sides.reduce((a, b) => a + b);
  let distance = (fraction % 1) * total, side = 0;
  while (distance > sides[side]) { distance -= sides[side]; side++; }
  const from = corners[side], to = corners[(side + 1) % 4], t = distance / sides[side], start: Vec3 = [from[0] + (to[0] - from[0]) * t, SWIM_Y, from[2] + (to[2] - from[2]) * t];
  return [start, ...Array.from({ length: 4 }, (_, i) => corners[(side + 1 + i) % 4]), start];
}

/** Floors, walls, plant room and deck furniture that do not depend on the snapshot. */
export const aquaticsBase: readonly SceneNode[] = [
  { id: 'ground', kind: 'ground', size: [46, 30], position: [0, 0, -1], color: '#e6edf3' },
  decor('floor-hall', 'floor', v(0, -.5), { variant: 'tiles', footprint: [44, 22], color: '#e8eef1', interior: true }),
  decor('floor-plant', 'floor', v(0, -12.6), { variant: 'concrete', footprint: [16, 3.6], interior: true }),
  decor('terrace', 'terrain', v(13, 12.2), { variant: 'grass', footprint: [18, 3.4] }),
  ...[-20, -16, -12, -8, 8, 12, 16, 20].map((x, i) => decor(`wall-back-${i}`, 'wall-segment', v(x, -14.4), { variant: 'window', color: '#e9eef2' })),
  ...[-4, 0, 4].map((x, i) => decor(`wall-plant-${i}`, 'wall-segment', v(x, -14.4), { color: '#d5dde5' })),
  ...[-6.1, 6.1].map((x, i) => decor(`wall-plant-side-${i}`, 'wall-segment', v(x, -12.6), { rotation: [0, Math.PI / 2, 0], scale: [.9, .55, 1], color: '#d5dde5' })),
  decor('pump-1', 'pump-unit', v(-2.6, -13.2)), decor('pump-2', 'pump-unit', v(-2.6, -11.8)),
  ...[0, 1, 2, 3].map(i => ({ id: `ladder-${i}`, kind: 'asset' as const, asset: 'pool-ladder', attachment: { nodeId: 'pool:main', anchor: `ladder-${i}` }, selectable: false })),
  ...([[-20.4, -7.4, Math.PI / 2], [-20.4, 7.4, Math.PI / 2], [8.4, -7.4, -Math.PI / 2], [8.4, 7.4, -Math.PI / 2], [17.6, 5.8, -Math.PI / 2]] as const).map(([x, z, yaw], i) => decor(`ring-${i}`, 'life-ring-post', v(x, z), { rotation: [0, yaw, 0], surfaceLabel: { kind: 'text', text: `R${i + 1}`, color: '#2e7d5b' } })),
  ...[0, 1].map(i => decor(`shower-${i}`, 'deck-shower', v(-18.6 + i * 1.2, 10.3))),
  ...Array.from({ length: 6 }, (_, i) => decor(`lounger-${i}`, 'sun-lounger', v(6.6 + i * 1.2, 12.4), { variant: i % 3 === 2 ? 'flat' : 'reclined', rotation: [0, Math.PI, 0], color: i % 2 ? '#e0a03a' : '#2f8fb0' })),
  ...Array.from({ length: 4 }, (_, i) => decor(`lounger-side-${i}`, 'sun-lounger', v(20.8, -2.6 + i * 1.2), { rotation: [0, -Math.PI / 2, 0], color: '#2f8fb0' })),
  decor('umbrella-1', 'patio-umbrella', v(9.6, 12.4), { color: '#2f8fb0' }), decor('umbrella-2', 'patio-umbrella', v(13.2, 12.4), { color: '#e0a03a' }),
  ...([[-21, 12.2], [21.2, 9.6], [21.2, -8.2], [-21.2, -11]] as const).map(([x, z], i) => decor(`palm-${i}`, 'tree-palm', v(x, z))),
  ...([[-9, 9.4], [-3, 9.4], [3.2, 9.4], [9.8, -8.6], [18.6, -8.6]] as const).map(([x, z], i) => decor(`plant-${i}`, 'potted-plant', v(x, z))),
  ...[0, 1].map(i => decor(`bench-${i}`, 'bench', v(-12 + i * 6, 9.6), { rotation: [0, Math.PI, 0] })),
  decor('sign', 'sign', v(-16, 10.6), { rotation: [0, Math.PI, 0], surfaceLabel: { kind: 'text', text: 'AQUATIC CENTRE', color: '#1f3a5f' } }),
];

/** Snapshot-dependent nodes: pools, lane blocks, swimmers, posts, plant equipment and the lane board. */
export function aquaticsNodes(snapshot: AquaticsSnapshot): SceneNode[] {
  const nodes: SceneNode[] = [...aquaticsBase];
  nodes.push(
    { id: 'pool:main', entityId: 'main', kind: 'asset', asset: 'lap-pool', variant: snapshot.open ? 'open' : 'covered', position: MAIN_POOL, label: `${POOL_LABELS.main} · ${bathers(snapshot, 'main')} in water`, labelMode: 'active', selectable: true },
    { id: 'pool:teaching', entityId: 'teaching', kind: 'asset', asset: 'wading-pool', variant: snapshot.teaching.fountain ? 'fountain' : 'still', position: TEACHING_POOL, label: `${POOL_LABELS.teaching} · ${snapshot.teaching.bathers} in water`, labelMode: 'active', selectable: true },
  );
  snapshot.lanes.forEach((session, i) => {
    const use = LANE_USE[session.use];
    nodes.push({ id: `lane:${session.laneId}`, entityId: session.laneId, kind: 'asset', asset: 'starting-block', attachment: { nodeId: 'pool:main', anchor: `lane-${i}-start` }, state: laneState(session), color: session.use === 'closed' ? '#8d99a8' : use.color, surfaceLabel: { kind: 'text', text: String(laneNumber(session.laneId)), color: '#1f3a5f' }, label: `Lane ${laneNumber(session.laneId)} · ${use.label}`, labelMode: 'active', selectable: true });
    nodes.push({ id: `lane-status:${session.laneId}`, entityId: session.laneId, kind: 'asset', asset: 'map-pin', attachment: { nodeId: `lane:${session.laneId}`, anchor: 'stand' }, position: [0, .12, 0], scale: [.35, .35, .35], state: laneState(session), localMotion: false, selectable: true });
    const visible = Math.min(LANE_VISIBLE, session.swimmers), speed = session.speed ? SPEED[session.speed] : session.use === 'closed' ? 0 : SPEED[session.use];
    for (let k = 0; k < visible; k++) {
      const points = laneLoop(i, k / visible + i * .13);
      nodes.push({ id: `swimmer:${session.laneId}:${k}`, kind: 'asset', asset: 'swimmer', color: CAPS[(i + k * 2) % CAPS.length], position: points[0], route: { points, speed: speed * (1 + (k % 2) * .08), loop: true }, ...(session.use === 'lessons' ? { scale: CHILD } : {}), selectable: false });
    }
  });
  // Children stand in the teaching pool; two float. Positions are illustrative.
  const spots = [[-1.6, .4], [-.9, 1.5], [1.3, 1.2], [1.7, -.6], [.2, 1.9], [-1.4, -1.2], [.6, -1.8], [-.3, -2.1]] as const;
  for (let k = 0; k < Math.min(TEACHING_VISIBLE, snapshot.teaching.bathers); k++) {
    const [x, z] = spots[k], position = v(TEACHING_POOL[0] + x, TEACHING_POOL[2] + z);
    nodes.push(k % 4 === 3
      ? { id: `child:${k}`, kind: 'asset', asset: 'swimmer', variant: 'floating', color: CAPS[k % CAPS.length], position: [position[0], .01, position[2]], rotation: [0, k, 0], scale: CHILD, selectable: false }
      : { id: `child:${k}`, kind: 'asset', asset: 'worker', materials: { hair: personHairColor(`child:${k}`) }, variant: k % 2 ? 'idle' : 'holding', ...(k % 3 ? {} : { person: { figure: 'feminine' } as const }), color: CAPS[(k + 2) % CAPS.length], position, rotation: [0, Math.atan2(-x, -z), 0], scale: CHILD, selectable: false });
  }
  const chairs: Readonly<Record<LifeguardPost['id'], { position: Vec3; yaw: number }>> = { north: { position: v(-12, -8.2), yaw: 0 }, south: { position: v(0, 8.2), yaw: Math.PI }, teaching: { position: v(14, -1.4), yaw: 0 } };
  for (const post of snapshot.posts) {
    const chair = chairs[post.id], status = POST_STATUS[post.status];
    nodes.push({ id: `post:${post.id}`, entityId: post.id, kind: 'asset', asset: 'lifeguard-chair', position: chair.position, rotation: [0, chair.yaw, 0], state: postState(snapshot, post), label: `${post.label} · ${snapshot.open ? status.label : 'Off duty'}`, labelMode: 'active', selectable: true });
    nodes.push({ id: `post-status:${post.id}`, entityId: post.id, kind: 'asset', asset: 'map-pin', attachment: { nodeId: `post:${post.id}`, anchor: 'top' }, position: [0, .1, 0], scale: [.35, .35, .35], state: postState(snapshot, post), localMotion: false, selectable: true });
    if (snapshot.open && post.status === 'on-post') nodes.push({ id: `guard:${post.id}`, kind: 'asset', asset: 'worker', materials: { hair: personHairColor(`guard:${post.id}`) }, variant: 'seated', ...(post.id === 'south' ? { person: { figure: 'feminine' } as const } : {}), color: STAFF, attachment: { nodeId: `post:${post.id}`, anchor: 'seat' }, position: [0, -.52, 0], selectable: false });
  }
  // A responding lifeguard stands on the deck at the lane, and a replacement walks toward an empty post.
  const alertLane = snapshot.lanes.findIndex(session => session.alert);
  if (snapshot.open && alertLane >= 0) nodes.push({ id: 'guard:responding', kind: 'asset', asset: 'worker', materials: { hair: personHairColor('guard:responding') }, variant: 'idle', color: STAFF, position: v(MAIN_POOL[0] - LAP_POOL.length / 2 - .9, MAIN_POOL[2] + lapPoolLaneZ(alertLane) + .9), rotation: [0, Math.PI / 2, 0], label: 'Lifeguard responding', labelMode: 'active', selectable: false });
  snapshot.filters.forEach((filter, i) => nodes.push({ id: `filter:${filter.id}`, entityId: filter.id, kind: 'asset', asset: 'sand-filter', position: v(-5.2 + i * 1.3, -12.5), state: filterState(filter), label: `Filter ${filter.id}`, labelMode: 'active', selectable: true }));
  (['main', 'teaching'] as const).forEach((pool, i) => {
    const reading = snapshot.water[pool], state = waterState(reading);
    nodes.push({ id: `dosing:${pool}`, entityId: `water-${pool}`, kind: 'asset', asset: 'dosing-station', position: v(1.2 + i * 2.2, -13.4), state, label: `Dosing · ${POOL_LABELS[pool]}`, labelMode: 'active', selectable: true, surfaceLabel: { kind: 'text', text: waterLabel(reading), color: state === 'normal' ? '#9ff0d0' : '#ffd27a', background: '#0f1c2b' } });
  });
  nodes.push({ id: 'lane-board', kind: 'asset', asset: 'information-board', position: v(-22, -4.5), rotation: [0, Math.PI / 2, 0], label: 'Lane board', labelMode: 'active', selectable: false, surfaceLabel: { kind: 'text', layout: 'multiline', color: '#e9f3ff', background: '#14263d', text: snapshot.open ? snapshot.lanes.map(session => `${laneNumber(session.laneId)}  ${session.use === 'public' ? session.speed!.toUpperCase() : LANE_USE[session.use].label.toUpperCase()}  ${session.use === 'closed' ? '' : `${session.swimmers}/${session.capacity}`}`.trimEnd()).join('\n') : 'POOL CLOSED\nOpens 06:30' } });
  return nodes;
}

export function createAquaticsStore(scenario: AquaticsScenario = 'afternoon'): SceneStore {
  return createSceneStore({ schemaVersion: 1, nodes: aquaticsNodes(SCENARIOS[scenario]) }, { zoom: 1.15 });
}
/** Replace with a confirmed host snapshot. Nothing in the UI changes bookings or rotas optimistically. */
export function applyAquaticsSnapshot(store: SceneStore, snapshot: AquaticsSnapshot): void { store.replace(aquaticsNodes(snapshot)); }
