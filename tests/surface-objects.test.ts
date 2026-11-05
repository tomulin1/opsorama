import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createSceneStore, resolveFootprint, validateNode, type AssetNode, type Footprint } from '@opsorama/core';
import { assetFootprintDefinitions, basicAssets, disposeObject, FLOOR_FINISHES, PARKING_BAY, ROAD_MODULE, ROAD_VARIANTS, SIDEWALK_VARIANTS, SURFACE_LEVELS, TERRAIN_FINISHES } from '@opsorama/renderer-three';
import { animateAsset } from '../packages/renderer-three/src/animation';
import { makeSurfacesStore, surfacesDefinition, updateSurfaces } from '../examples/surfaces-data';

type Options = Partial<AssetNode>;
const build = (asset: string, options: Options = {}, theme: 'light' | 'midnight' = 'light', palette = {}) => basicAssets[asset]({ id: asset, kind: 'asset', asset, ...options }, { theme, palette });
const resources = (object: THREE.Object3D) => { const result = new Set<THREE.BufferGeometry | THREE.Material>(); object.traverse(child => { if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) { result.add(child.geometry); result.add(child.material as THREE.Material); } }); return result; };
const named = (object: THREE.Object3D, name: string) => { const list: (THREE.Mesh | THREE.LineSegments)[] = []; object.traverse(child => { if (child.name === name && (child instanceof THREE.Mesh || child instanceof THREE.LineSegments)) list.push(child); }); return list; };
const color = (object: THREE.Object3D, name: string) => (named(object, name)[0].material as THREE.MeshStandardMaterial).color.getHexString();
const anchors = (object: THREE.Object3D) => object.children.filter(child => child.name.startsWith('anchor-')).map(child => child.name.slice(7)).sort();
const top = (object: THREE.Object3D, name: string) => new THREE.Box3().setFromObject(named(object, name)[0]).max.y;
const all = [
  ...ROAD_VARIANTS.map(variant => ['road', variant] as const), ...SIDEWALK_VARIANTS.map(variant => ['sidewalk', variant] as const),
  ...FLOOR_FINISHES.map(variant => ['floor', variant] as const), ...TERRAIN_FINISHES.map(variant => ['terrain', variant] as const),
];

describe('ground surfaces', () => {
  it('every variant is finite, static, sits on the Ground top and owns independent resources', () => {
    for (const [asset, variant] of all) {
      const first = build(asset, { variant }), second = build(asset, { variant }), bounds = new THREE.Box3().setFromObject(first);
      expect(bounds.min.y, `${asset} ${variant}`).toBeCloseTo(SURFACE_LEVELS.ground, 5);
      expect(first.userData.surfaceBounds).toEqual({ min: bounds.min.toArray(), max: bounds.max.toArray() });
      first.traverse(child => { if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) expect([...child.geometry.getAttribute('position').array].every(Number.isFinite)).toBe(true); });
      const before = first.toJSON(); animateAsset(first, { time: 4, delta: 1 }); expect(first.toJSON()).toEqual(before);
      const owned = resources(first); expect([...resources(second)].some(resource => owned.has(resource))).toBe(false);
      const release = [...owned].map(resource => vi.spyOn(resource, 'dispose')); disposeObject(first); release.forEach(spy => expect(spy).toHaveBeenCalledTimes(1)); disposeObject(second);
    }
  });

  it('declares walkable levels so terrain sits below floors and roads, and sidewalks are raised', () => {
    expect(SURFACE_LEVELS.terrain).toBeLessThan(SURFACE_LEVELS.floor); expect(SURFACE_LEVELS.ground).toBeLessThan(SURFACE_LEVELS.terrain);
    for (const [asset, slab, level] of [['road', 'road-surface', SURFACE_LEVELS.road], ['floor', 'floor-surface', SURFACE_LEVELS.floor], ['terrain', 'terrain-surface', SURFACE_LEVELS.terrain], ['sidewalk', 'sidewalk-paving', SURFACE_LEVELS.sidewalk]] as const) {
      const model = build(asset); expect(top(model, slab)).toBeCloseTo(level, 6); expect(model.userData.surfaceLevel).toBe(level); disposeObject(model);
    }
    const sidewalk = build('sidewalk'); expect(top(sidewalk, 'sidewalk-curb')).toBeCloseTo(SURFACE_LEVELS.sidewalk, 6); disposeObject(sidewalk);
    // Details float just above their own surface and never below it.
    const road = build('road', { variant: 'crosswalk' }); expect(new THREE.Box3().setFromObject(named(road, 'road-marking')[0]).min.y).toBeGreaterThan(SURFACE_LEVELS.road); disposeObject(road);
  });

  it('road tiles are 6 m modules with anchors on exactly their open edges', () => {
    const expected: Record<string, string[]> = { straight: ['end', 'start'], crosswalk: ['crossing-back', 'crossing-front', 'end', 'start'], corner: ['branch-front', 'start'], 't-junction': ['branch-front', 'end', 'start'], crossroads: ['branch-back', 'branch-front', 'end', 'start'] };
    for (const variant of ROAD_VARIANTS) {
      const model = build('road', { variant }), size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
      expect(size.x).toBeCloseTo(ROAD_MODULE, 5); expect(size.z).toBeCloseTo(ROAD_MODULE, 5);
      expect(anchors(model), variant).toEqual(expected[variant]);
      for (const name of anchors(model)) { const point = model.getObjectByName(`anchor-${name}`)!.position; expect(Math.max(Math.abs(point.x), Math.abs(point.z))).toBeCloseTo(ROAD_MODULE / 2, 6); }
      // Markings stay on the tile and their rectangles never overlap (no coplanar z-fighting).
      const marking = named(model, 'road-marking')[0] as THREE.Mesh, positions = marking.geometry.getAttribute('position');
      const rects: THREE.Box2[] = [];
      for (let i = 0; i < positions.count; i += 4) rects.push(new THREE.Box2().setFromPoints([0, 1, 2, 3].map(k => new THREE.Vector2(positions.getX(i + k), positions.getZ(i + k)))));
      for (const rect of rects) { expect(rect.min.x).toBeGreaterThanOrEqual(-3 - 1e-6); expect(rect.max.y).toBeLessThanOrEqual(3 + 1e-6); }
      for (let a = 0; a < rects.length; a++) for (let b = a + 1; b < rects.length; b++) { const overlap = rects[a].clone().intersect(rects[b]); expect(overlap.isEmpty() || overlap.getSize(new THREE.Vector2()).x * overlap.getSize(new THREE.Vector2()).y < 1e-9, `${variant} ${a}/${b}`).toBe(true); }
      disposeObject(model);
    }
    expect(() => build('road', { variant: 'roundabout' })).toThrow('Unknown road variant');
    expect(() => build('road', { footprint: [12, 6] })).toThrow('no footprint configuration');
  });

  it('sized surfaces follow footprint exactly, use variant defaults and reject out-of-range sizes', () => {
    for (const asset of ['floor', 'terrain', 'sidewalk'] as const) {
      const definition = assetFootprintDefinitions[asset];
      for (const footprint of [definition.min, definition.default, [Math.min(23.5, definition.max[0]), Math.min(4.25, definition.max[1])] as Footprint, definition.max]) {
        const model = build(asset, { footprint }), size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
        expect(size.x, `${asset} ${footprint}`).toBeCloseTo(footprint[0], 5); expect(size.z).toBeCloseTo(footprint[1], 5); disposeObject(model);
      }
      for (const footprint of [[definition.min[0] - .5, definition.default[1]], [definition.default[0], definition.max[1] + 1]] as Footprint[]) expect(() => build(asset, { footprint }), `${asset} ${footprint}`).toThrow('Footprint must be');
    }
    const corner = build('sidewalk', { variant: 'corner' }), size = new THREE.Box3().setFromObject(corner).getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(2, 5); expect(size.z).toBeCloseTo(2, 5); expect(named(corner, 'sidewalk-curb')).toHaveLength(2); disposeObject(corner);
    expect(resolveFootprint({ variant: 'parking' }, assetFootprintDefinitions.terrain)).toEqual([10, 5]);
    expect(() => validateNode({ id: 'f', kind: 'asset', asset: 'floor', footprint: [4, 0] })).toThrow('positive finite');
    expect(() => validateNode({ id: 'f', kind: 'asset', asset: 'floor', footprint: [4, Infinity] })).toThrow('positive finite');
    expect(() => validateNode({ id: 'b', kind: 'asset', asset: 'building', footprint: [4, 4] })).toThrow('building.size');
    expect(() => build('parcel', { footprint: [1, 1] })).toThrow('no footprint configuration');
    const store = createSceneStore({ schemaVersion: 1, nodes: [{ id: 'f', kind: 'asset', asset: 'floor', footprint: [4, 3] }] }), node = store.getSnapshot().nodes[0];
    expect(node.kind === 'asset' && Object.isFrozen(node.footprint)).toBe(true); store.dispose();
  });

  it('patterns keep their real size instead of stretching with the footprint', () => {
    const joints = (finish: string, footprint: Footprint) => { const model = build('floor', { variant: finish, footprint }); const count = named(model, 'floor-joint')[0].geometry.getAttribute('position').count / 2; disposeObject(model); return count; };
    // 0.6 m tiles: interior joints along each axis.
    expect(joints('tiles', [6, 3])).toBe(9 + 4); expect(joints('tiles', [12, 3])).toBe(19 + 4);
    expect(joints('concrete', [6, 6])).toBe(2); expect(joints('concrete', [9.5, 2])).toBe(3);
    // Very large plank floors keep only row joints to bound vertex count.
    expect(joints('wood', [100, 100])).toBe(499);
    const gravel = build('terrain', { variant: 'gravel', footprint: [100, 100] }), stones = named(gravel, 'terrain-detail').reduce((sum, mesh) => sum + mesh.geometry.getAttribute('position').count / 4, 0);
    expect(stones).toBeGreaterThan(2000); expect(stones).toBeLessThan(4000); disposeObject(gravel);
    // Deterministic per node: the same node renders the same pattern.
    const a = build('terrain', { variant: 'grass' }), b = build('terrain', { variant: 'grass' });
    expect(named(a, 'terrain-detail').map(mesh => [...mesh.geometry.getAttribute('position').array])).toEqual(named(b, 'terrain-detail').map(mesh => [...mesh.geometry.getAttribute('position').array]));
    disposeObject(a); disposeObject(b);
  });

  it('parking bays follow the footprint, stay inside it and face the aisle', () => {
    const single = build('terrain', { variant: 'parking', footprint: [12.5, 5] });
    expect(anchors(single)).toEqual(['bay-0', 'bay-1', 'bay-2', 'bay-3', 'bay-4']);
    const bay = single.getObjectByName('anchor-bay-1')!.position; expect(bay.x).toBeCloseTo(-2.5, 6); expect(bay.y).toBe(0); expect(bay.z).toBeCloseTo(0, 6);
    disposeObject(single);
    const double = build('terrain', { variant: 'parking', footprint: [10, 2 * PARKING_BAY.depth + 6] });
    const bays = anchors(double).map(name => double.getObjectByName(`anchor-${name}`)!);
    expect(bays).toHaveLength(8); expect(bays.filter(bay => bay.rotation.y === Math.PI)).toHaveLength(4);
    for (const bay of bays) expect(Math.sign(bay.position.z)).toBe(bay.rotation.y ? 1 : -1);
    const bounds = new THREE.Box3().setFromObject(double); expect(bounds.max.x).toBeCloseTo(5, 5); expect(bounds.max.z).toBeCloseTo(8, 5);
    disposeObject(double);
    const asphalt = build('terrain', { variant: 'asphalt' }); expect(anchors(asphalt)).toEqual([]); disposeObject(asphalt);
  });

  it('base tones follow theme and color; details use semantic roles with partial overrides', () => {
    for (const [asset, variant, slab] of [['road', 'straight', 'road-surface'], ['floor', 'wood', 'floor-surface'], ['terrain', 'grass', 'terrain-surface'], ['sidewalk', 'straight', 'sidewalk-paving']] as const) {
      const light = build(asset, { variant }), dark = build(asset, { variant }, 'midnight'), custom = build(asset, { variant, color: '#123456' }, 'midnight');
      expect(color(light, slab)).not.toBe(color(dark, slab)); expect(color(custom, slab)).toBe('123456');
      [light, dark, custom].forEach(disposeObject);
    }
    const concrete = build('floor', {}, 'light', { surface: '#abcdef' }); expect(color(concrete, 'floor-surface')).toBe('abcdef'); disposeObject(concrete);
    const road = build('road', { materials: { text: '#fedcba' } }, 'light', { text: '#111111' }); expect(color(road, 'road-marking')).toBe('fedcba'); disposeObject(road);
    const sidewalk = build('sidewalk', {}, 'light', { trim: '#222222' }); expect(color(sidewalk, 'sidewalk-curb')).toBe('222222'); disposeObject(sidewalk);
    const epoxy = build('floor', { variant: 'epoxy', materials: { accent: '#333333' } }); expect(color(epoxy, 'floor-marking')).toBe('333333'); disposeObject(epoxy);
    expect(() => build('floor', { materials: { surface: 'red' } })).toThrow();
  });

  it('decorative details never intercept picking; only the slab is hit', () => {
    const model = build('road', { variant: 'crosswalk' }), raycaster = new THREE.Raycaster(new THREE.Vector3(.4, 10, 1), new THREE.Vector3(0, -1, 0));
    model.updateMatrixWorld(true);
    expect([...new Set(raycaster.intersectObject(model, true).map(hit => hit.object.name))]).toEqual(['road-surface']);
    disposeObject(model);
  });

  it('the street fixture composes valid nodes, switches the floor finish and keeps the theme', () => {
    for (const node of surfacesDefinition.nodes) {
      expect(() => validateNode(node)).not.toThrow();
      if (node.kind === 'asset') { const model = basicAssets[node.asset](node); expect(model.children.length).toBeGreaterThan(0); disposeObject(model); }
    }
    const store = makeSurfacesStore(); updateSurfaces(store, 'wood', true);
    const terrace = store.getSnapshot().nodes.find(node => node.id === 'terrace');
    expect(terrace?.kind === 'asset' && terrace.variant).toBe('wood'); expect(store.getSnapshot().settings.theme).toBe('midnight');
    store.dispose();
  });
});
