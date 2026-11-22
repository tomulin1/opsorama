import { describe, expect, it, vi } from 'vitest';
import { OrthographicCamera, PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from 'three';
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

describe('camera drag input in perspective and with controls none', () => {
  function perspectiveSetup(callbacks: { canDrag?: () => boolean; onDragStart?: () => boolean } = {}) {
    const canvas = new TestCanvas(), camera = new PerspectiveCamera(30, 600 / 400, .1, 500);
    const target = new Vector3(), offset = new Vector3(16, 22, 30);
    const updateCamera = () => { camera.position.copy(target).add(offset); camera.lookAt(target); camera.updateMatrixWorld(true); };
    updateCamera();
    const click = vi.fn();
    const pan = bindCameraPan(canvas as unknown as HTMLCanvasElement, () => camera, { getTarget: () => target, setTarget: value => { target.copy(value); updateCamera(); }, onClick: click, onHover: vi.fn(), ...callbacks });
    return { canvas, camera, target, pan, click, updateCamera };
  }
  it('keeps the grabbed ground point under the pointer with a perspective camera', () => {
    const { canvas, camera, target, pan } = perspectiveSetup();
    canvas.send('pointerdown', { clientX: 250, clientY: 260 });
    const grabbed = new Vector3(0, 0, 0).project(camera);
    const ray = new Raycaster(); ray.setFromCamera(new Vector2(250 / 300 - 1, 1 - 260 / 200), camera);
    const anchor = ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), 0), new Vector3())!;
    canvas.send('pointermove', { clientX: 330, clientY: 300 });
    const moved = anchor.clone().project(camera);
    expect((moved.x + 1) * 300).toBeCloseTo(330, 8); expect((1 - moved.y) * 200).toBeCloseTo(300, 8);
    expect(target.y).toBe(0); expect(target.length()).toBeGreaterThan(0);
    canvas.send('pointermove', { clientX: 250, clientY: 260 });
    expect(target.length()).toBeCloseTo(0, 10);
    // Back at the press point, the view is where it started: the ground origin projects where it did.
    const back = new Vector3(0, 0, 0).project(camera); expect(back.x).toBeCloseTo(grabbed.x, 10); expect(back.y).toBeCloseTo(grabbed.y, 10); pan.dispose();
  });
  it('lets clicks through but never drags with controls none', () => {
    const { canvas, target, pan, click } = perspectiveSetup({ canDrag: () => false });
    expect(canvas.style.cursor).toBe('');
    canvas.send('pointerdown'); canvas.send('pointermove', { clientX: 400 }); canvas.send('pointerup');
    expect(target.length()).toBe(0); expect(click).not.toHaveBeenCalled();
    canvas.send('pointerdown'); canvas.send('pointerup'); expect(click).toHaveBeenCalledTimes(1); pan.dispose();
  });
  it('continues from the current view when a drag interrupts a camera transition', () => {
    let moved = false;
    const setup = perspectiveSetup({ onDragStart: () => { if (moved) return false; moved = true; setup.target.set(5, 0, 0); setup.updateCamera(); return true; } });
    const { canvas, target, pan } = setup;
    canvas.send('pointerdown'); canvas.send('pointermove', { clientX: 310 });
    // Re-anchored at the drag start: the view stays where the transition left it.
    expect(target.x).toBeCloseTo(5, 10);
    canvas.send('pointermove', { clientX: 330 }); expect(target.x).not.toBeCloseTo(5, 3); pan.dispose();
  });
});

describe('mouse orbit', () => {
  function orbitSetup(orbitEnabled = true) {
    const canvas = new TestCanvas(), camera = new OrthographicCamera(-300, 300, 200, -200, .1, 150);
    camera.position.set(16, 22, 30); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
    const target = new Vector3(), angles = { yaw: 0, pitch: .5 }, starts: string[] = [];
    let enabled = orbitEnabled;
    const click = vi.fn();
    const pan = bindCameraPan(canvas as unknown as HTMLCanvasElement, camera, {
      getTarget: () => target, setTarget: value => { target.copy(value); }, onClick: click, onHover: vi.fn(),
      canOrbit: () => enabled, orbit: (yaw, pitch) => { angles.yaw += yaw; angles.pitch += pitch; },
      onDragStart: mode => { starts.push(mode); return false; },
    });
    return { canvas, target, angles, starts, pan, click, enable: (value: boolean) => { enabled = value; } };
  }
  it('orbits with a right-button drag in steps of the pointer movement, half a turn per viewport height', () => {
    const { canvas, target, angles, starts, pan, click } = orbitSetup();
    canvas.send('pointerdown', { button: 2, buttons: 2 });
    canvas.send('pointermove', { buttons: 2, clientX: 303 }); expect(angles.yaw).toBe(0);
    canvas.send('pointermove', { buttons: 2, clientX: 340, clientY: 220 });
    expect(angles.yaw).toBeCloseTo(-40 * Math.PI / 400, 12); expect(angles.pitch).toBeCloseTo(.5 + 20 * Math.PI / 400, 12);
    canvas.send('pointermove', { buttons: 2, clientX: 300, clientY: 220 });
    expect(angles.yaw).toBeCloseTo(0, 12); expect(target.length()).toBe(0); expect(starts).toEqual(['orbit']);
    expect(canvas.style.cursor).toBe('grabbing');
    canvas.send('pointerup', { button: 2, buttons: 0 }); expect(click).not.toHaveBeenCalled(); expect(canvas.captured.size).toBe(0); pan.dispose();
  });
  it('orbits with Ctrl and the primary button, and a Ctrl click without movement still selects', () => {
    const { canvas, target, angles, pan, click } = orbitSetup();
    canvas.send('pointerdown', { ctrlKey: true }); canvas.send('pointermove', { clientX: 400 }); canvas.send('pointerup');
    expect(angles.yaw).toBeCloseTo(-100 * Math.PI / 400, 12); expect(target.length()).toBe(0); expect(click).not.toHaveBeenCalled();
    canvas.send('pointerdown', { ctrlKey: true }); canvas.send('pointerup'); expect(click).toHaveBeenCalledTimes(1);
    // A plain primary drag still pans with orbit controls.
    canvas.send('pointerdown'); canvas.send('pointermove', { clientX: 400 }); canvas.send('pointerup');
    expect(target.length()).toBeGreaterThan(0); pan.dispose();
  });
  it('suppresses the context menu only while orbit is enabled; without it right drags do nothing and Ctrl drags pan', () => {
    const { canvas, target, angles, pan, enable } = orbitSetup();
    const menu = () => { const event = new Event('contextmenu', { cancelable: true }); canvas.dispatchEvent(event); return event.defaultPrevented; };
    expect(menu()).toBe(true);
    enable(false); expect(menu()).toBe(false);
    canvas.send('pointerdown', { button: 2, buttons: 2 }); canvas.send('pointermove', { buttons: 2, clientX: 400 }); canvas.send('pointerup', { button: 2 });
    expect(angles).toEqual({ yaw: 0, pitch: .5 }); expect(target.length()).toBe(0);
    canvas.send('pointerdown', { ctrlKey: true }); canvas.send('pointermove', { clientX: 400 }); canvas.send('pointerup');
    expect(angles).toEqual({ yaw: 0, pitch: .5 }); expect(target.length()).toBeGreaterThan(0);
    pan.dispose(); enable(true); expect(menu()).toBe(false);
  });
  it('ends an orbit when the right button is no longer reported', () => {
    const { canvas, angles, pan } = orbitSetup();
    canvas.send('pointerdown', { button: 2, buttons: 2 }); canvas.send('pointermove', { buttons: 2, clientX: 340 });
    const yaw = angles.yaw; canvas.send('pointermove', { buttons: 1, clientX: 380 });
    expect(angles.yaw).toBe(yaw); expect(canvas.captured.size).toBe(0); pan.dispose();
  });
});
