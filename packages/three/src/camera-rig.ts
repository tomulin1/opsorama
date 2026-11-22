import { Box3, OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
import { CAMERA_PITCH_RANGE, type CameraEasing, type CameraProjection, type SceneNode, type Vec3 } from '@opsorama/core';

/**
 * Pure camera math of the scene renderer: no DOM, no store and no renderer state, so every number is unit-tested.
 * At default settings it reproduces the original orthographic overview exactly: a camera at offset [16, 22, 30] from its
 * target, whose zoom fits a 34 × 21 view-plane box per unit of extent into the viewport.
 */

/** The original camera offset from its target. The default yaw and pitch point along it. */
export const DEFAULT_CAMERA_OFFSET: Vec3 = Object.freeze([16, 22, 30]) as Vec3;
/** Distance of the orthographic camera from its target. Its near and far planes (−150, 150) are relative to this position. */
export const ORTHOGRAPHIC_DISTANCE = Math.hypot(...DEFAULT_CAMERA_OFFSET);
/** View-plane box, in metres per unit of extent, that zoom 1 fits into the viewport. */
export const FIT_BOX = Object.freeze({ width: 34, height: 21 });
/** Metres of margin around a fitted node's bounds, and the smallest fitted extent. */
export const FIT_MARGIN = 4, FIT_MIN_EXTENT = .3;
/** Share of a node's world position the orthographic camera moves to when framing without `fit` at the overview scale. */
export const ORTHOGRAPHIC_FRAME_SHARE = .48;
/** Rate per second of the default glide toward a new target (1 − e^(−5·dt) per frame). */
export const GLIDE_RATE = 5;

/** What the camera shows: target in world metres, direction, zoom (`SceneSettings.zoom`) and extent (scale at zoom 1). */
export interface CameraPose { target: Vec3; yaw: number; pitch: number; zoom: number; extent: number }

/** Unit vector from the target toward the camera for a heading and elevation in radians. */
export function viewDirection(yaw: number, pitch: number): Vector3 {
  return new Vector3(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw));
}
/** Heading and elevation in radians of an offset from the target to the camera. */
export function viewAngles(offset: Vec3): { yaw: number; pitch: number } {
  return { yaw: Math.atan2(offset[0], offset[2]), pitch: Math.atan2(offset[1], Math.hypot(offset[0], offset[2])) };
}
/** An angle in radians within (−π, π]. */
export function normalizeAngle(angle: number): number {
  const wrapped = Math.atan2(Math.sin(angle), Math.cos(angle));
  return wrapped === -Math.PI ? Math.PI : wrapped;
}

/** Overview extent of a scene: the largest ground over a 32 × 19 m reference, at least 1. */
export function groundExtent(nodes: readonly SceneNode[]): number {
  return nodes.reduce((value, node) => node.kind === 'ground' ? Math.max(value, node.size[0] / 32, node.size[1] / 19) : value, 1);
}
/** Overview target of the `ground` overview: the first ground node's position on y = 0, or [0, 0, −0.5] without ground. */
export function groundTarget(nodes: readonly SceneNode[]): Vector3 {
  const ground = nodes.find(node => node.kind === 'ground');
  return new Vector3(...(ground?.position ?? [0, 0, -.5])).setY(0);
}
/** Rough radius of the scene in metres from its ground nodes, for perspective depth planes. At least 20. */
export function groundRadius(nodes: readonly SceneNode[]): number {
  return nodes.reduce((value, node) => node.kind === 'ground' ? Math.max(value, Math.hypot(node.size[0], node.size[1]) / 2 + Math.hypot(...(node.position ?? [0, 0, 0]))) : value, 20);
}

/** Camera-space right and up axes for a direction. */
function viewAxes(yaw: number, pitch: number) {
  const direction = viewDirection(yaw, pitch), right = new Vector3().crossVectors(new Vector3(0, 1, 0), direction).normalize(), up = direction.clone().cross(right);
  return { right, up };
}
/**
 * Extent that fits a box of `size` (world metres) seen from `yaw`/`pitch` with a 4 m margin, at least 0.3. Multiply by the
 * zoom in effect to make the fit independent of it, as `frame(id, { fit: true })` does.
 */
export function fitExtent(size: Vector3, yaw: number, pitch: number): number {
  const { right, up } = viewAxes(yaw, pitch);
  const span = (axis: Vector3) => Math.abs(axis.x) * size.x + Math.abs(axis.y) * size.y + Math.abs(axis.z) * size.z;
  return Math.max(FIT_MIN_EXTENT, (span(right) + FIT_MARGIN) / FIT_BOX.width, (span(up) + FIT_MARGIN) / FIT_BOX.height);
}
/** Target and extent that fit world bounds: the bounds centre, and `fitExtent` of their size. */
export function fitBounds(bounds: Box3, yaw: number, pitch: number): { target: Vector3; extent: number } {
  return { target: bounds.getCenter(new Vector3()), extent: fitExtent(bounds.getSize(new Vector3()), yaw, pitch) };
}
/**
 * Target of `frame(id)` without `fit`: the node's world position on y = 0. The orthographic camera at the overview scale
 * (no fitted extent) moves only `ORTHOGRAPHIC_FRAME_SHARE` of the way from the origin, which keeps more of the scene in view.
 */
export function frameTarget(world: Vector3, projection: CameraProjection, fitted: boolean): Vector3 {
  return world.clone().multiplyScalar(projection === 'orthographic' && !fitted ? ORTHOGRAPHIC_FRAME_SHARE : 1).setY(0);
}

/** Orthographic `camera.zoom` that fits the `FIT_BOX` of `extent` into a viewport of CSS pixels, times the zoom setting. */
export function orthographicZoom(extent: number, width: number, height: number, zoom: number): number {
  return Math.min(width / (FIT_BOX.width * extent), height / (FIT_BOX.height * extent)) * zoom;
}
/**
 * Distance at which a perspective camera with a vertical field of view of `fov` degrees fits the `FIT_BOX` of `extent` into
 * a viewport of `aspect` (width / height). Divided by the zoom setting, it shows the same area at the target as the
 * orthographic camera.
 */
export function fitDistance(extent: number, aspect: number, fov: number): number {
  const tangent = Math.tan(fov * Math.PI / 360);
  return Math.max(FIT_BOX.height * extent / 2 / tangent, FIT_BOX.width * extent / 2 / (tangent * aspect));
}
/** Perspective near and far planes for a camera `distance` from its target in a scene of `radius` metres. */
export function perspectiveDepth(distance: number, radius: number): { near: number; far: number } {
  return { near: Math.max(.05, distance / 100), far: distance + 4 * radius + 100 };
}

/** Viewport of the camera in CSS pixels and the field of view in degrees (perspective only). */
export interface CameraFrame { width: number; height: number; fov: number; radius: number }
/** Places an orthographic camera for a pose: frustum in CSS pixels, position at `ORTHOGRAPHIC_DISTANCE`, zoom from extent and zoom. */
export function applyOrthographic(camera: OrthographicCamera, pose: CameraPose, frame: CameraFrame): void {
  camera.left = -frame.width / 2; camera.right = frame.width / 2; camera.top = frame.height / 2; camera.bottom = -frame.height / 2;
  placeCamera(camera, pose, ORTHOGRAPHIC_DISTANCE);
  camera.zoom = orthographicZoom(pose.extent, frame.width, frame.height, pose.zoom); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
}
/** Places a perspective camera for a pose: distance `fitDistance / zoom` along the view direction, depth planes around it. */
export function applyPerspective(camera: PerspectiveCamera, pose: CameraPose, frame: CameraFrame): void {
  const aspect = frame.width / frame.height, distance = fitDistance(pose.extent, aspect, frame.fov) / pose.zoom, depth = perspectiveDepth(distance, frame.radius);
  camera.fov = frame.fov; camera.aspect = aspect; camera.near = depth.near; camera.far = depth.far; camera.zoom = 1;
  placeCamera(camera, pose, distance); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
}
function placeCamera(camera: OrthographicCamera | PerspectiveCamera, pose: CameraPose, distance: number) {
  const target = new Vector3(...pose.target);
  camera.position.copy(target).addScaledVector(viewDirection(pose.yaw, pose.pitch), distance); camera.lookAt(target);
}

/** Progress 0–1 of a transition after `t` (0–1) of its time. */
export function ease(t: number, easing: CameraEasing): number {
  const clamped = Math.min(1, Math.max(0, t));
  return easing === 'linear' ? clamped : clamped * clamped * (3 - 2 * clamped);
}
/**
 * Pose `k` (0–1) of the way from `from` to `to`: target linear, yaw the shorter way round, pitch linear, zoom and extent
 * geometric so the visible scale changes evenly.
 */
export function interpolatePose(from: CameraPose, to: CameraPose, k: number): CameraPose {
  const yawDelta = normalizeAngle(to.yaw - from.yaw);
  return {
    target: [0, 1, 2].map(axis => from.target[axis] + (to.target[axis] - from.target[axis]) * k) as unknown as Vec3,
    yaw: from.yaw + yawDelta * k, pitch: from.pitch + (to.pitch - from.pitch) * k,
    zoom: from.zoom * Math.pow(to.zoom / from.zoom, k), extent: from.extent * Math.pow(to.extent / from.extent, k),
  };
}
/** Share of the remaining distance the default glide covers in `dt` seconds; 1 (a cut) with reduced motion. */
export function glideStep(dt: number, reducedMotion: boolean): number {
  return reducedMotion ? 1 : 1 - Math.exp(-dt * GLIDE_RATE);
}

/** Radians a mouse orbit turns per viewport height dragged: half a turn of yaw, or the whole pitch range and more. */
export const ORBIT_RADIANS_PER_HEIGHT = Math.PI;
/**
 * Yaw and pitch change in radians for a pointer move of `dx`, `dy` CSS pixels on a viewport `height` pixels tall. Dragging
 * right turns the scene right (yaw decreases); dragging down raises the camera (pitch increases). Clamp the new pitch with
 * `clampPitch`.
 */
export function orbitDelta(dx: number, dy: number, height: number): { yaw: number; pitch: number } {
  const scale = ORBIT_RADIANS_PER_HEIGHT / Math.max(1, height);
  return { yaw: -dx * scale, pitch: dy * scale };
}
/** A pitch within `CAMERA_PITCH_RANGE`. */
export function clampPitch(pitch: number): number {
  return Math.min(CAMERA_PITCH_RANGE.max, Math.max(CAMERA_PITCH_RANGE.min, pitch));
}

/** Rate per second at which a `behind` follow turns the yaw toward the node's heading (1 − e^(−rate·dt) per frame). */
export const FOLLOW_TURN_RATE = 2.5;
/**
 * Yaw of a `behind` follow after `dt` seconds: from `current` toward the view from behind a node heading `heading`
 * (radians, 0 = facing +Z), the shorter way round, plus `offset` (an orbit around the followed node). With reduced motion
 * it snaps, so a turning node never makes the view drift or jitter.
 */
export function followYaw(current: number, heading: number, offset: number, dt: number, reducedMotion: boolean): number {
  const step = reducedMotion ? 1 : 1 - Math.exp(-dt * FOLLOW_TURN_RATE);
  return current + normalizeAngle(heading + Math.PI + offset - current) * step;
}
/**
 * Extent (scale at zoom 1) at which a perspective camera with `fov` degrees on a viewport of `aspect` stands `distance`
 * metres from its target at `zoom`. The orthographic camera at this extent shows the same area at the target.
 */
export function followExtent(distance: number, zoom: number, aspect: number, fov: number): number {
  return distance * zoom / fitDistance(1, aspect, fov);
}
