import { Plane, Raycaster, Vector2, Vector3, type Camera } from 'three';

interface PanCallbacks {
  getTarget(): Vector3;
  setTarget(target: Vector3): void;
  onClick(event: PointerEvent): void;
  onHover(event: PointerEvent): void;
  /** Whether a press may drag the view (`CameraSettings.controls`). When false, a press that moves past the threshold is neither a drag nor a click. Default: always. */
  canDrag?(): boolean;
  /** Called once when a press becomes a drag. Return true when the camera moved since the press (an interrupted transition): the drag then continues from the current view. */
  onDragStart?(): boolean;
}

/**
 * Mouse input belongs to the renderer; panning never writes domain or selection state. The view moves so that the ground
 * point (y = 0) grabbed under the pointer stays under it, for orthographic and perspective cameras alike.
 */
export function bindCameraPan(canvas: HTMLCanvasElement, camera: Camera | (() => Camera), callbacks: PanCallbacks) {
  const currentCamera = typeof camera === 'function' ? camera : () => camera;
  const raycaster = new Raycaster(), pointer = new Vector2(), ground = new Plane(new Vector3(0, 1, 0), 0);
  const originalCursor = canvas.style.cursor, idleCursor = () => callbacks.canDrag?.() === false ? '' : 'grab';
  let disposed = false;
  let gesture: { id: number; x: number; y: number; camera: Camera; target: Vector3; anchor: Vector3; rect: DOMRect; dragged: boolean } | null = null;
  function groundPoint(x: number, y: number, view: Camera, rect: DOMRect) {
    pointer.set((x - rect.left) / rect.width * 2 - 1, 1 - (y - rect.top) / rect.height * 2);
    raycaster.setFromCamera(pointer, view);
    return raycaster.ray.intersectPlane(ground, new Vector3());
  }
  /** The frozen view, target and grabbed ground point a drag works from. */
  function snapshot(x: number, y: number, rect: DOMRect) {
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
    if (disposed || gesture || event.button !== 0 || !event.isPrimary || event.pointerType !== 'mouse') return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const view = snapshot(event.clientX, event.clientY, rect);
    if (!view) return;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, ...view, rect, dragged: false };
    canvas.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent) {
    if (disposed) return;
    if (!gesture) { callbacks.onHover(event); return; }
    if (gesture.id !== event.pointerId) return;
    if (!(event.buttons & 1)) { cancel(); return; }
    if (!gesture.dragged && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 5) return;
    if (callbacks.canDrag?.() === false) { gesture.dragged = true; return; }
    if (!gesture.dragged) {
      gesture.dragged = true; canvas.style.cursor = 'grabbing';
      if (callbacks.onDragStart?.()) { const view = snapshot(event.clientX, event.clientY, gesture.rect); if (view) Object.assign(gesture, view); }
    }
    const point = groundPoint(event.clientX, event.clientY, gesture.camera, gesture.rect);
    if (point) callbacks.setTarget(gesture.target.clone().add(gesture.anchor).sub(point).setY(gesture.target.y));
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
  canvas.style.cursor = idleCursor();
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', interrupted);
  canvas.addEventListener('lostpointercapture', interrupted);
  return {
    cancel,
    dispose() {
      if (disposed) return; disposed = true; cancel();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', interrupted);
      canvas.removeEventListener('lostpointercapture', interrupted);
      canvas.style.cursor = originalCursor;
    },
  };
}
