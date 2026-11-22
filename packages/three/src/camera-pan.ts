import { Plane, Raycaster, Vector2, Vector3, type Camera } from 'three';
import { orbitDelta } from './camera-rig';

/** A mouse drag either pans the view over the ground or orbits it around its target. */
export type DragMode = 'pan' | 'orbit';
interface PanCallbacks {
  getTarget(): Vector3;
  setTarget(target: Vector3): void;
  onClick(event: PointerEvent): void;
  onHover(event: PointerEvent): void;
  /** Whether a press may drag the view (`CameraSettings.controls`). When false, a press that moves past the threshold is neither a drag nor a click. Default: always. */
  canDrag?(): boolean;
  /** Whether a right-button drag or a Ctrl + primary-button drag orbits (`controls: 'orbit'`). The context menu over the canvas is suppressed only while true. Default: never. */
  canOrbit?(): boolean;
  /** Turns the view by yaw and pitch changes in radians since the previous move (see `orbitDelta`). */
  orbit?(yaw: number, pitch: number): void;
  /** Called once when a press becomes a drag. Return true when the camera moved since the press (an interrupted transition): a pan then continues from the current view. */
  onDragStart?(mode: DragMode): boolean;
}

/**
 * Mouse input belongs to the renderer; panning never writes domain or selection state. The view moves so that the ground
 * point (y = 0) grabbed under the pointer stays under it, for orthographic and perspective cameras alike. With `canOrbit`,
 * a right-button or Ctrl + primary-button drag turns the view instead.
 */
export function bindCameraPan(canvas: HTMLCanvasElement, camera: Camera | (() => Camera), callbacks: PanCallbacks) {
  const currentCamera = typeof camera === 'function' ? camera : () => camera;
  const raycaster = new Raycaster(), pointer = new Vector2(), ground = new Plane(new Vector3(0, 1, 0), 0);
  const originalCursor = canvas.style.cursor, idleCursor = () => callbacks.canDrag?.() === false ? '' : 'grab';
  let disposed = false;
  type View = { camera: Camera; target: Vector3; anchor: Vector3 };
  let gesture: { id: number; x: number; y: number; mode: DragMode; buttons: number; view: View | null; rect: DOMRect; dragged: boolean } | null = null;
  function groundPoint(x: number, y: number, view: Camera, rect: DOMRect) {
    pointer.set((x - rect.left) / rect.width * 2 - 1, 1 - (y - rect.top) / rect.height * 2);
    raycaster.setFromCamera(pointer, view);
    return raycaster.ray.intersectPlane(ground, new Vector3());
  }
  /** The frozen view, target and grabbed ground point a pan works from. */
  function snapshot(x: number, y: number, rect: DOMRect): View | null {
    const view = currentCamera().clone(); view.updateMatrixWorld(true);
    const anchor = groundPoint(x, y, view, rect);
    return anchor ? { camera: view, target: callbacks.getTarget().clone(), anchor } : null;
  }
  function cancel() {
    const id = gesture?.id; gesture = null;
    canvas.style.cursor = idleCursor();
    if (id !== undefined && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  }
  function down(event: PointerEvent) {
    if (disposed || gesture || !event.isPrimary || event.pointerType !== 'mouse') return;
    const orbit = callbacks.canOrbit?.() === true && (event.button === 2 || event.button === 0 && event.ctrlKey);
    if (event.button !== 0 && !orbit) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const view = orbit ? null : snapshot(event.clientX, event.clientY, rect);
    if (!orbit && !view) return;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, mode: orbit ? 'orbit' : 'pan', buttons: event.button === 2 ? 2 : 1, view, rect, dragged: false };
    canvas.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent) {
    if (disposed) return;
    if (!gesture) { callbacks.onHover(event); return; }
    if (gesture.id !== event.pointerId) return;
    if (!(event.buttons & gesture.buttons)) { cancel(); return; }
    if (!gesture.dragged && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 5) return;
    if (callbacks.canDrag?.() === false) { gesture.dragged = true; return; }
    if (!gesture.dragged) {
      gesture.dragged = true; canvas.style.cursor = 'grabbing';
      if (callbacks.onDragStart?.(gesture.mode) && gesture.mode === 'pan') gesture.view = snapshot(event.clientX, event.clientY, gesture.rect) ?? gesture.view;
    }
    if (gesture.mode === 'orbit') {
      // Orbit works in steps from the previous pointer position, so a camera that turns meanwhile (a follow) is not undone.
      const delta = orbitDelta(event.clientX - gesture.x, event.clientY - gesture.y, gesture.rect.height);
      gesture.x = event.clientX; gesture.y = event.clientY;
      callbacks.orbit?.(delta.yaw, delta.pitch);
      return;
    }
    const view = gesture.view!, point = groundPoint(event.clientX, event.clientY, view.camera, gesture.rect);
    if (point) callbacks.setTarget(view.target.clone().add(view.anchor).sub(point).setY(view.target.y));
  }
  function up(event: PointerEvent) {
    if (disposed) return;
    if (!gesture) {
      // Keep existing touch/pen tap selection; mouse clicks require a matching press.
      if (event.pointerType !== 'mouse' && event.button === 0) callbacks.onClick(event);
      return;
    }
    if (gesture.id !== event.pointerId) return;
    const dragged = gesture.dragged; cancel();
    if (!dragged && event.button === 0) callbacks.onClick(event);
  }
  function interrupted(event: PointerEvent) { if (gesture?.id === event.pointerId) cancel(); }
  function menu(event: Event) { if (callbacks.canOrbit?.() === true) event.preventDefault(); }
  const listeners = { pointerdown: down, pointermove: move, pointerup: up, pointercancel: interrupted, lostpointercapture: interrupted, contextmenu: menu } as Record<string, (event: never) => void>;
  canvas.style.cursor = idleCursor();
  for (const [type, listener] of Object.entries(listeners)) canvas.addEventListener(type, listener as EventListener);
  return {
    cancel,
    dispose() {
      if (disposed) return; disposed = true; cancel();
      for (const [type, listener] of Object.entries(listeners)) canvas.removeEventListener(type, listener as EventListener);
      canvas.style.cursor = originalCursor;
    },
  };
}
