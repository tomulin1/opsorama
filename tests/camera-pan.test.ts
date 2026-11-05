import { describe, expect, it, vi } from 'vitest';
import { OrthographicCamera, Vector3 } from 'three';
import { bindCameraPan } from '../packages/three/src/camera-pan';

class TestCanvas extends EventTarget {
  style = { cursor: '' };
  captured = new Set<number>();
  getBoundingClientRect() { return { left: 0, top: 0, width: 600, height: 400 } as DOMRect; }
  setPointerCapture(id: number) { this.captured.add(id); }
  hasPointerCapture(id: number) { return this.captured.has(id); }
  releasePointerCapture(id: number) { this.captured.delete(id); this.send('lostpointercapture', { pointerId: id }); }
  send(type: string, props: Partial<PointerEvent> = {}) {
    const event = Object.assign(new Event(type), { pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1, clientX: 300, clientY: 200 }, props);
    this.dispatchEvent(event);
  }
}
function setup(zoom = 20) {
  const canvas = new TestCanvas(), camera = new OrthographicCamera(-300, 300, 200, -200, .1, 150);
  const target = new Vector3(), offset = new Vector3(16, 22, 30);
  const updateCamera = () => { camera.position.copy(target).add(offset); camera.lookAt(target); camera.updateMatrixWorld(true); };
  camera.zoom = zoom; camera.updateProjectionMatrix(); updateCamera();
  const click = vi.fn(), hover = vi.fn();
  const pan = bindCameraPan(canvas as unknown as HTMLCanvasElement, camera, { getTarget: () => target, setTarget: value => { target.copy(value); updateCamera(); }, onClick: click, onHover: hover });
  return { canvas, camera, target, pan, click, hover };
}

describe('camera drag input', () => {
  it('keeps clicks and small pointer jitter separate from a drag', () => {
    const { canvas, target, pan, click } = setup();
    canvas.send('pointerup'); expect(click).not.toHaveBeenCalled();
    canvas.send('pointerdown'); canvas.send('pointermove', { clientX: 303, clientY: 202 }); canvas.send('pointerup');
    expect(click).toHaveBeenCalledTimes(1); expect(target.length()).toBe(0); expect(canvas.captured.size).toBe(0);
    canvas.send('pointerdown', { button: 2 }); canvas.send('pointermove', { clientX: 400 }); canvas.send('pointerup', { button: 2 });
    expect(target.length()).toBe(0); expect(click).toHaveBeenCalledTimes(1); pan.dispose();
  });
  it.each([12, 30])('keeps the grabbed ground point under the pointer at zoom %s without accumulating drift', zoom => {
    const { canvas, camera, target, pan, click } = setup(zoom);
    const grabbedPoint = new Vector3(0, 0, 0);
    canvas.send('pointerdown'); canvas.send('pointermove', { clientX: 380, clientY: 240 });
    const projected = grabbedPoint.clone().project(camera);
    expect((projected.x + 1) * 300).toBeCloseTo(380); expect((1 - projected.y) * 200).toBeCloseTo(240);
    canvas.send('pointermove', { clientX: 410, clientY: 255 });
    const final = grabbedPoint.clone().project(camera);
    expect((final.x + 1) * 300).toBeCloseTo(410); expect((1 - final.y) * 200).toBeCloseTo(255);
    expect(target.y).toBe(0); expect(canvas.style.cursor).toBe('grabbing');
    canvas.send('pointerup'); expect(click).not.toHaveBeenCalled(); expect(canvas.style.cursor).toBe('grab'); pan.dispose();
  });
  it('ignores other pointers, cancels without selection, and removes listeners/capture on disposal', () => {
    const { canvas, target, pan, click, hover } = setup();
    canvas.send('pointerdown'); canvas.send('pointermove', { pointerId: 2, clientX: 400 }); expect(target.length()).toBe(0);
    canvas.send('pointermove', { clientX: 400 }); const last = target.clone();
    canvas.send('pointercancel'); canvas.send('pointerup'); expect(click).not.toHaveBeenCalled(); expect(target.equals(last)).toBe(true);
    canvas.send('pointerdown'); pan.dispose(); pan.dispose(); expect(canvas.captured.size).toBe(0);
    canvas.send('pointermove', { clientX: 450 }); canvas.send('pointerup'); canvas.send('pointerdown');
    expect(target.equals(last)).toBe(true); expect(click).not.toHaveBeenCalled(); expect(hover).not.toHaveBeenCalled();
  });
  it('ends a gesture when movement reports a released button even if mouseup was missed', () => {
    const { canvas, target, pan, click } = setup();
    canvas.send('pointerdown'); canvas.send('pointermove', { clientX: 400 }); const last = target.clone();
    canvas.send('pointermove', { clientX: 450, buttons: 0 }); canvas.send('pointerup');
    expect(target.equals(last)).toBe(true); expect(canvas.captured.size).toBe(0); expect(click).not.toHaveBeenCalled(); pan.dispose();
  });
});
