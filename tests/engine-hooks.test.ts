import { describe, expect, it, vi } from 'vitest';
import { createElement, type FunctionComponent, type ReactNode } from 'react';
import { renderToString as renderReact } from 'react-dom/server';
import { createSSRApp, defineComponent, h } from 'vue';
import { renderToString as renderVue } from 'vue/server-renderer';
import { Ray, Vector3 } from 'three';
import { createSceneStore, type SceneNode, type SceneStore } from '@opsorama/core';
import { createFrameClock, createScenePointerEvent, DEFAULT_MAX_FRAME_STEPS, FRAME_STEP_RANGE, hoverTransitions, nearestNodeHit, nodeAncestors, resolvePointerTarget, setupRendererPlugins, validateFrameListener, validateRendererPlugins, type FrameClockState, type RendererPlugin, type RendererPluginContext, type SceneFrame } from '@opsorama/three';
import { DashboardProvider as ReactProvider, SceneCanvas as ReactCanvas, useSceneFrame as useReactSceneFrame } from '@opsorama/react';
// Vue composables, aliased so the React hook lint rules do not apply to them.
import { DashboardProvider as VueProvider, SceneCanvas as VueCanvas, useSceneFrame as vueSceneFrame } from '@opsorama/vue';

const running: FrameClockState = { speed: 1, paused: false, animated: true, hidden: false };

describe('frame clock', () => {
  it('runs fixed steps from accumulated real time times speed and keeps the remainder', () => {
    const clock = createFrameClock(error => { throw error; }), frames: SceneFrame[] = [];
    clock.add(frame => frames.push(frame), { step: 1 / 60 });
    clock.steps(.05, running);
    expect(frames.map(frame => frame.frame)).toEqual([1, 2, 3]);
    expect(frames.every(frame => frame.delta === 1 / 60 && frame.dropped === 0 && !frame.paused && frame.animated)).toBe(true);
    expect(frames[2].time).toBeCloseTo(.05);
    // 10 ms is less than a step; the next 10 ms complete it.
    clock.steps(.01, running); expect(frames).toHaveLength(3);
    clock.steps(.01, running); expect(frames).toHaveLength(4); expect(frames[3].time).toBeCloseTo(4 / 60);
    // Twice the speed: twice the steps for the same real time.
    clock.steps(1 / 30, { ...running, speed: 2 }); expect(frames).toHaveLength(8);
    // Per-frame listeners never run from steps, fixed-step listeners never from frames.
    clock.frame(.016, running); expect(frames).toHaveLength(8);
  });

  it('does not step while paused or hidden, keeps the accumulator, and steps with motion off', () => {
    const clock = createFrameClock(error => { throw error; }), steps: SceneFrame[] = [];
    clock.add(frame => steps.push(frame), { step: .1 });
    clock.steps(.05, running);
    clock.steps(.5, { ...running, paused: true }); clock.steps(.5, { ...running, hidden: true });
    expect(steps).toHaveLength(0);
    // The 50 ms before the pause still count.
    clock.steps(.05, { ...running, animated: false });
    expect(steps).toHaveLength(1); expect(steps[0].animated).toBe(false);
  });

  it('caps steps per frame at maxSteps and reports the dropped scene time', () => {
    const clock = createFrameClock(error => { throw error; }), steps: SceneFrame[] = [], capped: SceneFrame[] = [];
    clock.add(frame => steps.push(frame), { step: 1 / 240 });
    clock.add(frame => capped.push(frame), { step: 1 / 240, maxSteps: 1 });
    // 50 ms at speed 3 is 36 steps of 1/240 s.
    clock.steps(.05, { ...running, speed: 3 });
    expect(steps).toHaveLength(DEFAULT_MAX_FRAME_STEPS); expect(capped).toHaveLength(1);
    expect(steps[0].dropped).toBeCloseTo(32 / 240); expect(capped[0].dropped).toBeCloseTo(35 / 240);
    // Dropped time is gone: the next short frame runs only its own steps.
    clock.steps(1 / 120, running); expect(steps).toHaveLength(6); expect(steps[5].dropped).toBe(0);
  });

  it('gives per-frame listeners real time times speed, 0 while paused, and nothing while hidden', () => {
    const clock = createFrameClock(error => { throw error; }), frames: SceneFrame[] = [];
    clock.add(frame => frames.push(frame));
    clock.frame(.02, { ...running, speed: 1.5 }); clock.frame(.02, { ...running, paused: true }); clock.frame(.02, { ...running, hidden: true });
    expect(frames.map(frame => [frame.delta, frame.paused, frame.frame])).toEqual([[.03, false, 1], [0, true, 2]]);
    expect(frames[1].time).toBeCloseTo(.03);
  });

  it('reports a throwing listener and keeps calling the others', () => {
    const errors: unknown[] = [], clock = createFrameClock(error => errors.push(error)), calls: string[] = [];
    clock.add(() => { calls.push('a'); throw new Error('boom'); });
    clock.add(() => calls.push('b'));
    clock.add(() => { throw new Error('step boom'); }, { step: 1 / 60 });
    clock.frame(.016, running); clock.frame(.016, running); clock.steps(1 / 30, running);
    expect(calls).toEqual(['a', 'b', 'a', 'b']);
    expect(errors.map(error => (error as Error).message)).toEqual(['boom', 'boom', 'step boom', 'step boom']);
  });

  it('is safe to unsubscribe and subscribe from inside a listener', () => {
    const clock = createFrameClock(error => { throw error; }), calls: string[] = [];
    let stopB = () => undefined as void, stopSelf = () => undefined as void;
    clock.add(() => { calls.push('a'); stopB(); stopB(); clock.add(() => calls.push('late')); });
    stopB = clock.add(() => calls.push('b'));
    clock.frame(.016, running);
    expect(calls).toEqual(['a']);
    clock.frame(.016, running);
    expect(calls).toEqual(['a', 'a', 'late']);
    // A fixed-step listener that unsubscribes itself runs no further steps of the frame.
    let count = 0; stopSelf = clock.add(() => { count++; stopSelf(); }, { step: 1 / 60 });
    clock.steps(.05, running); expect(count).toBe(1);
    clock.clear(); expect(clock.size).toBe(0);
  });

  it('validates listeners and options with actionable messages', () => {
    expect(() => validateFrameListener(null)).toThrow('onFrame needs a listener function; got null.');
    expect(() => validateFrameListener(() => undefined, { step: 1 })).toThrow('onFrame step must be between 1/240 and 1/10 seconds');
    expect(() => validateFrameListener(() => undefined, { step: 0 })).toThrow('Pass a fixed step such as 1 / 60');
    expect(() => validateFrameListener(() => undefined, { maxSteps: 2 })).toThrow('maxSteps applies only to fixed-step listeners');
    expect(() => validateFrameListener(() => undefined, { step: 1 / 60, maxSteps: 1.5 })).toThrow('maxSteps must be an integer from 1 to 60');
    for (const step of [FRAME_STEP_RANGE.min, FRAME_STEP_RANGE.max, 1 / 60]) expect(() => validateFrameListener(() => undefined, { step })).not.toThrow();
    expect(() => createFrameClock(() => undefined).add(() => undefined, { step: 2 })).toThrow('onFrame step');
  });
});

describe('pointer events', () => {
  const nodes: SceneNode[] = [
    { id: 'hall', kind: 'asset', asset: 'building', position: [0, 0, 0] },
    { id: 'room', kind: 'asset', asset: 'room', parentId: 'hall', position: [0, 0, 0] },
    { id: 'desk', kind: 'asset', asset: 'desk', parentId: 'room', entityId: 'D-1', position: [0, 0, 0] },
    { id: 'loop-a', kind: 'asset', asset: 'box', parentId: 'loop-b', position: [0, 0, 0] },
    { id: 'loop-b', kind: 'asset', asset: 'box', parentId: 'loop-a', position: [0, 0, 0] },
    { id: 'orphan', kind: 'asset', asset: 'box', parentId: 'missing', position: [0, 0, 0] },
  ];
  const byId = new Map(nodes.map(node => [node.id, node])), getNode = (id: string) => byId.get(id);
  const input = { pointerType: 'mouse', button: 0, shiftKey: true, ctrlKey: false, altKey: true, metaKey: false };

  it('lists the parentId chain nearest first and stops at unknown parents and cycles', () => {
    expect(nodeAncestors('desk', getNode)).toEqual(['room', 'hall']);
    expect(nodeAncestors('hall', getNode)).toEqual([]);
    expect(nodeAncestors('orphan', getNode)).toEqual([]);
    expect(nodeAncestors('loop-a', getNode)).toEqual(['loop-b']);
    expect(nodeAncestors('unknown', getNode)).toEqual([]);
  });

  it('builds a frozen event with entity, ancestors, modifiers and a copied point', () => {
    const point: [number, number, number] = [1, 2, 3];
    const { event, selectionPrevented } = createScenePointerEvent('down', { nodeId: 'desk', point }, input, 'canvas', getNode);
    expect(event).toMatchObject({ type: 'down', nodeId: 'desk', entityId: 'D-1', ancestors: ['room', 'hall'], point: [1, 2, 3], pointerType: 'mouse', button: 0, shiftKey: true, altKey: true, ctrlKey: false, metaKey: false, source: 'canvas' });
    point[0] = 9; expect(event.point).toEqual([1, 2, 3]);
    expect(Object.isFrozen(event) && Object.isFrozen(event.ancestors) && Object.isFrozen(event.point)).toBe(true);
    // preventSelection only affects clicks.
    event.preventSelection(); expect(selectionPrevented()).toBe(false);
    const click = createScenePointerEvent('click', { nodeId: null, point: [4, 0, 5] }, input, 'canvas', getNode);
    expect(click.event).toMatchObject({ nodeId: null, ancestors: [], point: [4, 0, 5] }); expect('entityId' in click.event).toBe(false);
    expect(click.selectionPrevented()).toBe(false); click.event.preventSelection(); expect(click.selectionPrevented()).toBe(true);
  });

  it('reports label events, keyboard activation as mouse, and no button for moves', () => {
    const label = createScenePointerEvent('click', { nodeId: 'room', point: [0, 0, 0] }, { ...input, pointerType: '' }, 'label', getNode).event;
    expect(label).toMatchObject({ source: 'label', pointerType: 'mouse', ancestors: ['hall'] });
    expect(createScenePointerEvent('move', { nodeId: 'hall', point: null }, { ...input, pointerType: 'pen', button: 0 }, 'canvas', getNode).event).toMatchObject({ button: -1, pointerType: 'pen' });
    expect(createScenePointerEvent('up', { nodeId: null, point: null }, { ...input, pointerType: 'touch', button: 0 }, 'canvas', getNode).event.pointerType).toBe('touch');
  });

  it('takes the nearest hit of a known node and the ground plane point on a miss', () => {
    const hit = (nodeId: unknown, z: number) => ({ object: { userData: nodeId === undefined ? {} : { nodeId } }, point: { x: 1, y: .5, z } });
    // A selection bracket without a node ID and an unknown node are passed over; non-selectable nodes count.
    expect(nearestNodeHit([hit(undefined, 1), hit('gone', 2), hit('hall', 3), hit('desk', 4)], id => byId.has(id))).toEqual({ nodeId: 'hall', point: [1, .5, 3] });
    const down = new Ray(new Vector3(0, 10, 0), new Vector3(.6, -.8, 0));
    expect(resolvePointerTarget([], down, () => true)).toEqual({ nodeId: null, point: [7.5, 0, 0] });
    expect(resolvePointerTarget([hit('desk', 2)], down, () => true)).toEqual({ nodeId: 'desk', point: [1, .5, 2] });
    // A ray above the horizon never meets the ground.
    expect(resolvePointerTarget([], new Ray(new Vector3(0, 10, 0), new Vector3(0, 1, 0)), () => true)).toEqual({ nodeId: null, point: null });
  });

  it('turns a change of the node under the pointer into leave, then enter', () => {
    expect(hoverTransitions(null, 'a')).toEqual([{ type: 'enter', nodeId: 'a' }]);
    expect(hoverTransitions('a', 'b')).toEqual([{ type: 'leave', nodeId: 'a' }, { type: 'enter', nodeId: 'b' }]);
    expect(hoverTransitions('a', null)).toEqual([{ type: 'leave', nodeId: 'a' }]);
    expect(hoverTransitions('a', 'a')).toEqual([]); expect(hoverTransitions(null, null)).toEqual([]);
  });
});

describe('renderer plugins', () => {
  const context = (plugin: RendererPlugin) => ({ name: plugin.name }) as unknown as RendererPluginContext;
  const plugin = (name: string, log: string[], fail = false): RendererPlugin => ({ name, setup: () => { log.push(`setup ${name}`); if (fail) throw new Error('no scene'); return () => log.push(`cleanup ${name}`); } });

  it('sets plugins up in order and cleans them up once in reverse order', () => {
    const log: string[] = [], errors: Error[] = [];
    const host = setupRendererPlugins([plugin('a', log), { name: 'no-cleanup', setup: () => { log.push('setup no-cleanup'); } }, plugin('b', log)], context, error => errors.push(error));
    expect(log).toEqual(['setup a', 'setup no-cleanup', 'setup b']);
    host.dispose(); host.dispose();
    expect(log.slice(3)).toEqual(['cleanup b', 'cleanup a']); expect(errors).toEqual([]);
  });

  it('cleans up the plugins set up so far and names the plugin when a setup throws', () => {
    const log: string[] = [];
    let thrown: Error | undefined;
    try { setupRendererPlugins([plugin('a', log), plugin('b', log), plugin('broken', log, true), plugin('never', log)], context, () => undefined); } catch (error) { thrown = error as Error; }
    expect(log).toEqual(['setup a', 'setup b', 'setup broken', 'cleanup b', 'cleanup a']);
    expect(thrown?.message).toBe('Renderer plugin "broken" failed during setup: no scene. The renderer was disposed; fix the plugin or remove it from plugins.');
    expect((thrown?.cause as Error).message).toBe('no scene');
  });

  it('reports a throwing cleanup and still runs the others', () => {
    const log: string[] = [], errors: Error[] = [];
    const host = setupRendererPlugins([plugin('a', log), { name: 'bad', setup: () => () => { throw new Error('lost.'); } }], context, error => errors.push(error));
    host.dispose();
    expect(log).toEqual(['setup a', 'cleanup a']); expect(errors.map(error => error.message)).toEqual(['Renderer plugin "bad" failed during cleanup: lost.']);
  });

  it('rejects duplicate names and malformed plugins with actionable messages', () => {
    const setup = () => undefined;
    expect(() => validateRendererPlugins([{ name: 'ring', setup }, { name: 'ring', setup }])).toThrow('Two renderer plugins are named "ring". Plugin names must be unique within one renderer');
    expect(() => validateRendererPlugins([{ name: ' ', setup }])).toThrow('Renderer plugin at index 0 needs a non-empty string name');
    expect(() => validateRendererPlugins([{ name: 'ring' }])).toThrow('Renderer plugin "ring" needs a setup(context) function.');
    expect(() => validateRendererPlugins({ name: 'ring', setup })).toThrow('RendererOptions.plugins must be an array');
    expect(() => validateRendererPlugins([{ name: 'a', setup }, { name: 'b', setup }])).not.toThrow();
  });
});

describe('engine hooks in the adapters', () => {
  it('render on the server without subscribing and reject invalid frame options', async () => {
    const store = createSceneStore(), listener = vi.fn(), plugins: RendererPlugin[] = [{ name: 'ring', setup: vi.fn() }];
    const Provider = ReactProvider as FunctionComponent<{ store: SceneStore; children?: ReactNode }>;
    function Probe({ step }: { step?: number }) { useReactSceneFrame(listener, step === undefined ? {} : { step }); return createElement('output', null, 'frame'); }
    expect(renderReact(createElement(Provider, { store }, createElement(ReactCanvas, { assets: {}, plugins, onPointer: listener }, createElement(Probe, { step: 1 / 60 }))))).toContain('frame');
    expect(() => renderReact(createElement(Provider, { store }, createElement(Probe, { step: 5 })))).toThrow('onFrame step must be between 1/240 and 1/10 seconds');
    expect(() => renderReact(createElement(Probe))).toThrow('A DashboardProvider is required.');
    const VueProbe = defineComponent({ props: { step: Number }, setup(props) { vueSceneFrame(listener, () => props.step === undefined ? {} : { step: props.step }); return () => h('output', 'frame'); } });
    expect(await renderVue(createSSRApp({ render: () => h(VueProvider, { store }, () => h(VueCanvas, { assets: {}, plugins, onPointer: listener }, () => h(VueProbe, { step: 1 / 120 }))) }))).toContain('frame');
    // Vue also logs the setup error; keep the test output clean.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(renderVue(createSSRApp({ render: () => h(VueProvider, { store }, () => h(VueProbe, { step: 0 })) }))).rejects.toThrow('onFrame step must be between');
    warn.mockRestore();
    expect(listener).not.toHaveBeenCalled(); expect(plugins[0].setup).not.toHaveBeenCalled();
  });
});
