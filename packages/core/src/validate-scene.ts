import type { AssetNode, SceneNode, SceneStoreOptions } from './index';
import { MATERIAL_ROLES, type MaterialRole } from './palette';
import { MARKER_ICONS, MARKER_SHAPES, MARKER_SIZES, MARKER_TONES } from './marker';
import { NODE_VIEWS } from './containment';
import { MAX_ROUTE_ACCELERATION, MAX_ROUTE_CORNER_RADIUS, MAX_ROUTE_POINTS, MAX_ROUTE_SPEED, MAX_ROUTE_STOP_SECONDS, MAX_ROUTE_TURN_RATE } from './route';
import { collectProblems, pointer, type AddProblem, type SceneProblem } from './scene-problems';
import { CONTAINER_NODE_KINDS, IMAGE_SRC_PATTERN, MAX_IMAGE_SIZE, MAX_IMAGE_SRC_LENGTH, MAX_LINE_WIDTH, MAX_TEXT_LENGTH, MOTION_NODE_KINDS, SHAPE_TYPES, TEXT_ALIGNS, TEXT_SIZE_RANGE } from './shapes';

/*
 * Problem collectors behind `validateScene` and every throwing `validate*` function of core. Each collector reports all
 * problems of its value and keeps going; the throwing functions raise the first error as `SceneValidationError`. Values
 * are read as `unknown` because scene files come from JSON, generated code and agents. `undefined` counts as absent,
 * as in JSON. Only `validateScene` is public; the collectors are internal to the package.
 */

type Data = Record<string, unknown>;
const isObject = (value: unknown): value is Data => typeof value === 'object' && value !== null && !Array.isArray(value);
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isVec3 = (value: unknown) => Array.isArray(value) && value.length === 3 && value.every(isFiniteNumber);
const isNonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';
const inRange = (value: unknown, max: number) => isFiniteNumber(value) && value > 0 && value <= max;
/** A short rendering of a received value for messages. */
function shown(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}…` : value);
  if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value !== 'object') return `a ${typeof value}`;
  try {
    const text = JSON.stringify(value, (_, item) => typeof item === 'number' && !Number.isFinite(item) ? String(item) : item);
    return text.length > 40 ? `${text.slice(0, 40)}…` : text;
  } catch { return Array.isArray(value) ? 'an array' : 'an object'; }
}
const typeName = (value: unknown) => value === null ? 'null' : Array.isArray(value) ? 'an array' : typeof value === 'object' ? 'an object' : `a ${typeof value}`;

/** Documented visual states; the schema test checks this list against `VisualState`. */
const VISUAL_STATES = ['normal', 'busy', 'warning', 'critical', 'inactive'] as const;
const NODE_KINDS = ['ground', 'zone', 'asset', 'path', 'marker', 'shape', 'line', 'group', 'text', 'image'] as const;
const BASE_KEYS = ['id', 'kind', 'parentId', 'attachment', 'entityId', 'label', 'labelMode', 'position', 'rotation', 'scale', 'state', 'selectable'] as const;

/**
 * Known keys per node kind and per nested object, for `unknown-key` warnings. Hand-written to keep the runtime free of
 * the schema; tests/scene-schema.test.ts checks every set against the generated JSON Schema.
 */
export const NODE_KEYS: Readonly<Record<SceneNode['kind'], readonly string[]>> = /* @__PURE__ */ Object.freeze({
  ground: [...BASE_KEYS, 'size', 'color', 'interior'],
  zone: [...BASE_KEYS, 'size', 'color', 'interior'],
  asset: [...BASE_KEYS, 'asset', 'interior', 'localMotion', 'transfer', 'materials', 'view', 'peekOnHover', 'options', 'color', 'variant', 'count', 'multiplier', 'countLayout', 'footprint', 'route', 'controller'],
  path: [...BASE_KEYS, 'points', 'color'],
  marker: [...BASE_KEYS, 'shape', 'tone', 'icon', 'color', 'markerSize', 'eyebrow', 'detail', 'pulse'],
  shape: [...BASE_KEYS, 'shape', 'color', 'opacity', 'route', 'controller', 'transfer'],
  line: [...BASE_KEYS, 'points', 'color', 'width', 'dashed'],
  group: [...BASE_KEYS, 'route', 'controller', 'transfer'],
  text: [...BASE_KEYS, 'text', 'size', 'color', 'billboard', 'align'],
  image: [...BASE_KEYS, 'src', 'size', 'billboard'],
});
/** Known keys of nested objects, named after their schema definitions. */
export const NESTED_KEYS = /* @__PURE__ */ Object.freeze({
  SceneDefinition: ['schemaVersion', 'nodes'],
  Attachment: ['nodeId', 'anchor'],
  NodeTransfer: ['seconds', 'arc'],
  NodeRoute: ['points', 'speed', 'segmentSpeeds', 'stops', 'loop', 'endYaw', 'reverseSegments', 'profile', 'startYaw', 'startSpeed', 'elapsed'],
  RouteStop: ['index', 'seconds', 'yaw'],
  MotionProfile: ['acceleration', 'turnRate', 'turnInPlaceAngle', 'cornerSpeed', 'cornerRadius'],
  NodeController: ['kind', 'options'],
  MarkerCustomIcon: ['paths'],
  BoxShape: ['type', 'size'],
  SphereShape: ['type', 'radius'],
  CylinderShape: ['type', 'radiusTop', 'radiusBottom', 'height'],
} as const satisfies Record<string, readonly string[]>);

/** Edit distance, for the nearest-key suggestion. */
function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = current;
  }
  return previous[b.length];
}
/** The known key closest to `key`, when it is close enough to be a likely typo. */
export function nearestKey(key: string, known: readonly string[]): string | undefined {
  let best: string | undefined, bestDistance = Infinity;
  for (const candidate of known) {
    const value = distance(key.toLowerCase(), candidate.toLowerCase());
    if (value < bestDistance) { best = candidate; bestDistance = value; }
  }
  return best !== undefined && bestDistance <= Math.max(1, Math.floor(Math.max(key.length, best.length) / 3)) ? best : undefined;
}

/** Warns about keys of `value` outside `known`, except keys with an undefined value and keys that already have an error. */
function checkKeys(value: Data, known: readonly string[], at: string, owner: string, add: AddProblem, reported: (path: string) => boolean, hint = ''): void {
  for (const key of Object.keys(value)) {
    if (value[key] === undefined || known.includes(key) || reported(pointer(at, key))) continue;
    const near = nearestKey(key, known);
    add(pointer(at, key), 'unknown-key', `Unknown key "${key}" on ${owner}; it is ignored.`, near ? `Did you mean "${near}"? Otherwise remove "${key}".${hint}` : `Remove "${key}". ${owner.charAt(0).toUpperCase()}${owner.slice(1)} accepts: ${known.join(', ')}.${hint}`, 'warning');
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Nested values. `at` is the JSON Pointer of the value itself.

// A function, not a constant: palette.ts imports this module, so MATERIAL_ROLES is read only at call time.
const materialFix = () => `Use known material roles (${MATERIAL_ROLES.join(', ')}) with #RRGGBB colors, for example { accent: '#2f6fd6' }.`;
export function materialChecks(value: unknown, at: string, add: AddProblem): void {
  if (!isObject(value)) { add(at, 'materials', 'Material palette must be an object.', materialFix()); return; }
  for (const [role, color] of Object.entries(value)) {
    if (!MATERIAL_ROLES.includes(role as MaterialRole)) add(pointer(at, role), 'materials', `Unknown material role "${role}". Material palette requires known roles with #RRGGBB colors.`, `${nearestKey(role, MATERIAL_ROLES) ? `Did you mean "${nearestKey(role, MATERIAL_ROLES)}"? ` : ''}${materialFix()}`);
    else if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) add(pointer(at, role), 'materials', `Material role ${role} is ${shown(color)}. Material palette requires known roles with #RRGGBB colors.`, `Set ${role} to a six-digit hex color such as '#2f6fd6'; CSS names and short forms are not accepted.`);
  }
}

export function footprintChecks(value: unknown, at: string, add: AddProblem): void {
  if (!Array.isArray(value) || value.length !== 2 || value.some(item => !isFiniteNumber(item) || item <= 0)) add(at, 'footprint', 'Footprint requires two positive finite dimensions in metres.', 'Set footprint to [width, depth] in metres, both greater than 0, for example [12, 8].');
}

export function countChecks(input: { count?: unknown; multiplier?: unknown }, at: string, add: AddProblem): void {
  const { count, multiplier } = input;
  const countValid = count === undefined || Number.isSafeInteger(count) && (count as number) >= 0;
  const multiplierValid = multiplier === undefined || Number.isSafeInteger(multiplier) && (multiplier as number) >= 1;
  if (!countValid) add(pointer(at, 'count'), 'count', 'Asset count must be a non-negative safe integer.', `Set count to a whole number from 0 (received ${shown(count)}); the model's count definition limits it further.`);
  if (!multiplierValid) add(pointer(at, 'multiplier'), 'count', 'Asset multiplier must be a positive safe integer.', `Set multiplier to a whole number of at least 1 (received ${shown(multiplier)}), or omit it for 1.`);
  if (countValid && multiplierValid && !Number.isSafeInteger(((count as number | undefined) ?? 1) * ((multiplier as number | undefined) ?? 1))) add(pointer(at, 'multiplier'), 'count', 'Represented count exceeds the safe integer range.', 'Lower count or multiplier so that count × multiplier is at most 9007199254740991.');
}

export function transferChecks(value: unknown, at: string, add: AddProblem): void {
  if (!isObject(value)) { add(at, 'transfer', 'Node transfer must be an object.', 'Set transfer to { seconds, arc? }, for example { seconds: 0.8, arc: 0.25 }.'); return; }
  if (!(isFiniteNumber(value.seconds) && value.seconds >= .05 && value.seconds <= 5)) add(pointer(at, 'seconds'), 'transfer', 'Node transfer seconds must be from 0.05 to 5.', `Set transfer.seconds to a duration from 0.05 to 5 visual seconds (received ${shown(value.seconds)}).`);
  if (value.arc !== undefined && !(isFiniteNumber(value.arc) && value.arc >= 0 && value.arc <= 2)) add(pointer(at, 'arc'), 'transfer', 'Node transfer arc must be from 0 to 2 m.', `Set transfer.arc to a lift from 0 to 2 metres (received ${shown(value.arc)}), or omit it for 0.25.`);
}

/** JSON data accepted in controller options; mirrors `ControllerValue`. */
const isControllerData = (value: unknown, depth = 0): boolean => {
  if (depth > 16) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(item => isControllerData(item, depth + 1));
  return typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype && Object.values(value as object).every(item => isControllerData(item, depth + 1));
};
export function controllerChecks(value: unknown, at: string, add: AddProblem): void {
  if (!isObject(value)) { add(at, 'controller', 'Controller must be an object.', "Set controller to { kind, options? }, where kind names a factory in the renderer's controller registry."); return; }
  if (!isNonEmpty(value.kind)) add(pointer(at, 'kind'), 'controller', 'Controller kind must not be empty.', "Set controller.kind to the name of a controller in the renderer's registry (basicControllers or your own).");
  if (value.options !== undefined && (!isObject(value.options) || !isControllerData(value.options))) add(pointer(at, 'options'), 'controller', `Controller ${String(value.kind)} options must be plain JSON data with finite numbers.`, 'Use an object of strings, finite numbers, booleans, null, arrays and plain objects (at most 16 levels deep); no functions, class instances, NaN or Infinity.');
}

export function motionProfileChecks(value: unknown, at: string, add: AddProblem, name = 'Motion profile'): void {
  if (!isObject(value)) { add(at, 'route', `${name} must be an object.`, 'Set the profile to an object such as { acceleration: 1.2, turnRate: 2 }.'); return; }
  if (value.acceleration !== undefined && !inRange(value.acceleration, MAX_ROUTE_ACCELERATION)) add(pointer(at, 'acceleration'), 'route', `${name} acceleration must be greater than 0 and at most ${MAX_ROUTE_ACCELERATION} m/s².`, `Set acceleration to a value in (0, ${MAX_ROUTE_ACCELERATION}] m/s², or omit it for instant speed changes.`);
  if (value.turnRate !== undefined && !inRange(value.turnRate, MAX_ROUTE_TURN_RATE)) add(pointer(at, 'turnRate'), 'route', `${name} turn rate must be greater than 0 and at most ${MAX_ROUTE_TURN_RATE} rad/s.`, `Set turnRate to a value in (0, ${MAX_ROUTE_TURN_RATE}] rad/s, or omit it.`);
  if (value.turnInPlaceAngle !== undefined && !(isFiniteNumber(value.turnInPlaceAngle) && value.turnInPlaceAngle >= 0 && value.turnInPlaceAngle <= Math.PI)) add(pointer(at, 'turnInPlaceAngle'), 'route', `${name} turn-in-place angle must be between 0 and π.`, 'Set turnInPlaceAngle in radians from 0 to π (3.14159), for example Math.PI / 4.');
  if (value.cornerSpeed !== undefined) {
    if (!inRange(value.cornerSpeed, MAX_ROUTE_SPEED)) add(pointer(at, 'cornerSpeed'), 'route', `${name} corner speed must be greater than 0 and at most ${MAX_ROUTE_SPEED} m/s.`, `Set cornerSpeed to a value in (0, ${MAX_ROUTE_SPEED}] m/s.`);
    if (value.acceleration === undefined) add(pointer(at, 'cornerSpeed'), 'route', `${name} corner speed requires an acceleration.`, 'Add acceleration (m/s²) to the profile, or remove cornerSpeed.');
  }
  if (value.cornerRadius !== undefined && !inRange(value.cornerRadius, MAX_ROUTE_CORNER_RADIUS)) add(pointer(at, 'cornerRadius'), 'route', `${name} corner radius must be greater than 0 and at most ${MAX_ROUTE_CORNER_RADIUS} m.`, `Set cornerRadius to a value in (0, ${MAX_ROUTE_CORNER_RADIUS}] metres, or omit it for sharp corners.`);
}

const speedFix = (field: string, value: unknown) => `Set ${field} to metres per second, greater than 0 and at most ${MAX_ROUTE_SPEED} (received ${shown(value)}).`;
const validSpeed = (value: unknown) => inRange(value, MAX_ROUTE_SPEED);
export function routeChecks(value: unknown, at: string, add: AddProblem): void {
  if (!isObject(value)) { add(at, 'route', `Route requires 2–${MAX_ROUTE_POINTS} points.`, 'Set route to an object { points, speed, ... } with 2 or more [x, y, z] points in travel order.'); return; }
  const raw = value.points;
  const countOk = Array.isArray(raw) && raw.length >= 2 && raw.length <= MAX_ROUTE_POINTS;
  if (!countOk) add(pointer(at, 'points'), 'route', `Route requires 2–${MAX_ROUTE_POINTS} points.`, `Give route.points from 2 to ${MAX_ROUTE_POINTS} [x, y, z] points in travel order (received ${Array.isArray(raw) ? `${raw.length}` : shown(raw)}).`);
  let finite = countOk;
  if (countOk) for (const [index, point] of (raw as unknown[]).entries()) if (!isVec3(point)) { finite = false; add(pointer(at, 'points', index), 'route', 'Route points must be finite [x, y, z] values.', 'Write each route point as [x, y, z] with three finite numbers in metres.'); }
  const points = finite ? raw as readonly (readonly number[])[] : null;
  if (!validSpeed(value.speed)) add(pointer(at, 'speed'), 'route', `Route speed must be greater than 0 and at most ${MAX_ROUTE_SPEED} m/s.`, speedFix('route.speed', value.speed));
  if (value.segmentSpeeds !== undefined && (!Array.isArray(value.segmentSpeeds) || (Array.isArray(raw) && value.segmentSpeeds.length !== raw.length - 1) || !value.segmentSpeeds.every(validSpeed))) add(pointer(at, 'segmentSpeeds'), 'route', 'Route segment speeds must provide one valid speed per segment.', `Give segmentSpeeds exactly points.length - 1 speeds${Array.isArray(raw) ? ` (${raw.length - 1})` : ''}, each greater than 0 and at most ${MAX_ROUTE_SPEED} m/s, or omit it.`);
  if (value.stops !== undefined) {
    if (!Array.isArray(value.stops)) add(pointer(at, 'stops'), 'route', 'Route stops must be an array.', 'Set stops to an array of { index, seconds, yaw? }, or omit it.');
    else {
      const seen = new Set<number>();
      value.stops.forEach((stop: unknown, index: number) => {
        const path = pointer(at, 'stops', index);
        const indexFix = `Set index to a whole number from 0 to points.length - 1${Array.isArray(raw) ? ` (${raw.length - 1})` : ''}, at most one stop per point.`;
        if (!isObject(stop)) { add(path, 'route', 'Each route stop needs a unique point index within the route.', `Write the stop as { index, seconds, yaw? }. ${indexFix}`); return; }
        const point = stop.index;
        if (typeof point !== 'number' || !Number.isSafeInteger(point) || point < 0 || (Array.isArray(raw) && point >= raw.length) || seen.has(point)) add(pointer(path, 'index'), 'route', 'Each route stop needs a unique point index within the route.', indexFix);
        else seen.add(point);
        if (!(isFiniteNumber(stop.seconds) && stop.seconds > 0 && stop.seconds <= MAX_ROUTE_STOP_SECONDS)) add(pointer(path, 'seconds'), 'route', `Route stop duration must be greater than 0 and at most ${MAX_ROUTE_STOP_SECONDS} seconds.`, `Set seconds to a pause greater than 0 and at most ${MAX_ROUTE_STOP_SECONDS} visual seconds (received ${shown(stop.seconds)}).`);
        if (stop.yaw !== undefined && !isFiniteNumber(stop.yaw)) add(pointer(path, 'yaw'), 'route', 'Route stop heading must be finite.', 'Set yaw to a finite heading in radians (0 faces +z), or omit it.');
        checkKeys(stop, NESTED_KEYS.RouteStop, path, 'a route stop', add, () => false);
      });
    }
  }
  if (value.loop !== undefined && typeof value.loop !== 'boolean') add(pointer(at, 'loop'), 'route', 'Route loop must be boolean.', 'Set loop to true or false.');
  if (value.loop === true && points) {
    const first = points[0], last = points[points.length - 1];
    if (Math.hypot(last[0] - first[0], last[1] - first[1], last[2] - first[2]) > 1e-6) add(pointer(at, 'loop'), 'route', 'A looping route must end at its first point.', `Append the first point [${first.join(', ')}] to points to close the loop, or set loop to false.`);
  }
  if (value.endYaw !== undefined && !isFiniteNumber(value.endYaw)) add(pointer(at, 'endYaw'), 'route', 'Route end heading must be finite.', 'Set endYaw to a finite heading in radians, or omit it.');
  if (value.startYaw !== undefined && !isFiniteNumber(value.startYaw)) add(pointer(at, 'startYaw'), 'route', 'Route start heading must be finite.', 'Set startYaw to a finite heading in radians, or omit it.');
  if (value.reverseSegments !== undefined && !(Number.isSafeInteger(value.reverseSegments) && (value.reverseSegments as number) >= 0 && (!Array.isArray(raw) || (value.reverseSegments as number) < raw.length))) add(pointer(at, 'reverseSegments'), 'route', 'Route reverse segments must be a whole number from 0 to the number of segments.', `Set reverseSegments to a whole number from 0 to points.length - 1${Array.isArray(raw) ? ` (${raw.length - 1})` : ''}.`);
  if (value.reverseSegments && value.loop) add(pointer(at, 'reverseSegments'), 'route', 'A looping route cannot drive in reverse.', 'Remove reverseSegments or set loop to false.');
  if (value.startSpeed !== undefined && !(isFiniteNumber(value.startSpeed) && value.startSpeed >= 0 && value.startSpeed <= MAX_ROUTE_SPEED)) add(pointer(at, 'startSpeed'), 'route', `Route start speed must be between 0 and ${MAX_ROUTE_SPEED} m/s.`, `Set startSpeed from 0 to ${MAX_ROUTE_SPEED} m/s, or omit it for 0.`);
  if (value.profile !== undefined) {
    motionProfileChecks(value.profile, pointer(at, 'profile'), add);
    if (isObject(value.profile)) checkKeys(value.profile, NESTED_KEYS.MotionProfile, pointer(at, 'profile'), 'a motion profile', add, () => false);
  }
  if (value.elapsed !== undefined && !(isFiniteNumber(value.elapsed) && value.elapsed >= 0)) add(pointer(at, 'elapsed'), 'route', 'Route elapsed time must be finite and not negative.', 'Set elapsed to the seconds already travelled (0 or more), or omit it.');
  checkKeys(value, NESTED_KEYS.NodeRoute, at, 'a route', add, () => false);
}

const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]+$/;
export function markerChecks(node: Data, at: string, add: AddProblem): void {
  const id = String(node.id);
  const fail = (field: string, message: string, fix: string) => add(pointer(at, field), 'marker', `Marker ${id}: ${message}`, fix);
  if (typeof node.label !== 'string' || !node.label.trim() || node.label.length > 120) fail('label', 'label is required, 1–120 characters; it is the card title and accessible name.', 'Set label to a short title of 1–120 characters, for example "Rack A3 overheating".');
  if (node.shape !== undefined && !MARKER_SHAPES.includes(node.shape as never)) fail('shape', `unknown shape "${String(node.shape)}"; use one of ${MARKER_SHAPES.join(', ')}.`, `Set shape to one of ${MARKER_SHAPES.join(', ')}, or omit it for pin.`);
  if (node.tone !== undefined && !MARKER_TONES.includes(node.tone as never)) fail('tone', `unknown tone "${String(node.tone)}"; use one of ${MARKER_TONES.join(', ')}.`, `Set tone to one of ${MARKER_TONES.join(', ')}, or omit it to derive the tone from state.`);
  if (node.markerSize !== undefined && !Object.hasOwn(MARKER_SIZES, node.markerSize as PropertyKey)) fail('markerSize', `unknown markerSize "${String(node.markerSize)}"; use small, medium or large.`, 'Set markerSize to small, medium or large, or omit it for medium.');
  if (typeof node.icon === 'string' && !MARKER_ICONS.includes(node.icon as never)) fail('icon', `unknown icon "${node.icon}"; use one of ${MARKER_ICONS.join(', ')}, or { paths } for a custom icon.`, `Set icon to one of ${MARKER_ICONS.join(', ')}, or to { paths: [...] } with SVG path data in a 24 × 24 view box.`);
  if (node.icon !== undefined && typeof node.icon !== 'string') {
    const paths = isObject(node.icon) ? node.icon.paths : undefined;
    if (!Array.isArray(paths) || paths.length < 1 || paths.length > 8) fail('icon', 'a custom icon needs 1–8 paths.', 'Set icon to { paths: [...] } with 1–8 strings of SVG path data, or use a built-in icon name.');
    else paths.forEach((path, index) => { if (typeof path !== 'string' || path.length > 1000 || !PATH_DATA.test(path)) add(pointer(at, 'icon', 'paths', index), 'marker', `Marker ${id}: custom icon paths must be SVG path data (commands and numbers only), at most 1,000 characters each.`, 'Use only SVG path commands and numbers, such as "M4 4h16v16H4z"; no markup or quotes.'); });
    if (isObject(node.icon)) checkKeys(node.icon, NESTED_KEYS.MarkerCustomIcon, pointer(at, 'icon'), 'a custom marker icon', add, () => false);
  }
  if (node.color !== undefined && !isNonEmpty(node.color)) fail('color', 'color must be a CSS colour string.', "Set color to a CSS colour such as '#d64545', or omit it to use the tone.");
  if (node.eyebrow !== undefined && (typeof node.eyebrow !== 'string' || !node.eyebrow.trim() || node.eyebrow.length > 40)) fail('eyebrow', 'eyebrow must be 1–40 characters.', 'Shorten eyebrow to 1–40 characters, for example "CRITICAL", or omit it.');
  if (node.detail !== undefined && (typeof node.detail !== 'string' || !node.detail.trim() || node.detail.length > 160)) fail('detail', 'detail must be 1–160 characters.', 'Set detail to 1–160 characters, for example "Inlet 34 °C", or omit it.');
  if (node.pulse !== undefined && typeof node.pulse !== 'boolean') fail('pulse', 'pulse must be a boolean.', 'Set pulse to true or false, or omit it for the tone default.');
}

const shapeFix = "Set shape to { type: 'box', size: [width, height, depth] }, { type: 'sphere', radius } or { type: 'cylinder', radiusTop, radiusBottom, height }, in metres.";
const positive = (value: unknown) => isFiniteNumber(value) && value > 0;
/** Checks `ShapeNode.shape`; `name` names the node in messages. */
export function shapeChecks(value: unknown, at: string, add: AddProblem, name: string): void {
  if (!isObject(value)) { add(at, 'shape', `Shape ${name} requires a shape object; received ${typeName(value)}.`, shapeFix); return; }
  const type = value.type;
  if (!SHAPE_TYPES.includes(type as never)) {
    const near = typeof type === 'string' ? nearestKey(type, SHAPE_TYPES) : undefined;
    add(pointer(at, 'type'), 'shape', `Unknown shape type for ${name}: ${type === undefined ? 'missing' : shown(type)}.`, `${near ? `Did you mean "${near}"? ` : ''}Set shape.type to ${SHAPE_TYPES.join(', ')}. ${shapeFix}`);
    return;
  }
  if (type === 'box' && (!Array.isArray(value.size) || value.size.length !== 3 || !value.size.every(positive))) add(pointer(at, 'size'), 'shape', `Box ${name} requires a size of three positive finite dimensions in metres.`, `Set shape.size to [width, height, depth] in metres, each greater than 0 (received ${shown(value.size)}).`);
  if (type === 'sphere' && !positive(value.radius)) add(pointer(at, 'radius'), 'shape', `Sphere ${name} requires a positive finite radius in metres.`, `Set shape.radius to metres greater than 0 (received ${shown(value.radius)}).`);
  if (type === 'cylinder') {
    const radii = (['radiusTop', 'radiusBottom'] as const).map(key => {
      const radius = value[key], valid = isFiniteNumber(radius) && radius >= 0;
      if (!valid) add(pointer(at, key), 'shape', `Cylinder ${name} requires ${key} of 0 or more finite metres.`, `Set shape.${key} to metres, 0 or more (0 makes a cone point) (received ${shown(radius)}).`);
      return valid ? radius as number : undefined;
    });
    if (radii[0] === 0 && radii[1] === 0) add(pointer(at, 'radiusTop'), 'shape', `Cylinder ${name} needs a radius greater than 0; both radii are 0.`, 'Set radiusTop or radiusBottom (or both) greater than 0; a cylinder with two zero radii draws nothing.');
    if (!positive(value.height)) add(pointer(at, 'height'), 'shape', `Cylinder ${name} requires a positive finite height in metres.`, `Set shape.height to metres greater than 0 (received ${shown(value.height)}).`);
  }
  const keys = type === 'box' ? NESTED_KEYS.BoxShape : type === 'sphere' ? NESTED_KEYS.SphereShape : NESTED_KEYS.CylinderShape;
  checkKeys(value, keys, at, `a ${String(type)} shape`, add, () => false);
}

/** Checks the fields of a line node other than `color`. */
export function lineChecks(node: Data, at: string, add: AddProblem, name: string): void {
  if (!Array.isArray(node.points) || node.points.length < 2 || node.points.some(point => !isVec3(point))) add(pointer(at, 'points'), 'line-points', `Line ${name} requires at least two finite points.`, "Set points to two or more [x, y, z] arrays of finite numbers in metres, in the node's local coordinates.");
  if (node.width !== undefined && !(isFiniteNumber(node.width) && node.width >= 0 && node.width <= MAX_LINE_WIDTH)) add(pointer(at, 'width'), 'line-width', `Line ${name} width must be from 0 to ${MAX_LINE_WIDTH} m.`, `Set width to a tube diameter in metres from 0 to ${MAX_LINE_WIDTH} (received ${shown(node.width)}); 0 or omitted draws a 1-pixel line.`);
  if (node.dashed !== undefined && typeof node.dashed !== 'boolean') add(pointer(at, 'dashed'), 'field-type', `dashed of ${name} must be boolean.`, 'Set dashed to true or false, or omit it for a continuous line.');
}

const billboardFix = "Set billboard to true to face the camera, false to lie in the node's x-y plane, or omit it.";
/** Checks the fields of a text node other than `color`. */
export function textChecks(node: Data, at: string, add: AddProblem, name: string): void {
  const text = node.text, length = typeof text === 'string' ? [...text].length : 0;
  if (typeof text !== 'string' || !text.trim() || length > MAX_TEXT_LENGTH) add(pointer(at, 'text'), 'text', typeof text !== 'string' ? `Text ${name} requires a text string; received ${typeName(text)}.` : length > MAX_TEXT_LENGTH ? `Text ${name} has ${length} characters; at most ${MAX_TEXT_LENGTH} are allowed.` : `Text ${name} has no visible characters.`, `Set text to 1 to ${MAX_TEXT_LENGTH} characters with at least one visible character; use \\n for a line break. Put longer content in host HTML.`);
  if (node.size !== undefined && !(isFiniteNumber(node.size) && node.size >= TEXT_SIZE_RANGE.min && node.size <= TEXT_SIZE_RANGE.max)) add(pointer(at, 'size'), 'text-size', `Text size of ${name} must be from ${TEXT_SIZE_RANGE.min} to ${TEXT_SIZE_RANGE.max} m.`, `Set size to the height of capital letters in metres, from ${TEXT_SIZE_RANGE.min} to ${TEXT_SIZE_RANGE.max} (received ${shown(node.size)}), or omit it for 0.4.`);
  if (node.billboard !== undefined && typeof node.billboard !== 'boolean') add(pointer(at, 'billboard'), 'field-type', `billboard of ${name} must be boolean.`, billboardFix);
  if (node.align !== undefined && !TEXT_ALIGNS.includes(node.align as never)) add(pointer(at, 'align'), 'allowed-value', `Invalid text alignment for ${name}: ${shown(node.align)}.`, `Set align to ${TEXT_ALIGNS.join(', ')}, or omit it for center.`);
}

const imageSrcFix = "Set src to a relative URL such as '/images/logo.png', an http(s) or blob: URL, or a data:image/ URL.";
/** Why `src` is not an accepted `ImageNode.src`, or undefined when it is; the acceptance rule is `IMAGE_SRC_PATTERN`. */
function imageSrcReason(src: string): string | undefined {
  if (src.length > MAX_IMAGE_SRC_LENGTH) return `is ${src.length} characters long; at most ${MAX_IMAGE_SRC_LENGTH} are allowed`;
  if (IMAGE_SRC_PATTERN.test(src)) return undefined;
  if (/[\u0000-\u001f\u007f]/.test(src)) return 'contains a control character (a tab or line break, for example)';
  if (/^\s|\s$/.test(src)) return 'starts or ends with whitespace';
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(src)?.[1].toLowerCase();
  if (scheme === 'data') return 'is a data: URL that is not an image (it must start with data:image/)';
  return `uses the ${scheme ?? 'unknown'}: scheme, which images do not load from`;
}
/** Checks the fields of an image node. */
export function imageChecks(node: Data, at: string, add: AddProblem, name: string): void {
  const src = node.src, reason = typeof src !== 'string' ? `must be a URL string; received ${typeName(src)}` : !src ? 'is empty' : imageSrcReason(src);
  if (reason) add(pointer(at, 'src'), 'image-src', `Image src of ${name} ${reason}.`, imageSrcFix);
  const size = node.size;
  if (!Array.isArray(size) || size.length !== 2 || !size.every(value => isFiniteNumber(value) && value > 0 && value <= MAX_IMAGE_SIZE)) add(pointer(at, 'size'), 'image-size', `Image ${name} requires a size of [width, height] in metres.`, `Set size to [width, height] in metres, each greater than 0 and at most ${MAX_IMAGE_SIZE} (received ${shown(size)}); match the picture's aspect ratio, as the image is stretched to fill it.`);
  if (node.billboard !== undefined && typeof node.billboard !== 'boolean') add(pointer(at, 'billboard'), 'field-type', `billboard of ${name} must be boolean.`, billboardFix);
}

export function interiorChecks(node: Data, at: string, add: AddProblem): void {
  const interior = node.interior, id = String(node.id);
  if (interior === undefined) return;
  const path = pointer(at, 'interior');
  if (typeof interior !== 'boolean') { add(path, 'interior', `interior on ${id} must be boolean.`, 'Set interior to true or false, or omit it.'); return; }
  if (!interior) return;
  const area = node.kind === 'ground' || node.kind === 'zone' || node.kind === 'asset';
  if (!area) add(path, 'interior', `${String(node.kind).charAt(0).toUpperCase()}${String(node.kind).slice(1)} ${id} cannot be an interior area; mark a ground, zone or sized surface asset instead.`, 'Remove interior from this node and set interior: true on the ground, zone or surface asset that covers the area.');
  else if (node.kind === 'asset' && node.footprint === undefined) add(path, 'interior', `Interior asset ${id} needs an explicit footprint; interior areas are only sized surfaces such as floor or terrain.`, 'Add footprint: [width, depth] to this surface asset, or remove interior.');
  if (node.parentId !== undefined && area) add(path, 'interior', `Interior area ${id} must be a top-level node; nodes inside a container (parentId) are already indoor.`, 'Remove interior (the container already makes the node indoor) or remove parentId.');
}

const JSON_LIKE = 'options must be plain JSON-like data (objects, arrays, strings, finite numbers, booleans, null)';
/** Reports every value in `value` that is not plain JSON-like data; `label` is the dotted path used in messages. */
function jsonLikeChecks(value: unknown, at: string, label: string, add: AddProblem, seen: Set<object>): void {
  const fix = 'Replace the value with plain data: strings, finite numbers, booleans, null, arrays and plain objects. Keep functions and class instances in your application.';
  // JSON has no NaN or Infinity: both serialize as null, and the renderer compares serialized options to decide rebuilds.
  if (typeof value === 'number') { if (!Number.isFinite(value)) add(at, 'asset-options', `${label} is ${value}; ${JSON_LIKE}.`, fix); return; }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value !== 'object') { add(at, 'asset-options', `${label} is a ${typeof value}; ${JSON_LIKE}.`, fix); return; }
  if (seen.has(value)) { add(at, 'asset-options', `${label} refers to itself; ${JSON_LIKE} without cycles.`, 'Remove the circular reference; options must be a tree of plain data.'); return; }
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) { add(at, 'asset-options', `${label} is a ${prototype?.constructor?.name ?? 'class'} instance; ${JSON_LIKE}.`, fix); return; }
  seen.add(value);
  for (const [key, item] of Object.entries(value)) if (item !== undefined || Array.isArray(value)) jsonLikeChecks(item, pointer(at, key), Array.isArray(value) ? `${label}[${key}]` : `${label}.${key}`, add, seen);
  seen.delete(value);
}

// ---------------------------------------------------------------------------------------------------------------------
// One node. `at` is the node's JSON Pointer ('' for validateNode, '/nodes/3' in a scene).

const kindFix = `Set kind to one of ${NODE_KINDS.join(', ')}.`;
/** Problems of one node on its own (not its relations to other nodes), tagged with its ID. */
export function nodeProblems(node: unknown, at: string, { validateAsset }: SceneStoreOptions = {}): SceneProblem[] {
  if (!isObject(node)) return collectProblems(add => add(at, 'node-object', `A scene node must be an object; received ${typeName(node)}.`, "Write the node as an object such as { id: 'floor', kind: 'ground', size: [20, 12] }."));
  const id = typeof node.id === 'string' ? node.id : undefined;
  const name = id ?? (at ? `at ${at}` : 'without an id');
  const problems = collectProblems(add => {
    const field = (key: string) => pointer(at, key);
    const kind = node.kind;
    const known = (NODE_KINDS as readonly unknown[]).includes(kind);
    if (node.attachment !== undefined) {
      const attachment = node.attachment;
      if (!isObject(attachment) || !isNonEmpty(attachment.nodeId) || attachment.anchor !== undefined && !isNonEmpty(attachment.anchor)) add(field('attachment'), 'attachment', 'Attachments require a parent ID and a nonempty anchor name when supplied.', "Set attachment to { nodeId: '<carrier id>', anchor?: '<anchor name>' }; omit anchor to attach at the carrier's origin.");
      if (isObject(attachment)) checkKeys(attachment, NESTED_KEYS.Attachment, field('attachment'), 'an attachment', add, () => false);
    }
    if (!known) add(field('kind'), 'node-kind', `Unknown scene node kind: ${kind === undefined ? 'missing' : String(kind)}.`, `${kindFix}${typeof kind === 'string' && nearestKey(kind, NODE_KINDS) ? ` Did you mean "${nearestKey(kind, NODE_KINDS)}"?` : ''}`);
    if (typeof node.id !== 'string') add(field('id'), 'node-id', `Scene node ${name} has no id; every node needs a nonempty string id.`, "Add a unique string id, for example id: 'zone-inbound'.");
    else if (!node.id.trim()) add(field('id'), 'node-id', 'Scene node ID must not be empty.', "Set id to a unique nonempty string, for example 'zone-inbound'.");
    if (node.parentId !== undefined && (typeof node.parentId !== 'string' || !node.parentId.trim() || node.parentId === node.id)) add(field('parentId'), 'parent-id', `Invalid parent ID for ${name}: use the nonempty ID of another asset or group node.`, 'Set parentId to the id of the containing asset or group node, or remove it for a top-level node.');
    if (node.entityId !== undefined && typeof node.entityId !== 'string') add(field('entityId'), 'field-type', `entityId of ${name} must be a string; received ${typeName(node.entityId)}.`, 'Set entityId to the string ID of your host record, for example String(order.id).');
    if (node.label !== undefined && kind !== 'marker' && typeof node.label !== 'string') add(field('label'), 'field-type', `label of ${name} must be a string; received ${typeName(node.label)}.`, 'Set label to display text, or omit it.');
    if (node.labelMode !== undefined && !['always', 'active'].includes(node.labelMode as string)) add(field('labelMode'), 'allowed-value', `Invalid label mode for ${name}.`, `Set labelMode to always or active (received ${shown(node.labelMode)}), or omit it.`);
    for (const key of ['position', 'rotation', 'scale'] as const) if (node[key] !== undefined && !isVec3(node[key])) add(field(key), 'transform', `Invalid transform for ${name}.`, `Set ${key} to [x, y, z] with three finite numbers (${key === 'rotation' ? 'radians' : key === 'scale' ? 'factors' : 'metres'}), received ${shown(node[key])}.`);
    if (node.state !== undefined && !VISUAL_STATES.includes(node.state as never)) add(field('state'), 'allowed-value', `Invalid visual state for ${name}: ${shown(node.state)}.`, `Set state to one of ${VISUAL_STATES.join(', ')}, or omit it for normal.`);
    if (node.selectable !== undefined && typeof node.selectable !== 'boolean') add(field('selectable'), 'field-type', `selectable of ${name} must be boolean.`, 'Set selectable to true or false, or omit it.');
    if (node.color !== undefined && kind !== 'marker' && typeof node.color !== 'string') add(field('color'), 'field-type', `color of ${name} must be a CSS color string.`, "Set color to a CSS color such as '#dce9f6', or omit it.");
    if (kind === 'path' && (!Array.isArray(node.points) || node.points.length < 2 || node.points.some(point => !isVec3(point)))) add(field('points'), 'path-points', `Path ${name} requires at least two finite points.`, 'Set points to two or more [x, y, z] arrays of finite numbers in metres.');
    if ((kind === 'ground' || kind === 'zone') && (!Array.isArray(node.size) || node.size.length !== 2 || node.size.some(value => !isFiniteNumber(value) || value <= 0))) add(field('size'), 'size', `Invalid size for ${name}.`, `Set size to [width, depth] in metres, both greater than 0 (received ${shown(node.size)}).`);
    if (known) interiorChecks(node, at, add);
    if (kind === 'marker') markerChecks(node, at, add);
    const motion = MOTION_NODE_KINDS.includes(kind as never);
    if (known && !motion && node.route !== undefined) add(field('route'), 'motion-owner', `Only asset, shape and group nodes can follow a route (${name}).`, 'Move the route to an asset, shape or group node (a group moves everything inside it), or remove it.');
    if (known && !motion && node.controller !== undefined) add(field('controller'), 'motion-owner', `Only asset, shape and group nodes can have a controller (${name}).`, 'Move the controller to an asset, shape or group node (a group moves everything inside it), or remove it.');
    if (kind === 'shape') {
      shapeChecks(node.shape, field('shape'), add, name);
      if (node.opacity !== undefined && !(isFiniteNumber(node.opacity) && node.opacity >= 0 && node.opacity <= 1)) add(field('opacity'), 'opacity', `Opacity of ${name} must be from 0 to 1.`, `Set opacity to a number from 0 (invisible) to 1 (opaque) (received ${shown(node.opacity)}), or omit it for 1.`);
    }
    if (kind === 'line') lineChecks(node, at, add, name);
    if (kind === 'text') textChecks(node, at, add, name);
    if (kind === 'image') imageChecks(node, at, add, name);
    if (motion) {
      if (node.route !== undefined) routeChecks(node.route, field('route'), add);
      if (node.transfer !== undefined) transferChecks(node.transfer, field('transfer'), add);
      if (isObject(node.transfer)) checkKeys(node.transfer, NESTED_KEYS.NodeTransfer, field('transfer'), 'a transfer', add, () => false);
      if (node.controller !== undefined) controllerChecks(node.controller, field('controller'), add);
      if (isObject(node.controller)) checkKeys(node.controller, NESTED_KEYS.NodeController, field('controller'), 'a controller', add, () => false);
      if (node.route !== undefined && node.controller !== undefined) add(field('controller'), 'motion-owner', `${kind === 'asset' ? 'Asset' : kind === 'shape' ? 'Shape' : 'Group'} ${name} cannot have both a route and a controller.`, 'Keep either route (a fixed path) or controller (per-frame motion) and remove the other.');
    }
    if (kind === 'asset') {
      if (!isNonEmpty(node.asset)) add(field('asset'), 'asset-name', `Missing asset for ${name}.`, "Set asset to the name of a registered model, for example a catalog asset name from @opsorama/objects (see catalog.json).");
      if (node.variant !== undefined && typeof node.variant !== 'string') add(field('variant'), 'field-type', `Invalid asset variant for ${name}.`, "Set variant to one of the model's variant names (a string), or omit it.");
      if (node.localMotion !== undefined && typeof node.localMotion !== 'boolean') add(field('localMotion'), 'field-type', 'localMotion must be boolean.', 'Set localMotion to true or false, or omit it.');
      if (node.materials !== undefined) materialChecks(node.materials, field('materials'), add);
      if (node.options !== undefined) {
        if (!isObject(node.options)) add(field('options'), 'asset-options', `Options of ${name} must be an object keyed by option name, e.g. { building: { type: 'warehouse' } }.`, "Set options to an object keyed by option name, for example { building: { type: 'warehouse' } }; the asset's factory documents which options it accepts.");
        else jsonLikeChecks(node.options, field('options'), `${name}.options`, add, new Set());
      }
      if (node.view !== undefined && !NODE_VIEWS.includes(node.view as never)) add(field('view'), 'allowed-value', `Invalid view for ${name}: ${String(node.view)}. Use ${NODE_VIEWS.join(', ')}.`, `Set view to one of ${NODE_VIEWS.join(', ')}, or omit it for closed.`);
      if (node.peekOnHover !== undefined && typeof node.peekOnHover !== 'boolean') add(field('peekOnHover'), 'field-type', `peekOnHover of ${name} must be boolean.`, 'Set peekOnHover to true or false, or omit it.');
      if (node.countLayout !== undefined && !['compact', 'reserved'].includes(node.countLayout as string)) add(field('countLayout'), 'allowed-value', `Invalid count layout for ${name}.`, `Set countLayout to compact or reserved (received ${shown(node.countLayout)}), or omit it.`);
      if (node.footprint !== undefined) footprintChecks(node.footprint, field('footprint'), add);
      countChecks(node, at, add);
    }
  }, id);
  if (NODE_KINDS.includes(node.kind as never)) {
    const kind = node.kind as SceneNode['kind'];
    const errors = new Set(problems.filter(problem => problem.severity === 'error').map(problem => problem.path));
    const reported = (path: string) => [...errors].some(error => error === path || error.startsWith(`${path}/`));
    problems.push(...collectProblems(add => checkKeys(node, NODE_KEYS[kind], at, `${kind} node ${name}`, add, reported, kind === 'asset' ? ' Model-specific settings belong in options.' : ''), id));
  }
  // The factory runs only on an otherwise valid asset node, so it never sees malformed data.
  if (validateAsset && node.kind === 'asset' && !problems.some(problem => problem.severity === 'error')) {
    try { validateAsset(node as unknown as AssetNode); }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      problems.push(...collectProblems(add => add(node.options !== undefined && /options/.test(message) ? pointer(at, 'options') : at, 'asset-validator', message, "Change the node so its asset factory accepts it: use a registered asset name and only the options and values that asset documents (see its entry in the object catalog or catalog.json).")
      , id));
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------------------------------
// Relations between nodes. `base` is the JSON Pointer of the node array.

const ids = (nodes: readonly unknown[]) => nodes.map(node => isObject(node) && typeof node.id === 'string' ? node.id : undefined);

/** Parent graph: a parent must be an asset or group node, and parent chains must not form a cycle. Missing parents are dormant. */
export function parentProblems(nodes: readonly unknown[], base: string): SceneProblem[] {
  const byId = new Map<string, Data>(); nodes.forEach(node => { if (isObject(node) && typeof node.id === 'string' && !byId.has(node.id)) byId.set(node.id, node); });
  return nodes.flatMap((node, index) => {
    if (!isObject(node) || typeof node.id !== 'string' || typeof node.parentId !== 'string' || node.parentId === node.id) return [];
    const id = node.id, parentId = node.parentId;
    return collectProblems(add => {
      const parent = byId.get(parentId);
      if (parent && !CONTAINER_NODE_KINDS.includes(parent.kind as never)) add(pointer(base, index, 'parentId'), 'parent-kind', `Parent ${parentId} of ${id} must be an asset or group node; it is a ${String(parent.kind)} node. Only assets and groups can contain children.`, `Set parentId to the id of an asset or group node, or remove it. To place ${id} on a ground or zone, give it world coordinates instead; to move nodes together, put them in a group node.`);
      const seen = new Set([id]); let current: string | undefined = parentId;
      while (current !== undefined) {
        if (current === id) { add(pointer(base, index, 'parentId'), 'parent-cycle', `Parent cycle at ${id}: ${parentId} is its own ancestor. Remove one parentId from the cycle.`, `Remove parentId from ${id} or from one of its ancestors so that the chain ends at a top-level node.`); break; }
        if (seen.has(current)) break;
        seen.add(current); const next: unknown = byId.get(current)?.parentId;
        current = typeof next === 'string' ? next : undefined;
      }
    }, id);
  });
}

/** Attachments: no attachment together with parentId, no route or controller on an attached asset, shape or group, and no cycles. */
export function attachmentProblems(nodes: readonly unknown[], base: string): SceneProblem[] {
  const byId = new Map<string, Data>(); nodes.forEach(node => { if (isObject(node) && typeof node.id === 'string' && !byId.has(node.id)) byId.set(node.id, node); });
  const link = (node: Data | undefined): { id: string; attached: boolean } | undefined => {
    const carrier = isObject(node?.attachment) ? node.attachment.nodeId : undefined;
    if (typeof carrier === 'string') return { id: carrier, attached: true };
    return typeof node?.parentId === 'string' ? { id: node.parentId, attached: false } : undefined;
  };
  return nodes.flatMap((node, index) => {
    if (!isObject(node) || typeof node.id !== 'string' || !isObject(node.attachment)) return [];
    const id = node.id;
    return collectProblems(add => {
      if (node.parentId !== undefined) add(pointer(base, index, 'attachment'), 'attachment-conflict', `Node ${id} cannot have both an attachment and a parentId; a carried node follows its carrier, so remove one.`, 'Keep attachment to carry the node, or parentId to place it inside a container, and remove the other.');
      const motion = MOTION_NODE_KINDS.includes(node.kind as never), owners = `${String(node.kind)}s`;
      if (motion && node.route !== undefined) add(pointer(base, index, 'route'), 'attachment-conflict', `Attached ${owners} cannot own a route.`, `Remove the route from ${id}; it moves with its carrier. Give the carrier the route instead.`);
      if (motion && node.controller !== undefined) add(pointer(base, index, 'controller'), 'attachment-conflict', `Attached ${owners} cannot own a controller.`, `Remove the controller from ${id}; it moves with its carrier. Give the carrier the controller instead.`);
      // A cycle through at least one attachment; pure parentId cycles are reported as parent-cycle.
      const seen = new Set([id]); let step = link(node), attached = false;
      while (step) {
        attached ||= step.attached;
        if (step.id === id) { if (attached) add(pointer(base, index, 'attachment'), 'attachment-cycle', `Attachment cycle at ${id}.`, `Change attachment.nodeId of ${id} or of a node it leads to, so that the chain of carriers ends at a node that is not carried.`); break; }
        if (seen.has(step.id)) break;
        seen.add(step.id); step = link(byId.get(step.id));
      }
    }, id);
  });
}

/** Problems of a node array: each node, duplicate IDs, parents and attachments. */
export function nodeListProblems(nodes: readonly unknown[], base: string, options: SceneStoreOptions = {}): SceneProblem[] {
  const problems: SceneProblem[] = [];
  const first = new Map<string, number>(), nodeIds = ids(nodes);
  nodes.forEach((node, index) => {
    problems.push(...nodeProblems(node, pointer(base, index), options));
    const id = nodeIds[index];
    if (id === undefined) return;
    if (first.has(id)) problems.push(...collectProblems(add => add(pointer(base, index, 'id'), 'duplicate-id', `Duplicate scene node ID: ${id}.`, `Give this node a unique id; ${id} is already used by ${pointer(base, first.get(id)!)}.`), id));
    else first.set(id, index);
  });
  return [...problems, ...parentProblems(nodes, base), ...attachmentProblems(nodes, base)];
}

/**
 * Checks a scene definition and returns every problem in one pass, without throwing: structure, field types, ranges,
 * unique IDs, parents, attachments and, with `validateAsset`, the asset factories' own rules. Each problem carries a
 * JSON Pointer `path`, a stable `rule` (see `SCENE_RULES`), a `severity`, a `message`, an actionable `fix` and the
 * `nodeId` when known. An empty array means the store accepts the scene; warnings (`unknown-key`) do not block it.
 *
 * `input` may be anything, for example parsed JSON. Pass the same `validateAsset` as the store
 * (`assetValidator(registry)` from `@opsorama/three`) to also check asset names and model options; factories run only
 * on asset nodes without other errors. `createSceneStore` and `replace` run the same checks and throw
 * `SceneValidationError`.
 */
export function validateScene(input: unknown, options: SceneStoreOptions = {}): SceneProblem[] {
  if (!isObject(input)) return collectProblems(add => add('', 'scene-object', `A scene definition must be an object; received ${typeName(input)}.`, "Pass an object { schemaVersion: 1, nodes: [...] }, for example { schemaVersion: 1, nodes: [{ id: 'floor', kind: 'ground', size: [20, 12] }] }."));
  const problems = collectProblems(add => {
    if (input.schemaVersion !== 1) add('/schemaVersion', 'schema-version', `Unsupported scene schema version: ${input.schemaVersion === undefined ? 'missing' : shown(input.schemaVersion)}.`, 'Set schemaVersion to 1 (a number), the only version this package reads.');
    if (!Array.isArray(input.nodes)) add('/nodes', 'nodes-array', `nodes must be an array of scene nodes; received ${typeName(input.nodes)}.`, 'Set nodes to an array of node objects; use [] for an empty scene.');
    checkKeys(input, NESTED_KEYS.SceneDefinition, '', 'a scene definition', add, () => false, ' Settings and camera are passed to the store and renderer, not stored in the scene definition.');
  });
  return Array.isArray(input.nodes) ? [...problems, ...nodeListProblems(input.nodes, '/nodes', options)] : problems;
}
