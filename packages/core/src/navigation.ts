import type { Vec3 } from './index';
import type { HandlingViolationCode } from './handling-state';
import { motionProfileOf, validateMotionProfile, type MotionProfile, type NodeRoute, type RouteStop } from './route';

/**
 * A movement graph describes where agents may travel. It is visual/spatial
 * policy only: business rules, authorization and commands stay in the host.
 */
export interface NavPoint {
  id: string;
  position: Vec3;
  label?: string;
  /**
   * Most agents at this point at once (a positive integer). Default: unlimited.
   * Agents hold a limited point while standing at it, while walking between it
   * and a slot it approaches (or using that slot), and from leaving the
   * previous route point until reaching the next one when passing through.
   */
  capacity?: number;
}
export interface NavEdge {
  from: string;
  to: string;
  /** Lane name used by lane rules, e.g. 'walkway' or 'forklift'. */
  lane?: string;
  /** Travel only from `from` to `to`. Default: both directions. */
  oneWay?: boolean;
  /** Agent kinds allowed on this edge; combined with lane rules (both must allow). */
  allow?: readonly string[];
  /** Planning cost multiplier (≥ 1 discourages, < 1 prefers). Default 1. */
  cost?: number;
  /** Maximum speed on this edge in m/s. */
  speedLimit?: number;
  /** Most agents on this edge at once, in either direction (a positive integer). Default: the lane capacity, else unlimited. */
  capacity?: number;
}
export interface NavLaneRule { allow?: readonly string[]; speedLimit?: number; /** Default capacity of each edge in the lane. */ capacity?: number; }
/** Speed and kinematics of an agent kind: how it accelerates, brakes, takes corners and turns in place. */
export interface NavAgentRule extends MotionProfile { speed: number; }
export interface NavGraphDefinition {
  points: readonly NavPoint[];
  edges: readonly NavEdge[];
  lanes?: Readonly<Record<string, NavLaneRule>>;
  agents?: Readonly<Record<string, NavAgentRule>>;
}

/** Route codes, plus item and handling codes the behavior runner reports when a pick-up or put-down cannot happen. */
export type RouteViolationCode = 'unknown-agent' | 'unknown-point' | 'missing-edge' | 'wrong-direction' | 'agent-not-allowed' | 'no-route' | 'unknown-item' | 'item-unavailable' | 'item-out-of-reach' | 'carry-full' | 'not-carrying' | HandlingViolationCode;
export interface RouteViolation { code: RouteViolationCode; message: string; from?: string; to?: string; }

export interface NavStep { from: string; to: string; lane?: string; length: number; speed: number; }
export interface PlannedRoute {
  agent: string;
  points: readonly string[];
  positions: readonly Vec3[];
  steps: readonly NavStep[];
  /** Route point index reached for each requested stop: `from`, every `via`, then `to`. */
  waypoints: readonly number[];
  length: number;
  /** Travel seconds at permitted speeds, excluding stops, turns in place and acceleration (see `routeDuration`). */
  duration: number;
  /** Motion profile of the agent kind, copied from its rule. */
  profile?: MotionProfile;
}
export type RoutePlan = { ok: true; route: PlannedRoute } | { ok: false; violations: readonly RouteViolation[] };
export interface RouteRequest {
  agent: string; from: string; to: string;
  /** Points to pass through in order. */
  via?: readonly string[];
  /** Lanes to avoid even when allowed. */
  avoidLanes?: readonly string[];
  /** Extra planning cost (≥ 0, in metres of travel) for moving from → to, e.g. around a busy corridor; Infinity forbids the move. */
  penalty?: (from: string, to: string) => number;
}

export interface NavGraph {
  readonly definition: NavGraphDefinition;
  point(id: string): NavPoint | undefined;
  /** Plan the cheapest permitted route for an agent kind. */
  plan(request: RouteRequest): RoutePlan;
  /** Check an explicit host-supplied sequence of point IDs against the rules. */
  check(agent: string, points: readonly string[]): readonly RouteViolation[];
  /**
   * Planning cost (length × edge cost) from `from` to every point the agent may
   * reach, including `from` itself at 0. Empty for an unknown agent or point.
   */
  reach(agent: string, from: string, options?: { avoidLanes?: readonly string[] }): ReadonlyMap<string, number>;
  /** The edge that permits travel from → to (both directions share one edge object), or undefined. */
  edge(from: string, to: string): NavEdge | undefined;
  /** Capacity of a point, or of the edge from → to (edge, then lane capacity). Infinity when unlimited or unknown. */
  capacity(point: string): number;
  capacity(from: string, to: string): number;
}

interface Arc { edge: NavEdge; from: string; to: string; length: number; }
const MAX_SPEED = 30;
const validSpeed = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= MAX_SPEED;
const validCapacity = (value: unknown) => value === undefined || Number.isSafeInteger(value) && (value as number) >= 1;
const validNames = (value: unknown) => value === undefined || Array.isArray(value) && value.every(name => typeof name === 'string' && name.trim().length > 0);

export function createNavGraph(definition: NavGraphDefinition): NavGraph {
  const points = new Map<string, NavPoint>();
  for (const point of definition.points) {
    if (typeof point.id !== 'string' || !point.id.trim()) throw new Error('Navigation point ID must not be empty.');
    if (points.has(point.id)) throw new Error(`Duplicate navigation point: ${point.id}.`);
    if (!Array.isArray(point.position) || point.position.length !== 3 || !point.position.every(Number.isFinite)) throw new Error(`Navigation point ${point.id} requires a finite position.`);
    if (!validCapacity(point.capacity)) throw new Error(`Navigation point ${point.id} requires a capacity that is a positive integer.`);
    points.set(point.id, Object.freeze({ ...point, position: Object.freeze([...point.position]) as Vec3 }));
  }
  for (const [name, rule] of Object.entries(definition.agents ?? {})) {
    if (!name.trim() || !validSpeed(rule?.speed)) throw new Error(`Agent ${name} requires a speed greater than 0 and at most ${MAX_SPEED} m/s.`);
    validateMotionProfile(rule, `Agent ${name}`);
  }
  for (const [name, rule] of Object.entries(definition.lanes ?? {})) {
    if (!name.trim() || !validNames(rule?.allow)) throw new Error(`Lane ${name} has an invalid allow list.`);
    if (rule.speedLimit !== undefined && !validSpeed(rule.speedLimit)) throw new Error(`Lane ${name} has an invalid speed limit.`);
    if (!validCapacity(rule.capacity)) throw new Error(`Lane ${name} requires a capacity that is a positive integer.`);
  }
  const outgoing = new Map<string, Arc[]>(), directed = new Set<string>();
  for (const edge of definition.edges) {
    const label = `${edge.from} → ${edge.to}`;
    const from = points.get(edge.from), to = points.get(edge.to);
    if (!from || !to) throw new Error(`Navigation edge ${label} references an unknown point.`);
    if (edge.from === edge.to) throw new Error(`Navigation edge ${label} must connect two different points.`);
    if (edge.lane !== undefined && (typeof edge.lane !== 'string' || !edge.lane.trim())) throw new Error(`Navigation edge ${label} has an empty lane name.`);
    if (!validNames(edge.allow)) throw new Error(`Navigation edge ${label} has an invalid allow list.`);
    if (edge.cost !== undefined && !(Number.isFinite(edge.cost) && edge.cost > 0)) throw new Error(`Navigation edge ${label} requires a positive cost.`);
    if (edge.speedLimit !== undefined && !validSpeed(edge.speedLimit)) throw new Error(`Navigation edge ${label} has an invalid speed limit.`);
    if (!validCapacity(edge.capacity)) throw new Error(`Navigation edge ${label} requires a capacity that is a positive integer.`);
    const length = Math.hypot(to.position[0] - from.position[0], to.position[1] - from.position[1], to.position[2] - from.position[2]);
    const frozen = Object.freeze({ ...edge, ...(edge.allow ? { allow: Object.freeze([...edge.allow]) } : {}) });
    for (const [a, b] of edge.oneWay ? [[edge.from, edge.to]] : [[edge.from, edge.to], [edge.to, edge.from]]) {
      // One edge per direction keeps explicit route checks unambiguous.
      if (directed.has(`${a}\u0000${b}`)) throw new Error(`Duplicate navigation edge direction: ${a} → ${b}.`);
      directed.add(`${a}\u0000${b}`);
      outgoing.set(a, [...outgoing.get(a) ?? [], { edge: frozen, from: a, to: b, length }]);
    }
  }
  const frozenDefinition: NavGraphDefinition = Object.freeze({
    points: Object.freeze([...points.values()]),
    edges: Object.freeze(definition.edges.map(edge => Object.freeze({ ...edge }))),
    ...(definition.lanes ? { lanes: Object.freeze({ ...definition.lanes }) } : {}),
    ...(definition.agents ? { agents: Object.freeze({ ...definition.agents }) } : {}),
  });

  const allows = (agent: string, arc: Arc) => {
    const lane = arc.edge.lane ? definition.lanes?.[arc.edge.lane] : undefined;
    return (!arc.edge.allow || arc.edge.allow.includes(agent)) && (!lane?.allow || lane.allow.includes(agent));
  };
  const speedOn = (agent: string, arc: Arc) => Math.min(definition.agents![agent].speed, arc.edge.speedLimit ?? Infinity, (arc.edge.lane && definition.lanes?.[arc.edge.lane]?.speedLimit) || Infinity);
  const agentViolation = (agent: string): RouteViolation | null => definition.agents?.[agent] ? null : { code: 'unknown-agent', message: `Agent kind ${agent} has no speed rule.` };
  const pointViolation = (id: string): RouteViolation | null => points.has(id) ? null : { code: 'unknown-point', message: `Unknown navigation point: ${id}.`, from: id };

  function search(agent: string, start: string, goal: string | null, avoid: ReadonlySet<string>, penalty?: RouteRequest['penalty']) {
    // Dijkstra over permitted arcs; graphs are small, so a linear frontier scan is sufficient and deterministic.
    const best = new Map<string, number>([[start, 0]]), previous = new Map<string, Arc>(), done = new Set<string>();
    for (;;) {
      let current: string | null = null;
      for (const [id, cost] of best) if (!done.has(id) && (current === null || cost < best.get(current)!)) current = id;
      if (current === null || current === goal) return { best, previous, found: current !== null };
      done.add(current);
      for (const arc of outgoing.get(current) ?? []) {
        if (done.has(arc.to) || !allows(agent, arc) || (arc.edge.lane && avoid.has(arc.edge.lane))) continue;
        const extra = penalty ? penalty(arc.from, arc.to) : 0;
        if (Number.isNaN(extra) || extra < 0) throw new Error('Route penalties must be non-negative.');
        const cost = best.get(current)! + arc.length * (arc.edge.cost ?? 1) + extra;
        if (cost < (best.get(arc.to) ?? Infinity)) { best.set(arc.to, cost); previous.set(arc.to, arc); }
      }
    }
  }
  function cheapest(agent: string, start: string, goal: string, avoid: ReadonlySet<string>, penalty?: RouteRequest['penalty']): Arc[] | null {
    const { previous, found } = search(agent, start, goal, avoid, penalty);
    if (!found) return null;
    const arcs: Arc[] = []; for (let id = goal; id !== start; id = previous.get(id)!.from) arcs.unshift(previous.get(id)!);
    return arcs;
  }
  function build(agent: string, arcs: readonly Arc[], first: string, waypoints: readonly number[]): PlannedRoute {
    const steps = arcs.map(arc => Object.freeze({ from: arc.from, to: arc.to, ...(arc.edge.lane ? { lane: arc.edge.lane } : {}), length: arc.length, speed: speedOn(agent, arc) }));
    const ids = [first, ...arcs.map(arc => arc.to)];
    const profile = motionProfileOf(definition.agents![agent]);
    return Object.freeze({ agent, ...(profile ? { profile } : {}), points: Object.freeze(ids), positions: Object.freeze(ids.map(id => points.get(id)!.position)), steps: Object.freeze(steps), waypoints: Object.freeze([...waypoints]), length: steps.reduce((sum, step) => sum + step.length, 0), duration: steps.reduce((sum, step) => sum + step.length / step.speed, 0) });
  }

  const edgeOf = (from: string, to: string) => outgoing.get(from)?.find(arc => arc.to === to)?.edge;
  return {
    definition: frozenDefinition,
    point: id => points.get(id),
    plan(request) {
      const stops = [request.from, ...request.via ?? [], request.to];
      const violations = [agentViolation(request.agent), ...stops.map(pointViolation)].filter((value): value is RouteViolation => value !== null);
      if (violations.length) return { ok: false, violations: Object.freeze(violations) };
      const avoid = new Set(request.avoidLanes ?? []), arcs: Arc[] = [], waypoints = [0];
      for (let i = 0; i < stops.length - 1; i++) {
        if (stops[i] === stops[i + 1]) { waypoints.push(arcs.length); continue; }
        const leg = cheapest(request.agent, stops[i], stops[i + 1], avoid, request.penalty);
        if (!leg) return { ok: false, violations: Object.freeze([{ code: 'no-route' as const, message: `No permitted route for ${request.agent} from ${stops[i]} to ${stops[i + 1]}.`, from: stops[i], to: stops[i + 1] }]) };
        arcs.push(...leg); waypoints.push(arcs.length);
      }
      return { ok: true, route: build(request.agent, arcs, request.from, waypoints) };
    },
    check(agent, ids) {
      const violations: RouteViolation[] = [];
      const unknownAgent = agentViolation(agent); if (unknownAgent) violations.push(unknownAgent);
      for (const id of ids) { const unknown = pointViolation(id); if (unknown) violations.push(unknown); }
      if (violations.length) return Object.freeze(violations);
      for (let i = 0; i < ids.length - 1; i++) {
        const from = ids[i], to = ids[i + 1], arc = outgoing.get(from)?.find(item => item.to === to);
        if (!arc) {
          const reverse = outgoing.get(to)?.some(item => item.to === from);
          violations.push(reverse ? { code: 'wrong-direction', message: `${from} → ${to} is one-way in the opposite direction.`, from, to } : { code: 'missing-edge', message: `No navigation edge connects ${from} → ${to}.`, from, to });
        } else if (!allows(agent, arc)) violations.push({ code: 'agent-not-allowed', message: `${agent} may not use ${arc.edge.lane ? `lane ${arc.edge.lane}` : 'this edge'} between ${from} and ${to}.`, from, to });
      }
      return Object.freeze(violations);
    },
    reach(agent, from, options = {}) {
      if (agentViolation(agent) || pointViolation(from)) return new Map();
      return search(agent, from, null, new Set(options.avoidLanes ?? [])).best;
    },
    edge: edgeOf,
    capacity(from: string, to?: string) {
      if (to === undefined) return points.get(from)?.capacity ?? Infinity;
      const edge = edgeOf(from, to);
      return edge ? edge.capacity ?? (edge.lane ? definition.lanes?.[edge.lane]?.capacity : undefined) ?? Infinity : Infinity;
    },
  };
}

export interface WaypointStop {
  /** Index into the request stops: 0 = `from`, then each `via`, last = `to`. */
  waypoint: number;
  seconds: number;
  /** Heading while stopped; defaults to the slot heading for slot visits. */
  yaw?: number;
  /**
   * Visit an interaction slot whose approach is this waypoint: step from the
   * approach to the slot position, pause there, and step back out.
   */
  slot?: { position: Vec3; yaw: number };
}

/**
 * Convert a planned route into a renderer route. Lane and edge speed limits
 * become per-segment speeds; waypoint stops become timed pauses at the
 * corresponding route points (pass-through points never pause).
 */
export function toNodeRoute(route: PlannedRoute, options: { loop?: boolean; endYaw?: number; startYaw?: number; stops?: readonly WaypointStop[] } = {}): NodeRoute {
  if (route.positions.length < 2) throw new Error('A node route needs at least one travel step.');
  const byIndex = new Map<number, WaypointStop>();
  for (const stop of options.stops ?? []) {
    const index = route.waypoints[stop.waypoint];
    if (index === undefined) throw new Error(`Unknown route waypoint: ${stop.waypoint}.`);
    if (byIndex.has(index)) throw new Error(`Waypoints ${stop.waypoint} and another stop share route point ${index}.`);
    byIndex.set(index, stop);
  }
  const points: Vec3[] = [], speeds: number[] = [], stops: RouteStop[] = [];
  route.positions.forEach((point, i) => {
    if (i > 0) speeds.push(route.steps[i - 1].speed);
    points.push(point);
    const stop = byIndex.get(i); if (!stop) return;
    if (!stop.slot) { stops.push({ index: points.length - 1, seconds: stop.seconds, ...(stop.yaw !== undefined ? { yaw: stop.yaw } : {}) }); return; }
    const detour = route.steps[i - 1]?.speed ?? route.steps[i].speed;
    points.push(stop.slot.position); speeds.push(detour);
    stops.push({ index: points.length - 1, seconds: stop.seconds, yaw: stop.yaw ?? stop.slot.yaw });
    points.push(point); speeds.push(detour);
  });
  const speed = Math.max(...speeds);
  return { points, speed, ...(speeds.some(value => value !== speed) ? { segmentSpeeds: speeds } : {}), ...(stops.length ? { stops } : {}), ...(options.loop !== undefined ? { loop: options.loop } : {}), ...(options.endYaw !== undefined ? { endYaw: options.endYaw } : {}), ...(options.startYaw !== undefined ? { startYaw: options.startYaw } : {}), ...(route.profile ? { profile: route.profile } : {}) };
}
