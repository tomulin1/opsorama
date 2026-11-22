import type { Vec3 } from './index';

/**
 * Camera projection. `orthographic` (default) draws parallel lines parallel, the classic dashboard overview;
 * `perspective` draws depth with a field of view (`CameraSettings.fov`). Switching keeps the target and angles.
 */
export const CAMERA_PROJECTIONS = Object.freeze(['orthographic', 'perspective'] as const);
export type CameraProjection = typeof CAMERA_PROJECTIONS[number];
/**
 * Pointer controls of the renderer. `pan` (default): the primary mouse button drags the view over the ground. `none`: no
 * dragging; clicks and taps still select. Wheel zoom is a separate mount option (`RendererOptions.wheelZoom`).
 */
export const CAMERA_CONTROLS = Object.freeze(['pan', 'none'] as const);
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

const CAMERA_KEYS = Object.keys(DEFAULT_CAMERA_SETTINGS) as (keyof CameraSettings)[];
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const within = (value: unknown, range: { min: number; max: number }) => typeof value === 'number' && Number.isFinite(value) && value >= range.min && value <= range.max;
const finiteAngle = (value: unknown) => typeof value === 'number' && Number.isFinite(value);

/** Throws an actionable error unless `camera` is a complete, valid `CameraSettings` without unknown keys. */
export function validateCameraSettings(camera: CameraSettings): void {
  if (!isRecord(camera)) throw new Error('Setting camera must be an object such as { projection: \'perspective\' }; omitted fields use DEFAULT_CAMERA_SETTINGS.');
  for (const key of Object.keys(camera)) if (!(CAMERA_KEYS as string[]).includes(key)) throw new Error(`Unknown camera setting ${key}. Use ${CAMERA_KEYS.join(', ')}.`);
  if (!CAMERA_PROJECTIONS.includes(camera.projection)) throw new Error(`Unknown camera projection: ${String(camera.projection)}. Use ${CAMERA_PROJECTIONS.join(' or ')}.`);
  if (!CAMERA_CONTROLS.includes(camera.controls)) throw new Error(`Unknown camera controls: ${String(camera.controls)}. Use ${CAMERA_CONTROLS.join(' or ')}.`);
  if (!CAMERA_OVERVIEWS.includes(camera.overview)) throw new Error(`Unknown camera overview: ${String(camera.overview)}. Use ${CAMERA_OVERVIEWS.join(' or ')}.`);
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
  if (transition.easing !== undefined && !(CAMERA_EASINGS as readonly unknown[]).includes(transition.easing)) throw new Error(`Unknown camera easing: ${String(transition.easing)}. Use ${CAMERA_EASINGS.join(' or ')}.`);
}
