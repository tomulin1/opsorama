import type { Vec3 } from './index';

/**
 * Camera projection. `orthographic` (default) draws parallel lines parallel, the classic dashboard overview;
 * `perspective` draws depth with a field of view (`CameraSettings.fov`). Switching keeps the target and angles.
 */
export const CAMERA_PROJECTIONS = Object.freeze(['orthographic', 'perspective'] as const);
export type CameraProjection = typeof CAMERA_PROJECTIONS[number];
/**
 * Pointer controls of the renderer. `pan` (default): the primary mouse button drags the view over the ground. `orbit`:
 * panning as with `pan`, and a right-button drag or a Ctrl + primary-button drag turns the view around its target (yaw
 * and pitch, within `CAMERA_PITCH_RANGE`); the browser context menu over the canvas is suppressed only while `orbit` is
 * set. `none`: no dragging; clicks and taps still select. Wheel zoom is a separate mount option (`RendererOptions.wheelZoom`).
 * The canvas takes no keyboard focus: give keyboard users host controls that call `renderer.setCameraView`.
 */
export const CAMERA_CONTROLS = Object.freeze(['pan', 'orbit', 'none'] as const);
export type CameraControls = typeof CAMERA_CONTROLS[number];
/**
 * What `overview()` shows. `ground` (default): the first ground node's position, at a scale that fits the largest ground.
 * `bounds`: every built node, fitted to the view when the overview is applied (after the initial load, on `overview()` and
 * when the selection is cleared); later content changes do not move the camera until the next overview.
 */
export const CAMERA_OVERVIEWS = Object.freeze(['ground', 'bounds'] as const);
export type CameraOverview = typeof CAMERA_OVERVIEWS[number];
/** Timing curve of a camera transition: `ease-in-out` (default) starts and ends slowly, `linear` moves evenly. */
export const CAMERA_EASINGS = Object.freeze(['linear', 'ease-in-out'] as const);
export type CameraEasing = typeof CAMERA_EASINGS[number];

/** Bounds validated for `SceneSettings.zoom`, the single zoom knob of both projections. Host controls may use a narrower range. */
export const ZOOM_RANGE: Readonly<{ min: number; max: number }> = Object.freeze({ min: .65, max: 5 });
/** Degrees validated for `CameraSettings.fov`. */
export const CAMERA_FOV_RANGE: Readonly<{ min: number; max: number }> = Object.freeze({ min: 20, max: 75 });
/** Radians validated for a camera pitch: from almost level (about 3°) to almost straight down (about 89°). */
export const CAMERA_PITCH_RANGE: Readonly<{ min: number; max: number }> = Object.freeze({ min: .05, max: 1.55 });
/** Seconds validated for `CameraTransition.seconds`. */
export const CAMERA_TRANSITION_SECONDS: Readonly<{ min: number; max: number }> = Object.freeze({ min: 0, max: 10 });

/**
 * Camera configuration in `SceneSettings.camera`. Replacing `camera` with `configure({ camera })` resets the omitted
 * fields to `DEFAULT_CAMERA_SETTINGS`; spread the current value to change one field.
 */
export interface CameraSettings {
  /** Default `orthographic`. Applied on the next frame; the target and angles stay. */
  projection: CameraProjection;
  /** Default `pan`. */
  controls: CameraControls;
  /** Vertical field of view in degrees, 20–75, default 30. Perspective only. */
  fov: number;
  /**
   * Overview heading in radians, any finite value: 0 looks from +Z toward −Z, π/2 looks from +X toward −X. Default
   * `atan2(16, 30)` ≈ 0.49 (with the default pitch, the camera sits at offset [16, 22, 30] from its target). A change turns
   * the camera at once and keeps its target; `overview()` returns to it after `setCameraView` turned the camera.
   */
  yaw: number;
  /** Overview elevation in radians within `CAMERA_PITCH_RANGE` (0.05–1.55). Default `atan2(22, 34)` ≈ 0.57. Changes like `yaw`. */
  pitch: number;
  /** Default `ground`; see `CAMERA_OVERVIEWS`. Takes effect at the next overview. */
  overview: CameraOverview;
  /** Default true: selecting a node moves the camera to it and clearing the selection moves it back to the overview target. */
  frameOnSelect: boolean;
}

/** Default camera: the orthographic overview the renderer has always drawn, from offset [16, 22, 30]. */
export const DEFAULT_CAMERA_SETTINGS: Readonly<CameraSettings> = Object.freeze({
  projection: 'orthographic', controls: 'pan', fov: 30, yaw: Math.atan2(16, 30), pitch: Math.atan2(22, Math.hypot(16, 30)), overview: 'ground', frameOnSelect: true,
});

/**
 * A camera view: where it looks and from which direction, at what zoom. Read it with `renderer.getCameraView()` and set it
 * with `renderer.setCameraView(view, transition?)`. The scale at zoom 1 is the overview fit (or, after `frame(id, { fit: true })`,
 * the fit of that node until the next overview); a view does not change it.
 */
export interface CameraView {
  /** World point in metres at the centre of the view. */
  target: Vec3;
  /** Heading in radians; see `CameraSettings.yaw`. `getCameraView` reports it within (−π, π]. */
  yaw: number;
  /** Elevation in radians within `CAMERA_PITCH_RANGE`. */
  pitch: number;
  /** `SceneSettings.zoom`, within `ZOOM_RANGE`. Setting a view writes it to the store when the camera arrives. */
  zoom: number;
}

/**
 * A timed camera move. It runs on real seconds, independent of `speed` and `paused`. Reduced motion, `motion: false` or
 * `seconds: 0` make it a cut. A drag, `frame`, `overview`, clearing the selection, a zoom change from elsewhere or another
 * transition interrupts it where it is.
 */
export interface CameraTransition {
  /** Duration in seconds, 0–10, default 0.6. 0 is a cut. */
  seconds?: number;
  /** Default `ease-in-out`. */
  easing?: CameraEasing;
}
/** How a camera transition ended: it arrived, or something interrupted it (it then stays where it was). */
export type CameraTransitionResult = 'completed' | 'interrupted';
/** Defaults of `CameraTransition`. */
export const DEFAULT_CAMERA_TRANSITION: Readonly<Required<CameraTransition>> = Object.freeze({ seconds: .6, easing: 'ease-in-out' });

/**
 * How `renderer.followNode` turns the camera. `fixed` (default): the direction stays; only the target follows the node.
 * `behind`: the yaw also turns, smoothed, to look along the node's heading from behind it (the node's local +Z is forward).
 */
export const CAMERA_FOLLOW_HEADINGS = Object.freeze(['fixed', 'behind'] as const);
export type CameraFollowHeading = typeof CAMERA_FOLLOW_HEADINGS[number];
/** Metres validated for `CameraFollowOptions.distance`. */
export const CAMERA_FOLLOW_DISTANCE: Readonly<{ min: number; max: number }> = Object.freeze({ min: 1, max: 1000 });
/** Options of `renderer.followNode(id, options)`. */
export interface CameraFollowOptions {
  /**
   * Viewing distance in metres, 1–1000: sets the scale so that the perspective camera stands this far from the node at
   * the current zoom; the orthographic camera shows the same area at the target. Later zoom changes scale from there, and
   * the scale stays until the next overview. Default: keep the current scale.
   */
  distance?: number;
  /** Default `fixed`; see `CAMERA_FOLLOW_HEADINGS`. */
  heading?: CameraFollowHeading;
}
/**
 * Why following ended: `stopped` by `followNode(null)`, another `followNode` call or disposal; `interrupted` by a pan,
 * `frame`, `overview`, `setCameraView`, a camera path or a selection change that moves the camera; `removed` because the
 * node was removed or hidden, or is not built.
 */
export type CameraFollowEnd = 'stopped' | 'interrupted' | 'removed';

/** Seconds validated for `CameraKeyframe.seconds` and `CameraKeyframe.hold`. */
export const CAMERA_KEYFRAME_SECONDS: Readonly<{ min: number; max: number }> = Object.freeze({ min: 0, max: 60 });
/** Most keyframes in one `CameraPath`. */
export const MAX_CAMERA_KEYFRAMES = 64;
/**
 * One stop of a camera path. The camera travels for `seconds` from where it is (the previous keyframe, or the current view
 * for the first one) to this keyframe, then holds it for `hold` seconds. Give `view`, `frame` or both: `frame` takes the
 * target (and with `fit` the scale) from a node when the camera starts travelling to it, so a moving node is met where it
 * is then; `view` fields set yaw, pitch and zoom (and the target, without `frame`). Omitted fields keep the previous
 * keyframe's values.
 */
export interface CameraKeyframe {
  /** Fields of the view at this keyframe; see `CameraView`. `target` cannot be combined with `frame`. */
  view?: Partial<CameraView>;
  /** A node to centre, or with `fit` to fit into the view from this keyframe's direction. An unknown or hidden node ends the path `'interrupted'`. */
  frame?: { nodeId: string; fit?: boolean };
  /** Travel time in real seconds, 0–60. 0 is a cut. */
  seconds: number;
  /** Seconds to stay at this keyframe after arriving, 0–60, default 0. */
  hold?: number;
  /** Default `ease-in-out`. */
  easing?: CameraEasing;
}
/**
 * A sequence of camera keyframes for `renderer.playCameraPath`. It runs on real seconds, independent of `speed` and
 * `paused`. Reduced motion or `motion: false` turn every travel into a cut at the time the keyframe is reached. Camera
 * paths are host data for the renderer, not part of a scene definition.
 */
export interface CameraPath {
  /** 1–64 keyframes in playing order. */
  keyframes: readonly CameraKeyframe[];
  /** Default false. true starts again from the first keyframe after the last hold, until stopped; the path then needs a total time above 0. */
  loop?: boolean;
}

const CAMERA_KEYS = Object.keys(DEFAULT_CAMERA_SETTINGS) as (keyof CameraSettings)[];
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const within = (value: unknown, range: { min: number; max: number }) => typeof value === 'number' && Number.isFinite(value) && value >= range.min && value <= range.max;
const finiteAngle = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
/** `a`, `a or b`, `a, b or c`. */
const choices = (values: readonly string[]) => values.length < 2 ? values.join('') : `${values.slice(0, -1).join(', ')} or ${values[values.length - 1]}`;
const unknownKeys = (value: object, known: readonly string[]) => Object.keys(value).filter(key => !known.includes(key));

/** Throws an actionable error unless `camera` is a complete, valid `CameraSettings` without unknown keys. */
export function validateCameraSettings(camera: CameraSettings): void {
  if (!isRecord(camera)) throw new Error('Setting camera must be an object such as { projection: \'perspective\' }; omitted fields use DEFAULT_CAMERA_SETTINGS.');
  for (const key of Object.keys(camera)) if (!(CAMERA_KEYS as string[]).includes(key)) throw new Error(`Unknown camera setting ${key}. Use ${CAMERA_KEYS.join(', ')}.`);
  if (!CAMERA_PROJECTIONS.includes(camera.projection)) throw new Error(`Unknown camera projection: ${String(camera.projection)}. Use ${choices(CAMERA_PROJECTIONS)}.`);
  if (!CAMERA_CONTROLS.includes(camera.controls)) throw new Error(`Unknown camera controls: ${String(camera.controls)}. Use ${choices(CAMERA_CONTROLS)}.`);
  if (!CAMERA_OVERVIEWS.includes(camera.overview)) throw new Error(`Unknown camera overview: ${String(camera.overview)}. Use ${choices(CAMERA_OVERVIEWS)}.`);
  if (!within(camera.fov, CAMERA_FOV_RANGE)) throw new Error(`Camera fov must be degrees between ${CAMERA_FOV_RANGE.min} and ${CAMERA_FOV_RANGE.max}.`);
  if (!finiteAngle(camera.yaw)) throw new Error('Camera yaw must be a finite angle in radians.');
  if (!within(camera.pitch, CAMERA_PITCH_RANGE)) throw new Error(`Camera pitch must be radians between ${CAMERA_PITCH_RANGE.min} and ${CAMERA_PITCH_RANGE.max}.`);
  if (typeof camera.frameOnSelect !== 'boolean') throw new Error('Camera frameOnSelect must be boolean.');
}

/** Throws an actionable error unless every given field of `view` is valid. Omitted fields keep the current view. */
export function validateCameraView(view: Partial<CameraView>): void {
  if (!isRecord(view)) throw new Error('A camera view must be an object with target, yaw, pitch and/or zoom.');
  for (const key of Object.keys(view)) if (!['target', 'yaw', 'pitch', 'zoom'].includes(key)) throw new Error(`Unknown camera view field ${key}. Use target, yaw, pitch or zoom.`);
  if (view.target !== undefined && !(Array.isArray(view.target) && view.target.length === 3 && view.target.every(value => typeof value === 'number' && Number.isFinite(value)))) throw new Error('Camera view target must be [x, y, z] in finite metres.');
  if (view.yaw !== undefined && !finiteAngle(view.yaw)) throw new Error('Camera view yaw must be a finite angle in radians.');
  if (view.pitch !== undefined && !within(view.pitch, CAMERA_PITCH_RANGE)) throw new Error(`Camera view pitch must be radians between ${CAMERA_PITCH_RANGE.min} and ${CAMERA_PITCH_RANGE.max}.`);
  if (view.zoom !== undefined && !within(view.zoom, ZOOM_RANGE)) throw new Error(`Camera view zoom must be between ${ZOOM_RANGE.min} and ${ZOOM_RANGE.max} (SceneSettings.zoom).`);
}

/** Throws an actionable error unless `transition` is a valid `CameraTransition`. */
export function validateCameraTransition(transition: CameraTransition): void {
  if (!isRecord(transition)) throw new Error('A camera transition must be an object such as { seconds: 0.6, easing: \'ease-in-out\' }.');
  for (const key of Object.keys(transition)) if (key !== 'seconds' && key !== 'easing') throw new Error(`Unknown camera transition field ${key}. Use seconds or easing.`);
  if (transition.seconds !== undefined && !within(transition.seconds, CAMERA_TRANSITION_SECONDS)) throw new Error(`Camera transition seconds must be between ${CAMERA_TRANSITION_SECONDS.min} and ${CAMERA_TRANSITION_SECONDS.max}; 0 is a cut.`);
  if (transition.easing !== undefined && !(CAMERA_EASINGS as readonly unknown[]).includes(transition.easing)) throw new Error(`Unknown camera easing: ${String(transition.easing)}. Use ${choices(CAMERA_EASINGS)}.`);
}

/** Throws an actionable error unless `options` are valid `CameraFollowOptions`. */
export function validateCameraFollow(options: CameraFollowOptions): void {
  if (!isRecord(options)) throw new Error('Follow options must be an object such as { distance: 20, heading: \'behind\' }.');
  for (const key of unknownKeys(options, ['distance', 'heading'])) throw new Error(`Unknown follow option ${key}. Use distance or heading.`);
  if (options.distance !== undefined && !within(options.distance, CAMERA_FOLLOW_DISTANCE)) throw new Error(`Follow distance must be metres between ${CAMERA_FOLLOW_DISTANCE.min} and ${CAMERA_FOLLOW_DISTANCE.max}, or omitted to keep the current scale.`);
  if (options.heading !== undefined && !(CAMERA_FOLLOW_HEADINGS as readonly unknown[]).includes(options.heading)) throw new Error(`Unknown follow heading: ${String(options.heading)}. Use ${choices(CAMERA_FOLLOW_HEADINGS)}.`);
}

/**
 * Throws an actionable error unless `path` is a valid `CameraPath`. The message names the JSON Pointer of the offending
 * value, such as `Camera path /keyframes/2/seconds: ...`, and the fix.
 */
export function validateCameraPath(path: CameraPath): void {
  const fail = (at: string, message: string): never => { throw new Error(`Camera path${at && ` ${at}`}: ${message}`); };
  const known = (value: object, keys: readonly string[], at: string) => { for (const key of unknownKeys(value, keys)) fail(`${at}/${key}`, `unknown field. Use ${choices(keys)}.`); };
  const seconds = (value: unknown) => within(value, CAMERA_KEYFRAME_SECONDS), range = `in seconds from ${CAMERA_KEYFRAME_SECONDS.min} to ${CAMERA_KEYFRAME_SECONDS.max}`, shape = '{ view?, frame?, seconds, hold?, easing? }';
  if (!isRecord(path)) fail('', 'must be an object { keyframes: [...], loop? }.');
  known(path, ['keyframes', 'loop'], '');
  const keyframes: unknown = path.keyframes;
  if (!Array.isArray(keyframes) || !keyframes.length || keyframes.length > MAX_CAMERA_KEYFRAMES) return fail('/keyframes', `give an array of 1–${MAX_CAMERA_KEYFRAMES} keyframes ${shape} (received ${Array.isArray(keyframes) ? keyframes.length : typeof keyframes}).`);
  let total = 0;
  keyframes.forEach((keyframe: unknown, index) => {
    const at = `/keyframes/${index}`;
    if (!isRecord(keyframe)) return fail(at, `must be an object ${shape}.`);
    known(keyframe, ['view', 'frame', 'seconds', 'hold', 'easing'], at);
    const { view, frame, hold, easing } = keyframe;
    if (view === undefined && frame === undefined) fail(at, 'give a view, a frame or both.');
    if (!seconds(keyframe.seconds)) fail(`${at}/seconds`, `set the travel time ${range}; 0 is a cut.`);
    if (hold !== undefined && !seconds(hold)) fail(`${at}/hold`, `set the hold ${range}, or omit it for 0.`);
    if (easing !== undefined && !(CAMERA_EASINGS as readonly unknown[]).includes(easing)) fail(`${at}/easing`, `unknown easing ${String(easing)}. Use ${choices(CAMERA_EASINGS)}.`);
    if (view !== undefined) try { validateCameraView(view as Partial<CameraView>); } catch (error) { fail(`${at}/view`, (error as Error).message); }
    if (frame !== undefined) {
      if (!isRecord(frame) || typeof frame.nodeId !== 'string' || !frame.nodeId.trim()) return fail(`${at}/frame`, 'must be { nodeId, fit? } with the nonempty ID of a scene node.');
      known(frame, ['nodeId', 'fit'], `${at}/frame`);
      if (frame.fit !== undefined && typeof frame.fit !== 'boolean') fail(`${at}/frame/fit`, 'must be true or false.');
      if ((view as Partial<CameraView> | undefined)?.target) fail(`${at}/view/target`, 'cannot be combined with frame; remove one of them.');
    }
    total += (keyframe.seconds as number) + ((hold as number | undefined) ?? 0);
  });
  if (path.loop !== undefined && typeof path.loop !== 'boolean') fail('/loop', 'must be true or false.');
  if (path.loop && !total) fail('/loop', 'a looping path needs seconds or hold above 0 in at least one keyframe.');
}
