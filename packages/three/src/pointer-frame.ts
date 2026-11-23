import type { Camera } from 'three';

/*
 * Per-frame scheduling of pointer input for the scene renderer: pointer moves are queued and resolved once per frame
 * with one shared raycast. Internal to the package.
 */

/** The DOM fields of a queued pointer move the renderer reads. */
export interface PointerSample { clientX: number; clientY: number; pointerType: string; buttons: number }

/**
 * The latest pointer move of a frame. `hover`: the renderer's own hover (emphasis, cursor, peek) should follow it; the
 * camera gestures ask for that only while no drag is active. `report`: a host `onPointer` handler should receive it.
 */
export interface QueuedPointer<T extends PointerSample = PointerSample> { event: T; label: string | undefined; hover: boolean; report: boolean }

/**
 * Collects pointer moves between frames and keeps only the latest. Several listeners may queue the same DOM event (the
 * host reporting and the hover listener); their requests are merged.
 */
export interface PointerQueue<T extends PointerSample = PointerSample> {
  push(event: T, label: string | undefined, request: { hover?: boolean; report?: boolean }): void;
  /** Returns the latest move and empties the queue. */
  take(): QueuedPointer<T> | null;
  clear(): void;
}

export function createPointerQueue<T extends PointerSample = PointerSample>(): PointerQueue<T> {
  let queued: QueuedPointer<T> | null = null;
  return {
    push(event, label, request) {
      if (queued?.event === event) { queued.hover ||= request.hover === true; queued.report ||= request.report === true; return; }
      queued = { event, label, hover: request.hover === true, report: request.report === true };
    },
    take() { const latest = queued; queued = null; return latest; },
    clear() { queued = null; },
  };
}

/**
 * Whether a hover position can be cast again when only the camera moved: a mouse or pen over the canvas (not a label)
 * with no button pressed. Touch has no resting hover, and a pressed button belongs to a drag, which clears the hover.
 */
export function isRestingHover(pointer: Pick<QueuedPointer, 'event' | 'label' | 'hover'>): boolean {
  return pointer.hover && pointer.label === undefined && pointer.event.pointerType !== 'touch' && pointer.event.buttons === 0;
}

/**
 * What the pointer step of a frame does: cast the `queued` move; else cast the `resting` hover position again when the
 * camera moved since the last cast (what lies under a resting pointer changed); else nothing. At most one cast per frame.
 */
export function pointerFrameWork(queued: boolean, resting: boolean, cameraMoved: boolean): 'queued' | 'resting' | 'none' {
  return queued ? 'queued' : resting && cameraMoved ? 'resting' : 'none';
}

/**
 * Relative change of a camera matrix element below which the camera counts as still: far below a pixel, so the tail of
 * an easing glide does not cast a resting pointer again every frame.
 */
export const CAMERA_STILL_TOLERANCE = 1e-5;

/** Detects camera changes between frames by comparing its world and projection matrices with the last recorded ones. */
export interface CameraWatch {
  /** Whether `camera` differs (another camera, or a matrix element by more than `CAMERA_STILL_TOLERANCE`) from the last `record`. */
  changed(camera: Camera): boolean;
  /** Remembers the camera as it is now. */
  record(camera: Camera): void;
}

export function createCameraWatch(): CameraWatch {
  const recorded = new Float64Array(32); let last: Camera | null = null;
  return {
    changed(camera) {
      if (camera !== last) return true;
      const world = camera.matrixWorld.elements, projection = camera.projectionMatrix.elements;
      const differs = (a: number, b: number) => Math.abs(a - b) > 1e-9 + CAMERA_STILL_TOLERANCE * Math.abs(a);
      for (let i = 0; i < 16; i++) if (differs(recorded[i], world[i]) || differs(recorded[16 + i], projection[i])) return true;
      return false;
    },
    record(camera) { last = camera; recorded.set(camera.matrixWorld.elements, 0); recorded.set(camera.projectionMatrix.elements, 16); },
  };
}
