import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createElement, type FunctionComponent, type ReactNode } from 'react';
import { renderToString as renderReact } from 'react-dom/server';
import { createSSRApp, h } from 'vue';
import { renderToString as renderVue } from 'vue/server-renderer';
import { createControllerSlot, createSceneStore, isContained, isMotionNode, isNodeVisible, nodeView, setNodeView, validateParents, validateScene, type AssetNode, type GroupNode, type LineNode, type SceneNode, type SceneStore, type ShapeNode } from '@opsorama/core';
import { applyShadowPolicy, createGlowHighlight, createInstanceBatcher, disposeObject, INSTANCING_MIN_COUNT, mergeStaticParts, previewNodes, isSelectableNode, selectionTarget } from '@opsorama/three';
import * as ReactAdapter from '@opsorama/react';
import * as VueAdapter from '@opsorama/vue';
import { buildNodeObject, contentBounds, LINE_DASH, lineColor, PRIMITIVE_COLORS, shapeColor, unitShapeGeometry } from '../packages/three/src/nodes';
import { chartValues, peak, primitivesDefinition, SERIES } from '../apps/site/examples/primitives-data';

const context = { assets: {}, theme: 'light' as const };
const box = (id: string, size: [number, number, number], extra: Partial<ShapeNode> = {}): ShapeNode => ({ id, kind: 'shape', shape: { type: 'box', size }, ...extra });
const group: GroupNode = { id: 'g', kind: 'group', position: [2, 0, 0] };
const index = (nodes: readonly SceneNode[]) => new Map(nodes.map(node => [node.id, node]));
const meshesOf = (object: THREE.Object3D) => { const list: THREE.Mesh[] = []; object.traverse(child => { if ((child as THREE.Mesh).isMesh) list.push(child as THREE.Mesh); }); return list; };
/** Builds nodes as the renderer does: shadow policy, static merge, picking ids, then registers them with a batcher. */
function mount(nodes: readonly SceneNode[]) {
  const scene = new THREE.Scene(), batcher = createInstanceBatcher(scene);
  const objects = nodes.map((node, i) => {
    const object = buildNodeObject(node, context); applyShadowPolicy(object, { interior: false }); mergeStaticParts(object);
    object.position.set(i * 3, 0, 0); object.traverse(child => { child.userData.nodeId = node.id; }); scene.add(object); return object;
  });
  scene.updateMatrixWorld(true); objects.forEach(object => batcher.add(object)); batcher.update();
  return { scene, batcher, objects };
}
/** Every geometry and material under `object`, with a flag set when it is disposed. */
function trackDisposal(object: THREE.Object3D) {
  const resources = new Set<THREE.BufferGeometry | THREE.Material>(), disposed = new Set<unknown>();
  object.traverse(child => { const mesh = child as THREE.Mesh; if (mesh.geometry) resources.add(mesh.geometry); if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(material => resources.add(material)); });
  resources.forEach(resource => resource.addEventListener('dispose', () => disposed.add(resource)));
  return { count: resources.size, all: () => [...resources].every(resource => disposed.has(resource)) };
}

describe('shape, line and group nodes in the store', () => {
  it('accepts every kind, motion on shapes and groups, and deep-freezes their fields', () => {
    const route = { points: [[0, 0, 0], [4, 0, 0]] as const, speed: 1 };
    const store = createSceneStore({ schemaVersion: 1, nodes: [group, box('b', [1, 2, 1], { parentId: 'g', controller: { kind: 'approach' }, transfer: { seconds: .5 } }), { id: 'l', kind: 'line', parentId: 'g', points: [[0, 0, 0], [1, 1, 1]], width: .1, dashed: true }, { ...group, id: 'mover', route }] });
    const [stored, shape, line, mover] = store.getSnapshot().nodes as [GroupNode, ShapeNode, LineNode, GroupNode];
    expect(stored.kind).toBe('group');
    expect(Object.isFrozen(shape.shape) && Object.isFrozen((shape.shape as { size: unknown }).size) && Object.isFrozen(shape.controller) && Object.isFrozen(shape.transfer)).toBe(true);
    expect(Object.isFrozen(line.points) && Object.isFrozen(line.points[0])).toBe(true);
    expect(Object.isFrozen(mover.route) && Object.isFrozen(mover.route!.points[0])).toBe(true);
    expect([group, shape, line].map(isMotionNode)).toEqual([true, true, false]);
  });

  it('starts controllers on shapes and groups through the same slot as assets', () => {
    const slot = createControllerSlot(), started: string[] = [];
    slot.assign({ ...group, controller: { kind: 'spin' } }, { spin: (_, node) => { started.push(node.kind); return { update: (_frame, pose) => pose }; } });
    expect(slot.active).toBe(true); expect(started).toEqual(['group']);
    slot.cancel('cleared');
  });

  it('reports each problem of a shape and a line with a path, a rule and a fix', () => {
    const problems = validateScene({ schemaVersion: 1, nodes: [
      { id: 's', kind: 'shape', shape: { type: 'sphre', radius: 1 } },
      { id: 'b', kind: 'shape', shape: { type: 'box', size: [1, -1, 1] }, opacity: 1.5 },
      { id: 'c', kind: 'shape', shape: { type: 'cylinder', radiusTop: 0, radiusBottom: 0, height: 1 } },
      { id: 'l', kind: 'line', points: [[0, 0, 0]], width: -1, dashed: 1, route: { points: [[0, 0, 0], [1, 0, 0]], speed: 1 } },
    ] });
    const at = (path: string) => problems.find(problem => problem.path === path);
    expect(at('/nodes/0/shape/type')).toMatchObject({ rule: 'shape', nodeId: 's', fix: expect.stringContaining('Did you mean "sphere"?') });
    expect(at('/nodes/1/shape/size')).toMatchObject({ rule: 'shape', fix: expect.stringContaining('each greater than 0') });
    expect(at('/nodes/1/opacity')).toMatchObject({ rule: 'opacity', fix: expect.stringContaining('from 0 (invisible) to 1') });
    expect(at('/nodes/2/shape/radiusTop')).toMatchObject({ rule: 'shape', fix: expect.stringContaining('greater than 0') });
    expect(at('/nodes/3/points')).toMatchObject({ rule: 'line-points' });
    expect(at('/nodes/3/width')).toMatchObject({ rule: 'line-width', fix: expect.stringContaining('from 0 to 5') });
    expect(at('/nodes/3/dashed')).toMatchObject({ rule: 'field-type' });
    expect(at('/nodes/3/route')).toMatchObject({ rule: 'motion-owner', fix: expect.stringContaining('asset, shape or group') });
  });
});

describe('groups as containers', () => {
  const child = box('child', [1, 1, 1], { parentId: group.id });

  it('are always open: children show while the group shows, and a closed asset above still hides them', () => {
    const building: AssetNode = { id: 'hall', kind: 'asset', asset: 'building' };
    const inner: GroupNode = { ...group, id: 'inner', parentId: building.id }, nested = { ...child, id: 'nested', parentId: inner.id };
    const nodes = [group, child, building, inner, nested];
    expect(nodeView(group)).toBe('open');
    expect(isNodeVisible(child, nodes)).toBe(true);
    expect(isNodeVisible(nested, nodes)).toBe(false);
    expect(isNodeVisible(nested, [group, child, { ...building, view: 'open' }, inner, nested])).toBe(true);
    const store = createSceneStore({ schemaVersion: 1, nodes: [group, child] });
    expect(() => setNodeView(store, group.id, 'closed')).toThrow('only asset nodes have a view');
    store.remove(group.id); expect(store.getSnapshot().nodes).toEqual([]);
  });

  it('accept children; shapes, lines and other kinds do not', () => {
    expect(() => validateParents([group, child])).not.toThrow();
    expect(() => validateParents([box('s', [1, 1, 1]), { ...child, parentId: 's' }])).toThrow('Parent s of child must be an asset or group node; it is a shape node');
    expect(() => validateParents([{ id: 'l', kind: 'line', points: [[0, 0, 0], [1, 0, 0]] }, { ...child, parentId: 'l' }])).toThrow('Only assets and groups can contain children');
  });

  it('keep the shadow policy: only asset containers make their contents indoor', () => {
    const building: AssetNode = { id: 'hall', kind: 'asset', asset: 'building', view: 'open' };
    const indoorGroup: GroupNode = { ...group, id: 'indoor', parentId: building.id }, indoorChild = { ...child, id: 'indoor-child', parentId: indoorGroup.id };
    const carried = box('carried', [1, 1, 1], { attachment: { nodeId: child.id } });
    const byId = index([group, child, building, indoorGroup, indoorChild, carried]);
    expect(isContained(group, byId)).toBe(false); expect(isContained(child, byId)).toBe(false); expect(isContained(carried, byId)).toBe(false);
    expect(isContained(indoorGroup, byId)).toBe(true); expect(isContained(indoorChild, byId)).toBe(true);
    // A missing parent still counts as a container, as before.
    expect(isContained({ ...child, parentId: 'missing' }, byId)).toBe(true);
  });

  it('bubble selection from a node that is not selectable to the nearest selectable group, and stop at assets', () => {
    const nodes = index([
      { ...group, id: 'chart' }, { ...group, id: 'series', parentId: 'chart', entityId: 'series:a' }, box('bar', [1, 1, 1], { parentId: 'series' }),
      box('own', [1, 1, 1], { parentId: 'series', selectable: true }), { id: 'cabinet', kind: 'asset', asset: 'equipment-cabinet', selectable: true }, box('inside', [1, 1, 1], { parentId: 'cabinet' }),
      { ...group, id: 'loose' }, box('free', [1, 1, 1], { parentId: 'loose' }),
    ]);
    const getNode = (id: string) => nodes.get(id);
    expect(selectionTarget('bar', getNode)).toBe('series');
    expect(selectionTarget('own', getNode)).toBe('own');
    expect(selectionTarget('series', getNode)).toBe('series');
    expect(selectionTarget('inside', getNode)).toBeUndefined();
    expect(selectionTarget('free', getNode)).toBeUndefined();
    expect(selectionTarget('unknown', getNode)).toBeUndefined();
  });

  it('keeps a node with an entityId out of pointer selection with selectable: false', () => {
    expect([isSelectableNode({ entityId: 'shop' }), isSelectableNode({ selectable: true }), isSelectableNode({}), isSelectableNode({ entityId: 'shop', selectable: false })]).toEqual([true, true, false, false]);
    // A floor area with records inside a selectable group: a click passes it by and selects the group.
    const nodes = index([{ ...group, id: 'site', entityId: 'site' }, box('floor', [4, .1, 4], { parentId: 'site', entityId: 'area:shop', selectable: false })]);
    expect(selectionTarget('floor', id => nodes.get(id))).toBe('site');
  });

  it('measure their contents for the selection marker in their own coordinates', () => {
    const root = buildNodeObject(group, context), part = buildNodeObject(box('b', [2, 3, 1]), context);
    root.position.set(10, 0, 0); part.position.set(1, 0, 0); root.add(part);
    const bounds = contentBounds(root);
    [0, 0, -.5].forEach((value, axis) => expect(bounds.min.getComponent(axis)).toBeCloseTo(value));
    [2, 3, .5].forEach((value, axis) => expect(bounds.max.getComponent(axis)).toBeCloseTo(value));
    expect(contentBounds(buildNodeObject(group, context)).isEmpty()).toBe(true);
  });

  it('glow over the meshes of the nodes inside them, renewed on every call', () => {
    const scene = new THREE.Scene(), glow = createGlowHighlight(scene, () => true), shells = () => scene.getObjectByName('selection-glow')!.children;
    const root = buildNodeObject(group, context); root.userData.nodeId = group.id; scene.add(root);
    const part = (id: string) => { const object = buildNodeObject(box(id, [1, 1, 1]), context); object.traverse(child => { child.userData.nodeId = id; }); root.add(object); return object; };
    part('a');
    glow.show('selected', root, '#4779ed');
    expect(shells()).toHaveLength(0);
    glow.show('selected', root, '#4779ed', { descendants: true });
    expect(shells()).toHaveLength(1);
    part('b'); glow.show('selected', root, '#4779ed', { descendants: true });
    expect(shells()).toHaveLength(2);
    glow.show('selected', null, '#4779ed'); expect(shells()).toHaveLength(0);
    glow.dispose();
  });

  it('lose their motion in a node preview', () => {
    const copy = previewNodes([{ ...group, route: { points: [[0, 0, 0], [1, 0, 0]], speed: 1 } }, { ...child, controller: { kind: 'approach' } }], group.id);
    expect(copy.map(node => node.id)).toEqual([group.id, child.id]);
    expect(copy.every(node => !isMotionNode(node) || (node.route === undefined && node.controller === undefined))).toBe(true);
  });
});

describe('building shapes and lines', () => {
  it('scales one unit geometry per shape type, standing on the origin', () => {
    const { geometry, scale, height } = unitShapeGeometry({ type: 'box', size: [2, 3, 4] });
    geometry.computeBoundingBox();
    expect(geometry.boundingBox!.min.toArray()).toEqual([-.5, 0, -.5]); expect(scale).toEqual([2, 3, 4]); expect(height).toBe(3);
    const sphere = buildNodeObject({ id: 's', kind: 'shape', shape: { type: 'sphere', radius: .5 } }, context);
    expect(new THREE.Box3().setFromObject(sphere).min.y).toBeCloseTo(0); expect(sphere.userData.labelHeight).toBeCloseTo(1.3);
    const cone = unitShapeGeometry({ type: 'cylinder', radiusTop: 0, radiusBottom: .4, height: 2 });
    expect(cone.scale).toEqual([.4, 2, .4]);
  });

  it('draws equal shapes of any size and color as one instanced batch, and never transparent ones', () => {
    const shapes: SceneNode[] = [box('a', [1, 1, 1]), box('b', [.5, 3, .5], { color: '#ff0000' }), box('c', [2, .2, 1], { state: 'warning' }), box('d', [1, 4, 1], { color: '#00ff00' })];
    const { batcher } = mount(shapes);
    expect(batcher.stats()).toEqual({ batches: 1, instances: INSTANCING_MIN_COUNT });
    // Cylinders share a batch only with the same radius ratio; spheres never batch with boxes.
    const cylinder = (id: string, radiusTop: number, radiusBottom: number, height: number): ShapeNode => ({ id, kind: 'shape', shape: { type: 'cylinder', radiusTop, radiusBottom, height } });
    expect(mount([cylinder('a', .25, .5, 1), cylinder('b', .5, 1, 2), cylinder('c', .1, .2, 3), cylinder('d', .3, .6, .5)]).batcher.stats()).toEqual({ batches: 1, instances: 4 });
    expect(mount([cylinder('a', .25, .5, 1), cylinder('b', .5, .5, 2), cylinder('c', 0, .2, 3), cylinder('d', .3, .2, .5)]).batcher.stats()).toEqual({ batches: 0, instances: 0 });
    expect(mount([...shapes.slice(0, 2), { id: 's1', kind: 'shape', shape: { type: 'sphere', radius: 1 } }, { id: 's2', kind: 'shape', shape: { type: 'sphere', radius: 2 } }]).batcher.stats()).toEqual({ batches: 0, instances: 0 });
    const transparent = mount(shapes.map(shape => ({ ...shape, opacity: .5 }) as ShapeNode));
    expect(transparent.batcher.stats()).toEqual({ batches: 0, instances: 0 });
    expect(meshesOf(transparent.objects[0]).every(mesh => (mesh.material as THREE.Material).transparent && !mesh.castShadow)).toBe(true);
  });

  it('releases every geometry and material, and the batches with them', () => {
    const nodes: SceneNode[] = [box('a', [1, 1, 1]), box('b', [1, 2, 1]), box('c', [1, 3, 1]), box('d', [1, 4, 1]), { id: 'tube', kind: 'line', points: [[0, 0, 0], [2, 0, 0], [2, 0, 2]], width: .2, dashed: true }, { id: 'thin', kind: 'line', points: [[0, 0, 0], [1, 1, 1]], dashed: true }, group];
    const { batcher, objects } = mount(nodes), tracked = objects.map(trackDisposal);
    expect(tracked.slice(0, 6).every(item => item.count === 2)).toBe(true); expect(tracked[6].count).toBe(0);
    objects.forEach(object => { batcher.remove(object); object.removeFromParent(); disposeObject(object); });
    expect(tracked.every(item => item.all())).toBe(true);
    expect(batcher.stats()).toEqual({ batches: 0, instances: 0 });
  });

  it('builds wide lines as a lit, pickable tube and width 0 as a 1-pixel line, dashed or not', () => {
    const points: LineNode['points'] = [[0, 0, 0], [3, 0, 0], [3, 0, 3]];
    const tube = buildNodeObject({ id: 't', kind: 'line', points, width: .2 }, context).children[0] as THREE.Mesh;
    expect(tube).toBeInstanceOf(THREE.Mesh); expect(tube.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    tube.geometry.computeBoundingBox(); expect(tube.geometry.boundingBox!.max.x).toBeCloseTo(3.1); expect(tube.geometry.boundingBox!.max.z).toBeCloseTo(3);
    const ray = new THREE.Raycaster(new THREE.Vector3(1.5, 5, 0), new THREE.Vector3(0, -1, 0));
    expect(ray.intersectObject(tube).length).toBeGreaterThan(0);
    // Dashes leave gaps: a ray through the first gap (0.6 m dash) misses the dashed tube.
    const dashed = buildNodeObject({ id: 'd', kind: 'line', points, width: .2, dashed: true }, context).children[0] as THREE.Mesh;
    expect(new THREE.Raycaster(new THREE.Vector3(.8, 5, 0), new THREE.Vector3(0, -1, 0)).intersectObject(dashed)).toHaveLength(0);
    expect(new THREE.Raycaster(new THREE.Vector3(.3, 5, 0), new THREE.Vector3(0, -1, 0)).intersectObject(dashed).length).toBeGreaterThan(0);
    const thin = buildNodeObject({ id: 'p', kind: 'line', points, dashed: true }, context).children[0] as THREE.Line;
    expect(thin).toBeInstanceOf(THREE.Line); expect(thin).not.toBeInstanceOf(THREE.Mesh);
    expect(thin.material).toMatchObject({ dashSize: LINE_DASH.dash, gapSize: LINE_DASH.gap });
  });

  it('takes colors from the node, then the palette, then the theme', () => {
    const shape = box('s', [1, 1, 1]);
    expect(shapeColor(shape, { theme: 'light' })).toBe(PRIMITIVE_COLORS.light.accent);
    expect(shapeColor(shape, { theme: 'midnight', palette: { accent: '#123456' } })).toBe('#123456');
    expect(shapeColor({ ...shape, state: 'critical' }, { theme: 'light', palette: { critical: '#aa0000' } })).toBe('#aa0000');
    expect(shapeColor({ ...shape, state: 'normal', color: '#00ff00' }, { theme: 'light' })).toBe('#00ff00');
    const line: LineNode = { id: 'l', kind: 'line', points: [[0, 0, 0], [1, 0, 0]] };
    expect(lineColor(line, { theme: 'midnight' })).toBe(PRIMITIVE_COLORS.midnight.structure);
    expect(lineColor(line, { theme: 'light', palette: { structure: '#222222' } })).toBe('#222222');
    const built = buildNodeObject({ ...shape, state: 'warning' }, { ...context, palette: { warning: '#ffaa00' } });
    expect((meshesOf(built)[0].material as THREE.MeshStandardMaterial).color.getHexString()).toBe(new THREE.Color('#ffaa00').getHexString());
  });
});

describe('Group, Shape and Line components', () => {
  it('exist in both adapters and render nothing on the server', () => {
    const store = createSceneStore();
    for (const name of ['Group', 'Shape', 'Line'] as const) {
      expect(ReactAdapter).toHaveProperty(name); expect(VueAdapter).toHaveProperty(name);
    }
    const children = [createElement(ReactAdapter.Group, { key: 'g', id: 'g' }), createElement(ReactAdapter.Shape, { key: 's', id: 's', parentId: 'g', shape: { type: 'sphere', radius: 1 } }), createElement(ReactAdapter.Line, { key: 'l', id: 'l', points: [[0, 0, 0], [1, 0, 0]] })];
    const Provider = ReactAdapter.DashboardProvider as FunctionComponent<{ store: SceneStore; children?: ReactNode }>;
    const html = renderReact(createElement(Provider, { store }, ...children));
    expect(html).toBe('');
  });

  it('pass shape, opacity, width and dashed through the Vue props without defaults', async () => {
    const store = createSceneStore();
    const app = createSSRApp({ render: () => h(VueAdapter.DashboardProvider, { store }, { default: () => [
      h(VueAdapter.Group, { id: 'g', route: { points: [[0, 0, 0], [1, 0, 0]], speed: 1 } }),
      h(VueAdapter.Shape, { id: 's', parentId: 'g', shape: { type: 'box', size: [1, 2, 3] }, opacity: .5 }),
      h(VueAdapter.Line, { id: 'l', points: [[0, 0, 0], [1, 0, 0]], width: .1, dashed: true }),
      h(VueAdapter.Line, { id: 'plain', points: [[0, 0, 0], [1, 0, 0]] }),
    ] }) });
    await renderVue(app);
    const nodes = new Map(store.getSnapshot().nodes.map(node => [node.id, node]));
    expect(nodes.get('g')).toMatchObject({ kind: 'group', route: { speed: 1 } });
    expect(nodes.get('s')).toMatchObject({ kind: 'shape', shape: { type: 'box', size: [1, 2, 3] }, opacity: .5, parentId: 'g' });
    expect(nodes.get('l')).toMatchObject({ kind: 'line', width: .1, dashed: true });
    expect((nodes.get('plain') as LineNode).dashed).toBeUndefined();
    expect(validateScene({ schemaVersion: 1, nodes: [...nodes.values()] }).filter(problem => problem.severity === 'error')).toEqual([]);
  });
});

describe('primitives example', () => {
  it('builds a valid scene for every data set, with the peak marker on the highest bar', () => {
    for (const seed of [0, 1, 7]) {
      const values = chartValues(seed);
      expect(values).toHaveLength(SERIES.length);
      expect(values.flat().every(value => Number.isInteger(value) && value >= 0 && value <= 100)).toBe(true);
      expect(validateScene(primitivesDefinition(values))).toEqual([]);
      const marker = primitivesDefinition(values).nodes.find(node => node.id === 'peak-marker');
      expect(marker?.label).toBe(`Peak ${peak(values).value}`);
    }
    expect(chartValues(3)).toEqual(chartValues(3)); expect(chartValues(3)).not.toEqual(chartValues(4));
  });
});
