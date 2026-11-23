import { Plane, Quaternion, Raycaster, Vector2, Vector3, type Camera, type OrthographicCamera } from 'three';
import { ZOOM_RANGE } from '@opsorama/core';
import { normalizeAngle, orbitDelta } from './camera-rig';

/**
 * What a drag does to the view: `pan` moves it over the ground, `orbit` turns it around its target (a mouse orbit drag or a
 * two-finger vertical drag), `pinch` zooms with two fingers and, with orbit controls, turns it by their twist.
 */
export type DragMode = 'pan' | 'orbit' | 'pinch';

/** CSS pixels a press or touch moves before it is a drag instead of a click or tap. */
export const DRAG_THRESHOLD = 5;
/** Radians two fingers twist before a pinch starts turning the view, so a plain pinch does not wobble the direction. */
export const TWIST_THRESHOLD = .15;
/** CSS pixels one finger of two moves before the gesture counts as a pinch even though the other finger rests. */
const TWO_FINGER_DECISION = 4 * DRAG_THRESHOLD;

export interface GestureCallbacks {
  getTarget(): Vector3;
  setTarget(target: Vector3): void;
  onClick(event: PointerEvent): void;
  onHover(event: PointerEvent): void;
  /** Whether a press may drag the view (`CameraSettings.controls`). When false, a press that moves past the threshold is neither a drag nor a click, and a pinch only zooms. Default: always. */
  canDrag?(): boolean;
  /** Whether a right-button drag, a Ctrl + primary-button drag, a two-finger twist or a two-finger vertical drag turns the view (`controls: 'orbit'`). The context menu over the canvas is suppressed only while true. Default: never. */
  canOrbit?(): boolean;
  /** Turns the view by yaw and pitch changes in radians since the previous call (see `orbitDelta`). */
  orbit?(yaw: number, pitch: number): void;
  /** Called once when a press becomes a drag or two fingers start a gesture. Return true when the camera moved since the press (an interrupted transition): the drag then continues from the current view. */
  onDragStart?(mode: DragMode): boolean;
  /** The zoom setting (`SceneSettings.zoom`) a pinch starts from. A pinch zooms only when both `getZoom` and `setZoom` are given. */
  getZoom?(): number;
  /** Writes a pinch zoom within `ZOOM_RANGE`, at most once per animation frame. */
  setZoom?(zoom: number): void;
  /** Whether a pinch also moves the target so the ground point between the fingers stays between them. When false (the renderer while following a node) it zooms and turns around the current target. Default: always, unless `canDrag` is false. */
  pinchPans?(): boolean;
}

export interface GestureOptions {
  /**
   * Default false: touch input stays with the page (no `touch-action` is set, so the page scrolls and zooms over the
   * canvas), and a touch tap selects. True sets `touch-action: none` on the canvas (restored on dispose) and handles
   * touch here: one finger pans, two fingers pinch-zoom around their midpoint, and with `canOrbit` a two-finger twist
   * turns the yaw and a two-finger vertical drag the pitch. A tap that moves less than `DRAG_THRESHOLD` still selects.
   */
  touch?: boolean;
}

/** Zoom after a pinch from `startDistance` to `distance` CSS pixels: proportional, clamped to `ZOOM_RANGE` and rounded like the wheel zoom. */
export function pinchZoom(startZoom: number, startDistance: number, distance: number): number {
  const next = startZoom * distance / Math.max(1, startDistance);
  return Math.min(ZOOM_RANGE.max, Math.max(ZOOM_RANGE.min, Math.round(next * 1e4) / 1e4));
}
/**
 * Whether two fingers that moved by `a` and `b` (CSS pixels since the gesture started) drag vertically together: both
 * mostly vertical, the same way, and by amounts within a factor of two. Such a drag orbits the pitch; anything else pinches.
 */
export function isVerticalTwoFingerDrag(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  const ay = Math.abs(a.y), by = Math.abs(b.y);
  return a.y * b.y > 0 && ay > 2 * Math.abs(a.x) && by > 2 * Math.abs(b.x) && Math.min(ay, by) * 2 >= Math.max(ay, by);
}

type Point = { x: number; y: number };
const UP = new Vector3(0, 1, 0);
const distanceOf = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y), angleOf = (a: Point, b: Point) => Math.atan2(b.y - a.y, b.x - a.x);
const midpointOf = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * Pointer input belongs to the renderer; gestures never write domain or selection state. A pan moves the view so that the
 * ground point (y = 0) grabbed under the pointer stays under it, for orthographic and perspective cameras alike. Mouse and
 * pen: the primary button pans; with `canOrbit` a right-button or Ctrl + primary-button drag turns the view. Touch: see
 * `GestureOptions.touch`. `cancel()` ends any drag or touch gesture without a click (the renderer calls it when another
 * camera move takes over); `resize()` keeps a gesture going after the canvas changed size; `dispose()` also removes every
 * listener and restores the canvas cursor and `touch-action`.
 */
export function bindCameraGestures(canvas: HTMLCanvasElement, getCamera: () => Camera, callbacks: GestureCallbacks, options: GestureOptions = {}) {
  const touchEnabled = options.touch === true;
  const raycaster = new Raycaster(), pointer = new Vector2(), ground = new Plane(new Vector3(0, 1, 0), 0);
  const originalCursor = canvas.style.cursor, originalTouchAction = canvas.style.touchAction, idleCursor = () => callbacks.canDrag?.() === false ? '' : 'grab';
  let disposed = false;
  type View = { camera: Camera; target: Vector3; anchor: Vector3 };
  /**
   * A mouse or pen press: a click until it moves past the threshold, then a pan or an orbit. `x` and `y` are the press
   * position (the previous position while orbiting), `last` the latest pointer position.
   */
  let drag: {
    id: number; x: number; y: number; last: Point; mode: 'pan' | 'orbit'; buttons: number; view: View | null; rect: DOMRect; dragged: boolean;
  } | null = null;
  /**
   * Touch contacts on the canvas (at most two are tracked). `press`: one finger below the threshold (`tap`: lifting it
   * selects); `pan`: one finger panning; `blocked`: one finger past the threshold without drag controls; `two`: two fingers.
   */
  type TwoFingers = { ids: [number, number]; start: [Point, Point]; mode: 'undecided' | 'pinch' | 'tilt'; distance: number; zoom: number; angle: number; twist: number; twistStart: number | null; yaw: number; midY: number; view: View | null };
  let touch: { points: Map<number, Point>; rect: DOMRect; phase: 'press' | 'pan' | 'blocked' | 'two'; start: Point; tap: boolean; view: View | null; two: TwoFingers | null } | null = null;
  /** Animation frame of a pending pinch update, 0 when none. */
  let frame = 0;
  function groundPoint(x: number, y: number, view: Camera, rect: DOMRect) {
    pointer.set((x - rect.left) / rect.width * 2 - 1, 1 - (y - rect.top) / rect.height * 2);
    raycaster.setFromCamera(pointer, view);
    return raycaster.ray.intersectPlane(ground, new Vector3());
  }
  /** The frozen view, target and grabbed ground point a pan works from. */
  function snapshot(x: number, y: number, rect: DOMRect): View | null {
    const view = getCamera().clone(); view.updateMatrixWorld(true);
    const anchor = groundPoint(x, y, view, rect);
    return anchor ? { camera: view, target: callbacks.getTarget().clone(), anchor } : null;
  }
  /** Moves the target so the grabbed ground point lies under (x, y) as seen by `camera` (the frozen view, or it turned and zoomed). */
  function keepAnchor(view: View, x: number, y: number, rect: DOMRect, camera = view.camera) {
    const point = groundPoint(x, y, camera, rect);
    if (point) callbacks.setTarget(view.target.clone().add(view.anchor).sub(point).setY(view.target.y));
  }
  /**
   * The frozen view turned by `yaw` radians around the vertical axis through its target and zoomed by `factor`: an
   * orthographic camera scales its zoom, a perspective camera moves toward the target. That is the camera the renderer
   * draws for the same target at the new yaw and zoom, so the pinch midpoint can be kept on its ground point exactly.
   */
  function transformed(view: View, factor: number, yaw: number): Camera {
    const camera = view.camera.clone(), offset = camera.position.clone().sub(view.target);
    if (yaw) { const turn = new Quaternion().setFromAxisAngle(UP, yaw); offset.applyQuaternion(turn); camera.quaternion.premultiply(turn); }
    if ((camera as OrthographicCamera).isOrthographicCamera) { (camera as OrthographicCamera).zoom *= factor; (camera as OrthographicCamera).updateProjectionMatrix(); } else offset.divideScalar(factor);
    camera.position.copy(view.target).add(offset); camera.updateMatrixWorld(true);
    return camera;
  }
  function release(id: number) { if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id); }

  function cancelDrag() {
    const id = drag?.id; drag = null;
    canvas.style.cursor = idleCursor();
    if (id !== undefined) release(id);
  }
  function cancelTouch() {
    const active = touch; touch = null;
    if (frame) { cancelAnimationFrame(frame); frame = 0; }
    active?.points.forEach((_, id) => release(id));
  }
  function cancel() { cancelDrag(); cancelTouch(); }

  /**
   * Keeps a drag or touch gesture going after the canvas changed size or position; the renderer calls it once its camera
   * has the new viewport. The canvas rectangle is read again, and a pan or pinch restarts from the pointers' current
   * positions against the camera as drawn now, so the grabbed ground point stays under the pointer. An orbit only takes
   * the new height. A canvas without size cancels the gesture.
   */
  function resize() {
    if (!drag && !touch) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) { cancel(); return; }
    if (drag) {
      drag.rect = rect;
      if (drag.mode === 'pan') drag.view = snapshot(drag.last.x, drag.last.y, rect) ?? drag.view;
    }
    if (touch) resizeTouch(touch, rect);
  }
  function resizeTouch(active: NonNullable<typeof touch>, rect: DOMRect) {
    // A pending pinch update belongs to the size it was measured at.
    if (frame) { cancelAnimationFrame(frame); applyPinch(); }
    active.rect = rect;
    const two = active.two;
    if (two) {
      // A twist that already turns the view keeps turning without crossing the threshold again.
      const twisting = two.twistStart !== null, [a, b] = two.ids.map(id => active.points.get(id)!) as [Point, Point];
      restart(two, a, b);
      if (twisting) two.twistStart = 0;
      return;
    }
    const [point] = [...active.points.values()];
    if (point && (active.phase === 'press' || active.phase === 'pan')) active.view = snapshot(point.x, point.y, rect);
  }

  // Mouse and pen.
  function mouseDown(event: PointerEvent) {
    if (drag || !event.isPrimary) return;
    const orbit = callbacks.canOrbit?.() === true && (event.button === 2 || event.button === 0 && event.ctrlKey);
    if (event.button !== 0 && !orbit) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const view = orbit ? null : snapshot(event.clientX, event.clientY, rect);
    if (!orbit && !view) return;
    const at = { x: event.clientX, y: event.clientY };
    drag = { id: event.pointerId, ...at, last: at, mode: orbit ? 'orbit' : 'pan', buttons: event.button === 2 ? 2 : 1, view, rect, dragged: false };
    canvas.setPointerCapture(event.pointerId);
  }
  function mouseMove(event: PointerEvent) {
    if (!drag) { callbacks.onHover(event); return; }
    if (drag.id !== event.pointerId) return;
    if (!(event.buttons & drag.buttons)) { cancelDrag(); return; }
    drag.last = { x: event.clientX, y: event.clientY };
    if (!drag.dragged && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < DRAG_THRESHOLD) return;
    if (callbacks.canDrag?.() === false) { drag.dragged = true; return; }
    if (!drag.dragged) {
      drag.dragged = true; canvas.style.cursor = 'grabbing';
      if (callbacks.onDragStart?.(drag.mode) && drag.mode === 'pan') drag.view = snapshot(event.clientX, event.clientY, drag.rect) ?? drag.view;
    }
    if (drag.mode === 'orbit') {
      // Orbit works in steps from the previous pointer position, so a camera that turns meanwhile (a follow) is not undone.
      const delta = orbitDelta(event.clientX - drag.x, event.clientY - drag.y, drag.rect.height);
      drag.x = event.clientX; drag.y = event.clientY;
      callbacks.orbit?.(delta.yaw, delta.pitch);
      return;
    }
    keepAnchor(drag.view!, event.clientX, event.clientY, drag.rect);
  }
  function mouseUp(event: PointerEvent) {
    if (!drag || drag.id !== event.pointerId) return;
    const dragged = drag.dragged; cancelDrag();
    if (!dragged && event.button === 0) callbacks.onClick(event);
  }

  // Touch, with `options.touch`.
  function touchDown(event: PointerEvent) {
    const point = { x: event.clientX, y: event.clientY };
    if (!touch) {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      touch = { points: new Map([[event.pointerId, point]]), rect, phase: 'press', start: { ...point }, tap: true, view: snapshot(point.x, point.y, rect), two: null };
      canvas.setPointerCapture(event.pointerId);
      return;
    }
    // A third finger is ignored; it never taps either.
    if (touch.points.size >= 2) return;
    touch.points.set(event.pointerId, point); canvas.setPointerCapture(event.pointerId);
    const ids = [...touch.points.keys()] as [number, number], [a, b] = ids.map(id => ({ ...touch!.points.get(id)! })) as [Point, Point];
    touch.phase = 'two'; touch.view = null;
    touch.two = { ids, start: [a, b], mode: 'undecided', distance: 0, zoom: 1, angle: 0, twist: 0, twistStart: null, yaw: 0, midY: 0, view: null };
    restart(touch.two, a, b);
  }
  /** Starts measuring a two-finger gesture from the fingers' current positions. */
  function restart(two: TwoFingers, a: Point, b: Point) {
    const mid = midpointOf(a, b), pans = callbacks.canDrag?.() !== false && callbacks.pinchPans?.() !== false;
    Object.assign(two, { distance: distanceOf(a, b), zoom: callbacks.getZoom?.() ?? 1, angle: angleOf(a, b), twist: 0, twistStart: null, yaw: 0, midY: mid.y, view: pans ? snapshot(mid.x, mid.y, touch!.rect) : null });
  }
  function touchMove(event: PointerEvent) {
    const active = touch!, point = active.points.get(event.pointerId);
    if (!point) return;
    point.x = event.clientX; point.y = event.clientY;
    if (active.phase === 'press') {
      if (Math.hypot(point.x - active.start.x, point.y - active.start.y) < DRAG_THRESHOLD) return;
      if (callbacks.canDrag?.() === false) { active.phase = 'blocked'; return; }
      active.phase = 'pan';
      if (callbacks.onDragStart?.('pan') || !active.view) active.view = snapshot(point.x, point.y, active.rect);
    }
    if (active.phase === 'pan') { if (active.view) keepAnchor(active.view, point.x, point.y, active.rect); return; }
    if (active.phase !== 'two') return;
    const two = active.two!, [a, b] = two.ids.map(id => active.points.get(id)!) as [Point, Point];
    if (two.mode === 'undecided') {
      const da = { x: a.x - two.start[0].x, y: a.y - two.start[0].y }, db = { x: b.x - two.start[1].x, y: b.y - two.start[1].y };
      const moved = [Math.hypot(da.x, da.y), Math.hypot(db.x, db.y)];
      // Fingers report one at a time: decide once both moved, or once one clearly moved alone (a pinch around a resting finger).
      if (Math.min(...moved) < DRAG_THRESHOLD && Math.max(...moved) < TWO_FINGER_DECISION) return;
      const orbit = callbacks.canOrbit?.() === true && callbacks.canDrag?.() !== false;
      two.mode = orbit && isVerticalTwoFingerDrag(da, db) ? 'tilt' : 'pinch';
      callbacks.onDragStart?.(two.mode === 'tilt' ? 'orbit' : 'pinch');
      // Measuring restarts here, so the view does not jump by the movement it took to decide.
      restart(two, a, b);
      return;
    }
    if (two.mode === 'tilt') {
      const midY = (a.y + b.y) / 2, delta = orbitDelta(0, midY - two.midY, active.rect.height); two.midY = midY;
      callbacks.orbit?.(0, delta.pitch);
      return;
    }
    const angle = angleOf(a, b); two.twist += normalizeAngle(angle - two.angle); two.angle = angle;
    // Zoom writes go to the store and its subscribers: coalesce them, with the turn and pan that belong to them, to one per frame.
    if (!frame) frame = requestAnimationFrame(applyPinch);
  }
  /** Applies the latest pinch: zoom from the finger distance, yaw from their twist, target so the midpoint keeps its ground point. */
  function applyPinch() {
    frame = 0;
    const two = touch?.two;
    if (!touch || !two || two.mode !== 'pinch') return;
    const [a, b] = two.ids.map(id => touch!.points.get(id)!) as [Point, Point], mid = midpointOf(a, b);
    let zoom = two.zoom;
    if (callbacks.getZoom && callbacks.setZoom) { zoom = pinchZoom(two.zoom, two.distance, distanceOf(a, b)); if (zoom !== callbacks.getZoom()) callbacks.setZoom(zoom); }
    if (callbacks.canOrbit?.() === true && callbacks.canDrag?.() !== false) {
      if (two.twistStart === null && Math.abs(two.twist) >= TWIST_THRESHOLD) two.twistStart = two.twist;
      // Fingers turning clockwise on screen turn the ground clockwise with them: the camera yaw grows.
      const yaw = two.twistStart === null ? 0 : two.twist - two.twistStart;
      if (yaw !== two.yaw) { callbacks.orbit?.(yaw - two.yaw, 0); two.yaw = yaw; }
    }
    if (two.view) keepAnchor(two.view, mid.x, mid.y, touch.rect, transformed(two.view, zoom / two.zoom, two.yaw));
  }
  function touchUp(event: PointerEvent) {
    const active = touch;
    if (!active?.points.has(event.pointerId)) return;
    if (frame) { cancelAnimationFrame(frame); applyPinch(); }
    active.points.delete(event.pointerId); release(event.pointerId);
    if (!active.points.size) {
      touch = null;
      if (active.phase === 'press' && active.tap && event.button === 0) callbacks.onClick(event);
      return;
    }
    if (active.phase === 'two') {
      // The remaining finger pans once it moves past the threshold from here; lifting it never taps.
      const [point] = [...active.points.values()];
      Object.assign(active, { phase: 'press', start: { ...point }, tap: false, view: null, two: null });
    }
  }

  function down(event: PointerEvent) {
    if (disposed) return;
    if (event.pointerType === 'touch') { if (touchEnabled) touchDown(event); return; }
    mouseDown(event);
  }
  function move(event: PointerEvent) {
    if (disposed) return;
    if (event.pointerType === 'touch' && touch) { touchMove(event); return; }
    if (event.pointerType === 'touch') { callbacks.onHover(event); return; }
    mouseMove(event);
  }
  function up(event: PointerEvent) {
    if (disposed) return;
    if (event.pointerType !== 'touch') { mouseUp(event); return; }
    if (touchEnabled) { touchUp(event); return; }
    // Without touch gestures the page keeps touch input; a tap still selects (a scroll ends in pointercancel instead).
    if (event.button === 0) callbacks.onClick(event);
  }
  function interrupted(event: PointerEvent) {
    if (drag?.id === event.pointerId) cancelDrag();
    if (touch?.points.has(event.pointerId)) cancelTouch();
  }
  function menu(event: Event) { if (callbacks.canOrbit?.() === true) event.preventDefault(); }
  const listeners = { pointerdown: down, pointermove: move, pointerup: up, pointercancel: interrupted, lostpointercapture: interrupted, contextmenu: menu } as Record<string, (event: never) => void>;
  canvas.style.cursor = idleCursor();
  if (touchEnabled) canvas.style.touchAction = 'none';
  for (const [type, listener] of Object.entries(listeners)) canvas.addEventListener(type, listener as EventListener);
  return {
    cancel,
    resize,
    dispose() {
      if (disposed) return; disposed = true; cancel();
      for (const [type, listener] of Object.entries(listeners)) canvas.removeEventListener(type, listener as EventListener);
      canvas.style.cursor = originalCursor;
      if (touchEnabled) canvas.style.touchAction = originalTouchAction;
    },
  };
}
