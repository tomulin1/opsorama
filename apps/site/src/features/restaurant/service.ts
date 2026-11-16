import type { NodeRoute, Vec3 } from '@opsorama/core';
import { sampleRoute } from '@opsorama/core';

/**
 * The service loop of the restaurant example: one deterministic cycle of `period` seconds in which every course is
 * plated at its station, carried to the pass by its cook, collected by its server, set on its table, eaten, cleared and
 * dropped at the dish machine. Everything in the loop is a pure function of the cycle second (the phase), so a plate is
 * always in exactly one place and the scene can be rebuilt at any phase. People walk looping routes that last exactly
 * one period; the host only has to know the phase, which `trackServicePhase` keeps in step with the renderer.
 */

/** A floor point `[x, z]` in metres. */
export type FloorPoint = readonly [x: number, z: number];

/** Where one plate rests: on `node`, at its `anchor` when given, with a local offset and heading in radians. */
export interface PlateRest { readonly node: string; readonly anchor?: string; readonly offset: Vec3; readonly yaw?: number; }

/** A plate hand-over at the end of a stop: `take` lifts every plate of a course into the hands; `put` sets them on `on`, one rest per plate. */
export type PlateAction = { readonly take: string } | { readonly put: string; readonly on: readonly PlateRest[] };

/** One stop of a person's loop. */
export interface ServiceStop {
  /** Floor points walked through from the previous stop, in order. */
  readonly via?: readonly FloorPoint[];
  readonly at: FloorPoint;
  /** Heading while stopped; 0 faces +z. */
  readonly yaw: number;
  /** When the person leaves: `leave` seconds into the cycle (0 ≤ leave < period), or `dwell` seconds after arriving. Give exactly one. */
  readonly leave?: number;
  readonly dwell?: number;
  /** Pose while stopped with free hands, e.g. `working` at a station. Default: the person's travel pose. */
  readonly pose?: string;
  /** Plate hand-over, `HAND_OFF` seconds before leaving. */
  readonly action?: PlateAction;
}

/** A person who walks a loop of stops at `speed` m/s. The loop returns from the last stop to the first. */
export interface ServiceActor { readonly id: string; readonly speed: number; readonly stops: readonly ServiceStop[]; }

/** One order's plates: plated on `plated` (one rest per plate, 1–2 plates) at `platedAt` seconds into the cycle, then moved by the actors' actions. */
export interface ServiceCourse {
  /** Course ID, usually the kitchen ticket. */
  readonly id: string;
  /** Node ID of the table the course is served at; plates set down there are eaten. */
  readonly table: string;
  readonly platedAt: number;
  readonly plated: readonly PlateRest[];
}

export interface ServicePlan { readonly period: number; readonly actors: readonly ServiceActor[]; readonly courses: readonly ServiceCourse[]; }

/** Plates change hands this many seconds before the person leaves; plate transfers animate for 0.8 s. */
export const HAND_OFF = 1;
/** Seconds the cleared plates rest on the dish machine inlet before they go in to be washed. */
export const WASH_SECONDS = 5;
/** Shortest stop: enough for a hand-over to finish before the person turns away. */
const MIN_STOP = HAND_OFF + .2;

export interface TimedStop extends ServiceStop { readonly arrive: number; readonly leave: number; }
export interface CompiledActor {
  readonly id: string;
  readonly stops: readonly TimedStop[];
  /** The looping route; its time 0 is the arrival at the first stop. */
  readonly route: NodeRoute;
  /** Cycle second at which the route starts, i.e. the arrival at the first stop. */
  readonly start: number;
}
type Place = { readonly holder: string } | { readonly rests: readonly PlateRest[] };
interface PlateStep { readonly at: number; readonly place: Place; }
export interface CompiledCourse {
  readonly course: ServiceCourse;
  /** Places in order, at seconds after `platedAt`. */
  readonly steps: readonly PlateStep[];
  /** Seconds after `platedAt` at which the guests finish the dish. */
  readonly eaten: number;
  /** Seconds after `platedAt` at which the plates leave the scene into the dish machine. */
  readonly washed: number;
}
export interface ServiceCycle { readonly period: number; readonly actors: readonly CompiledActor[]; readonly courses: readonly CompiledCourse[]; }

/** Where a plate is at one phase. */
export interface PlateState {
  /** Stable ID for the plate's scene node. */
  readonly id: string;
  readonly course: string;
  readonly load: 'full' | 'empty';
  /** In a person's hands, or resting on a node. */
  readonly holder?: string;
  readonly rest?: PlateRest;
  /** Index of this plate among the plates in the same hands (0–1). */
  readonly slot: number;
  readonly count: number;
}

const wrap = (value: number, period: number) => ((value % period) + period) % period;
const distance = (a: FloorPoint, b: FloorPoint) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const pathLength = (points: readonly FloorPoint[]) => points.slice(1).reduce((sum, point, i) => sum + distance(points[i], point), 0);

function compileActor(actor: ServiceActor, period: number): CompiledActor {
  const { stops } = actor, n = stops.length;
  if (n < 2) throw new Error(`Service actor ${actor.id} needs at least two stops; give it a static node instead.`);
  if (!(actor.speed > 0)) throw new Error(`Service actor ${actor.id} needs a positive speed in m/s.`);
  const walk = (k: number) => pathLength([stops[(k + n - 1) % n].at, ...stops[k].via ?? [], stops[k].at]) / actor.speed;
  const anchor = stops.findIndex(stop => stop.leave !== undefined);
  if (anchor < 0) throw new Error(`Service actor ${actor.id} needs one stop with an absolute leave time.`);
  for (const [k, stop] of stops.entries()) if ((stop.leave === undefined) === (stop.dwell === undefined)) throw new Error(`Stop ${k} of ${actor.id} needs exactly one of leave or dwell.`);
  // Walk forward from the first absolute stop; every later stop arrives one walk after the previous departure.
  const timed: TimedStop[] = new Array(n);
  let clock = stops[anchor].leave!;
  for (let step = 1; step <= n; step++) {
    const k = (anchor + step) % n, stop = stops[k], arrive = clock + walk(k);
    const leave = stop.leave !== undefined ? arrive + wrap(stop.leave - arrive, period) : arrive + stop.dwell!;
    if (leave - arrive < MIN_STOP) throw new Error(`${actor.id} arrives at stop ${k} at ${wrap(arrive, period).toFixed(1)} s but leaves at ${wrap(leave, period).toFixed(1)} s; stops last at least ${MIN_STOP} s. Move the leave time later.`);
    timed[k] = { ...stop, arrive, leave };
    clock = leave;
  }
  const total = clock - stops[anchor].leave!;
  if (Math.abs(total - period) > 1e-6) {
    const schedule = timed.map((stop, k) => `stop ${k} ${wrap(stop.arrive, period).toFixed(1)}–${wrap(stop.leave, period).toFixed(1)} s`).join(', ');
    throw new Error(`${actor.id}'s loop lasts ${total.toFixed(1)} s instead of the ${period} s cycle (${schedule}); a stop that arrives after its leave time waits for the next cycle. Shorten its dwells or move its leave times.`);
  }
  const normalized = timed.map(stop => ({ ...stop, arrive: wrap(stop.arrive, period), leave: wrap(stop.leave, period) }));
  const points: Vec3[] = [], routeStops: { index: number; seconds: number; yaw: number }[] = [];
  normalized.forEach((stop, k) => {
    if (k) points.push(...(stop.via ?? []).map(([x, z]): Vec3 => [x, 0, z]));
    routeStops.push({ index: points.length, seconds: wrap(stop.leave - stop.arrive, period), yaw: stop.yaw });
    points.push([stop.at[0], 0, stop.at[1]]);
  });
  points.push(...(normalized[0].via ?? []).map(([x, z]): Vec3 => [x, 0, z]), [normalized[0].at[0], 0, normalized[0].at[1]]);
  const route: NodeRoute = { points, speed: actor.speed, loop: true, stops: routeStops };
  return { id: actor.id, stops: normalized, route, start: normalized[0].arrive };
}

function compileCourse(course: ServiceCourse, actors: readonly CompiledActor[], period: number): CompiledCourse {
  const label = `Course ${course.id}`;
  if (course.plated.length < 1 || course.plated.length > 2) throw new Error(`${label} needs one or two plates; a person carries at most two.`);
  const actions = actors.flatMap(actor => actor.stops.flatMap(stop => {
    const action = stop.action;
    if (!action || ('take' in action ? action.take : action.put) !== course.id) return [];
    return [{ actor: actor.id, at: wrap(stop.leave - HAND_OFF - course.platedAt, period), action }];
  })).sort((a, b) => a.at - b.at);
  const steps: PlateStep[] = [{ at: 0, place: { rests: course.plated } }];
  let holder: string | null = null, served = -1, cleared = -1;
  for (const { actor, at, action } of actions) {
    if ('take' in action) {
      if (holder) throw new Error(`${label}: ${actor} takes the plates at ${at.toFixed(1)} s after plating while ${holder} still holds them.`);
      holder = actor; steps.push({ at, place: { holder: actor } });
      if (served >= 0 && cleared < 0) cleared = at;
    } else {
      if (holder !== actor) throw new Error(`${label}: ${actor} puts the plates down at ${at.toFixed(1)} s after plating without holding them.`);
      if (action.on.length !== course.plated.length) throw new Error(`${label}: a put needs one rest per plate (${course.plated.length}).`);
      holder = null; steps.push({ at, place: { rests: action.on } });
      if (action.on.every(rest => rest.node === course.table)) served = at;
    }
  }
  if (holder || steps.length < 3) throw new Error(`${label} must end with its plates put down, e.g. at the dish machine.`);
  if (served < 0 || cleared < 0) throw new Error(`${label} needs a put on ${course.table} and a later take that clears it.`);
  const washed = steps.at(-1)!.at + WASH_SECONDS;
  if (washed >= period) throw new Error(`${label} is still on the dish machine when it is plated again; plate it later or clear it sooner.`);
  return { course, steps, eaten: served + (cleared - served) / 2, washed };
}

/** Validate a plan and turn it into routes and plate timelines. Throws with the actor, stop or course to fix. */
export function compileService(plan: ServicePlan): ServiceCycle {
  if (!(plan.period > 0)) throw new Error('A service plan needs a positive period in seconds.');
  const actors = plan.actors.map(actor => compileActor(actor, plan.period));
  return { period: plan.period, actors, courses: plan.courses.map(course => compileCourse(course, actors, plan.period)) };
}

/** The route of `actor` with `elapsed` set for `phase`, so a renderer that mounts now starts in step. */
export function routeAtPhase(actor: CompiledActor, period: number, phase: number): NodeRoute {
  return { ...actor.route, elapsed: wrap(phase - actor.start, period) };
}

/** Every plate in the scene at `phase`: plates not yet plated or already washed are absent. */
export function platesAt(cycle: ServiceCycle, phase: number): PlateState[] {
  return cycle.courses.flatMap(({ course, steps, eaten, washed }) => {
    const since = wrap(phase - course.platedAt, cycle.period);
    if (since >= washed) return [];
    const place = steps.findLast(step => step.at <= since)!.place, load = since >= eaten ? 'empty' as const : 'full' as const;
    return course.plated.map((_, index): PlateState => ({
      id: `plate:${course.id}:${index}`, course: course.id, load, slot: index, count: course.plated.length,
      ...('holder' in place ? { holder: place.holder } : { rest: place.rests[index] }),
    }));
  });
}

/** The pose of `actor` at `phase`: `holding` with plates in hand, the stop's pose while stopped, otherwise `travel`. */
export function actorPose(cycle: ServiceCycle, actor: CompiledActor, phase: number, travel = 'walking'): string {
  if (platesAt(cycle, phase).some(plate => plate.holder === actor.id)) return 'holding';
  const stop = actor.stops.find(item => wrap(phase - item.arrive, cycle.period) < wrap(item.leave - item.arrive, cycle.period));
  return stop?.pose ?? travel;
}

/** Where `actor` stands at `phase`, as a floor point. */
export function positionAt(cycle: ServiceCycle, actor: CompiledActor, phase: number): FloorPoint {
  const { position: [x, , z] } = sampleRoute(actor.route, wrap(phase - actor.start, cycle.period));
  return [x, z];
}

/** Grid step in seconds when the phase has to be found again. */
const SEARCH_STEP = .1;
/**
 * The phase that matches where the renderer draws the walking people, starting from the host's `estimate`.
 * `observe` returns where an actor stands (its floor point) or null while it is not drawn. The estimate stands while
 * every observed person is within `tolerance` metres of where it puts them; otherwise the phase nearest to the
 * estimate that fits them all is returned, or the best fit when none does. The renderer places a route follower
 * exactly on its route (only the heading is smoothed), so a small tolerance suffices.
 */
export function trackServicePhase(cycle: ServiceCycle, observe: (id: string) => FloorPoint | null, estimate: number, tolerance = .25): number {
  const seen = cycle.actors.flatMap(actor => { const point = observe(actor.id); return point ? [{ actor, point }] : []; });
  if (!seen.length) return estimate;
  const error = (phase: number) => Math.max(...seen.map(({ actor, point }) => distance(positionAt(cycle, actor, phase), point)));
  if (error(estimate) <= tolerance) return estimate;
  let best = estimate, bestError = Infinity, near = estimate, nearGap = Infinity;
  for (let phase = 0; phase < cycle.period; phase += SEARCH_STEP) {
    const value = error(phase), gap = Math.min(wrap(phase - estimate, cycle.period), wrap(estimate - phase, cycle.period));
    if (value < bestError) { best = phase; bestError = value; }
    if (value <= tolerance && gap < nearGap) { near = phase; nearGap = gap; }
  }
  return nearGap < Infinity ? near : best;
}

/**
 * Where a person stands, from a world pose of an anchor `ahead` metres in front of it at its root, such as a worker's
 * `carry` anchor (`SceneRenderer.getAnchor`). The rotation is the anchor's XYZ Euler angles.
 */
export function standingPoint(anchor: { readonly position: readonly [number, number, number]; readonly rotation: readonly [number, number, number] }, ahead: number): FloorPoint {
  const [x, , z] = anchor.position, [pitch, yaw] = anchor.rotation;
  // Forward (+z) through XYZ Euler angles; a heading past ±90° comes back as pitch and roll of π.
  return [x - Math.sin(yaw) * ahead, z - Math.cos(yaw) * Math.cos(pitch) * ahead];
}
