import { describe, expect, it, vi } from 'vitest';
import { basicControllers, createControllerSlot, createSceneStore, type AssetNode, type ControllerContext, type ControllerPose, type ControllerRegistry, type MotionController, type Vec3 } from '@opsorama/core';

const node = (position: Vec3, extra: Partial<AssetNode> = {}): AssetNode => ({ id: 'robot', kind: 'asset', asset: 'mobile-robot', position, ...extra });
const context = (current: AssetNode, poses: Record<string, ControllerPose> = {}): ControllerContext => ({ node: current, pose: id => poses[id] ?? null });

/** Run a controller for `seconds` at 60 fps and return every pose. */
function run(controller: MotionController, start: ControllerPose, seconds: number, ctx: (time: number) => ControllerContext) {
  const poses: (ControllerPose & { moving?: boolean })[] = [];
  let pose = start;
  for (let frame = 1; frame <= Math.round(seconds * 60); frame++) { pose = controller.update({ delta: 1 / 60, time: frame / 60 }, pose, ctx(frame / 60)); poses.push(pose); }
  return poses;
}
const horizontal = (a: Vec3, b: Vec3) => Math.hypot(b[0] - a[0], b[2] - a[2]);

describe('approach controller', () => {
  it('turns toward the record position, accelerates, brakes and arrives exactly', () => {
    const target = node([4, 0, 0]), controller = basicControllers.approach({ speed: 1, acceleration: 1, turnRate: 4 }, target);
    const poses = run(controller, { position: [0, 0, 0], yaw: 0 }, 8, () => context(target));
    const speeds = poses.slice(1).map((pose, i) => horizontal(poses[i].position, pose.position) * 60);
    expect(Math.max(...speeds)).toBeLessThanOrEqual(1 + 1e-9);
    // It starts slowly while turning from +z to +x, and is moving fast in the middle.
    expect(speeds[5]).toBeLessThan(.2);
    expect(speeds[200]).toBeCloseTo(1, 2);
    expect(poses.at(-1)).toMatchObject({ position: [4, 0, 0], moving: false });
    expect(poses.at(-1)!.yaw).toBeCloseTo(Math.PI / 2);
    // No overshoot.
    expect(Math.max(...poses.map(pose => pose.position[0]))).toBeLessThanOrEqual(4);
  });

  it('retargets when the host moves the record, and can arrive facing the record heading', () => {
    let current = node([2, 0, 0], { rotation: [0, Math.PI, 0] });
    const controller = basicControllers.approach({ arriveYaw: 'record' }, current);
    let pose: ControllerPose = { position: [0, 0, 0], yaw: 0 };
    for (let i = 0; i < 60; i++) pose = controller.update({ delta: 1 / 60, time: i / 60 }, pose, context(current));
    current = { ...current, position: [0, 0, 3] };
    for (let i = 0; i < 600; i++) pose = controller.update({ delta: 1 / 60, time: i / 60 }, pose, context(current));
    expect(pose.position).toEqual([0, 0, 3]);
    expect(Math.cos(pose.yaw)).toBeCloseTo(-1);
    expect(controller.settle!({ position: [9, 0, 9], yaw: 0 }, context(current))).toEqual({ position: [0, 0, 3], yaw: Math.PI, moving: false });
  });

  it('rejects invalid options', () => {
    expect(() => basicControllers.approach({ speed: 0 }, node([0, 0, 0]))).toThrow('speed');
    expect(() => basicControllers.approach({ arriveYaw: 'sideways' }, node([0, 0, 0]))).toThrow('arriveYaw');
    expect(() => basicControllers.follow({}, node([0, 0, 0]))).toThrow('target');
  });
});

describe('follow controller', () => {
  it('trails a moving leader at a distance, holds without one and settles behind it', () => {
    const cart = node([0, 0, -2], { id: 'cart', controller: { kind: 'follow', options: { target: 'robot', distance: 1 } } });
    const controller = basicControllers.follow({ target: 'robot', distance: 1, speed: 3 }, cart);
    const leader = (time: number): ControllerPose => ({ position: [0, 0, time * .8], yaw: 0 });
    const poses = run(controller, { position: [0, 0, -2], yaw: 0 }, 6, time => context(cart, { robot: leader(time) }));
    expect(horizontal(poses.at(-1)!.position, leader(6).position)).toBeCloseTo(1, 1);
    expect(poses.at(-1)!.moving).toBe(true);
    expect(controller.update({ delta: .1, time: 7 }, poses.at(-1)!, context(cart))).toMatchObject({ position: poses.at(-1)!.position, moving: false });
    const settled = controller.settle!(poses.at(-1)!, context(cart, { robot: { position: [5, 0, 5], yaw: Math.PI / 2 } }));
    expect(settled.position[0]).toBeCloseTo(4); expect(settled.position[2]).toBeCloseTo(5);
    expect(settled.yaw).toBeCloseTo(Math.PI / 2);
  });
});

describe('controller slot lifecycle', () => {
  const spy = () => {
    const cancel = vi.fn(), update = vi.fn((_frame, pose: ControllerPose) => ({ ...pose, position: [pose.position[0] + 1, 0, 0] as Vec3, moving: true }));
    const factory = vi.fn((): MotionController => ({ update, cancel }));
    return { cancel, update, factory, registry: { spin: factory } satisfies ControllerRegistry };
  };

  it('starts once per spec, keeps running across node updates and cancels exactly once with a reason', () => {
    const { cancel, factory, registry } = spy(), slot = createControllerSlot();
    const spinning = node([0, 0, 0], { controller: { kind: 'spin', options: { rate: 1 } } });
    slot.assign(spinning, registry); slot.assign({ ...spinning, position: [5, 0, 5] }, registry);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(slot.advance({ delta: .1, time: .1 }, { position: [0, 0, 0], yaw: 0 }, context(spinning))?.position).toEqual([1, 0, 0]);
    // Motion off without a settle method holds the current pose.
    expect(slot.settle({ position: [2, 0, 0], yaw: 1 }, context(spinning))).toEqual({ position: [2, 0, 0], yaw: 1, moving: false });
    slot.assign({ ...spinning, controller: { kind: 'spin', options: { rate: 2 } } }, registry);
    expect(cancel).toHaveBeenLastCalledWith('replaced'); expect(factory).toHaveBeenCalledTimes(2);
    slot.assign({ ...spinning, controller: undefined }, registry);
    expect(cancel).toHaveBeenLastCalledWith('cleared'); expect(slot.active).toBe(false);
    slot.assign(spinning, registry); slot.cancel('removed'); slot.cancel('disposed');
    expect(cancel.mock.calls.map(call => call[0])).toEqual(['replaced', 'cleared', 'removed']);
    expect(slot.advance({ delta: .1, time: .2 }, { position: [0, 0, 0], yaw: 0 }, context(spinning))).toBeNull();
  });

  it('stops a controller that throws or is unknown, and retries only a changed spec', () => {
    const { cancel, update, factory, registry } = spy(), slot = createControllerSlot();
    const spinning = node([0, 0, 0], { controller: { kind: 'spin' } });
    slot.assign(spinning, registry);
    update.mockImplementationOnce(() => { throw new Error('boom'); });
    expect(() => slot.advance({ delta: .1, time: .1 }, { position: [0, 0, 0], yaw: 0 }, context(spinning))).toThrow('boom');
    expect(cancel).toHaveBeenLastCalledWith('error'); expect(slot.active).toBe(false);
    slot.assign({ ...spinning, position: [1, 0, 0] }, registry);
    expect(factory).toHaveBeenCalledTimes(1);
    slot.assign({ ...spinning, controller: { kind: 'spin', options: { retry: true } } }, registry);
    expect(slot.active).toBe(true);
    expect(() => slot.assign({ ...spinning, controller: { kind: 'missing' } }, registry)).toThrow('Unknown controller: missing');
    expect(() => slot.assign({ ...spinning, controller: { kind: 'missing' } }, registry)).not.toThrow();
    expect(slot.active).toBe(false);
  });
});

describe('controller specs in the scene store', () => {
  it('validates, clones and freezes controller specs', () => {
    const store = createSceneStore({ schemaVersion: 1, nodes: [node([0, 0, 0], { controller: { kind: 'follow', options: { target: 'lead', nested: { list: [1, 2] } } } })] });
    const stored = store.getSnapshot().nodes[0] as AssetNode;
    expect(Object.isFrozen(stored.controller?.options?.nested)).toBe(true);
    const bad = (extra: Partial<AssetNode>) => () => store.upsert(node([0, 0, 0], extra));
    expect(bad({ controller: { kind: '' } })).toThrow('kind');
    expect(bad({ controller: { kind: 'x', options: { f: (() => 1) as never } } })).toThrow('plain JSON');
    expect(bad({ controller: { kind: 'x', options: { n: Number.NaN } } })).toThrow('plain JSON');
    expect(bad({ controller: { kind: 'approach' }, route: { points: [[0, 0, 0], [1, 0, 0]], speed: 1 } })).toThrow('both a route and a controller');
    expect(() => store.upsert({ id: 'held', kind: 'asset', asset: 'parcel', attachment: { nodeId: 'robot' }, controller: { kind: 'approach' } })).toThrow('cannot own a controller');
    expect(() => store.upsert({ id: 'z', kind: 'zone', size: [1, 1], controller: { kind: 'approach' } } as never)).toThrow('Only asset nodes');
    store.dispose();
  });

  it('keeps controllers framework-free and wires them through every adapter', async () => {
    const { readFile } = await import('node:fs/promises');
    const core = await readFile('packages/core/src/controller.ts', 'utf8');
    expect(core).not.toMatch(/from\s+['"](?:react|vue|next|zustand|three)/);
    expect(core).not.toMatch(/\b(?:window|document|requestAnimationFrame)\b/);
    for (const file of ['packages/react/src/index.tsx', 'packages/vue/src/index.ts']) expect(await readFile(file, 'utf8')).toMatch(/controllers/);
    expect(await readFile('packages/vue/src/index.ts', 'utf8')).toMatch(/controller: Object as PropType<NodeController>/);
  });
});
