import { OrthographicCamera, Plane, Raycaster, Vector2, Vector3 } from 'three';

interface PanCallbacks {
  getTarget(): Vector3;
  setTarget(target: Vector3): void;
  onClick(event: PointerEvent): void;
  onHover(event: PointerEvent): void;
}

/** Mouse input belongs to the renderer; panning never writes domain or selection state. */
export function bindCameraPan(canvas: HTMLCanvasElement, camera: OrthographicCamera, callbacks: PanCallbacks) {
  const raycaster = new Raycaster(), pointer = new Vector2(), ground = new Plane(new Vector3(0, 1, 0), 0);
  const originalCursor = canvas.style.cursor;
  let disposed = false;
  let gesture: { id: number; x: number; y: number; camera: OrthographicCamera; target: Vector3; anchor: Vector3; rect: DOMRect; dragged: boolean } | null = null;
  function groundPoint(x: number, y: number, view: OrthographicCamera, rect: DOMRect) {
    pointer.set((x - rect.left) / rect.width * 2 - 1, 1 - (y - rect.top) / rect.height * 2);
    raycaster.setFromCamera(pointer, view);
    return raycaster.ray.intersectPlane(ground, new Vector3());
  }
  function cancel() {
    const id = gesture?.id; gesture = null;
    canvas.style.cursor = 'grab';
    if (id !== undefined && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  }
  function down(event: PointerEvent) {
    if (disposed || gesture || event.button !== 0 || !event.isPrimary || event.pointerType !== 'mouse') return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const view = camera.clone(); view.updateMatrixWorld(true);
    const anchor = groundPoint(event.clientX, event.clientY, view, rect);
    if (!anchor) return;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, camera: view, target: callbacks.getTarget().clone(), anchor, rect, dragged: false };
    canvas.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent) {
    if (disposed) return;
    if (!gesture) { callbacks.onHover(event); return; }
    if (gesture.id !== event.pointerId) return;
    if (!(event.buttons & 1)) { cancel(); return; }
    if (!gesture.dragged && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 5) return;
    gesture.dragged = true; canvas.style.cursor = 'grabbing';
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
  canvas.style.cursor = 'grab';
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
