import type { Vec3 } from './index';

/**
 * A visual route assigned to an asset node. The follower owns the node's root
 * position and heading while the route is present; `position` stays the host's
 * record position and is used again after the route is removed.
 */
export interface RouteStop {
  /** Index into `points` where the follower pauses. */
  index: number;
  /** Visual seconds to remain at the point. */
  seconds: number;
  /** Optional heading while stopped, e.g. facing a shelf or desk. */
  yaw?: number;
}

/**
 * How an agent kind moves along a route. Every field is optional; without a
 * profile, speed changes and turns are instant (the renderer only blends the
 * heading). The profile is part of the route, so simulation time
 * (`routeDuration`) and visual time stay identical.
 */
export interface MotionProfile {
  /** Acceleration and braking in m/s² (at most 50). Agents start, stop and change lane speed smoothly. */
  acceleration?: number;
  /** Turning rate in rad/s (at most 50) while standing: at the start, at stops, at the end and at sharp corners. */
  turnRate?: number;
  /**
   * Corners sharper than this angle (radians, 0–π) are not taken while moving:
   * the agent brakes to a stop (with `acceleration`) and turns in place (with
   * `turnRate`). Default π/4 when `turnRate` is set; otherwise π, which never stops.
   */
  turnInPlaceAngle?: number;
  /**
   * Speed through a 90° corner taken while moving, in m/s; requires `acceleration`.
   * Shallower corners interpolate toward full speed, sharper ones use this value.
   */
  cornerSpeed?: number;
  /**
   * Radius in metres (greater than 0, at most 50) of corners taken while
   * moving: the agent drives a circular arc tangent to both segments instead
   * of pivoting on the corner point. Short segments shrink the arc so it never
   * uses more than half of either one. Timing stays on the polyline, so
   * `routeDuration`, `routeTimes` and arrival times do not change: the arc is
   * covered in the time of the two corner legs it replaces, a little slower than
   * the reported speed. Corners where the agent stops and turns in place stay sharp.
   */
  cornerRadius?: number;
}

export interface NodeRoute {
  /** World-space points in travel order (at least two). */
  points: readonly Vec3[];
  /** Default travel speed in metres per visual second. */
  speed: number;
  /** Optional per-segment speeds (length `points.length - 1`), e.g. lane speed limits. */
  segmentSpeeds?: readonly number[];
  /** Timed pauses at route points, in any order; one per point. */
  stops?: readonly RouteStop[];
  /** Restart from the first point after the last; requires a closed route (last point equals first). */
  loop?: boolean;
  /** Heading in radians (rotation about Y, 0 faces +z) after a non-looping route ends. */
  endYaw?: number;
  /**
   * How many segments from the start are driven in reverse: the agent keeps its
   * heading and backs along them, then stops before it drives forward. Default 0.
   * Not for loops. A follower that joins this route mid-travel drives it forward.
   */
  reverseSegments?: number;
  /** Kinematics of the agent kind; see `MotionProfile`. */
  profile?: MotionProfile;
  /** Heading before the route starts; with `profile.turnRate` the agent first turns in place. Ignored by loops. */
  startYaw?: number;
  /** Speed at the first point in m/s, e.g. when a replacement joins mid-travel. Default 0. Used with `profile.acceleration`; ignored by loops. */
  startSpeed?: number;
  /**
   * Seconds of this route already travelled when a follower first takes it, so
   * a newly mounted renderer resumes mid-route instead of restarting (loops wrap;
   * at or beyond the end a one-way route is finished). Not part of the route's
   * identity: a follower that already follows the route keeps its own progress.
   * Default 0. `behaviorNode(state, base, { time })` sets it from simulation time.
   */
  elapsed?: number;
}

export interface RouteSample {
  position: Vec3;
  /** Rotation about Y in radians; 0 faces +z, matching the catalog's front direction. */
  yaw: number;
  /** True while the follower is travelling along a segment of non-zero length. */
  moving: boolean;
  /** True once a non-looping route has reached its last point and final stop. */
  done: boolean;
  /** Index of the current (or last) segment. */
  segment: number;
  /** Point index while paused at a stop. */
  stop?: number;
  /** Point index while standing at a point (stopped or turning in place). */
  point?: number;
  /** True while turning in place. */
  turning?: boolean;
  /** True while driving a rounded corner (`MotionProfile.cornerRadius`); `yaw` is then the exact arc tangent. */
  curving?: boolean;
  /** Current speed in m/s. */
  speed: number;
}

export const MAX_ROUTE_POINTS = 512;
export const MAX_ROUTE_SPEED = 30;
export const MAX_ROUTE_STOP_SECONDS = 3600;
export const MAX_ROUTE_ACCELERATION = 50;
export const MAX_ROUTE_TURN_RATE = 50;
export const MAX_ROUTE_CORNER_RADIUS = 50;
const CLOSED_EPSILON = 1e-6;

const finiteVec = (value: unknown): value is Vec3 => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
const validSpeed = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= MAX_ROUTE_SPEED;

export function validateNodeRoute(route: NodeRoute): void {
  if (!route || !Array.isArray(route.points) || route.points.length < 2 || route.points.length > MAX_ROUTE_POINTS) throw new Error(`Route requires 2–${MAX_ROUTE_POINTS} points.`);
  if (!route.points.every(finiteVec)) throw new Error('Route points must be finite [x, y, z] values.');
  if (!validSpeed(route.speed)) throw new Error(`Route speed must be greater than 0 and at most ${MAX_ROUTE_SPEED} m/s.`);
  if (route.segmentSpeeds !== undefined && (!Array.isArray(route.segmentSpeeds) || route.segmentSpeeds.length !== route.points.length - 1 || !route.segmentSpeeds.every(validSpeed))) throw new Error('Route segment speeds must provide one valid speed per segment.');
  if (route.stops !== undefined) {
    if (!Array.isArray(route.stops)) throw new Error('Route stops must be an array.');
    const seen = new Set<number>();
    for (const stop of route.stops) {
      if (!stop || !Number.isSafeInteger(stop.index) || stop.index < 0 || stop.index >= route.points.length || seen.has(stop.index)) throw new Error('Each route stop needs a unique point index within the route.');
      if (!Number.isFinite(stop.seconds) || stop.seconds <= 0 || stop.seconds > MAX_ROUTE_STOP_SECONDS) throw new Error(`Route stop duration must be greater than 0 and at most ${MAX_ROUTE_STOP_SECONDS} seconds.`);
      if (stop.yaw !== undefined && !Number.isFinite(stop.yaw)) throw new Error('Route stop heading must be finite.');
      seen.add(stop.index);
    }
  }
  if (route.loop !== undefined && typeof route.loop !== 'boolean') throw new Error('Route loop must be boolean.');
  if (route.loop && distance(route.points[0], route.points[route.points.length - 1]) > CLOSED_EPSILON) throw new Error('A looping route must end at its first point.');
  if (route.endYaw !== undefined && !Number.isFinite(route.endYaw)) throw new Error('Route end heading must be finite.');
  if (route.startYaw !== undefined && !Number.isFinite(route.startYaw)) throw new Error('Route start heading must be finite.');
  if (route.reverseSegments !== undefined && !(Number.isSafeInteger(route.reverseSegments) && route.reverseSegments >= 0 && route.reverseSegments < route.points.length)) throw new Error('Route reverse segments must be a whole number from 0 to the number of segments.');
  if (route.reverseSegments && route.loop) throw new Error('A looping route cannot drive in reverse.');
  if (route.startSpeed !== undefined && !(Number.isFinite(route.startSpeed) && route.startSpeed >= 0 && route.startSpeed <= MAX_ROUTE_SPEED)) throw new Error(`Route start speed must be between 0 and ${MAX_ROUTE_SPEED} m/s.`);
  if (route.profile !== undefined) validateMotionProfile(route.profile);
  if (route.elapsed !== undefined && !(Number.isFinite(route.elapsed) && route.elapsed >= 0)) throw new Error('Route elapsed time must be finite and not negative.');
}

const inRange = (value: unknown, max: number) => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= max;
export function validateMotionProfile(profile: MotionProfile, name = 'Motion profile'): void {
  if (!profile || typeof profile !== 'object') throw new Error(`${name} must be an object.`);
  if (profile.acceleration !== undefined && !inRange(profile.acceleration, MAX_ROUTE_ACCELERATION)) throw new Error(`${name} acceleration must be greater than 0 and at most ${MAX_ROUTE_ACCELERATION} m/s².`);
  if (profile.turnRate !== undefined && !inRange(profile.turnRate, MAX_ROUTE_TURN_RATE)) throw new Error(`${name} turn rate must be greater than 0 and at most ${MAX_ROUTE_TURN_RATE} rad/s.`);
  if (profile.turnInPlaceAngle !== undefined && !(Number.isFinite(profile.turnInPlaceAngle) && profile.turnInPlaceAngle >= 0 && profile.turnInPlaceAngle <= Math.PI)) throw new Error(`${name} turn-in-place angle must be between 0 and π.`);
  if (profile.cornerSpeed !== undefined) {
    if (!inRange(profile.cornerSpeed, MAX_ROUTE_SPEED)) throw new Error(`${name} corner speed must be greater than 0 and at most ${MAX_ROUTE_SPEED} m/s.`);
    if (profile.acceleration === undefined) throw new Error(`${name} corner speed requires an acceleration.`);
  }
  if (profile.cornerRadius !== undefined && !inRange(profile.cornerRadius, MAX_ROUTE_CORNER_RADIUS)) throw new Error(`${name} corner radius must be greater than 0 and at most ${MAX_ROUTE_CORNER_RADIUS} m.`);
}

/** The motion-profile fields of a rule (for example a movement-graph agent rule), or undefined when it has none. */
export function motionProfileOf(rule: MotionProfile | undefined): MotionProfile | undefined {
  if (!rule) return undefined;
  const profile: MotionProfile = {
    ...(rule.acceleration !== undefined ? { acceleration: rule.acceleration } : {}),
    ...(rule.turnRate !== undefined ? { turnRate: rule.turnRate } : {}),
    ...(rule.turnInPlaceAngle !== undefined ? { turnInPlaceAngle: rule.turnInPlaceAngle } : {}),
    ...(rule.cornerSpeed !== undefined ? { cornerSpeed: rule.cornerSpeed } : {}),
    ...(rule.cornerRadius !== undefined ? { cornerRadius: rule.cornerRadius } : {}),
  };
  return Object.keys(profile).length ? Object.freeze(profile) : undefined;
}

export function cloneNodeRoute(route: NodeRoute): NodeRoute {
  return Object.freeze({
    ...route,
    points: Object.freeze(route.points.map(point => Object.freeze([...point]) as Vec3)),
    ...(route.segmentSpeeds ? { segmentSpeeds: Object.freeze([...route.segmentSpeeds]) } : {}),
    ...(route.stops ? { stops: Object.freeze(route.stops.map(stop => Object.freeze({ ...stop }))) } : {}),
    ...(route.profile ? { profile: Object.freeze({ ...route.profile }) } : {}),
  });
}

function distance(a: Vec3, b: Vec3) { return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); }
const headingOf = (a: Vec3, b: Vec3) => Math.atan2(b[0] - a[0], b[2] - a[2]);
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
const TURN_EPSILON = 1e-6;

type MovePhase = {
  kind: 'move'; segment: number; seconds: number; length: number; yaw: number;
  /** Trapezoidal speed profile: accelerate from `u` to `peak`, cruise, brake to `w`. Without acceleration all three equal the segment speed. */
  u: number; peak: number; w: number; accel: number; t1: number; t2: number; d1: number; d2: number;
};
type Phase =
  | { kind: 'stop'; point: number; seconds: number; yaw: number }
  | { kind: 'turn'; point: number; seconds: number; from: number; delta: number }
  | MovePhase;
/** A rounded corner: from `start` (distance `d` before the corner point) to `end` (`d` after it), turning by `delta` from heading `from`. */
interface CornerArc { d: number; radius: number; from: number; delta: number; start: Vec3; end: Vec3 }
interface Timeline { phases: readonly Phase[]; total: number; endYaw: number; arcs: readonly (CornerArc | null)[] }

function movePhase(segment: number, length: number, yaw: number, cap: number, u: number, w: number, accel: number | undefined): MovePhase {
  if (!accel || length <= 0) return { kind: 'move', segment, length, yaw, seconds: length / cap, u: cap, peak: cap, w: cap, accel: 0, t1: 0, t2: length / cap, d1: 0, d2: length };
  // Boundary speeds are reachable within `length`, so the peak is never below either of them.
  const peak = Math.max(u, w, Math.min(cap, Math.sqrt((2 * accel * length + u * u + w * w) / 2)));
  const d1 = (peak * peak - u * u) / (2 * accel), d3 = (peak * peak - w * w) / (2 * accel), d2 = Math.max(0, length - d1 - d3);
  const t1 = (peak - u) / accel, t2 = peak > 0 ? d2 / peak : 0, t3 = (peak - w) / accel;
  return { kind: 'move', segment, length, yaw, seconds: t1 + t2 + t3, u, peak, w, accel, t1, t2, d1, d2 };
}

const timelines = new WeakMap<NodeRoute, Timeline>();
/** Phases of one pass. Routes are treated as immutable, so the timeline is cached per route object. */
function timeline(route: NodeRoute): Timeline {
  const cached = timelines.get(route); if (cached) return cached;
  const { points } = route, last = points.length - 1, loop = route.loop === true, profile = route.profile;
  const accel = profile?.acceleration, turnRate = profile?.turnRate;
  const turnAngle = profile?.turnInPlaceAngle ?? (turnRate ? Math.PI / 4 : Math.PI);
  const stops = new Map((route.stops ?? []).map(stop => [stop.index, stop]));
  const lengths = points.slice(1).map((point, i) => distance(points[i], point));
  const caps = lengths.map((_, i) => route.segmentSpeeds?.[i] ?? route.speed);
  // A reversed segment is faced away from its direction of travel; positions still follow the points.
  const reversed = route.reverseSegments ?? 0, headings = lengths.map((length, i) => length > 0 ? headingOf(points[i], points[i + 1]) + (i < reversed ? Math.PI : 0) : null);
  const nextHeading = (k: number) => { for (let i = k; i < last; i++) if (headings[i] !== null) return headings[i]!; return null; };
  const prevHeading = (k: number) => { for (let i = k; i >= 0; i--) if (headings[i] !== null) return headings[i]!; return null; };
  const firstHeading = nextHeading(0) ?? route.endYaw ?? 0;
  const startFacing = loop ? prevHeading(last - 1) ?? firstHeading : route.startYaw ?? firstHeading;
  // Corner angle at each point. Coincident points carry their corner on the point that leaves them.
  const angles = points.map((_, k) => k === last || headings[k] === null ? 0 : Math.abs(wrap(headings[k]! - (prevHeading(k - 1) ?? startFacing))));
  // Points where the agent stands still: stops, sharp corners, and the ends of a one-way route.
  const standing = points.map((_, k) => stops.has(k) || angles[k] > turnAngle + TURN_EPSILON || k === reversed && k > 0 || !loop && (k === last || k === 0 && !((route.startSpeed ?? 0) > 0)));
  if (loop && (standing[0] || standing[last])) standing[0] = standing[last] = true;
  for (let k = 0; k < last; k++) if (standing[k] && lengths[k] === 0) standing[k + 1] = true;

  // Boundary speeds; forward and backward passes keep every speed change within the acceleration limit.
  const speeds = points.map((_, k) => {
    if (!accel || standing[k]) return 0;
    let cap = Math.min(k > 0 ? caps[k - 1] : caps[last - 1], k < last ? caps[k] : caps[0]);
    if (k === 0 && !loop) cap = Math.min(cap, route.startSpeed ?? 0);
    const angle = loop && k === last ? angles[0] : angles[k];
    if (profile?.cornerSpeed !== undefined && angle > TURN_EPSILON) cap = Math.min(cap, cap + (profile.cornerSpeed - cap) * Math.min(1, angle / (Math.PI / 2)));
    return cap;
  });
  if (accel) {
    const pass = () => {
      for (let k = 1; k <= last; k++) speeds[k] = Math.min(speeds[k], Math.sqrt(speeds[k - 1] ** 2 + 2 * accel * lengths[k - 1]));
      for (let k = last - 1; k >= 0; k--) speeds[k] = Math.min(speeds[k], Math.sqrt(speeds[k + 1] ** 2 + 2 * accel * lengths[k]));
    };
    pass();
    // A loop's seam is one place: both ends take the lower speed until the passes agree.
    for (let i = 0; loop && i < 8 && Math.abs(speeds[0] - speeds[last]) > 1e-9; i++) { speeds[0] = speeds[last] = Math.min(speeds[0], speeds[last]); pass(); }
    if (loop && Math.abs(speeds[0] - speeds[last]) > 1e-9) { speeds[0] = speeds[last] = 0; pass(); }
  }

  const phases: Phase[] = [];
  let facing = startFacing;
  const turn = (point: number, to: number) => {
    const delta = wrap(to - facing);
    if (turnRate && Math.abs(delta) > TURN_EPSILON) phases.push({ kind: 'turn', point, seconds: Math.abs(delta) / turnRate, from: facing, delta });
    facing = to;
  };
  points.forEach((_, k) => {
    const stop = stops.get(k);
    if (stop) { if (stop.yaw !== undefined) turn(k, stop.yaw); phases.push({ kind: 'stop', point: k, seconds: stop.seconds, yaw: facing }); }
    const out = k < last ? headings[k] : loop ? null : route.endYaw ?? null;
    if (out !== null) { if (standing[k]) turn(k, out); else facing = out; }
    if (k < last) phases.push(movePhase(k, lengths[k], facing, caps[k], speeds[k], speeds[k + 1], accel));
  });
  // Rounded corners: only where the agent keeps moving, between two segments of non-zero length.
  const radius = profile?.cornerRadius;
  const arcAt = (k: number, inSegment: number, outSegment: number): CornerArc | null => {
    if (!radius || standing[k] || inSegment < reversed || outSegment < reversed || !(lengths[inSegment] > 0) || !(lengths[outSegment] > 0)) return null;
    const from = headings[inSegment]!, delta = wrap(headings[outSegment]! - from), half = Math.abs(delta) / 2;
    if (half < TURN_EPSILON || half > Math.PI / 2 - TURN_EPSILON) return null;
    const d = Math.min(radius * Math.tan(half), lengths[inSegment] / 2, lengths[outSegment] / 2), corner = points[k];
    const along = (segment: number, distanceFromCorner: number, a: Vec3, b: Vec3): Vec3 => { const t = distanceFromCorner / lengths[segment]; return [corner[0] + (b[0] - a[0]) * t, corner[1] + (b[1] - a[1]) * t, corner[2] + (b[2] - a[2]) * t]; };
    return { d, radius: d / Math.tan(half), from, delta, start: along(inSegment, -d, points[inSegment], points[inSegment + 1]), end: along(outSegment, d, points[outSegment], points[outSegment + 1]) };
  };
  const arcs = points.map((_, k) => k > 0 && k < last ? arcAt(k, k - 1, k) : null);
  // A loop's seam is one corner shared by its first and last point.
  if (loop && last > 1) arcs[0] = arcs[last] = arcAt(0, last - 1, 0);
  const result: Timeline = { phases, total: phases.reduce((sum, phase) => sum + phase.seconds, 0), endYaw: facing, arcs };
  timelines.set(route, result);
  return result;
}

export function routeLength(route: NodeRoute): number { return route.points.slice(1).reduce((sum, point, index) => sum + distance(route.points[index], point), 0); }
/** Visual seconds for one pass, including stops, turns in place and acceleration. */
export function routeDuration(route: NodeRoute): number { return timeline(route).total; }

/**
 * Seconds into one pass at which the follower reaches (`arrive`) and leaves
 * (`depart`) each point, including stops, turns in place and acceleration.
 * The first point is reached at 0; the last is left when the pass ends.
 */
export function routeTimes(route: NodeRoute): readonly { arrive: number; depart: number }[] {
  const { phases, total } = timeline(route), times = route.points.map(() => ({ arrive: 0, depart: 0 }));
  let clock = 0;
  for (const phase of phases) {
    if (phase.kind === 'move') times[phase.segment].depart = clock;
    clock += phase.seconds;
    if (phase.kind === 'move') times[phase.segment + 1].arrive = clock;
  }
  times[times.length - 1].depart = total;
  return times;
}

/** Distance and speed `time` seconds into a move phase. */
function travelled(phase: MovePhase, time: number): [number, number] {
  if (!phase.accel) return [phase.peak * time, phase.peak];
  if (time < phase.t1) return [phase.u * time + phase.accel * time * time / 2, phase.u + phase.accel * time];
  if (time < phase.t1 + phase.t2) return [phase.d1 + phase.peak * (time - phase.t1), phase.peak];
  const t = Math.min(time - phase.t1 - phase.t2, (phase.peak - phase.w) / phase.accel);
  return [Math.min(phase.length, phase.d1 + phase.d2 + phase.peak * t - phase.accel * t * t / 2), phase.peak - phase.accel * t];
}

/** Position and heading `u` (0–1) of the way through a rounded corner. */
function onArc(arc: CornerArc, u: number): { position: Vec3; yaw: number } {
  const yaw = arc.from + arc.delta * u, side = Math.sign(arc.delta) * arc.radius;
  return { position: [arc.start[0] + side * (Math.cos(arc.from) - Math.cos(yaw)), arc.start[1] + (arc.end[1] - arc.start[1]) * u, arc.start[2] + side * (Math.sin(yaw) - Math.sin(arc.from))], yaw };
}

/** Deterministic position, heading and speed after `elapsed` visual seconds. */
export function sampleRoute(route: NodeRoute, elapsed: number): RouteSample {
  const { phases, total, endYaw, arcs } = timeline(route), last = route.points.length - 1;
  const end = (): RouteSample => ({ position: route.points[last], yaw: endYaw, moving: false, done: !route.loop, segment: last - 1, speed: 0 });
  if (total <= 0) return end();
  // Infinity means "after the end" for one-way routes; loops cannot reach an end.
  let time = Number.isNaN(elapsed) ? 0 : Math.max(0, elapsed);
  if (route.loop) time = Number.isFinite(time) ? time % total : 0;
  else if (time >= total) return end();
  for (const phase of phases) {
    if (time >= phase.seconds) { time -= phase.seconds; continue; }
    if (phase.kind === 'stop') return { position: route.points[phase.point], yaw: phase.yaw, moving: false, done: false, segment: Math.min(phase.point, last - 1), stop: phase.point, point: phase.point, speed: 0 };
    if (phase.kind === 'turn') return { position: route.points[phase.point], yaw: phase.from + phase.delta * time / phase.seconds, moving: false, done: false, segment: Math.min(phase.point, last - 1), point: phase.point, turning: true, speed: 0 };
    const a = route.points[phase.segment], b = route.points[phase.segment + 1], [along, speed] = travelled(phase, time), t = along / phase.length;
    // Near a rounded corner the polyline distance maps linearly onto the arc, so timing stays on the polyline.
    const before = arcs[phase.segment], after = arcs[phase.segment + 1];
    const curve = before && along < before.d ? onArc(before, (before.d + along) / (2 * before.d)) : after && along > phase.length - after.d ? onArc(after, (along - phase.length + after.d) / (2 * after.d)) : null;
    if (curve) return { ...curve, moving: true, done: false, segment: phase.segment, speed, curving: true };
    return { position: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], yaw: phase.yaw, moving: true, done: false, segment: phase.segment, speed };
  }
  return end();
}

/** Stable identity used to ignore duplicate or re-sent route assignments; `elapsed` is not part of it. */
export function routeKey(route: NodeRoute): string {
  return JSON.stringify([route.points, route.speed, route.segmentSpeeds ?? null, route.stops ?? null, route.loop ?? false, route.endYaw ?? null, route.profile ?? null, route.startYaw ?? null, route.startSpeed ?? null, route.reverseSegments ?? 0]);
}

export interface RouteFollower {
  /** The route currently being travelled, including any join prefix from the previous route. */
  readonly route: NodeRoute | null;
  /**
   * Assign or clear a route. An identical route keeps its progress. A different
   * route takes over without a position jump or a second loop (see `joinRoutes`).
   */
  assign(route: NodeRoute | undefined, from: Vec3): void;
  /** Advance the visual clock; callers apply pause and speed before calling. */
  advance(seconds: number): RouteSample | null;
  /**
   * Show the confirmed result without animation (motion off / reduced motion):
   * the end of a one-way route, or the current pose of a loop. While joining a
   * loop, the current pose on the join prefix is held; the loop starts once
   * motion resumes and the prefix has been travelled.
   */
  settle(): RouteSample | null;
  sample(): RouteSample | null;
}

const SAME_POINT = 1e-6;
const samePoint = (a: Vec3, b: Vec3) => distance(a, b) <= SAME_POINT;
const speedOf = (route: NodeRoute, segment: number) => route.segmentSpeeds?.[segment] ?? route.speed;

/**
 * How `joinRoutes` composes a replacement, so a simulation can map the joined
 * route's points back onto its own plan. The joined route's points are `from`,
 * then `current.points[i]` for each index in `via`, then `next.points` after
 * index `at`. `at` is -1 when the routes share no point: the joined route is
 * then `from` followed by every point of `next` (an unchecked bridge).
 */
export interface RouteJoin {
  /** Index into `current` of the point the follower last reached or stands at; the joined route's first segment continues from it. */
  previous: number;
  /** Indices into `current` of the upcoming points travelled before taking `next`, in order. */
  via: readonly number[];
  /** Index into `next` of the shared point after which the joined route follows `next`; -1 for a bridge. */
  at: number;
}

/** Where a follower at `progress` on `current`, standing at `from`, takes over `next` (see `joinRoutes`). */
export function routeJoin(current: NodeRoute, progress: RouteSample, next: NodeRoute, from: Vec3): RouteJoin {
  const last = current.points.length - 1;
  const first = progress.done ? last + 1 : progress.point !== undefined ? progress.point + 1 : progress.segment + 1;
  // Upcoming points of the current route, wrapping once around a loop.
  const upcoming: number[] = [];
  for (let i = first; i <= last; i++) upcoming.push(i);
  if (current.loop && !progress.done) for (let i = 1; i < first; i++) upcoming.push(i);
  const candidates = [from, ...upcoming.map(i => current.points[i])];
  for (let k = 0; k < candidates.length; k++) {
    const at = next.points.findIndex(point => samePoint(point, candidates[k]));
    if (at >= 0) return { previous: first - 1, via: upcoming.slice(0, k), at };
  }
  return { previous: first - 1, via: [], at: -1 };
}

/**
 * Replacement policy ("join"): keep travelling along the current route to the
 * first upcoming point that the next route also contains, then continue on the
 * next route from that point. Every travelled segment therefore belongs to one
 * of the two planned routes, so movement rules stay respected and nothing jumps.
 * Remaining stops of the interrupted route are skipped. Routes planned from the
 * previous destination, or from the next upcoming point, always share a point.
 * Only when the routes share no point does the follower bridge directly from
 * its current position to the next route's start; that bridge is not rule-checked.
 * `routeJoin` returns the same composition as indices.
 *
 * Returns a one-way route; when `next` loops, the caller starts the loop after it.
 */
export function joinRoutes(current: NodeRoute, progress: RouteSample, next: NodeRoute, from: Vec3): NodeRoute {
  const { via, at } = routeJoin(current, progress, next, from);
  // The replacement starts with the current heading and speed, so profiles brake, turn and accelerate from there.
  const handoff = { ...(next.profile ? { profile: next.profile } : {}), startYaw: progress.yaw, ...(progress.speed > 0 ? { startSpeed: progress.speed } : {}) };
  if (at < 0) return { ...next, points: [from, ...next.points], segmentSpeeds: [next.speed, ...next.points.slice(1).map((_, index) => speedOf(next, index))], ...(next.stops ? { stops: next.stops.map(stop => ({ ...stop, index: stop.index + 1 })) } : {}), loop: false, ...handoff };
  // Each upcoming point keeps the speed of the segment that reaches it.
  const tail = next.points.slice(at + 1);
  const points = [from, ...via.map(i => current.points[i]), ...tail];
  const speeds = [...via.map(i => speedOf(current, i - 1)), ...tail.map((_, index) => speedOf(next, at + index))];
  // Joining exactly at the end of `next` leaves a single point; keep a zero-length segment so the route stays valid.
  if (points.length === 1) { points.push(from); speeds.push(next.speed); }
  const offset = via.length - at;
  const stops = (next.stops ?? []).filter(stop => stop.index >= at && stop.index + offset < points.length).map(stop => ({ ...stop, index: stop.index + offset }));
  return { points, speed: next.speed, segmentSpeeds: speeds, ...(stops.length ? { stops } : {}), ...(next.endYaw !== undefined ? { endYaw: next.endYaw } : {}), ...handoff };
}

export function createRouteFollower(): RouteFollower {
  let key: string | null = null, active: NodeRoute | null = null, loopAfter: NodeRoute | null = null, elapsed = 0;
  const startLoopIfDue = () => {
    if (!loopAfter || !active) return;
    const prefix = routeDuration(active);
    if (elapsed >= prefix) { elapsed -= prefix; active = loopAfter; loopAfter = null; }
  };
  return {
    get route() { return active; },
    assign(route, from) {
      if (!route) { key = null; active = null; loopAfter = null; elapsed = 0; return; }
      const nextKey = routeKey(route); if (nextKey === key) return;
      validateNodeRoute(route); key = nextKey;
      // A first route starts at its declared progress, e.g. after the renderer was mounted again.
      if (!active) { active = route; loopAfter = null; elapsed = route.elapsed ?? 0; return; }
      const progress = sampleRoute(active, elapsed); elapsed = 0;
      // A route that starts exactly here needs no join prefix.
      if (samePoint(from, route.points[0])) { active = route; loopAfter = null; return; }
      active = joinRoutes(active, progress, route, from); loopAfter = route.loop ? route : null;
    },
    advance(seconds) {
      if (!active) return null;
      elapsed += Math.max(0, Number.isFinite(seconds) ? seconds : 0);
      startLoopIfDue();
      return sampleRoute(active, elapsed);
    },
    settle() {
      if (!active) return null;
      // A join into a loop has no confirmed end: hold the pose, as the loop itself would.
      if (!loopAfter && !active.loop) elapsed = routeDuration(active);
      return { ...sampleRoute(active, elapsed), moving: false };
    },
    sample() { return active ? sampleRoute(active, elapsed) : null; },
  };
}
