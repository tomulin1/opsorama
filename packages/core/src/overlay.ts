import type { Vec3 } from './index';
import type { NavGraph } from './navigation';
import type { ResolvedSlot } from './interaction';
import type { NodeRoute } from './route';
import type { CapacityHold } from './behavior';

/** Lines and floor markers drawn above the scene for debugging; not selectable and not part of the scene store. */
export interface SceneOverlay { lines: readonly OverlayLine[]; points: readonly OverlayPoint[]; }
export interface OverlayLine { from: Vec3; to: Vec3; color: string; /** Arrow head at `to`. */ arrow?: boolean; dashed?: boolean; }
export interface OverlayPoint { position: Vec3; color: string; /** Metres; default .12. */ radius?: number; }

export const OVERLAY_COLORS = Object.freeze({ point: '#5d6f86', free: '#2f9e6f', reserved: '#d0504c', route: '#3d6fd8', limited: '#7c5cc4', held: '#e07b39', lanes: Object.freeze(['#3c8dbc', '#d9922e', '#8c62c7', '#2a9d8f', '#c45a8a', '#6b8e23']) });
const MAX_OVERLAY_ITEMS = 5000;
const hex = /^#[0-9a-f]{6}$/i;
const finite = (value: unknown) => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);

export function validateOverlay(overlay: SceneOverlay): void {
  if (!overlay || !Array.isArray(overlay.lines) || !Array.isArray(overlay.points)) throw new Error('Overlay requires lines and points arrays.');
  if (overlay.lines.length + overlay.points.length > MAX_OVERLAY_ITEMS) throw new Error(`Overlay supports at most ${MAX_OVERLAY_ITEMS} items.`);
  for (const line of overlay.lines) if (!finite(line.from) || !finite(line.to) || !hex.test(line.color)) throw new Error('Overlay lines need finite endpoints and #RRGGBB colors.');
  for (const point of overlay.points) if (!finite(point.position) || !hex.test(point.color) || point.radius !== undefined && !(point.radius > 0 && point.radius <= 2)) throw new Error('Overlay points need a finite position, #RRGGBB color and radius up to 2 m.');
}

export interface NavOverlayOptions {
  /** Lane → color; lanes without a color get a stable palette color. */
  laneColors?: Readonly<Record<string, string>>;
  slots?: readonly ResolvedSlot[];
  /** Slot ID → agent ID; reserved slots are drawn in the reserved color. */
  reservations?: ReadonlyMap<string, string>;
  routes?: readonly NodeRoute[];
  /** Capacity holds from `runner.getHolds()`; holds active at `time` mark their point or edge as held. */
  holds?: readonly CapacityHold[];
  /** Simulation time for `holds`, e.g. `runner.time`. Default: every hold counts as active. */
  time?: number;
}

/**
 * Describe a movement graph, slot occupancy, capacity and active routes as an
 * overlay. Capacity-limited points get a ring and limited edges a midpoint
 * marker in the `limited` color; points and edges held at `time` turn `held`,
 * and held edges are traced in that color.
 */
export function navGraphOverlay(graph: NavGraph, options: NavOverlayOptions = {}): SceneOverlay {
  const lanes = [...new Set(graph.definition.edges.map(edge => edge.lane).filter((lane): lane is string => Boolean(lane)))].sort();
  const laneColor = (lane?: string) => lane ? options.laneColors?.[lane] ?? OVERLAY_COLORS.lanes[lanes.indexOf(lane) % OVERLAY_COLORS.lanes.length] : OVERLAY_COLORS.point;
  const slotIds = new Set((options.slots ?? []).map(slot => slot.id));
  const lines: OverlayLine[] = graph.definition.edges.map(edge => ({ from: graph.point(edge.from)!.position, to: graph.point(edge.to)!.position, color: laneColor(edge.lane), ...(edge.oneWay ? { arrow: true } : {}) }));
  const points: OverlayPoint[] = graph.definition.points.filter(point => !slotIds.has(point.id)).map(point => ({ position: point.position, color: OVERLAY_COLORS.point, radius: .1 }));
  for (const slot of options.slots ?? []) {
    const color = options.reservations?.has(slot.id) ? OVERLAY_COLORS.reserved : OVERLAY_COLORS.free;
    lines.push({ from: slot.approach, to: slot.position, color, dashed: true });
    points.push({ position: slot.approach, color, radius: .1 }, { position: slot.position, color, radius: .18 });
  }
  const active = (options.holds ?? []).filter(hold => options.time === undefined || hold.from <= options.time && options.time < hold.to);
  const heldPoints = new Set(active.flatMap(hold => hold.point ? [hold.point] : [])), heldEdges = new Set(active.flatMap(hold => hold.edge ? [`${hold.edge.from}\u0000${hold.edge.to}`] : []));
  const markers: OverlayPoint[] = [];
  for (const point of graph.definition.points) if (graph.capacity(point.id) < Infinity) markers.push({ position: point.position, color: heldPoints.has(point.id) ? OVERLAY_COLORS.held : OVERLAY_COLORS.limited, radius: .2 });
  for (const edge of graph.definition.edges) {
    if (graph.capacity(edge.from, edge.to) === Infinity) continue;
    const from = graph.point(edge.from)!.position, to = graph.point(edge.to)!.position, held = heldEdges.has(`${edge.from}\u0000${edge.to}`);
    if (held) lines.push({ from, to, color: OVERLAY_COLORS.held });
    markers.push({ position: [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2], color: held ? OVERLAY_COLORS.held : OVERLAY_COLORS.limited, radius: .09 });
  }
  for (const route of options.routes ?? []) route.points.slice(1).forEach((point, index) => lines.push({ from: route.points[index], to: point, color: OVERLAY_COLORS.route, dashed: true }));
  // Capacity rings go first, so the smaller point markers stay visible on top of them.
  return { lines, points: [...markers, ...points] };
}
