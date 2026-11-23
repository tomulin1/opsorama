import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { AssetNode, SceneNode } from '@opsorama/core';
import type { AssetRegistry } from '../packages/three/src/assets';
import { isProgramLinking, loadProgress, loadStateText } from '../packages/three/src/loading';
import { buildNodeObject } from '../packages/three/src/nodes';
import { canvasPixelRatio, MAX_CANVAS_PIXEL_RATIO, watchPixelRatio } from '../packages/three/src/pixel-ratio';
import { labelClickOrigin } from '../packages/three/src/pointer';
import { bindTurntableDrag } from '../packages/three/src/preview';
import { attachmentAnchorError, buildSceneObject, nodeBuildError, nodeParent } from '../packages/three/src/scene-build';
import { boundsWithin, CORNER_REFIT_TOLERANCE, createCornerMarker, refitCornerMarker, showCornerMarker } from '../packages/three/src/selection-marker';

const box = () => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
const assets: AssetRegistry = {
  crate: () => { const mesh = box(); mesh.castShadow = true; return mesh; },
  broken: () => { throw new Error('the factory exploded.'); },
};
const build = (node: SceneNode) => buildNodeObject(node, { assets, theme: 'light' });
const asset = (id: string, name: string, extra: Partial<AssetNode> = {}): AssetNode => ({ id, kind: 'asset', asset: name, ...extra });

describe('building one scene node', () => {
  it('returns the built model with the shadow policy applied', () => {
    const { object, error } = buildSceneObject(asset('a', 'crate'), true, build);
    expect(error).toBeNull();
    expect((object as THREE.Mesh).isMesh).toBe(true);
    // A contained node is indoor: it neither casts nor receives shadows.
    expect(object.castShadow).toBe(false);
  });
  it('turns a throwing factory into an empty stand-in and an error that names the node', () => {
    const { object, error } = buildSceneObject(asset('dock-7', 'broken'), false, build);
    expect(object).toBeInstanceOf(THREE.Group);
    expect(object.children).toHaveLength(0);
    expect(error?.message).toContain('Scene node "dock-7" could not be built: the factory exploded.');
    expect(error?.message).toContain('until the node changes');
    expect((error?.cause as Error).message).toBe('the factory exploded.');
  });
  it('reports an unknown asset and a failing validate the same way', () => {
    expect(buildSceneObject(asset('x', 'missing'), false, build).error?.message).toMatch(/^Scene node "x" could not be built: /);
    const validated = Object.assign(() => box(), { validate: () => { throw new Error('Option size must be positive.'); } });
    const result = buildSceneObject(asset('y', 'sized'), false, node => buildNodeObject(node, { assets: { sized: validated }, theme: 'light' }));
    expect(result.error?.message).toContain('"y" could not be built: Option size must be positive.');
  });
  it('releases a model that was built before a later step failed', () => {
    const mesh = box(), released = vi.fn(); mesh.geometry.addEventListener('dispose', released);
    // The shadow policy updates world matrices first; a model that breaks there fails after the factory returned.
    const result = buildSceneObject(asset('z', 'crate'), false, () => {
      const object = new THREE.Group(); object.add(mesh);
      object.updateMatrixWorld = () => { throw new Error('broken model'); };
      return object;
    });
    expect(result.error?.message).toContain('broken model');
    expect(released).toHaveBeenCalledTimes(1);
  });
  it('wraps a thrown non-error value', () => {
    expect(nodeBuildError('n', 'plain text').message).toContain('"n" could not be built: plain text');
  });
});

describe('placing a node in the scene graph', () => {
  const root = new THREE.Scene(), owner = new THREE.Group(), container = new THREE.Group(), anchor = new THREE.Group();
  anchor.name = 'anchor-fork'; owner.add(anchor);
  const objects = new Map<string, THREE.Object3D>([['truck', owner], ['hall', container]]);
  const objectOf = (id: string) => objects.get(id);
  it('puts top-level nodes under the root and children under their container', () => {
    expect(nodeParent({ id: 'a', kind: 'group' }, objectOf, root)).toEqual({ parent: root, missingAnchor: null });
    expect(nodeParent({ id: 'a', kind: 'group', parentId: 'hall' }, objectOf, root).parent).toBe(container);
    expect(nodeParent({ id: 'a', kind: 'group', parentId: 'unbuilt' }, objectOf, root).parent).toBeUndefined();
  });
  it('attaches to the named anchor, or to the owner without one', () => {
    expect(nodeParent({ id: 'p', kind: 'group', attachment: { nodeId: 'truck', anchor: 'fork' } }, objectOf, root).parent).toBe(anchor);
    expect(nodeParent({ id: 'p', kind: 'group', attachment: { nodeId: 'truck' } }, objectOf, root).parent).toBe(owner);
    expect(nodeParent({ id: 'p', kind: 'group', attachment: { nodeId: 'unbuilt', anchor: 'fork' } }, objectOf, root)).toEqual({ parent: undefined, missingAnchor: null });
  });
  it('places a node on an anchor the model lacks at the owner and names the anchor', () => {
    const placed = nodeParent({ id: 'p', kind: 'group', attachment: { nodeId: 'truck', anchor: 'roof' } }, objectOf, root);
    expect(placed).toEqual({ parent: owner, missingAnchor: 'roof' });
    const message = attachmentAnchorError('p', 'truck', 'roof').message;
    expect(message).toContain('"p" is attached to anchor "roof" of "truck"');
    expect(message).toContain('use an anchor the model declares');
  });
});

describe('label clicks', () => {
  it('select with the keyboard origin only when activated from the keyboard', () => {
    expect(labelClickOrigin({ detail: 0 })).toBe('keyboard');
    expect(labelClickOrigin({ detail: 1 })).toBe('pointer');
    expect(labelClickOrigin({ detail: 2 })).toBe('pointer');
  });
});

describe('load states', () => {
  it('describe a failed load and keep the share built', () => {
    expect(loadStateText({ phase: 'error', built: 3, total: 10 })).toBe('Scene could not load');
    expect(loadProgress({ phase: 'error', built: 5, total: 10 })).toBeCloseTo(.45);
  });
});

describe('shader compilation readiness', () => {
  const properties = (program: { isReady(): boolean | null } | undefined) => ({ get: () => (program ? { currentProgram: program } : {}) });
  it('waits only while a program reports that it is still linking', () => {
    const material = new THREE.MeshBasicMaterial();
    expect(isProgramLinking(properties({ isReady: () => false }), material)).toBe(true);
    expect(isProgramLinking(properties({ isReady: () => true }), material)).toBe(false);
    // A lost context makes `isReady` return null; a missing program never blocks the load either.
    expect(isProgramLinking(properties({ isReady: () => null }), material)).toBe(false);
    expect(isProgramLinking(properties(undefined), material)).toBe(false);
    expect(isProgramLinking({ get: () => undefined }, material)).toBe(false);
  });
  it('pins the three.js internals it reads: currentProgram on material properties and WebGLProgram.isReady', () => {
    // If this fails after a three.js upgrade, update `isProgramLinking` in loading.ts to the new internals.
    const source = readFileSync('packages/three/node_modules/three/build/three.module.js', 'utf8');
    expect(source).toMatch(/materialProperties\.currentProgram = program;/);
    expect(source).toMatch(/this\.isReady = function \(\) \{\s*if \( programReady === false \) \{\s*programReady = gl\.getProgramParameter\( program, COMPLETION_STATUS_KHR \);/);
    expect(source).toMatch(/function WebGLProperties\(\) \{\s*let properties = new WeakMap\(\);\s*function has\( object \)[\s\S]{0,200}function get\( object \)/);
  });
});

describe('group brackets that follow their contents', () => {
  const boxOf = (min: number, max: number) => new THREE.Box3(new THREE.Vector3(min, 0, min), new THREE.Vector3(max, 1, max));
  it('compare bounds within a tolerance, empty boxes only to empty boxes', () => {
    expect(boundsWithin(boxOf(0, 1), boxOf(.005, 1), CORNER_REFIT_TOLERANCE)).toBe(true);
    expect(boundsWithin(boxOf(0, 1), boxOf(0, 1.5), CORNER_REFIT_TOLERANCE)).toBe(false);
    expect(boundsWithin(new THREE.Box3(), new THREE.Box3(), CORNER_REFIT_TOLERANCE)).toBe(true);
    expect(boundsWithin(new THREE.Box3(), boxOf(0, 1), CORNER_REFIT_TOLERANCE)).toBe(false);
  });
  it('keep the brackets while the contents stay, and replace them without restarting the animation when they move', () => {
    const group = new THREE.Group(), marker = createCornerMarker(boxOf(0, 1), 0); group.add(marker.object);
    showCornerMarker(marker, 'selected', '#ff0000');
    marker.settle = .5; marker.object.scale.set(1.1, 1, 1.1);
    expect(refitCornerMarker(marker, boxOf(0, 1), boxOf(.002, 1), 0)).toBe(marker);
    const released = vi.fn(); (marker.object.children[0] as THREE.Mesh).geometry.addEventListener('dispose', released);
    const next = refitCornerMarker(marker, boxOf(0, 1), boxOf(2, 4), 0);
    expect(next).not.toBe(marker);
    expect(next.object.parent).toBe(group); expect(marker.object.parent).toBeNull(); expect(released).toHaveBeenCalled();
    expect(next.emphasis).toBe('selected'); expect(next.settle).toBe(.5); expect(next.object.scale.x).toBeCloseTo(1.1);
    expect(next.object.visible).toBe(true); expect(next.brackets.color.getHexString()).toBe('ff0000');
    // Showing the same emphasis again keeps the running animation.
    showCornerMarker(next, 'selected', '#ff0000'); expect(next.settle).toBe(.5);
  });
  it('create hidden brackets when a group has none yet', () => {
    const created = refitCornerMarker(null, null, boxOf(0, 1), 0);
    expect(created.object.visible).toBe(false); expect(created.emphasis).toBeNull();
  });
});

describe('canvas pixel ratio', () => {
  class FakeQuery extends EventTarget { constructor(readonly media: string) { super(); } }
  function environment(ratio: number) {
    const queries: FakeQuery[] = [];
    const env = { devicePixelRatio: ratio, matchMedia: (media: string) => { const query = new FakeQuery(media); queries.push(query); return query; } };
    return { env, queries };
  }
  it('clamps the display ratio to the canvas maximum', () => {
    expect(canvasPixelRatio(undefined)).toBe(1); expect(canvasPixelRatio(0)).toBe(1);
    expect(canvasPixelRatio(1.25)).toBe(1.25); expect(canvasPixelRatio(3)).toBe(MAX_CANVAS_PIXEL_RATIO);
  });
  it('reports each change of the display ratio and listens for the next one', () => {
    const { env, queries } = environment(1), listener = vi.fn();
    const stop = watchPixelRatio(listener, env);
    expect(queries.map(query => query.media)).toEqual(['(resolution: 1dppx)']);
    env.devicePixelRatio = 1.5; queries[0].dispatchEvent(new Event('change'));
    expect(listener).toHaveBeenLastCalledWith(1.5);
    expect(queries.map(query => query.media)).toEqual(['(resolution: 1dppx)', '(resolution: 1.5dppx)']);
    // The old query no longer reports.
    queries[0].dispatchEvent(new Event('change')); expect(listener).toHaveBeenCalledTimes(1);
    env.devicePixelRatio = 3; queries[1].dispatchEvent(new Event('change'));
    expect(listener).toHaveBeenLastCalledWith(2);
    stop(); stop();
    queries[2].dispatchEvent(new Event('change')); expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('turning the node preview by hand', () => {
  class FakeCanvas extends EventTarget {
    style = { cursor: 'grab' };
    captured = new Set<number>();
    setPointerCapture(id: number) { this.captured.add(id); }
    hasPointerCapture(id: number) { return this.captured.has(id); }
    releasePointerCapture(id: number) { this.captured.delete(id); }
    send(type: string, props: Partial<PointerEvent> = {}) {
      this.dispatchEvent(Object.assign(new Event(type), { pointerId: 1, isPrimary: true, button: 0, clientX: 100 }, props));
    }
  }
  function setup() {
    const canvas = new FakeCanvas(), turn = vi.fn(), end = vi.fn();
    const drag = bindTurntableDrag(canvas as unknown as HTMLCanvasElement, { turn, end });
    return { canvas, drag, turn, end };
  }
  it('turns with the captured primary pointer and ends on release', () => {
    const { canvas, drag, turn, end } = setup();
    canvas.send('pointerdown'); expect(drag.dragging()).toBe(true); expect(canvas.captured.has(1)).toBe(true); expect(canvas.style.cursor).toBe('grabbing');
    canvas.send('pointermove', { clientX: 130 }); expect(turn).toHaveBeenLastCalledWith(30);
    canvas.send('pointerup'); expect(drag.dragging()).toBe(false); expect(canvas.captured.size).toBe(0); expect(end).toHaveBeenCalledTimes(1);
    expect(canvas.style.cursor).toBe('grab');
  });
  it('ends the drag when the capture is lost, so frames stop being requested', () => {
    const { canvas, drag, turn, end } = setup();
    canvas.send('pointerdown'); canvas.captured.clear(); canvas.send('lostpointercapture');
    expect(drag.dragging()).toBe(false); expect(end).toHaveBeenCalledTimes(1);
    canvas.send('pointermove', { clientX: 160 }); expect(turn).not.toHaveBeenCalled();
    canvas.send('pointerdown'); canvas.send('pointercancel'); expect(drag.dragging()).toBe(false); expect(end).toHaveBeenCalledTimes(2);
  });
  it('ignores secondary pointers, other buttons and a second press', () => {
    const { canvas, drag, turn } = setup();
    canvas.send('pointerdown', { isPrimary: false, pointerId: 2 }); expect(drag.dragging()).toBe(false);
    canvas.send('pointerdown', { button: 2 }); expect(drag.dragging()).toBe(false);
    canvas.send('pointerdown'); canvas.send('pointerdown', { pointerId: 3 }); canvas.send('pointermove', { pointerId: 3, clientX: 150 });
    expect(turn).not.toHaveBeenCalled(); expect(canvas.captured.has(3)).toBe(false);
  });
  it('releases a running capture and removes its listeners on dispose', () => {
    const { canvas, drag, turn } = setup();
    canvas.send('pointerdown'); drag.dispose();
    expect(drag.dragging()).toBe(false); expect(canvas.captured.size).toBe(0);
    canvas.send('pointerdown'); canvas.send('pointermove', { clientX: 150 }); expect(turn).not.toHaveBeenCalled();
  });
});
