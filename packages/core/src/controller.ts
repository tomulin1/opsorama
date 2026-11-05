import type { AssetNode, Vec3 } from './index';

/** JSON data accepted in controller options, so scene definitions stay serializable. */
export type ControllerValue = string | number | boolean | null | readonly ControllerValue[] | { readonly [key: string]: ControllerValue };

/**
 * A per-frame motion controller assigned to an asset node by name. The scene
 * definition stays serializable; the renderer resolves `kind` in its controller
 * registry (`basicControllers` plus the host's own).
 */
export interface NodeController {
  kind: string;
  options?: Readonly<Record<string, ControllerValue>>;
}

/** Root position and heading in the node's parent space (the scene for top-level nodes). 0 yaw faces +z. */
export interface ControllerPose { position: Vec3; yaw: number; }
export interface ControllerOutput extends ControllerPose {
  /** Passed to the model's local animator as `locomotion.moving`, e.g. so a worker walks in place. */
  moving?: boolean;
}
/** Visual seconds after scene speed; `time` is the shared animation clock. */
export interface ControllerFrame { delta: number; time: number; }
export interface ControllerContext {
  /** The latest node; `node.position` is the host's record position. */
  readonly node: AssetNode;
  /** Current visual pose of another node in this node's parent space, or null when it is missing or hidden. */
  pose(id: string): ControllerPose | null;
}
/** Why a controller stopped: its spec was removed or replaced, the node or scene went away, or it threw. */
export type ControllerStopReason = 'cleared' | 'replaced' | 'removed' | 'disposed' | 'error';

/**
 * Lifecycle: the factory starts a controller with the node's current pose;
 * `update` runs on animated, unpaused frames; `settle` replaces travel while
 * motion is off or reduced; `cancel` runs exactly once when it stops, and
 * releases anything it owns.
 */
export interface MotionController {
  update(frame: ControllerFrame, pose: ControllerPose, context: ControllerContext): ControllerOutput;
  /** The confirmed pose without animation. Default: hold the current pose. */
  settle?(pose: ControllerPose, context: ControllerContext): ControllerOutput;
  cancel?(reason: ControllerStopReason): void;
}
export type ControllerFactory = (options: Readonly<Record<string, ControllerValue>>, node: AssetNode) => MotionController;
export type ControllerRegistry = Readonly<Record<string, ControllerFactory>>;

const isData = (value: unknown, depth = 0): value is ControllerValue => {
  if (depth > 16) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(item => isData(item, depth + 1));
  return typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype && Object.values(value as object).every(item => isData(item, depth + 1));
};
export function validateNodeController(controller: NodeController): void {
  if (!controller || typeof controller !== 'object') throw new Error('Controller must be an object.');
  if (typeof controller.kind !== 'string' || !controller.kind.trim()) throw new Error('Controller kind must not be empty.');
  if (controller.options !== undefined && (typeof controller.options !== 'object' || controller.options === null || Array.isArray(controller.options) || !isData(controller.options))) throw new Error(`Controller ${controller.kind} options must be plain JSON data with finite numbers.`);
}
const freeze = <T>(value: T): T => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
export function cloneNodeController(controller: NodeController): NodeController {
  return freeze({ kind: controller.kind, ...(controller.options ? { options: JSON.parse(JSON.stringify(controller.options)) } : {}) });
}
export const controllerKey = (controller: NodeController | undefined) => controller ? JSON.stringify([controller.kind, controller.options ?? null]) : '';

/** Owns one node's controller across model rebuilds, like the route follower. */
export interface ControllerSlot {
  readonly active: boolean;
  /** Start, replace or clear the controller for `node.controller`. A spec that failed stays stopped until it changes. */
  assign(node: AssetNode, registry: ControllerRegistry): void;
  /** Run one frame; a controller that throws is cancelled with `error` and the error is rethrown. */
  advance(frame: ControllerFrame, pose: ControllerPose, context: ControllerContext): ControllerOutput | null;
  settle(pose: ControllerPose, context: ControllerContext): ControllerOutput | null;
  cancel(reason: ControllerStopReason): void;
}

export function createControllerSlot(): ControllerSlot {
  let controller: MotionController | null = null, key = '', failed = '';
  const stop = (reason: ControllerStopReason) => { const current = controller; controller = null; current?.cancel?.(reason); };
  const guard = <T>(run: () => T): T => { try { return run(); } catch (error) { failed = key; stop('error'); throw error; } };
  return {
    get active() { return controller !== null; },
    assign(node, registry) {
      const next = controllerKey(node.controller);
      if (next === key) return;
      stop(next ? 'replaced' : 'cleared'); key = next;
      if (!next || next === failed) return;
      failed = '';
      const factory = registry[node.controller!.kind];
      if (!factory) { failed = next; throw new Error(`Unknown controller: ${node.controller!.kind}. Register a ControllerFactory in renderer options.`); }
      controller = guard(() => factory(node.controller!.options ?? {}, node));
    },
    advance(frame, pose, context) { const current = controller; return current ? guard(() => current.update(frame, pose, context)) : null; },
    settle(pose, context) { const current = controller; return current ? guard(() => current.settle?.(pose, context) ?? { ...pose, moving: false }) : null; },
    cancel(reason) { stop(reason); key = ''; failed = ''; },
  };
}

const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
const number = (options: Readonly<Record<string, ControllerValue>>, name: string, fallback: number, max: number, kind: string) => {
  const value = options[name] ?? fallback;
  if (typeof value !== 'number' || !(value > 0) || value > max) throw new Error(`Controller ${kind} option ${name} must be a number greater than 0 and at most ${max}.`);
  return value;
};

const ARRIVED = 1e-6;
/** Speed-limited, accelerated travel toward a point that may move; faces the direction of travel. It never overshoots. */
function seeker(kind: string, options: Readonly<Record<string, ControllerValue>>) {
  const speed = number(options, 'speed', 1.5, 30, kind), acceleration = number(options, 'acceleration', 2, 50, kind), turnRate = number(options, 'turnRate', 8, 50, kind);
  let velocity = 0;
  return {
    reset() { velocity = 0; },
    /** `goalSpeed` is how fast the goal itself moves, so a follower can match a moving leader instead of lagging. */
    step(delta: number, pose: ControllerPose, goal: Vec3, finalYaw?: number, goalSpeed = 0): ControllerOutput {
      const dx = goal[0] - pose.position[0], dz = goal[2] - pose.position[2], distance = Math.hypot(dx, dz);
      const turnToward = (yaw: number) => pose.yaw + Math.max(-turnRate * delta, Math.min(turnRate * delta, wrap(yaw - pose.yaw)));
      if (distance <= ARRIVED) { velocity = 0; return { position: goal, yaw: finalYaw === undefined ? pose.yaw : turnToward(finalYaw), moving: false }; }
      // Brake in time to stop at the goal; turn toward it and move only as fast as the heading allows.
      const desired = Math.min(speed, goalSpeed + Math.sqrt(2 * acceleration * distance));
      velocity = velocity < desired ? Math.min(desired, velocity + acceleration * delta) : Math.max(desired, velocity - acceleration * delta);
      const heading = Math.atan2(dx, dz), yaw = turnToward(heading), alignment = Math.max(0, Math.cos(wrap(heading - yaw)));
      const step = Math.min(distance, velocity * alignment * delta), t = step / distance;
      return { position: [pose.position[0] + dx * t, pose.position[1] + (goal[1] - pose.position[1]) * t, pose.position[2] + dz * t], yaw, moving: step > 0 };
    },
  };
}

/**
 * `approach`: travel to the node's record `position` with its own speed,
 * acceleration and turning instead of the default interpolation, so a host
 * only sets where the object should be. Options: `speed` (m/s, default 1.5),
 * `acceleration` (m/s², 2), `turnRate` (rad/s, 8), `arriveYaw` (`travel` keeps the travel heading, `record` turns to the node's
 * rotation on arrival; default `travel`). It ignores obstacles and movement rules.
 */
function approach(options: Readonly<Record<string, ControllerValue>>): MotionController {
  const seek = seeker('approach', options), arriveYaw = options.arriveYaw ?? 'travel';
  if (arriveYaw !== 'travel' && arriveYaw !== 'record') throw new Error('Controller approach option arriveYaw must be travel or record.');
  const goal = (node: AssetNode): Vec3 => node.position ?? [0, 0, 0];
  const finalYaw = (node: AssetNode, pose: ControllerPose) => arriveYaw === 'record' ? node.rotation?.[1] ?? 0 : pose.yaw;
  return {
    update: ({ delta }, pose, { node }) => seek.step(delta, pose, goal(node), arriveYaw === 'record' ? node.rotation?.[1] ?? 0 : undefined),
    settle: (pose, { node }) => { seek.reset(); return { position: goal(node), yaw: finalYaw(node, pose), moving: false }; },
  };
}

/**
 * `follow`: trail another node at `distance` metres (default 1.2), e.g. a cart
 * behind a tug. Options: `target` (node ID, required) plus the `approach`
 * kinematics options; default speed 2 m/s. It holds still while the target is
 * missing. Motion-off places it directly behind the target.
 */
function follow(options: Readonly<Record<string, ControllerValue>>): MotionController {
  const target = options.target;
  if (typeof target !== 'string' || !target.trim()) throw new Error('Controller follow requires a target node ID.');
  const distance = number(options, 'distance', 1.2, 50, 'follow'), seek = seeker('follow', { speed: 2, ...options });
  let last: ControllerPose | null = null, leaderSpeed = 0;
  const behind = (leader: ControllerPose): Vec3 => [leader.position[0] - Math.sin(leader.yaw) * distance, leader.position[1], leader.position[2] - Math.cos(leader.yaw) * distance];
  return {
    update({ delta }, pose, context) {
      const leader = context.pose(target);
      if (!leader) { seek.reset(); last = null; leaderSpeed = 0; return { ...pose, moving: false }; }
      // Smoothed leader speed, so the follower keeps pace instead of braking toward a goal that moves on.
      if (last && delta > 0) leaderSpeed += (Math.hypot(leader.position[0] - last.position[0], leader.position[2] - last.position[2]) / delta - leaderSpeed) * Math.min(1, delta * 8);
      last = leader;
      const dx = pose.position[0] - leader.position[0], dz = pose.position[2] - leader.position[2], gap = Math.hypot(dx, dz);
      // Keep the trailing gap along the line to the leader, so the follower cuts corners like a towed cart.
      const goal: Vec3 = gap > 1e-6 ? [leader.position[0] + dx / gap * distance, leader.position[1], leader.position[2] + dz / gap * distance] : behind(leader);
      if (gap <= distance) { seek.reset(); return { ...pose, moving: false }; }
      return seek.step(delta, pose, goal, undefined, leaderSpeed);
    },
    settle(pose, context) {
      seek.reset(); last = null; leaderSpeed = 0;
      const leader = context.pose(target);
      return leader ? { position: behind(leader), yaw: leader.yaw, moving: false } : { ...pose, moving: false };
    },
  };
}

/** Built-in controllers; renderer options add or override entries. */
export const basicControllers: ControllerRegistry = Object.freeze({ approach, follow });
