import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrthographicCamera, PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from 'three';
import { ZOOM_RANGE, type Vec3 } from '@opsorama/core';
import { bindCameraGestures, isVerticalTwoFingerDrag, pinchZoom, TWIST_THRESHOLD } from '../packages/three/src/gestures';
import { applyOrthographic, applyPerspective, orbitDelta } from '../packages/three/src/camera-rig';

class TestCanvas extends EventTarget {
  style = { cursor: '', touchAction: '' };
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
  const pan = bindCameraGestures(canvas as unknown as HTMLCanvasElement, () => camera, { getTarget: () => target, setTarget: value => { target.copy(value); updateCamera(); }, onClick: click, onHover: hover });
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
    const pan = bindCameraGestures(canvas as unknown as HTMLCanvasElement, () => camera, { getTarget: () => target, setTarget: value => { target.copy(value); updateCamera(); }, onClick: click, onHover: vi.fn(), ...callbacks });
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
    const pan = bindCameraGestures(canvas as unknown as HTMLCanvasElement, () => camera, {
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

describe('pen input', () => {
  it('behaves like a mouse: a press drags or clicks, a barrel-button drag orbits, a release without a press does nothing', () => {
    const { canvas, target, pan, click } = setup();
    canvas.send('pointerup', { pointerType: 'pen' }); expect(click).not.toHaveBeenCalled();
    canvas.send('pointerdown', { pointerType: 'pen' }); canvas.send('pointerup', { pointerType: 'pen' }); expect(click).toHaveBeenCalledTimes(1);
    canvas.send('pointerdown', { pointerType: 'pen' }); canvas.send('pointermove', { pointerType: 'pen', clientX: 380 }); canvas.send('pointerup', { pointerType: 'pen' });
    expect(target.length()).toBeGreaterThan(0); expect(click).toHaveBeenCalledTimes(1); expect(canvas.captured.size).toBe(0); pan.dispose();
    const angles = { yaw: 0, pitch: 0 }, pen = new TestCanvas(), camera = new OrthographicCamera(-300, 300, 200, -200, .1, 150);
    camera.position.set(16, 22, 30); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
    const orbit = bindCameraGestures(pen as unknown as HTMLCanvasElement, () => camera, { getTarget: () => new Vector3(), setTarget: vi.fn(), onClick: vi.fn(), onHover: vi.fn(), canOrbit: () => true, orbit: (yaw, pitch) => { angles.yaw += yaw; angles.pitch += pitch; } });
    pen.send('pointerdown', { pointerType: 'pen', button: 2, buttons: 2 }); pen.send('pointermove', { pointerType: 'pen', buttons: 2, clientX: 340 });
    expect(angles.yaw).toBeCloseTo(-40 * Math.PI / 400, 12); orbit.dispose();
  });
});

describe('gesture helpers', () => {
  it('scales the zoom with the finger distance within ZOOM_RANGE', () => {
    expect(pinchZoom(1, 100, 150)).toBe(1.5); expect(pinchZoom(2, 200, 100)).toBe(1);
    expect(pinchZoom(1, 100, 10000)).toBe(ZOOM_RANGE.max); expect(pinchZoom(1, 100, 1)).toBe(ZOOM_RANGE.min);
    expect(pinchZoom(1, 0, 3)).toBe(3);
  });
  it('recognizes a vertical two-finger drag only when both fingers move mostly vertically, the same way and by similar amounts', () => {
    expect(isVerticalTwoFingerDrag({ x: 1, y: -10 }, { x: -2, y: -8 })).toBe(true);
    expect(isVerticalTwoFingerDrag({ x: 1, y: -10 }, { x: 0, y: 10 })).toBe(false);
    expect(isVerticalTwoFingerDrag({ x: 6, y: -10 }, { x: 0, y: -10 })).toBe(false);
    expect(isVerticalTwoFingerDrag({ x: 0, y: -20 }, { x: 0, y: -6 })).toBe(false);
    expect(isVerticalTwoFingerDrag({ x: 0, y: -20 }, { x: 0, y: 0 })).toBe(false);
  });
});

describe('touch gestures', () => {
  type RigOptions = { touch?: boolean; projection?: 'orthographic' | 'perspective'; pitch?: number; orbit?: boolean; canDrag?: boolean; pinchPans?: boolean; touchAction?: string };
  const frames: (FrameRequestCallback | null)[] = [];
  beforeEach(() => {
    frames.length = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
    vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames[id - 1] = null; });
  });
  afterEach(() => { vi.unstubAllGlobals(); });
  /** Runs the animation frames requested so far. Frame ids stay unique, so a cancelled id never cancels a later frame. */
  const flush = () => { const pending = frames.map((callback, index) => [callback, index] as const); pending.forEach(([callback, index]) => { frames[index] = null; callback?.(0); }); };
  const pendingFrames = () => frames.filter(Boolean).length;

  /** A camera placed by the renderer's camera rig from target, yaw, pitch and zoom, updated by every callback. */
  function rig(options: RigOptions = {}) {
    const canvas = new TestCanvas(); canvas.style.touchAction = options.touchAction ?? '';
    const state = { target: new Vector3(), yaw: .5, pitch: options.pitch ?? .6, zoom: 1 };
    const camera = options.projection === 'perspective' ? new PerspectiveCamera() : new OrthographicCamera();
    const place = () => {
      const pose = { target: state.target.toArray() as unknown as Vec3, yaw: state.yaw, pitch: state.pitch, zoom: state.zoom, extent: 1 }, frame = { width: 600, height: 400, fov: 30, radius: 20 };
      if (camera instanceof PerspectiveCamera) applyPerspective(camera, pose, frame); else applyOrthographic(camera, pose, frame);
    };
    place();
    const click = vi.fn(), hover = vi.fn(), zoomWrites = vi.fn(), starts: string[] = [];
    const gestures = bindCameraGestures(canvas as unknown as HTMLCanvasElement, () => camera, {
      getTarget: () => state.target, setTarget: value => { state.target.copy(value); place(); }, onClick: click, onHover: hover,
      canDrag: () => options.canDrag ?? true, canOrbit: () => options.orbit ?? false,
      orbit: (yaw, pitch) => { state.yaw += yaw; state.pitch += pitch; place(); },
      onDragStart: mode => { starts.push(mode); return false; },
      getZoom: () => state.zoom, setZoom: zoom => { zoomWrites(zoom); state.zoom = zoom; place(); },
      pinchPans: () => options.pinchPans ?? true,
    }, { touch: options.touch ?? true });
    const finger = (type: string, id: number, x: number, y: number) => canvas.send(type, { pointerType: 'touch', pointerId: id, isPrimary: id === 11, clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1 });
    const screen = (point: Vector3) => { const projected = point.clone().project(camera); return { x: (projected.x + 1) * 300, y: (1 - projected.y) * 200 }; };
    const groundAt = (x: number, y: number) => { const ray = new Raycaster(); ray.setFromCamera(new Vector2(x / 300 - 1, 1 - y / 200), camera); return ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), 0), new Vector3())!; };
    return { canvas, state, gestures, click, hover, zoomWrites, starts, finger, screen, groundAt };
  }
  type Rig = ReturnType<typeof rig>;
  /** Puts two fingers down and moves both by `move` (the second mirrored horizontally) so the gesture is decided. */
  function startTwo(r: Rig, a: [number, number], b: [number, number], move: [number, number] = [-10, 0]) {
    r.finger('pointerdown', 11, ...a); r.finger('pointerdown', 12, ...b);
    r.finger('pointermove', 11, a[0] + move[0], a[1] + move[1]); r.finger('pointermove', 12, b[0] - move[0], b[1] + move[1]);
    flush();
  }

  it('leaves touch-action unset and touch with the page by default; a tap still selects', () => {
    const r = rig({ touch: false });
    expect(r.canvas.style.touchAction).toBe('');
    r.finger('pointerdown', 11, 300, 200); r.finger('pointerup', 11, 300, 200); expect(r.click).toHaveBeenCalledTimes(1);
    // The page scrolls: the browser cancels the pointer instead of releasing it.
    r.finger('pointerdown', 11, 300, 200); r.finger('pointermove', 11, 300, 260); r.canvas.send('pointercancel', { pointerType: 'touch', pointerId: 11 });
    r.finger('pointerdown', 11, 250, 200); r.finger('pointerdown', 12, 350, 200); r.finger('pointermove', 11, 150, 200); r.finger('pointermove', 12, 450, 200); flush();
    expect(r.state.target.length()).toBe(0); expect(r.zoomWrites).not.toHaveBeenCalled(); expect(r.canvas.captured.size).toBe(0); expect(r.click).toHaveBeenCalledTimes(1);
    r.gestures.dispose(); expect(r.canvas.style.touchAction).toBe('');
  });

  it('sets touch-action none while bound and restores the previous value on dispose', () => {
    const r = rig({ touchAction: 'pan-y' });
    expect(r.canvas.style.touchAction).toBe('none');
    r.gestures.dispose(); expect(r.canvas.style.touchAction).toBe('pan-y');
  });

  it('keeps taps below the drag threshold and pans with one finger past it', () => {
    const r = rig();
    r.finger('pointerdown', 11, 300, 200); r.finger('pointermove', 11, 303, 202); r.finger('pointerup', 11, 303, 202);
    expect(r.click).toHaveBeenCalledTimes(1); expect(r.state.target.length()).toBe(0); expect(r.canvas.captured.size).toBe(0);
    const grabbed = r.groundAt(200, 250);
    r.finger('pointerdown', 11, 200, 250); r.finger('pointermove', 11, 206, 250);
    expect(r.starts).toEqual(['pan']);
    r.finger('pointermove', 11, 280, 300);
    expect(r.screen(grabbed).x).toBeCloseTo(280, 6); expect(r.screen(grabbed).y).toBeCloseTo(300, 6); expect(r.state.target.y).toBe(0);
    r.finger('pointerup', 11, 280, 300); expect(r.click).toHaveBeenCalledTimes(1); expect(r.canvas.captured.size).toBe(0); r.gestures.dispose();
  });

  it.each(['orthographic', 'perspective'] as const)('pinch-zooms around the finger midpoint with a %s camera, once per frame', projection => {
    const r = rig({ projection });
    startTwo(r, [110, 300], [210, 300]);
    // Decided after both fingers moved: nothing applied yet, measuring restarts at a distance of 120 px around x = 160.
    expect(r.starts).toEqual(['pinch']); expect(r.zoomWrites).not.toHaveBeenCalled();
    const anchor = r.groundAt(160, 300);
    r.finger('pointermove', 11, 70, 300); r.finger('pointermove', 12, 250, 300); r.finger('pointermove', 12, 280, 300);
    r.finger('pointermove', 11, 40, 300);
    expect(r.zoomWrites).not.toHaveBeenCalled(); expect(pendingFrames()).toBe(1);
    flush();
    expect(r.zoomWrites).toHaveBeenCalledTimes(1); expect(r.state.zoom).toBeCloseTo(2, 4);
    expect(r.screen(anchor).x).toBeCloseTo(160, 4); expect(r.screen(anchor).y).toBeCloseTo(300, 4);
    // Moving both fingers drags the anchored ground point along with their midpoint.
    r.finger('pointermove', 11, 80, 280); r.finger('pointermove', 12, 320, 280); flush();
    expect(r.screen(anchor).x).toBeCloseTo(200, 4); expect(r.screen(anchor).y).toBeCloseTo(280, 4); expect(r.state.target.y).toBe(0);
    expect(r.zoomWrites).toHaveBeenCalledTimes(1);
    r.finger('pointerup', 12, 320, 280); r.finger('pointerup', 11, 80, 280);
    expect(r.click).not.toHaveBeenCalled(); expect(r.canvas.captured.size).toBe(0); r.gestures.dispose();
  });

  it('clamps a pinch to ZOOM_RANGE and applies the last positions when a finger lifts before the frame', () => {
    const r = rig();
    startTwo(r, [250, 200], [350, 200]);
    r.finger('pointermove', 11, 0, 200); r.finger('pointermove', 12, 600, 200); flush();
    expect(r.state.zoom).toBe(ZOOM_RANGE.max);
    r.finger('pointermove', 11, 299, 200); r.finger('pointermove', 12, 301, 200);
    r.finger('pointerup', 12, 301, 200);
    expect(r.state.zoom).toBe(ZOOM_RANGE.min); expect(pendingFrames()).toBe(0); r.gestures.dispose();
  });

  it('zooms around the target without panning when pinchPans is false, and only zooms with controls none', () => {
    for (const options of [{ pinchPans: false }, { canDrag: false, orbit: true }]) {
      const r = rig(options);
      startTwo(r, [100, 300], [200, 300]);
      r.finger('pointermove', 11, 40, 260); r.finger('pointermove', 12, 300, 260); flush();
      expect(r.state.zoom).toBeGreaterThan(1.5); expect(r.state.target.length()).toBe(0); expect(r.state.yaw).toBe(.5);
      r.gestures.dispose();
    }
    // With controls none one finger neither pans nor taps once it moved past the threshold.
    const r = rig({ canDrag: false });
    r.finger('pointerdown', 11, 300, 200); r.finger('pointermove', 11, 360, 200); r.finger('pointerup', 11, 360, 200);
    expect(r.state.target.length()).toBe(0); expect(r.click).not.toHaveBeenCalled(); expect(r.starts).toEqual([]);
    r.finger('pointerdown', 11, 300, 200); r.finger('pointerup', 11, 300, 200); expect(r.click).toHaveBeenCalledTimes(1); r.gestures.dispose();
  });

  it('turns the yaw with a two-finger twist only with orbit controls, past a small threshold, with the ground following the fingers', () => {
    const at = (angle: number): [[number, number], [number, number]] => [[300 - 80 * Math.cos(angle), 200 - 80 * Math.sin(angle)], [300 + 80 * Math.cos(angle), 200 + 80 * Math.sin(angle)]];
    const twist = (r: Rig, from: number, to: number) => {
      for (let step = 1; step <= Math.round((to - from) / .1); step++) { const [a, b] = at(from + step * .1); r.finger('pointermove', 11, ...a); r.finger('pointermove', 12, ...b); flush(); }
    };
    // Nearly top-down, where a turn of the camera is a pure rotation of the image.
    const r = rig({ orbit: true, pitch: 1.55 });
    const [a0, b0] = at(0); r.finger('pointerdown', 11, ...a0); r.finger('pointerdown', 12, ...b0);
    twist(r, 0, .1);
    expect(r.starts).toEqual(['pinch']);
    // The yaw starts turning once the twist since the decision reaches TWIST_THRESHOLD: at 0.2 rad here, in 0.1 rad steps.
    twist(r, .1, .3); expect(r.state.yaw).toBeCloseTo(.5, 10);
    const [grab] = at(.3), grabbed = r.groundAt(...grab);
    twist(r, .3, .8);
    // Fingers turning clockwise on screen grow the yaw, and the ground point under a finger stays under it.
    expect(r.state.yaw).toBeCloseTo(1, 6); expect(r.state.zoom).toBeCloseTo(1, 4);
    const [finger] = at(.8);
    expect(r.screen(grabbed).x).toBeCloseTo(finger[0], 0); expect(r.screen(grabbed).y).toBeCloseTo(finger[1], 0);
    r.gestures.dispose();
    const fixed = rig({ pitch: 1.55 });
    fixed.finger('pointerdown', 11, ...a0); fixed.finger('pointerdown', 12, ...b0); twist(fixed, 0, .8);
    expect(fixed.state.yaw).toBe(.5); fixed.gestures.dispose();
    expect(TWIST_THRESHOLD).toBeLessThan(.2);
  });

  it('orbits the pitch with a two-finger vertical drag only with orbit controls; otherwise the drag pans', () => {
    const r = rig({ orbit: true });
    startTwo(r, [250, 300], [350, 300], [0, -10]);
    expect(r.starts).toEqual(['orbit']);
    r.finger('pointermove', 11, 250, 250); r.finger('pointermove', 12, 350, 250);
    expect(r.state.pitch).toBeCloseTo(.6 + orbitDelta(0, -40, 400).pitch, 10);
    flush(); expect(r.zoomWrites).not.toHaveBeenCalled(); expect(r.state.target.length()).toBe(0); expect(r.state.yaw).toBe(.5);
    r.gestures.dispose();
    const panning = rig();
    startTwo(panning, [250, 300], [350, 300], [0, -10]);
    expect(panning.starts).toEqual(['pinch']);
    panning.finger('pointermove', 11, 250, 250); panning.finger('pointermove', 12, 350, 250); flush();
    expect(panning.state.pitch).toBe(.6); expect(panning.state.target.length()).toBeGreaterThan(0); expect(panning.state.zoom).toBe(1);
    panning.gestures.dispose();
  });

  it('never taps after two fingers; the remaining finger pans once it moves past the threshold again', () => {
    const r = rig();
    r.finger('pointerdown', 11, 250, 200); r.finger('pointerdown', 12, 350, 200);
    r.finger('pointerup', 12, 350, 200); r.finger('pointerup', 11, 250, 200);
    expect(r.click).not.toHaveBeenCalled(); expect(r.starts).toEqual([]);
    startTwo(r, [250, 200], [350, 200]);
    r.finger('pointermove', 11, 200, 200); flush(); const zoom = r.state.zoom, target = r.state.target.clone();
    r.finger('pointerup', 12, 360, 200);
    r.finger('pointermove', 11, 203, 200); expect(r.state.target.equals(target)).toBe(true);
    // The pan grabs the ground where the finger crossed the threshold, after the pinch zoom was applied.
    r.finger('pointermove', 11, 230, 220); expect(r.starts).toEqual(['pinch', 'pan']);
    const grabbed = r.groundAt(230, 220); r.finger('pointermove', 11, 260, 240);
    expect(r.state.target.equals(target)).toBe(false); expect(r.screen(grabbed).x).toBeCloseTo(260, 6); expect(r.state.zoom).toBe(zoom);
    r.finger('pointerup', 11, 260, 240); expect(r.click).not.toHaveBeenCalled(); expect(r.canvas.captured.size).toBe(0);
    // A third finger is ignored.
    r.finger('pointerdown', 11, 250, 200); r.finger('pointerdown', 12, 350, 200); r.finger('pointerdown', 13, 300, 300);
    expect(r.canvas.captured.has(13)).toBe(false); r.finger('pointerup', 13, 300, 300); expect(r.click).not.toHaveBeenCalled(); r.gestures.dispose();
  });

  it('ends a gesture on pointercancel or lost pointer capture without a tap or a pending zoom', () => {
    const r = rig();
    startTwo(r, [250, 200], [350, 200]);
    r.finger('pointermove', 11, 150, 200); expect(pendingFrames()).toBe(1);
    r.canvas.send('pointercancel', { pointerType: 'touch', pointerId: 12 });
    flush(); expect(r.zoomWrites).not.toHaveBeenCalled(); expect(r.canvas.captured.size).toBe(0);
    r.finger('pointermove', 11, 100, 200); r.finger('pointerup', 11, 100, 200);
    expect(r.zoomWrites).not.toHaveBeenCalled(); expect(r.click).not.toHaveBeenCalled(); expect(r.state.target.length()).toBe(0);
    r.finger('pointerdown', 11, 300, 200); r.finger('pointermove', 11, 340, 200); const target = r.state.target.clone();
    expect(target.length()).toBeGreaterThan(0);
    r.canvas.send('lostpointercapture', { pointerType: 'touch', pointerId: 11 });
    r.finger('pointermove', 11, 400, 200); r.finger('pointerup', 11, 400, 200);
    expect(r.state.target.equals(target)).toBe(true); expect(r.click).not.toHaveBeenCalled(); r.gestures.dispose();
  });

  it('cancel() ends a pinch where it is, as when another camera move takes over', () => {
    const r = rig();
    startTwo(r, [250, 200], [350, 200]);
    r.finger('pointermove', 11, 150, 200); r.gestures.cancel(); flush();
    expect(r.zoomWrites).not.toHaveBeenCalled(); expect(r.canvas.captured.size).toBe(0);
    r.finger('pointermove', 12, 500, 200); r.finger('pointerup', 12, 500, 200); r.finger('pointerup', 11, 150, 200);
    expect(r.zoomWrites).not.toHaveBeenCalled(); expect(r.click).not.toHaveBeenCalled(); r.gestures.dispose();
  });

  it('removes listeners, pointer capture, the pending frame and touch-action on dispose', () => {
    const r = rig();
    startTwo(r, [250, 200], [350, 200]);
    r.finger('pointermove', 11, 150, 200);
    r.gestures.dispose(); r.gestures.dispose(); flush();
    expect(r.canvas.captured.size).toBe(0); expect(r.canvas.style.touchAction).toBe(''); expect(r.zoomWrites).not.toHaveBeenCalled();
    r.finger('pointerdown', 11, 300, 200); r.finger('pointermove', 11, 400, 200); r.finger('pointerup', 11, 400, 200);
    expect(r.canvas.captured.size).toBe(0); expect(r.state.target.length()).toBe(0); expect(r.click).not.toHaveBeenCalled(); expect(r.hover).not.toHaveBeenCalled();
  });
});
