import type { AssetNode, Vec3 } from './index';
import type { NavEdge, NavGraph, PlannedRoute, RouteRequest, RouteViolation } from './navigation';
import type { ResolvedSlot } from './interaction';
import { joinRoutes, motionProfileOf, routeDuration, routeJoin, routeTimes, sampleRoute, type NodeRoute, type RouteSample } from './route';
import { DEFAULT_STACK_HEIGHT, validateCarryRule, validateItemRest, type CarryRule, type ItemPlacement, type ItemRest } from './carry';
import type { FloorPlacement, HandlingMove, HandlingState, HandlingTarget, ReceptacleTarget, UnitPlacement } from './handling-state';

/** Seconds, or a `[min, max]` range drawn from the runner's seeded random source. */
export type BehaviorDuration = number | readonly [number, number];

/** Slots on one object: a named `slot`, any slot of `group`, or any slot. */
export interface SlotQuery { node: string; slot?: string; group?: string; }

/**
 * Where a `move` goes. The runner resolves it when the step starts, from the
 * agent's point (or the last `via` point):
 * - a movement-graph point ID;
 * - `{ position }`: the reachable point nearest to a world position (horizontal distance);
 * - a `SlotQuery`: the cheapest reachable approach of the object's matching slots, without reserving a slot.
 */
export type MoveTarget = string | { position: Vec3 } | SlotQuery;

export type BehaviorStep =
  /** Travel to a target, optionally through `via` points in order. */
  | { kind: 'move'; to: MoveTarget; via?: readonly string[]; avoidLanes?: readonly string[]; label?: string }
  /**
   * Reserve the nearest free matching slot on `node`, walk to it (through `via`
   * when given), take its pose for `seconds`, then release it. When every
   * matching slot is taken the agent joins a first-come queue, standing at the
   * listed `queue` points in order when provided.
   */
  | ({ kind: 'interact'; via?: readonly string[]; avoidLanes?: readonly string[]; label?: string } & SlotQuery & InteractDetails)
  /** Stay in place. */
  | { kind: 'wait'; seconds: BehaviorDuration; label?: string };

/**
 * What happens at a slot. Items change hands when the interaction ends: first
 * `putDown`, then `pickUp`, so an agent can swap a load in one visit.
 */
export interface InteractDetails {
  seconds: BehaviorDuration;
  /** Points where agents wait, in order, while every matching slot is taken. */
  queue?: readonly string[];
  /** Pose while interacting instead of the slot's pose, e.g. `picking` or `placing`. */
  pose?: string;
  /**
   * Items to take: their IDs, or a number of items resting on this object
   * (oldest first, fewer when fewer are there). Requires the agent's `carry` rule.
   * With handling state, a count skips units it cannot reach or hold.
   */
  pickUp?: number | readonly string[];
  /** Carried items to put down: their IDs, or `all`. */
  putDown?: 'all' | readonly string[];
  /**
   * Where put-down items rest on this object. Without it they rest on the floor
   * 0.45 m ahead of the slot.
   * - Without handling state: a named anchor and/or a local offset; items on one
   *   spot stack by the agent's stack height.
   * - With handling state: a `receptacle` of this object, checked like any move;
   *   omitted fields resolve to the next free place.
   * - In both modes: a floor placement, `{ position, yaw }` in world metres and
   *   radians, for loads the agent sets down further away than 0.45 m, such as a
   *   pallet at the tips of a forklift's forks. Every item of the put-down lands there.
   */
  putOn?: { anchor?: string; offset?: Vec3 } | Omit<ReceptacleTarget, 'container'> | FloorPlacement;
}

export interface BehaviorAgent {
  id: string;
  /** Agent kind used by movement rules and slot permissions, e.g. `person`. */
  agent: string;
  /** Movement-graph point where the agent starts. */
  start: string;
  steps: readonly BehaviorStep[];
  loop?: boolean;
  /** Pose while travelling. Default `walking`. */
  travelPose?: string;
  /** Pose while waiting or queued. Default `idle`. */
  idlePose?: string;
  /** Initial heading. Default 0. */
  yaw?: number;
  /** How the agent carries items; required for `pickUp` and `putDown`. */
  carry?: CarryRule;
  /** Leave a slot in reverse, back to its approach, instead of turning around in it; for vehicles whose forks are inside a load or a rack. Default false. */
  backOut?: boolean;
}

/** `yielding`: waiting for a capacity-limited point or edge on the agent's next route to clear. */
export type AgentPhase = 'moving' | 'yielding' | 'queued' | 'interacting' | 'waiting' | 'idle' | 'blocked';

export interface AgentState {
  id: string;
  agent: string;
  phase: AgentPhase;
  /** Index of the current step; equals `steps.length` once a non-looping behavior finishes. */
  step: number;
  label?: string;
  /** Movement-graph point the agent is at, or is travelling to. */
  at: string;
  /** Route for the renderer; it ends at `position`. */
  route?: NodeRoute;
  /** Simulation time at which `route` started; `behaviorNode(state, base, { time })` uses it to resume the route after a remount. */
  routeStart?: number;
  pose: string;
  /** Confirmed position and heading at the end of the current route. */
  position: Vec3;
  yaw: number;
  /** Reserved slot ID while walking to or using a slot. */
  slot?: string;
  /** 1-based place in a slot queue. */
  queuePlace?: number;
  /** Why the agent stopped, when `phase` is `blocked`. */
  violations?: readonly RouteViolation[];
  /**
   * Agents (this one included, sorted) that wait for each other with no end:
   * each stands on a capacity-limited point another one needs. Present while
   * the agent is `yielding` in such a cycle; a host command to any member ends it.
   */
  deadlock?: readonly string[];
  /**
   * Agents (sorted) that keep this agent's open-ended wait for capacity from
   * ending and stand still with nothing planned: finished, idle or blocked.
   * Found directly or through other waiting agents. Present while the agent is
   * `yielding` or `queued` behind them; a host command to one of them ends it.
   */
  stalled?: readonly string[];
  /** IDs of carried items, bottom first; absent when empty. */
  carrying?: readonly string[];
}

export type BehaviorEventDetail =
  | { type: 'step-started'; label?: string }
  | { type: 'arrived'; point: string }
  | { type: 'queued'; node: string; place: number }
  | { type: 'interaction-started'; slot: string }
  /** `interrupted` when a host command ended the interaction early. */
  | { type: 'interaction-ended'; slot: string; interrupted?: boolean }
  | { type: 'blocked'; violations: readonly RouteViolation[] }
  /**
   * The agent waits at `point` because a capacity-limited point or edge on its
   * route is held by `agents`. `seconds` is the wait when known; an open-ended
   * wait is reported again with `seconds` once the agent has a departure time
   * (once only, when that happens in the same instant).
   */
  | { type: 'yielding'; point: string; seconds?: number; agents: readonly string[] }
  /** Items taken at `node` when an interaction ended. */
  | { type: 'picked-up'; node: string; items: readonly string[] }
  /** Items put down at `node` when an interaction ended; `getItems()` has where they rest. */
  | { type: 'put-down'; node: string; items: readonly string[] }
  /**
   * The agent joined a cycle of open-ended waits for capacity (`agents`, sorted)
   * that cannot clear by itself. The agents keep waiting; reassign one of them.
   */
  | { type: 'deadlock'; agents: readonly string[] }
  /**
   * The agent's open-ended wait for capacity depends on `agents` (sorted) that
   * stand still with nothing planned (finished, idle or blocked), so it cannot
   * end by itself. Reported once per change; command one of them to move on.
   */
  | { type: 'stalled'; agents: readonly string[] }
  /** A non-looping behavior completed its last step. */
  | { type: 'finished' };
/** What happened to an agent, in simulation-time order. `step` is the index of the step involved. */
export type BehaviorEvent = { agent: string; time: number; step: number } & BehaviorEventDetail;

/**
 * A goal for one agent: where to go and what to use. The agent plans a
 * permitted route, picks the nearest free slot, queues and turns by itself.
 */
export interface AgentCommand {
  goTo?: MoveTarget;
  /** Use a slot on an object. Without `goTo`, the slot is the destination. */
  interact?: SlotQuery & InteractDetails;
  /** Points to pass on the first leg, in order. */
  via?: readonly string[];
  avoidLanes?: readonly string[];
  label?: string;
  /** Steps that follow, such as resuming a routine. */
  then?: readonly BehaviorStep[];
}

/** Steps for a command; `runner.command` assigns them. */
export function commandSteps(command: AgentCommand): BehaviorStep[] {
  if (command.goTo === undefined && !command.interact) throw new Error('A command needs goTo, interact or both.');
  const leg = { ...(command.via ? { via: command.via } : {}), ...(command.avoidLanes ? { avoidLanes: command.avoidLanes } : {}) }, label = command.label !== undefined ? { label: command.label } : {};
  const steps: BehaviorStep[] = [];
  if (command.goTo !== undefined) steps.push({ kind: 'move', to: command.goTo, ...leg, ...label });
  if (command.interact) steps.push({ kind: 'interact', ...command.interact, ...(command.goTo === undefined ? leg : {}), ...label });
  return [...steps, ...command.then ?? []];
}

export interface BehaviorRunner {
  /** Simulation seconds since the runner started. */
  readonly time: number;
  /** Advance simulation time; events are processed in time order regardless of tick size. */
  advance(seconds: number): void;
  getAgents(): readonly AgentState[];
  getAgent(id: string): AgentState | undefined;
  /** Slot ID → agent ID for every reserved slot. */
  getReservations(): ReadonlyMap<string, string>;
  /** Current and planned capacity holds, earliest first; pass them to `navGraphOverlay` to draw them. */
  getHolds(): readonly CapacityHold[];
  /** Replace an agent's steps now, e.g. after a host command. Its reservation and queue place are released. */
  assign(id: string, steps: readonly BehaviorStep[], options?: { loop?: boolean }): void;
  /** Give an agent a goal (`commandSteps`) instead of explicit steps. */
  command(id: string, command: AgentCommand, options?: { loop?: boolean }): void;
  /** Where every tracked item is, in placement order (most recently placed last). */
  getItems(): ReadonlyMap<string, ItemPlacement>;
  /** Add an item or move it, e.g. after a host record changes; an agent holding it lets go. */
  placeItem(id: string, at: ItemRest): void;
  /** Stop tracking an item; an agent holding it lets go. */
  removeItem(id: string): void;
  /** Called after agent or item changes; read `getAgents()` and `getItems()`. */
  subscribe(listener: () => void): () => void;
  /** Receive events after each `advance`, `assign` or `command`, after state subscribers. Events from creation are not delivered. */
  subscribeEvents(listener: (event: BehaviorEvent) => void): () => void;
  dispose(): void;
}

export interface BehaviorRunnerOptions {
  graph: NavGraph;
  slots?: readonly ResolvedSlot[];
  agents: readonly BehaviorAgent[];
  /** Seed for `[min, max]` durations. Default 1. */
  seed?: number;
  /** Items present at the start and where they rest. Not used with `handling`, which already knows them. */
  items?: readonly { id: string; at: ItemRest }[];
  /**
   * Shared handling state. Every placed unit is then an item, and pick-ups and
   * put-downs are checked moves: a blocked exchange reports the same codes as
   * `HandlingState.move`. Each agent with a `carry` rule must be registered, with
   * a receptacle at the rule's anchor. Move, add or remove units through the
   * state, also inside `onItemEvent`; `placeItem` and `removeItem` throw. Without
   * it, items are plain placements with no compatibility check, for scenes
   * without handling declarations. The runner subscribes until `dispose`.
   */
  handling?: HandlingState;
  /**
   * Host item rules, called synchronously at the simulation time of each
   * `picked-up` or `put-down`, before any other agent acts. Use it to restock or
   * remove items so the result does not depend on how often `advance` runs;
   * `subscribeEvents` listeners only hear about events after `advance` returns.
   */
  onItemEvent?: (event: Extract<BehaviorEvent, { type: 'picked-up' | 'put-down' }>, items: ItemRules) => void;
}

/** What `onItemEvent` may do: read and change items, at the event's simulation time. */
export interface ItemRules {
  readonly time: number;
  getItems(): ReadonlyMap<string, ItemPlacement>;
  placeItem(id: string, at: ItemRest): void;
  removeItem(id: string): void;
}

type Leg = { via?: readonly string[]; avoidLanes?: readonly string[] };
/** A travel request. It is planned again while it waits for capacity without a known departure time. */
interface Trip {
  to: string; leg?: Leg;
  /** Off-graph end, such as a slot position. */
  end?: { position: Vec3; yaw: number };
  /** When already at `to` but inside a slot, step out to the point itself. */
  stepOut?: boolean;
  phase: 'moving' | 'queued';
  depart(): void; arrive(): void; fail(violations: readonly RouteViolation[]): void;
}
/** Time window in simulation seconds during which an agent holds a capacity-limited point or edge. */
type Hold = { agent: string; from: number; to: number };
/** A hold of a planned route in route seconds; a `start` hold is the point the agent already stands at and begins now. */
type Claim = { key: string | NavEdge; capacity: number; from: number; to: number; start: boolean };
/** `open`: agents whose holds have no end and keep this trip from fitting at any delay. */
type TripOption = { route?: NodeRoute; spots: readonly string[]; claims: readonly Claim[]; delay: number; agents: readonly string[]; open: readonly string[]; detours: ReadonlyMap<string | NavEdge, number> };

/**
 * A capacity hold: `agent` holds a capacity-limited `point` or `edge` from
 * `from` to `to` (simulation seconds). `to` is Infinity while the agent stands
 * there with no departure planned.
 */
export interface CapacityHold { agent: string; point?: string; edge?: { from: string; to: string }; from: number; to: number }

type Internal = {
  def: BehaviorAgent; steps: readonly BehaviorStep[]; loop: boolean; state: AgentState;
  nextAt: number; onDue: (() => void) | null;
  /** Floor point to leave from when the agent is off-graph (in a slot). */
  leaveFrom?: Vec3;
  /** The latest route, when it started and the movement-graph point of each route point; the agent is travelling until it ends. */
  transit?: { route: NodeRoute; start: number; spots: readonly string[] };
  queueEntry?: { seq: number; step: Extract<BehaviorStep, { kind: 'interact' }> };
  loopStartedAt: number;
  /** Trip that has not departed yet: waiting for capacity, with or without a departure time. */
  trip?: Trip;
  /** Order of an open-ended wait for capacity; open-ended waits are retried first come, first served. */
  waiting?: number;
  /** The `yielding` event of the current open-ended wait. */
  yielded?: BehaviorEvent;
  /** Agents whose open-ended holds keep this agent's open-ended wait from ending. */
  waitsFor?: readonly string[];
};

function random(seed: number) {
  let value = seed >>> 0;
  return () => { value = value + 0x6d2b79f5 >>> 0; let t = value; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const POSITION_EPSILON = 1e-9;
const TIME_EPSILON = 1e-9;
const isFloorPut = (putOn: NonNullable<InteractDetails['putOn']>): putOn is FloorPlacement => 'position' in putOn && !('receptacle' in putOn);
const isPositionTarget = (target: MoveTarget): target is { position: Vec3 } => typeof target === 'object' && 'position' in target;
const finiteVec = (value: unknown): value is Vec3 => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
const validDuration = (value: BehaviorDuration) => typeof value === 'number' ? Number.isFinite(value) && value >= 0 : Array.isArray(value) && value.length === 2 && value.every(Number.isFinite) && value[0] >= 0 && value[1] >= value[0];

export function createBehaviorRunner(options: BehaviorRunnerOptions): BehaviorRunner {
  const { graph } = options, slots = new Map((options.slots ?? []).map(slot => [slot.id, slot])), rand = random(options.seed ?? 1);
  const reservations = new Map<string, string>(), holds = new Map<string | NavEdge, Hold[]>(), listeners = new Set<() => void>(), eventListeners = new Set<(event: BehaviorEvent) => void>(), agents = new Map<string, Internal>();
  let pending: BehaviorEvent[] = [];
  const items = new Map<string, ItemPlacement>();
  let itemSnapshot: ReadonlyMap<string, ItemPlacement> = new Map();
  let time = 0, seq = 0, changed = true, snapshot: readonly AgentState[] = [], disposed = false, retrying = false, retryAgain = false, arranging = false, rearrange = false, advancing = false;

  const validateSteps = (id: string, steps: readonly BehaviorStep[]) => {
    for (const step of steps) {
      if (step.kind === 'move') {
        const to = step.to;
        if (typeof to === 'string') { if (!graph.point(to)) throw new Error(`Agent ${id}: unknown movement point ${to}.`); }
        else if (isPositionTarget(to)) { if (!finiteVec(to.position)) throw new Error(`Agent ${id}: move position must be a finite [x, y, z] value.`); }
        else if (!to || typeof to.node !== 'string' || ![...slots.values()].some(slot => matches(slot, to))) throw new Error(`Agent ${id}: ${String(to?.node)} has no matching interaction slot to move to.`);
      }
      if (step.kind === 'interact') {
        if (!validDuration(step.seconds)) throw new Error(`Agent ${id}: invalid interaction duration.`);
        const matching = [...slots.values()].filter(slot => matches(slot, step));
        if (!matching.length) throw new Error(`Agent ${id}: ${step.node} has no matching interaction slot.`);
        for (const slot of matching) if (!graph.point(slot.id)) throw new Error(`Slot ${slot.id} is not connected to the movement graph; add slotNavPoints and edges.`);
        for (const point of step.queue ?? []) if (!graph.point(point)) throw new Error(`Agent ${id}: unknown queue point ${point}.`);
        if (step.pose !== undefined && !(typeof step.pose === 'string' && step.pose.trim())) throw new Error(`Agent ${id}: interaction pose must not be empty.`);
        if (step.pickUp !== undefined || step.putDown !== undefined) {
          if (!carryRule(id)) throw new Error(`Agent ${id}: picking up or putting down items requires a carry rule.`);
          const ids = (value: unknown) => Array.isArray(value) && value.every(item => typeof item === 'string' && item.trim());
          if (step.pickUp !== undefined && !(typeof step.pickUp === 'number' ? Number.isSafeInteger(step.pickUp) && step.pickUp >= 1 : ids(step.pickUp))) throw new Error(`Agent ${id}: pickUp needs a positive whole number or item IDs.`);
          if (step.putDown !== undefined && step.putDown !== 'all' && !ids(step.putDown)) throw new Error(`Agent ${id}: putDown needs 'all' or item IDs.`);
        }
        if (step.putOn !== undefined) {
          const named = 'receptacle' in step.putOn, floor = isFloorPut(step.putOn);
          if (named && !options.handling) throw new Error(`Agent ${id}: putOn names a receptacle, which needs the runner's handling state. Pass handling, or use an anchor and offset.`);
          if (!named && !floor && options.handling) throw new Error(`Agent ${id}: with handling state, putOn needs a receptacle of ${step.node} or a floor placement; an anchor or offset would skip the compatibility check.`);
          if (isFloorPut(step.putOn)) { if (!Number.isFinite(step.putOn.yaw)) throw new Error(`Agent ${id}: a floor putOn needs a finite heading.`); validateItemRest(step.putOn, `Agent ${id}: putOn`); }
          else if (!named) validateItemRest({ node: step.node, ...step.putOn as { anchor?: string; offset?: Vec3 } }, `Agent ${id}: putOn`);
        }
      }
      if (step.kind === 'wait' && !validDuration(step.seconds)) throw new Error(`Agent ${id}: invalid wait duration.`);
      if (!['move', 'interact', 'wait'].includes(step.kind)) throw new Error(`Agent ${id}: unknown step kind.`);
    }
  };
  const carryRule = (id: string) => options.agents.find(def => def.id === id)?.carry;
  const matches = (slot: ResolvedSlot, step: SlotQuery) => slot.nodeId === step.node && (step.slot === undefined || slot.name === step.slot) && (step.group === undefined || slot.group === step.group);
  const duration = (value: BehaviorDuration) => typeof value === 'number' ? value : value[0] + rand() * (value[1] - value[0]);
  const update = (agent: Internal, patch: Partial<AgentState>) => { agent.state = { ...agent.state, ...patch }; changed = true; };
  const loaded = (agent: Internal) => Boolean(agent.state.carrying?.length);
  const travelPose = (agent: Internal) => (loaded(agent) ? agent.def.carry?.travelPose : undefined) ?? agent.def.travelPose ?? 'walking';
  const idlePose = (agent: Internal) => (loaded(agent) ? agent.def.carry?.idlePose : undefined) ?? agent.def.idlePose ?? 'idle';
  const record = (agent: Internal, event: BehaviorEventDetail) => Object.freeze({ ...event, agent: agent.def.id, time, step: agent.state.step }) as BehaviorEvent;
  const emit = (agent: Internal, event: BehaviorEventDetail) => { const recorded = record(agent, event); pending.push(recorded); return recorded; };
  const schedule = (agent: Internal, at: number, onDue: (() => void) | null) => { agent.nextAt = at; agent.onDue = onDue; };
  /** Where the agent is on its latest route, while that route is still under way. */
  const transitProgress = (agent: Internal): RouteSample | undefined => {
    const transit = agent.transit;
    if (!transit || time >= transit.start + routeDuration(transit.route) - TIME_EPSILON) return undefined;
    const progress = sampleRoute(transit.route, time - transit.start);
    return progress.done ? undefined : progress;
  };
  /** When the latest route ends; now when the agent stands. */
  const transitEnd = (agent: Internal) => agent.transit ? Math.max(time, agent.transit.start + routeDuration(agent.transit.route)) : time;
  /** Make a route point the agent's point; a point off the graph, such as a slot position, is left from there. */
  const placeAt = (agent: Internal, spot: string, position: Vec3) => {
    const point = graph.point(spot)!.position;
    agent.leaveFrom = Math.hypot(position[0] - point[0], position[1] - point[1], position[2] - point[2]) <= POSITION_EPSILON ? undefined : position;
    update(agent, { at: spot });
  };

  /**
   * Route along a plan, optionally leaving a slot first and entering one at the end.
   * `spots` names the movement-graph point of each route point; a slot position counts as its approach point.
   * While a route is under way, the new one continues from the agent's current pose exactly as the
   * renderer's follower joins it (`joinRoutes`), so simulation and visual timing stay identical; without
   * new travel the trip ends where the route under way ends.
   */
  function makeRoute(agent: Internal, plan: PlannedRoute | null, end?: { position: Vec3; yaw: number; point: string }): { route?: NodeRoute; spots: string[] } {
    const { route, spots } = planRoute(agent, plan, end), progress = transitProgress(agent);
    if (!progress) return route ? { route, spots } : { spots };
    if (!route) return { spots: [] };
    const transit = agent.transit!, from = progress.position;
    const { previous, via, at } = routeJoin(transit.route, progress, route, from), joined = joinRoutes(transit.route, progress, route, from);
    // A join at the agent's own position starts on the shared point; otherwise on the point it last passed.
    const joinedSpots = [at >= 0 && !via.length ? spots[at] : transit.spots[previous], ...via.map(index => transit.spots[index]), ...at >= 0 ? spots.slice(at + 1) : spots];
    while (joinedSpots.length < joined.points.length) joinedSpots.push(joinedSpots[joinedSpots.length - 1]);
    return { route: joined, spots: joinedSpots };
  }
  function planRoute(agent: Internal, plan: PlannedRoute | null, end?: { position: Vec3; yaw: number; point: string }): { route?: NodeRoute; spots: string[] } {
    const speed = graph.definition.agents?.[agent.def.agent]?.speed ?? 1;
    const points: Vec3[] = [], speeds: number[] = [], spots: string[] = [];
    const add = (point: Vec3, segmentSpeed: number, spot: string) => {
      const last = points[points.length - 1];
      if (last && last.every((value, axis) => value === point[axis])) return;
      if (last) speeds.push(segmentSpeed); points.push(point); spots.push(spot);
    };
    // Routes start where the agent is: inside a slot, or at its current graph point.
    add(agent.leaveFrom ?? graph.point(agent.state.at)!.position, speed, agent.state.at);
    if (plan) plan.positions.forEach((point, index) => add(point, index ? plan.steps[index - 1].speed : speed, plan.points[index]));
    if (end) add(end.position, speed, end.point);
    if (points.length < 2) return { spots };
    const max = Math.max(...speeds), profile = motionProfileOf(graph.definition.agents?.[agent.def.agent]);
    // The agent's kind decides how it starts, turns and brakes; it leaves facing its current heading.
    const route: NodeRoute = { points, speed: max, ...(speeds.some(value => value !== max) ? { segmentSpeeds: speeds } : {}), ...(end ? { endYaw: end.yaw } : {}), ...(profile ? { profile, startYaw: agent.state.yaw } : {}), ...(agent.def.backOut && agent.leaveFrom ? { reverseSegments: 1 } : {}) };
    return routeDuration(route) > 0 ? { route, spots } : { spots };
  }
  /** Set off along a route; without one, arrive where the route under way ends (now when standing). */
  function travel(agent: Internal, route: NodeRoute | undefined, spots: readonly string[], phase: AgentPhase, arrive: () => void) {
    const end = route ? sampleRoute(route, Infinity) : null;
    if (route) agent.transit = { route, start: time, spots };
    update(agent, { phase, route: route ?? agent.state.route, ...(route ? { routeStart: time } : {}), pose: travelPose(agent), ...(end ? { position: end.position, yaw: end.yaw } : {}) });
    schedule(agent, route ? time + routeDuration(route) : transitEnd(agent), arrive);
  }
  function plan(agent: Internal, to: string, leg?: Leg, penalty?: RouteRequest['penalty']): PlannedRoute | null | RouteViolation[] {
    if (agent.state.at === to && !leg?.via?.length) return null;
    const result = graph.plan({ agent: agent.def.agent, from: agent.state.at, to, ...(leg?.via ? { via: leg.via } : {}), ...(leg?.avoidLanes ? { avoidLanes: leg.avoidLanes } : {}), ...(penalty ? { penalty } : {}) });
    return result.ok ? result.route : [...result.violations];
  }
  /**
   * Replace all of an agent's holds; `start` claims begin now, the others after
   * `delay`. A route that sets off while another is under way joins it, so its
   * claims cover the rest of the way from the agent's current pose.
   */
  function setHolds(agent: Internal, claims: readonly Claim[], delay: number) {
    const id = agent.def.id;
    for (const [key, list] of holds) {
      const kept = list.filter(hold => hold.to > time + TIME_EPSILON && hold.agent !== id);
      if (kept.length) holds.set(key, kept); else holds.delete(key);
    }
    for (const claim of claims) holds.set(claim.key, [...holds.get(claim.key) ?? [], { agent: id, from: claim.start ? time : time + delay + claim.from, to: time + delay + claim.to }]);
  }
  /** Standing still holds only the agent's current point, until its next departure; a route under way keeps its holds. */
  function stand(agent: Internal) {
    if (transitProgress(agent)) return;
    const capacity = graph.capacity(agent.state.at);
    setHolds(agent, capacity < Infinity ? [{ key: agent.state.at, capacity, from: 0, to: Infinity, start: true }] : [], 0);
  }
  /**
   * A host command during travel: the agent finishes its current segment, and the
   * next route point becomes its point. The route is cut there, so the renderer
   * stops there too unless a new route continues from the agent's pose first
   * (`makeRoute`). The holds follow the remaining segment.
   */
  function interrupt(agent: Internal, progress: RouteSample) {
    const { route, spots } = agent.transit!, last = route.points.length - 1, next = (progress.point ?? progress.segment) + 1;
    // Only a final turn or stop remains: the agent is already at the end.
    if (next > last) { placeAt(agent, spots[last], route.points[last]); return; }
    const point = route.points[next], rest: NodeRoute = {
      points: [progress.position, point], speed: route.segmentSpeeds?.[next - 1] ?? route.speed,
      ...(route.profile ? { profile: route.profile } : {}), startYaw: progress.yaw, ...(progress.speed > 0 ? { startSpeed: progress.speed } : {}),
    };
    agent.transit = { route: rest, start: time, spots: [spots[next - 1], spots[next]] };
    placeAt(agent, spots[next], point);
    update(agent, { route: rest, routeStart: time, position: point, yaw: sampleRoute(rest, Infinity).yaw });
    setHolds(agent, claimsOf(rest, agent.transit.spots), 0);
  }
  /** Capacity claims along a route, in route seconds. */
  function claimsOf(route: NodeRoute | undefined, spots: readonly string[]): Claim[] {
    if (!route) return [];
    const times = routeTimes(route), last = spots.length - 1, claims: Claim[] = [];
    for (let k = 0; k < last; k++) {
      const edge = spots[k] === spots[k + 1] ? undefined : graph.edge(spots[k], spots[k + 1]), capacity = edge ? graph.capacity(spots[k], spots[k + 1]) : Infinity;
      if (edge && capacity < Infinity) claims.push({ key: edge, capacity, from: times[k].depart, to: times[k + 1].arrive, start: false });
    }
    for (let i = 0, j = 0; i <= last; i = ++j) {
      while (j < last && spots[j + 1] === spots[i]) j++;
      const capacity = graph.capacity(spots[i]);
      // A limited point is held from leaving the previous point until reaching the next one; a route end until the next departure.
      if (capacity < Infinity) claims.push({ key: spots[i], capacity, from: i ? times[i - 1].depart : 0, to: j < last ? times[j + 1].arrive : Infinity, start: i === 0 });
    }
    return claims;
  }
  /** Other agents' holds that would keep `key` at capacity during [from, to); empty when the window fits. */
  function crowding(key: string | NavEdge, capacity: number, from: number, to: number, self: string): Hold[] {
    const overlapping = (holds.get(key) ?? []).filter(hold => hold.agent !== self && hold.from < to - TIME_EPSILON && from < hold.to - TIME_EPSILON);
    if (overlapping.length < capacity) return [];
    const marks = overlapping.flatMap(hold => [[Math.max(hold.from, from), 1], [Math.min(hold.to, to), -1]] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let count = 0;
    for (const [, step] of marks) if ((count += step) >= capacity) return overlapping;
    return [];
  }
  /** The earliest departure delay at which every claim fits, who is in the way, and how long each busy point or edge stays busy. */
  function fit(agent: Internal, claims: readonly Claim[]): Omit<TripOption, 'route' | 'spots' | 'claims'> {
    const self = agent.def.id, moving = claims.filter(claim => !claim.start);
    const blocking = (claim: Claim, delay: number) => crowding(claim.key, claim.capacity, time + delay + claim.from, time + delay + claim.to, self);
    // A wait only helps once another agent's hold ends, so the earliest fit is 0 or such an end.
    const delays = new Set([0]);
    for (const claim of moving) for (const hold of holds.get(claim.key) ?? []) if (hold.agent !== self && hold.to < Infinity && hold.to - time - claim.from > 0) delays.add(hold.to - time - claim.from);
    const delay = [...delays].sort((a, b) => a - b).find(value => moving.every(claim => !blocking(claim, value).length)) ?? Infinity;
    const agents = new Set<string>(), open = new Set<string>(), detours = new Map<string | NavEdge, number>();
    if (delay > 0) for (const claim of moving) {
      const blockers = blocking(claim, 0);
      blockers.forEach(hold => { agents.add(hold.agent); if (hold.to === Infinity) open.add(hold.agent); });
      if (blockers.length) detours.set(claim.key, Math.max(detours.get(claim.key) ?? 0, ...blockers.map(hold => hold.to - time - claim.from)));
    }
    return { delay, agents: [...agents].sort(), open: [...open].sort(), detours };
  }
  function option(agent: Internal, trip: Trip, penalty?: RouteRequest['penalty']): TripOption | RouteViolation[] {
    const result = plan(agent, trip.to, trip.leg, penalty);
    if (Array.isArray(result)) return result;
    const end = trip.end ?? (trip.stepOut && !result ? { position: graph.point(trip.to)!.position, yaw: agent.state.yaw } : undefined);
    const { route, spots } = makeRoute(agent, result, end && { ...end, point: trip.to });
    const claims = claimsOf(route, spots);
    return { route, spots, claims, ...fit(agent, claims) };
  }
  /**
   * Plan a trip and depart now, after a wait for capacity, or once the way clears.
   * A wait is weighed against a route around the busy points and edges.
   */
  function go(agent: Internal, trip: Trip) {
    // A new request replaces a trip that has not set off, including its scheduled departure.
    if (agent.trip && agent.trip !== trip) { agent.trip = undefined; agent.waiting = undefined; agent.yielded = undefined; agent.waitsFor = undefined; schedule(agent, Infinity, null); stand(agent); }
    const first = option(agent, trip);
    if (Array.isArray(first)) { agent.trip = undefined; agent.waiting = undefined; agent.yielded = undefined; agent.waitsFor = undefined; trip.fail(first); return; }
    let chosen = first;
    if (first.delay > 0) {
      // Each busy point or edge costs the distance the agent could travel while waiting for it.
      const speed = graph.definition.agents![agent.def.agent].speed, detour = (key: string | NavEdge | undefined) => key === undefined ? 0 : (first.detours.get(key) ?? 0) * speed;
      const other = option(agent, trip, (from, to) => detour(to) + detour(graph.edge(from, to)));
      const finish = (value: TripOption) => value.delay + (value.route ? routeDuration(value.route) : 0);
      if (!Array.isArray(other) && finish(other) < finish(first) - TIME_EPSILON) chosen = other;
    }
    agent.trip = trip;
    if (chosen.delay > 0 && transitProgress(agent)) {
      // An agent cannot wait partway along a route: it finishes the route under way and plans again from its end.
      agent.waiting = undefined; agent.yielded = undefined; agent.waitsFor = undefined;
      update(agent, { phase: trip.phase === 'queued' ? 'queued' : 'moving', pose: travelPose(agent) });
      schedule(agent, transitEnd(agent), () => go(agent, trip));
      return;
    }
    if (chosen.delay < Infinity) { commit(agent, trip, chosen); return; }
    agent.waitsFor = chosen.open;
    if (agent.waiting !== undefined) return;
    agent.waiting = seq++;
    update(agent, { phase: trip.phase === 'queued' ? 'queued' : 'yielding', pose: idlePose(agent) }); schedule(agent, Infinity, null);
    agent.yielded = emit(agent, { type: 'yielding', point: agent.state.at, agents: chosen.agents });
  }
  function commit(agent: Internal, trip: Trip, chosen: TripOption) {
    if (chosen.route) setHolds(agent, chosen.claims, chosen.delay);
    // An open-ended wait that resolves in the same instant is reported once, with its outcome.
    const earlier = agent.yielded && agent.yielded.time === time ? pending.indexOf(agent.yielded) : -1;
    if (earlier >= 0) pending.splice(earlier, 1);
    agent.waiting = undefined; agent.yielded = undefined; agent.waitsFor = undefined;
    const leave = () => { agent.trip = undefined; trip.depart(); travel(agent, chosen.route, chosen.spots, trip.phase, trip.arrive); };
    if (chosen.delay > 0) {
      update(agent, { phase: trip.phase === 'queued' ? 'queued' : 'yielding', pose: idlePose(agent) });
      const event = record(agent, { type: 'yielding', point: agent.state.at, seconds: chosen.delay, agents: chosen.agents });
      if (earlier >= 0) pending.splice(earlier, 0, event); else pending.push(event);
      schedule(agent, time + chosen.delay, leave);
    } else leave();
    retryWaiters();
  }
  /** Retry open-ended waits first come, first served; a departure may have freed their way. */
  function retryWaiters() {
    if (retrying) { retryAgain = true; return; }
    retrying = true;
    try {
      do {
        retryAgain = false;
        for (const agent of [...agents.values()].filter(item => item.waiting !== undefined).sort((a, b) => a.waiting! - b.waiting!)) if (agent.waiting !== undefined && agent.trip) go(agent, agent.trip);
      } while (retryAgain);
    } finally { retrying = false; }
  }
  /** An agent that stands still with nothing planned: it finished, is idle or is blocked, and only a host command moves it. */
  const standsStill = (agent: Internal) => agent.waiting === undefined && !agent.trip && agent.nextAt === Infinity && (agent.state.phase === 'idle' || agent.state.phase === 'blocked');
  /**
   * Flag open-ended waits that cannot end by themselves. Agents whose waits form
   * a cycle (each waits for a point another one stands on) are deadlocked; a wait
   * that leads, directly or through other waiting agents, to an agent that stands
   * still is stalled. They keep waiting (a host command to one of the agents in
   * the way ends it); a `deadlock` or `stalled` event reports each change once.
   */
  function detectDeadlocks() {
    const waiting = new Map([...agents.values()].filter(agent => agent.waiting !== undefined).map(agent => [agent.def.id, agent.waitsFor ?? []]));
    const reach = (from: string) => { const seen = new Set<string>(), stack = [...waiting.get(from) ?? []]; while (stack.length) { const id = stack.pop()!; if (seen.has(id)) continue; seen.add(id); stack.push(...waiting.get(id) ?? []); } return seen; };
    const reachable = new Map([...waiting.keys()].map(id => [id, reach(id)]));
    for (const agent of [...agents.values()].sort((a, b) => a.def.id.localeCompare(b.def.id))) {
      const own = reachable.get(agent.def.id);
      const cycle = own?.has(agent.def.id) ? [...own].filter(id => waiting.has(id) && reachable.get(id)?.has(agent.def.id)).sort() : undefined;
      const still = own ? [...own].filter(id => { const other = agents.get(id); return other !== undefined && standsStill(other); }).sort() : [];
      const stalled = still.length ? still : undefined;
      if (String(cycle) !== String(agent.state.deadlock)) {
        update(agent, { deadlock: cycle && Object.freeze(cycle) });
        if (cycle) emit(agent, { type: 'deadlock', agents: agent.state.deadlock! });
      }
      if (String(stalled) !== String(agent.state.stalled)) {
        update(agent, { stalled: stalled && Object.freeze(stalled) });
        if (stalled) emit(agent, { type: 'stalled', agents: agent.state.stalled! });
      }
    }
  }
  /** Where an agent without a queue point waits after leaving a slot: the approach, or the nearest point without a capacity. */
  function stepOutPoint(agent: Internal): string | undefined {
    if (graph.capacity(agent.state.at) === Infinity) return agent.state.at;
    const costs = graph.reach(agent.def.agent, agent.state.at);
    let best: string | undefined;
    for (const [id, cost] of costs) if (graph.capacity(id) === Infinity && (best === undefined || cost < costs.get(best)! || cost === costs.get(best) && id < best)) best = id;
    return best;
  }

  /** Planning costs from where the leg's final part starts: the last `via` point, or the agent's point. */
  const costsFor = (agent: Internal, leg: Leg) => graph.reach(agent.def.agent, leg.via?.length ? leg.via[leg.via.length - 1] : agent.state.at, leg.avoidLanes ? { avoidLanes: leg.avoidLanes } : {});
  function resolveTarget(agent: Internal, step: Extract<BehaviorStep, { kind: 'move' }>): string | RouteViolation[] {
    const to = step.to;
    if (typeof to === 'string') return to;
    const costs = costsFor(agent, step);
    if (isPositionTarget(to)) {
      let best: string | null = null, bestDistance = Infinity;
      for (const [id, cost] of costs) {
        const point = graph.point(id)!.position, gap = Math.hypot(point[0] - to.position[0], point[2] - to.position[2]);
        // Ties go to the cheaper point, then the lower ID, so resolution is deterministic.
        if (gap < bestDistance - POSITION_EPSILON || Math.abs(gap - bestDistance) <= POSITION_EPSILON && (cost < costs.get(best!)! || cost === costs.get(best!) && id < best!)) { best = id; bestDistance = gap; }
      }
      return best ?? [{ code: 'no-route', message: `No permitted point for ${agent.def.agent} near [${to.position.join(', ')}].` }];
    }
    const reachable = [...slots.values()].filter(slot => matches(slot, to) && costs.has(slot.id)).sort((a, b) => costs.get(a.id)! - costs.get(b.id)!);
    return reachable[0]?.id ?? [{ code: 'no-route', message: `No permitted route for ${agent.def.agent} to ${to.node}.`, to: to.node }];
  }
  function block(agent: Internal, violations: readonly RouteViolation[]) {
    update(agent, { phase: 'blocked', violations, pose: idlePose(agent), queuePlace: undefined }); schedule(agent, Infinity, null);
    emit(agent, { type: 'blocked', violations });
  }

  function next(agent: Internal) {
    let index = agent.state.step + 1;
    if (index >= agent.steps.length) {
      if (!agent.loop) { update(agent, { phase: 'idle', step: agent.steps.length, label: undefined, pose: idlePose(agent) }); schedule(agent, Infinity, null); emit(agent, { type: 'finished' }); return; }
      // A loop that takes no simulated time would never let time advance.
      if (time === agent.loopStartedAt) { block(agent, [{ code: 'no-route', message: `Behavior loop of ${agent.def.id} takes no time.` }]); return; }
      agent.loopStartedAt = time; index = 0;
    }
    start(agent, index);
  }
  function start(agent: Internal, index: number) {
    const step = agent.steps[index];
    update(agent, { step: index, label: step?.label, violations: undefined, queuePlace: undefined });
    if (!step) { next(agent); return; }
    emit(agent, { type: 'step-started', ...(step.label !== undefined ? { label: step.label } : {}) });
    // A wait starts once the agent has finished the route under way, e.g. after a host command interrupted travel.
    if (step.kind === 'wait') { update(agent, { phase: 'waiting', pose: idlePose(agent) }); schedule(agent, transitEnd(agent) + duration(step.seconds), () => next(agent)); return; }
    if (step.kind === 'move') {
      const to = resolveTarget(agent, step);
      if (Array.isArray(to)) { block(agent, to); return; }
      go(agent, {
        to, leg: step, phase: 'moving', depart: () => {}, fail: violations => block(agent, violations),
        arrive: () => { agent.leaveFrom = undefined; update(agent, { at: to }); emit(agent, { type: 'arrived', point: to }); next(agent); },
      });
      return;
    }
    const candidates = [...slots.values()].filter(slot => matches(slot, step) && slot.agents.includes(agent.def.agent));
    if (!candidates.length) { block(agent, [{ code: 'agent-not-allowed', message: `${agent.def.agent} may not use ${step.node}.` }]); return; }
    // The nearest free slot by planning cost that no waiting agent could use: those agents were first.
    // Unreachable slots come last and block with the planner's reason.
    const costs = costsFor(agent, step), cost = (slot: ResolvedSlot) => costs.get(slot.id) ?? Infinity;
    const wanted = (slot: ResolvedSlot) => [...agents.values()].some(other => other !== agent && other.queueEntry && matches(slot, other.queueEntry.step) && slot.agents.includes(other.def.agent));
    const free = candidates.filter(slot => !reservations.has(slot.id) && !wanted(slot)).sort((a, b) => cost(a) - cost(b))[0];
    if (free) acquire(agent, step, free);
    else { agent.queueEntry = { seq: seq++, step }; update(agent, { phase: 'queued', pose: idlePose(agent) }); schedule(agent, Infinity, null); arrangeQueues(); emit(agent, { type: 'queued', node: step.node, place: agent.state.queuePlace ?? 1 }); }
  }
  function acquire(agent: Internal, step: Extract<BehaviorStep, { kind: 'interact' }>, slot: ResolvedSlot) {
    // A queued agent walks from its queue point, so only a fresh request keeps its via points.
    const fresh = !agent.queueEntry;
    reservations.set(slot.id, agent.def.id); agent.queueEntry = undefined;
    update(agent, { slot: slot.id, queuePlace: undefined });
    go(agent, {
      to: slot.id, ...(fresh ? { leg: step } : {}), end: { position: slot.position, yaw: slot.yaw }, phase: 'moving',
      depart: () => {},
      fail: violations => { reservations.delete(slot.id); update(agent, { slot: undefined }); block(agent, violations); wake(slot); },
      arrive: () => {
        agent.leaveFrom = slot.position;
        update(agent, { at: slot.id, phase: 'interacting', pose: step.pose ?? slot.pose, position: slot.position, yaw: slot.yaw });
        emit(agent, { type: 'interaction-started', slot: slot.id });
        // With a hand-over time, items change hands that long before the interaction ends, while the agent is still at the slot.
        const seconds = duration(step.seconds), early = step.pickUp !== undefined || step.putDown !== undefined ? Math.min(seconds, agent.def.carry?.handOverSeconds ?? 0) : 0;
        const finish = () => { release(agent); next(agent); };
        schedule(agent, time + seconds - early, () => {
          const violations = exchange(agent, step, slot);
          if (violations.length) { release(agent); block(agent, violations); return; }
          if (early > 0) schedule(agent, time + early, finish); else finish();
        });
      },
    });
  }
  const stackHeight = (agent: Internal) => agent.def.carry?.stackHeight ?? DEFAULT_STACK_HEIGHT;
  const sameSpot = (a: ItemPlacement, node: string, anchor: string | undefined) => 'node' in a && a.node === node && a.anchor === anchor;
  const setItem = (id: string, placement: ItemPlacement) => { items.delete(id); items.set(id, Object.freeze(placement)); changed = true; };
  /** Re-stack an agent's carried items at its anchor, bottom first. */
  function restack(agent: Internal, carried: readonly string[]) {
    const rule = agent.def.carry!, height = stackHeight(agent);
    carried.forEach((id, index) => { const at = items.get(id); const offset: Vec3 = [0, index * height, 0]; if (!at || !('holder' in at) || at.holder !== agent.def.id || at.offset[1] !== offset[1]) setItem(id, { holder: agent.def.id, anchor: rule.anchor, offset }); });
    update(agent, { carrying: carried.length ? Object.freeze([...carried]) : undefined });
  }
  /** Let go of an item an agent holds, e.g. when the host moves it. */
  function letGo(id: string) {
    const at = items.get(id);
    if (!at || !('holder' in at)) return;
    const holder = agents.get(at.holder);
    if (holder) restack(holder, (holder.state.carrying ?? []).filter(item => item !== id));
  }
  /** Carried stacks of agents with handling state, by agent ID: receptacle name at the carry anchor. */
  const carryReceptacles = new Map<string, string>();
  const asItem = (at: UnitPlacement): ItemPlacement => {
    if (!('container' in at)) return { position: at.position, yaw: at.yaw };
    const turn = at.turn ? { yaw: at.turn * Math.PI / 180 } : {}, holder = agents.get(at.container);
    if (holder?.def.carry) return { holder: at.container, anchor: at.anchor ?? holder.def.carry.anchor, offset: at.offset, ...turn };
    return { node: at.container, ...(at.anchor ? { anchor: at.anchor } : {}), offset: at.offset, ...turn };
  };
  /** Mirror the shared state into the item map and each agent's carried stack. */
  function mirrorHandling(state: HandlingState) {
    items.clear();
    for (const [id, at] of state.placements()) items.set(id, Object.freeze(asItem(at)));
    for (const id of carryReceptacles.keys()) {
      const agent = agents.get(id)!, held = state.contents(id), before = agent.state.carrying ?? [];
      if (held.length !== before.length || held.some((item, index) => item !== before[index])) update(agent, { carrying: held.length ? held : undefined });
    }
    changed = true;
  }
  function rest(id: string, at: ItemRest) {
    letGo(id);
    setItem(id, 'node' in at ? { node: at.node, ...(at.anchor ? { anchor: at.anchor } : {}), offset: at.offset ? [...at.offset] as Vec3 : [0, 0, 0] } : { position: [...at.position] as Vec3, yaw: at.yaw ?? 0 });
  }
  const itemRules: ItemRules = {
    get time() { return time; },
    getItems: () => new Map(items),
    placeItem(id, at) { if (options.handling) throw new Error('With handling state, place units with handling.move.'); if (typeof id !== 'string' || !id.trim()) throw new Error('Item ID must not be empty.'); validateItemRest(at, `Item ${id}`); rest(id, at); },
    removeItem(id) { if (options.handling) throw new Error('With handling state, remove units with handling.unregister.'); if (!items.has(id)) return; letGo(id); items.delete(id); changed = true; },
  };
  const itemEvent = (agent: Internal, event: Extract<BehaviorEventDetail, { type: 'picked-up' | 'put-down' }>) => { const recorded = emit(agent, event); options.onItemEvent?.(recorded as Extract<BehaviorEvent, { type: 'picked-up' | 'put-down' }>, itemRules); };
  /** Put down, then pick up, when an interaction ends. Returns why it could not, without changing anything then. */
  function exchange(agent: Internal, step: Extract<BehaviorStep, { kind: 'interact' }>, slot: ResolvedSlot): RouteViolation[] {
    if (step.putDown === undefined && step.pickUp === undefined) return [];
    if (options.handling) return exchangeHandled(options.handling, agent, step, slot);
    const rule = agent.def.carry!, capacity = rule.capacity ?? 1, carried = [...agent.state.carrying ?? []];
    const dropping = step.putDown === undefined ? [] : step.putDown === 'all' ? carried : [...step.putDown];
    const missing = dropping.filter(id => !carried.includes(id));
    if (missing.length) return [{ code: 'not-carrying', message: `${agent.def.id} is not carrying ${missing.join(', ')}.` }];
    const kept = carried.filter(id => !dropping.includes(id));
    let taking: string[] = [];
    if (typeof step.pickUp === 'number') {
      taking = [...items].filter(([id, at]) => 'node' in at && at.node === step.node && !dropping.includes(id)).slice(0, Math.min(step.pickUp, capacity - kept.length)).map(([id]) => id);
    } else if (step.pickUp) {
      const unknown = step.pickUp.filter(id => !items.has(id));
      if (unknown.length) return [{ code: 'unknown-item', message: `Unknown items: ${unknown.join(', ')}.` }];
      const held = step.pickUp.filter(id => { const at = items.get(id)!; return 'holder' in at && at.holder !== agent.def.id; });
      if (held.length) return [{ code: 'item-unavailable', message: `Another agent is carrying ${held.join(', ')}.` }];
      if (rule.reach !== undefined) {
        const reach = rule.reach, far = step.pickUp.filter(id => { const at = items.get(id)!; return 'node' in at ? at.node !== step.node : 'position' in at && Math.hypot(at.position[0] - slot.position[0], at.position[2] - slot.position[2]) > reach; });
        if (far.length) return [{ code: 'item-out-of-reach', message: `${far.join(', ')} ${far.length === 1 ? 'is' : 'are'} out of reach of ${agent.def.id} at ${slot.id}: put ${far.length === 1 ? 'it' : 'them'} on ${step.node} or within ${reach} m of the slot.` }];
      }
      taking = step.pickUp.filter(id => !kept.includes(id));
      if (kept.length + taking.length > capacity) return [{ code: 'carry-full', message: `${agent.def.id} can carry ${capacity} item${capacity === 1 ? '' : 's'}.` }];
    }
    if (dropping.length) {
      const floor = step.putOn && isFloorPut(step.putOn) ? step.putOn : undefined;
      const spot = step.putOn as { anchor?: string; offset?: Vec3 } | undefined, anchor = spot?.anchor, base: Vec3 = spot?.offset ? [...spot.offset] as Vec3 : [0, 0, 0], height = stackHeight(agent);
      // Each item takes the lowest free level of its spot, so a spot emptied by the host fills again from the bottom.
      const used = new Set([...items.values()].flatMap(at => step.putOn && sameSpot(at, step.node, anchor) ? [Math.round(((at as { offset: Vec3 }).offset[1] - base[1]) / (height || 1))] : []));
      const forward: Vec3 = [Math.sin(slot.yaw), 0, Math.cos(slot.yaw)];
      for (const id of dropping) {
        if (floor) { setItem(id, { position: [...floor.position] as Vec3, yaw: floor.yaw }); continue; }
        if (!step.putOn) { setItem(id, { position: [slot.position[0] + forward[0] * .45, slot.position[1], slot.position[2] + forward[2] * .45], yaw: slot.yaw }); continue; }
        let level = 0; while (used.has(level)) level++; used.add(level);
        setItem(id, { node: step.node, ...(anchor ? { anchor } : {}), offset: [base[0], base[1] + level * height, base[2]] });
      }
      restack(agent, kept);
      itemEvent(agent, { type: 'put-down', node: step.node, items: Object.freeze([...dropping]) });
    }
    if (taking.length) {
      for (const id of taking) letGo(id);
      restack(agent, [...kept, ...taking]);
      itemEvent(agent, { type: 'picked-up', node: step.node, items: Object.freeze([...taking]) });
    }
    return [];
  }
  /** The same exchange through the shared state: one atomic move for what is named, then a count pick-up one unit at a time. */
  function exchangeHandled(state: HandlingState, agent: Internal, step: Extract<BehaviorStep, { kind: 'interact' }>, slot: ResolvedSlot): RouteViolation[] {
    const rule = agent.def.carry!, capacity = rule.capacity ?? 1, carried = [...agent.state.carrying ?? []], hold: HandlingTarget = { container: agent.def.id, receptacle: carryReceptacles.get(agent.def.id)!, ...(rule.turn !== undefined ? { turn: rule.turn } : {}) };
    const dropping = step.putDown === undefined ? [] : step.putDown === 'all' ? carried : [...step.putDown];
    const missing = dropping.filter(id => !carried.includes(id));
    if (missing.length) return [{ code: 'not-carrying', message: `${agent.def.id} is not carrying ${missing.join(', ')}.` }];
    const kept = carried.filter(id => !dropping.includes(id));
    const named = Array.isArray(step.pickUp) ? (step.pickUp as readonly string[]).filter(id => !kept.includes(id)) : [];
    if (named.length) {
      const unknown = named.filter(id => !items.has(id));
      if (unknown.length) return [{ code: 'unknown-item', message: `Unknown items: ${unknown.join(', ')}.` }];
      const held = named.filter(id => { const at = items.get(id)!; return 'holder' in at && at.holder !== agent.def.id; });
      if (held.length) return [{ code: 'item-unavailable', message: `Another agent is carrying ${held.join(', ')}.` }];
      if (rule.reach !== undefined) {
        const reach = rule.reach, far = named.filter(id => { const at = items.get(id)!; return 'node' in at ? at.node !== step.node : 'position' in at && Math.hypot(at.position[0] - slot.position[0], at.position[2] - slot.position[2]) > reach; });
        if (far.length) return [{ code: 'item-out-of-reach', message: `${far.join(', ')} ${far.length === 1 ? 'is' : 'are'} out of reach of ${agent.def.id} at ${slot.id}: put ${far.length === 1 ? 'it' : 'them'} on ${step.node} or within ${reach} m of the slot.` }];
      }
      if (kept.length + named.length > capacity) return [{ code: 'carry-full', message: `${agent.def.id} can carry ${capacity} item${capacity === 1 ? '' : 's'}.` }];
    }
    const forward: Vec3 = [Math.sin(slot.yaw), 0, Math.cos(slot.yaw)];
    const putTo: HandlingTarget = step.putOn && 'receptacle' in step.putOn ? { container: step.node, ...step.putOn } : step.putOn && isFloorPut(step.putOn) ? step.putOn : { position: [slot.position[0] + forward[0] * .45, slot.position[1], slot.position[2] + forward[2] * .45], yaw: slot.yaw };
    // The top of the stack leaves first; a put-down has to clear what it is holding.
    const moves: HandlingMove[] = [...carried].reverse().filter(id => dropping.includes(id)).map(unit => ({ unit, to: putTo })).concat(named.map(unit => ({ unit, to: hold })));
    if (moves.length) {
      const checks = state.move(moves), last = checks[checks.length - 1];
      if (!last.ok) return last.violations.map(({ code, message }) => ({ code, message }));
    }
    if (dropping.length) itemEvent(agent, { type: 'put-down', node: step.node, items: Object.freeze([...dropping]) });
    const taken = [...named];
    if (typeof step.pickUp === 'number') {
      const wanted = Math.min(step.pickUp, capacity - kept.length);
      for (const [id, at] of state.placements()) {
        if (taken.length >= wanted) break;
        if ('container' in at && at.container === step.node && !dropping.includes(id) && state.move([{ unit: id, to: hold }])[0].ok) taken.push(id);
      }
    }
    if (taken.length) itemEvent(agent, { type: 'picked-up', node: step.node, items: Object.freeze(taken) });
    return [];
  }
  function release(agent: Internal, interrupted = false) {
    const slot = agent.state.slot ? slots.get(agent.state.slot) : undefined;
    if (!slot) return;
    if (agent.state.phase === 'interacting') emit(agent, { type: 'interaction-ended', slot: slot.id, ...(interrupted ? { interrupted } : {}) });
    reservations.delete(slot.id); update(agent, { slot: undefined }); wake(slot);
  }
  /** Give a freed slot to the longest-waiting agent whose request it matches. */
  function wake(slot: ResolvedSlot) {
    if (reservations.has(slot.id)) return;
    const waiting = [...agents.values()].filter(other => other.queueEntry && matches(slot, other.queueEntry.step) && slot.agents.includes(other.def.agent)).sort((a, b) => a.queueEntry!.seq - b.queueEntry!.seq)[0];
    if (waiting) acquire(waiting, waiting.queueEntry!.step, slot);
    arrangeQueues();
  }
  /**
   * Move queued agents to their queue points in arrival order. Places count per
   * object and list of queue points, whatever slot or group each agent asked for,
   * so two agents never share a queue point. An agent that cannot reach its queue
   * point is blocked and leaves the queue; the agents behind it move up.
   */
  function arrangeQueues() {
    if (arranging) { rearrange = true; return; }
    arranging = true;
    try {
      do {
        rearrange = false;
        const queued = [...agents.values()].filter(agent => agent.queueEntry).sort((a, b) => a.queueEntry!.seq - b.queueEntry!.seq);
        const places = new Map<string, number>();
        for (const agent of queued) {
          if (!agent.queueEntry) continue;
          const step = agent.queueEntry.step, key = [step.node, ...step.queue ?? []].join('\u0000'), place = (places.get(key) ?? 0) + 1; places.set(key, place);
          if (agent.state.queuePlace === place) continue;
          update(agent, { queuePlace: place });
          // Without a queue point, an agent that just left a slot steps back to its approach instead of blocking the slot,
          // or out to the nearest point without a capacity when the approach has one.
          const point = step.queue?.[place - 1] ?? (agent.leaveFrom ? stepOutPoint(agent) : undefined);
          if (!point || agent.state.at === point && !agent.leaveFrom) continue;
          go(agent, {
            to: point, stepOut: true, phase: 'queued',
            fail: violations => { agent.queueEntry = undefined; block(agent, violations); arrangeQueues(); },
            // The queue point becomes the agent's location when it sets off; the route animates the walk there.
            depart: () => { agent.leaveFrom = undefined; update(agent, { at: point }); },
            arrive: () => { update(agent, { pose: idlePose(agent) }); schedule(agent, Infinity, null); },
          });
        }
      } while (rearrange);
    } finally { arranging = false; }
  }

  for (const def of options.agents) {
    if (agents.has(def.id)) throw new Error(`Duplicate behavior agent: ${def.id}.`);
    const point = graph.point(def.start); if (!point) throw new Error(`Agent ${def.id}: unknown start point ${def.start}.`);
    if (!graph.definition.agents?.[def.agent]) throw new Error(`Agent ${def.id}: agent kind ${def.agent} has no speed rule.`);
    if (def.carry !== undefined) validateCarryRule(def.carry, `Agent ${def.id} carry rule`);
    validateSteps(def.id, def.steps);
    agents.set(def.id, { def, steps: def.steps, loop: def.loop ?? false, nextAt: Infinity, onDue: null, loopStartedAt: -1, state: { id: def.id, agent: def.agent, phase: 'idle', step: -1, at: def.start, pose: def.idlePose ?? 'idle', position: point.position, yaw: def.yaw ?? 0 } });
  }
  if (options.handling) {
    if (options.items?.length) throw new Error('With handling state, place units with handling.move before creating the runner; items is not used.');
    for (const agent of agents.values()) {
      if (!agent.def.carry) continue;
      const hold = options.handling.receptacleAt(agent.def.id, agent.def.carry.anchor);
      if (!hold) throw new Error(`Agent ${agent.def.id}: handling state has no receptacle at anchor ${agent.def.carry.anchor}. Register the agent's node and declare one in assetHandling.`);
      carryReceptacles.set(agent.def.id, hold);
    }
    mirrorHandling(options.handling);
  }
  for (const item of options.items ?? []) {
    if (typeof item?.id !== 'string' || !item.id.trim()) throw new Error('Item ID must not be empty.');
    if (items.has(item.id)) throw new Error(`Duplicate item: ${item.id}.`);
    validateItemRest(item.at, `Item ${item.id}`); rest(item.id, item.at);
  }
  agents.forEach(stand);
  for (const agent of [...agents.values()].sort((a, b) => a.def.id.localeCompare(b.def.id))) { agent.loopStartedAt = time; start(agent, 0); }
  detectDeadlocks();

  const notify = () => {
    if (changed) { changed = false; snapshot = Object.freeze([...agents.values()].map(agent => Object.freeze({ ...agent.state }))); itemSnapshot = new Map(items); listeners.forEach(listener => listener()); }
    // Listeners may issue commands; their events are delivered by the nested notify.
    while (pending.length) { const batch = pending; pending = []; for (const event of batch) eventListeners.forEach(listener => listener(event)); }
  };
  notify();
  // Moves the host makes between ticks show at once; inside `advance` the tick's own notify covers them.
  const stopHandling = options.handling?.subscribe(() => { mirrorHandling(options.handling!); if (!advancing) notify(); });
  const runner: BehaviorRunner = {
    get time() { return time; },
    advance(seconds) {
      if (disposed) throw new Error('Behavior runner has been disposed.');
      if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Advance requires a finite, non-negative number of seconds.');
      const target = time + seconds;
      advancing = true;
      try {
        for (let guard = 0; guard < 100_000; guard++) {
          let due: Internal | null = null;
          for (const agent of agents.values()) if (agent.nextAt <= target && (!due || agent.nextAt < due.nextAt || agent.nextAt === due.nextAt && agent.def.id < due.def.id)) due = agent;
          if (!due) break;
          time = due.nextAt; const run = due.onDue; schedule(due, Infinity, null); run?.();
          detectDeadlocks();
        }
      } finally { advancing = false; }
      time = target; notify();
    },
    getAgents: () => snapshot,
    getAgent: id => snapshot.find(state => state.id === id),
    getReservations: () => new Map(reservations),
    getHolds: () => Object.freeze([...holds].flatMap(([key, list]) => list.filter(hold => hold.to > time).map(hold => Object.freeze({ agent: hold.agent, ...(typeof key === 'string' ? { point: key } : { edge: Object.freeze({ from: key.from, to: key.to }) }), from: hold.from, to: hold.to })))
      .sort((a, b) => a.from - b.from || a.agent.localeCompare(b.agent))),
    assign(id, steps, assignOptions = {}) {
      const agent = agents.get(id); if (!agent) throw new Error(`Unknown behavior agent: ${id}.`);
      validateSteps(id, steps);
      // Interrupted travel finishes its current segment, as the renderer's join policy does; the next route point becomes the agent's point.
      const progress = transitProgress(agent);
      if (progress) interrupt(agent, progress);
      // A trip that has not set off is dropped; the agent holds its point and any route already under way.
      agent.trip = undefined; agent.waiting = undefined; agent.yielded = undefined; agent.waitsFor = undefined; stand(agent);
      const hadEntry = Boolean(agent.queueEntry); agent.queueEntry = undefined;
      release(agent, true); if (hadEntry) arrangeQueues();
      agent.steps = steps; agent.loop = assignOptions.loop ?? false; agent.loopStartedAt = time; schedule(agent, Infinity, null);
      retryWaiters(); start(agent, 0); detectDeadlocks(); notify();
    },
    command(id, command, commandOptions) { runner.assign(id, commandSteps(command), commandOptions); },
    getItems: () => itemSnapshot,
    placeItem(id, at) { if (disposed) throw new Error('Behavior runner has been disposed.'); itemRules.placeItem(id, at); notify(); },
    removeItem(id) { if (disposed) throw new Error('Behavior runner has been disposed.'); itemRules.removeItem(id); notify(); },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    subscribeEvents(listener) { eventListeners.add(listener); return () => { eventListeners.delete(listener); }; },
    dispose() { disposed = true; stopHandling?.(); listeners.clear(); eventListeners.clear(); pending = []; holds.clear(); agents.forEach(agent => schedule(agent, Infinity, null)); },
  };
  return runner;
}

/**
 * Map an agent state onto an asset node for the scene store. Pass the runner's
 * current `time` so the route carries its progress (`NodeRoute.elapsed`): a
 * renderer mounted mid-route then shows the agent where the simulation has it.
 */
export function behaviorNode(state: AgentState, base: Omit<AssetNode, 'kind' | 'id' | 'position' | 'rotation' | 'route'>, options: { time?: number } = {}): AssetNode {
  const route = state.route && options.time !== undefined && state.routeStart !== undefined ? { ...state.route, elapsed: Math.max(0, options.time - state.routeStart) } : state.route;
  return { ...base, id: state.id, kind: 'asset', variant: state.pose, position: state.position, rotation: [0, state.yaw, 0], ...(route ? { route } : {}) };
}
