import { describe, expect, it, vi } from 'vitest';
import { validateCameraPath, type CameraKeyframe, type CameraPath } from '@opsorama/core';
import { createCameraPathPlayer, type KeyframeResolver } from '../packages/three/src/camera-path';
import { ease, type CameraPose } from '../packages/three/src/camera-rig';

const start: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: .5, zoom: 1, extent: 1 };
/** Resolves `view` fields over the previous pose and `frame` to a node position from `nodes`; unknown nodes give null. */
function resolver(nodes: Record<string, [number, number, number]> = {}): KeyframeResolver {
  return (keyframe, previous) => {
    const view = keyframe.view ?? {};
    if (keyframe.frame && !nodes[keyframe.frame.nodeId]) return null;
    return { target: keyframe.frame ? nodes[keyframe.frame.nodeId] : view.target ?? previous.target, yaw: view.yaw ?? previous.yaw, pitch: view.pitch ?? previous.pitch, zoom: view.zoom ?? previous.zoom, extent: previous.extent };
  };
}
const path = (keyframes: CameraKeyframe[], loop?: boolean): CameraPath => { const value = { keyframes, ...(loop === undefined ? {} : { loop }) }; validateCameraPath(value); return value; };

describe('camera path playback', () => {
  it('travels each keyframe on its easing, holds it and completes after the last hold', async () => {
    const player = createCameraPathPlayer(path([
      { view: { target: [10, 0, 0] }, seconds: 2, easing: 'linear' },
      { view: { target: [10, 0, 10], yaw: 1 }, seconds: 1, hold: 1 },
    ]), start, resolver());
    expect(player.advance(0, false).target).toEqual([0, 0, 0]);
    expect(player.advance(.5, false).target[0]).toBeCloseTo(2.5, 12);
    expect(player.advance(1.5, false).target).toEqual([10, 0, 0]);
    // Second keyframe: ease-in-out by default, a quarter of the way at t = 0.5 · ease(0.5)… checked against `ease`.
    const quarter = player.advance(.25, false);
    expect(quarter.target[2]).toBeCloseTo(10 * ease(.25, 'ease-in-out'), 12); expect(quarter.yaw).toBeCloseTo(ease(.25, 'ease-in-out'), 12);
    expect(player.advance(.75, false)).toMatchObject({ target: [10, 0, 10], yaw: 1 });
    expect(player.result).toBeNull();
    player.advance(.999, false); expect(player.result).toBeNull();
    expect(player.advance(.002, false)).toMatchObject({ target: [10, 0, 10], yaw: 1 });
    expect(player.result).toBe('completed'); await expect(player.finished).resolves.toBe('completed');
    // Ended: stopping changes nothing and the pose stays.
    player.finish('interrupted'); expect(player.result).toBe('completed');
    expect(player.advance(5, false).target).toEqual([10, 0, 10]);
  });
  it('passes several keyframes in one long step, resolving each from the one before', () => {
    const resolve = vi.fn(resolver());
    const player = createCameraPathPlayer(path([
      { view: { yaw: 1 }, seconds: 1 }, { view: { pitch: 1 }, seconds: 1 }, { view: { zoom: 2 }, seconds: 1, hold: 2 },
    ]), start, resolve);
    const pose = player.advance(3.5, false);
    expect(pose).toMatchObject({ yaw: 1, pitch: 1, zoom: 2 }); expect(player.result).toBeNull();
    expect(resolve).toHaveBeenCalledTimes(3);
    expect(resolve.mock.calls[2][1]).toMatchObject({ yaw: 1, pitch: 1, zoom: 1 });
  });
  it('cuts to each keyframe when it is reached with reduced motion or motion off', () => {
    const player = createCameraPathPlayer(path([
      { view: { target: [4, 0, 0] }, seconds: 1, hold: .5 }, { view: { target: [8, 0, 0] }, seconds: 2 },
    ]), start, resolver());
    expect(player.advance(.9, true).target).toEqual([0, 0, 0]);
    expect(player.advance(.1, true).target).toEqual([4, 0, 0]);
    expect(player.advance(1.5, true).target).toEqual([4, 0, 0]);
    expect(player.advance(.99, true).target).toEqual([4, 0, 0]);
    expect(player.advance(.02, true).target).toEqual([8, 0, 0]); expect(player.result).toBe('completed');
  });
  it('makes zero-second keyframes cuts and completes a path of cuts at once', () => {
    const player = createCameraPathPlayer(path([{ view: { yaw: 2 }, seconds: 0 }, { view: { yaw: 3 }, seconds: 0 }]), start, resolver());
    expect(player.advance(0, false).yaw).toBe(3); expect(player.result).toBe('completed');
  });
  it('loops from the last keyframe back to the first until stopped, keeping the phase after a long gap', async () => {
    const player = createCameraPathPlayer(path([
      { view: { target: [0, 0, 0] }, seconds: 1, easing: 'linear' }, { view: { target: [10, 0, 0] }, seconds: 1, easing: 'linear' },
    ], true), { ...start, target: [-10, 0, 0] }, resolver());
    expect(player.advance(.5, false).target[0]).toBeCloseTo(-5, 12);
    expect(player.advance(1, false).target[0]).toBeCloseTo(5, 12);
    // Back toward the first keyframe from the last one.
    expect(player.advance(1, false).target[0]).toBeCloseTo(5, 12);
    expect(player.advance(.5, false).target[0]).toBeCloseTo(0, 12);
    // A day-long gap lands on the same phase without replaying every lap.
    expect(player.advance(86400 + .5, false).target[0]).toBeCloseTo(5, 9);
    expect(player.result).toBeNull();
    player.finish('interrupted'); player.finish('completed');
    expect(player.result).toBe('interrupted'); await expect(player.finished).resolves.toBe('interrupted');
  });
  it('ends interrupted at the last pose when a framed node is unknown or gone', async () => {
    const nodes: Record<string, [number, number, number]> = { truck: [5, 0, 5], forklift: [1, 0, 1] };
    const player = createCameraPathPlayer(path([{ frame: { nodeId: 'truck' }, seconds: 1 }, { frame: { nodeId: 'forklift' }, seconds: 1 }]), start, resolver(nodes));
    delete nodes.forklift;
    expect(player.advance(1.5, false).target).toEqual([5, 0, 5]);
    expect(player.result).toBe('interrupted'); await expect(player.finished).resolves.toBe('interrupted');
    const missing = createCameraPathPlayer(path([{ frame: { nodeId: 'crane' }, seconds: 1 }]), start, resolver(nodes));
    expect(missing.result).toBe('interrupted'); expect(missing.advance(1, false)).toBe(start);
  });
  it('meets a moving node where it is when travel to it starts', () => {
    const nodes: Record<string, [number, number, number]> = { agv: [0, 0, 0] };
    const player = createCameraPathPlayer(path([{ view: { yaw: 1 }, seconds: 1 }, { frame: { nodeId: 'agv' }, seconds: 1 }]), start, resolver(nodes));
    player.advance(.5, false); nodes.agv = [3, 0, 3];
    player.advance(.6, false); nodes.agv = [9, 0, 9];
    expect(player.advance(1, false).target).toEqual([3, 0, 3]); expect(player.result).toBe('completed');
  });
});

describe('camera path validation', () => {
  it('accepts views, frames, holds, easing and loops', () => {
    expect(() => validateCameraPath({ keyframes: [{ frame: { nodeId: 'truck', fit: true }, view: { yaw: 1, zoom: 2 }, seconds: 2, hold: 1, easing: 'linear' }, { view: { target: [0, 0, 0] }, seconds: 0 }], loop: true })).not.toThrow();
  });
  it.each<[unknown, string]>([
    [null, 'Camera path: must be an object { keyframes: [...], loop? }.'],
    [{ keyframes: [], speed: 1 }, 'Camera path /speed: unknown field. Use keyframes or loop.'],
    [{ keyframes: {} }, 'Camera path /keyframes: give an array of 1–64 keyframes { view?, frame?, seconds, hold?, easing? } (received object).'],
    [{ keyframes: [] }, '(received 0)'],
    [{ keyframes: [3] }, 'Camera path /keyframes/0: must be an object'],
    [{ keyframes: [{ seconds: 1 }] }, 'Camera path /keyframes/0: give a view, a frame or both'],
    [{ keyframes: [{ view: { yaw: 0 }, seconds: 1 }, { view: { yaw: 0 } }] }, 'Camera path /keyframes/1/seconds: set the travel time in seconds from 0 to 60; 0 is a cut.'],
    [{ keyframes: [{ view: { yaw: 0 }, seconds: 61 }] }, '/keyframes/0/seconds'],
    [{ keyframes: [{ view: { yaw: 0 }, seconds: 1, hold: -1 }] }, 'Camera path /keyframes/0/hold: set the hold in seconds from 0 to 60, or omit it for 0.'],
    [{ keyframes: [{ view: { yaw: 0 }, seconds: 1, easing: 'bounce' }] }, 'Camera path /keyframes/0/easing: unknown easing bounce. Use linear or ease-in-out.'],
    [{ keyframes: [{ view: { pitch: 2 }, seconds: 1 }] }, 'Camera path /keyframes/0/view: Camera view pitch must be radians between 0.05 and 1.55.'],
    [{ keyframes: [{ frame: { nodeId: '' }, seconds: 1 }] }, 'Camera path /keyframes/0/frame: must be { nodeId, fit? }'],
    [{ keyframes: [{ frame: { nodeId: 'a', zoom: 2 }, seconds: 1 }] }, 'Camera path /keyframes/0/frame/zoom: unknown field. Use nodeId or fit.'],
    [{ keyframes: [{ frame: { nodeId: 'a', fit: 'yes' }, seconds: 1 }] }, 'Camera path /keyframes/0/frame/fit: must be true or false.'],
    [{ keyframes: [{ frame: { nodeId: 'a' }, view: { target: [0, 0, 0] }, seconds: 1 }] }, 'Camera path /keyframes/0/view/target: cannot be combined with frame; remove one of them.'],
    [{ keyframes: [{ view: { yaw: 0 }, seconds: 1, duration: 1 }] }, 'Camera path /keyframes/0/duration: unknown field. Use view, frame, seconds, hold or easing.'],
    [{ keyframes: [{ view: { yaw: 0 }, seconds: 1 }], loop: 'yes' }, 'Camera path /loop: must be true or false.'],
    [{ keyframes: [{ view: { yaw: 0 }, seconds: 0 }], loop: true }, 'Camera path /loop: a looping path needs seconds or hold above 0'],
  ])('rejects %j with the location and the fix', (value, message) => {
    expect(() => validateCameraPath(value as CameraPath)).toThrow(message);
  });
  it('rejects more than 64 keyframes', () => {
    expect(() => validateCameraPath({ keyframes: Array.from({ length: 65 }, () => ({ view: { yaw: 0 }, seconds: 1 })) })).toThrow('(received 65)');
  });
});
