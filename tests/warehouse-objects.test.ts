import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { resolveInteractionSlots, type AssetNode } from '@opsorama/core';
import { disposeObject } from '@opsorama/three';
import { assetCountDefinitions, assetInteractionSlots, assetLabelSurfaces, catalogAssets } from '@opsorama/objects';
import { animateAsset } from '../packages/three/src/animation';

const build = (asset: string, options: Partial<AssetNode> = {}, context?: Parameters<typeof catalogAssets[string]>[1]) => catalogAssets[asset]({ id: asset, kind: 'asset', asset, ...options }, context);
const meshes = (object: THREE.Object3D) => { const list: THREE.Mesh[] = []; object.traverse(child => { if (child instanceof THREE.Mesh) list.push(child); }); return list; };
const hex = (mesh: THREE.Mesh) => (mesh.material as THREE.MeshStandardMaterial).color.getHexString();
const parts = (object: THREE.Object3D) => { const list: THREE.Object3D[] = []; object.traverse(child => { if (child.name.startsWith('count-part-')) list.push(child); }); return list; };
const transforms = (object: THREE.Object3D) => { const values: unknown[] = []; object.traverse(child => values.push([child.position.toArray(), child.rotation.toArray(), child.scale.toArray()])); return values; };
const colored = (object: THREE.Object3D, value: string) => new Set(meshes(object).filter(mesh => hex(mesh) === value).map(mesh => mesh.name));
const worldAnchor = (object: THREE.Object3D, name: string) => { object.updateMatrixWorld(true); return object.getObjectByName(`anchor-${name}`)!.getWorldPosition(new THREE.Vector3()); };

const VARIANTS: Readonly<Record<string, readonly (string | undefined)[]>> = {
  'pallet-rack': [undefined], 'reach-truck': ['empty', 'operated'], 'stretch-wrapper': ['wrapping', 'empty'], 'carton-flow-rack': [undefined],
  'safety-barrier': ['rail', 'bollard'], 'pallet-stack': [undefined], 'ibc-tank': [undefined], 'drum-pallet': [undefined], 'bulk-bag': [undefined],
};
const COLOR_PARTS: Readonly<Record<string, readonly string[]>> = {
  'pallet-rack': ['rack-upright', 'rack-bracing'], 'reach-truck': ['reach-body'], 'stretch-wrapper': ['wrapper-mast', 'wrapper-carriage'], 'carton-flow-rack': ['flow-upright', 'flow-beam', 'flow-header'],
  'safety-barrier': ['barrier-post', 'barrier-rail'], 'ibc-tank': ['ibc-tank-body'], 'drum-pallet': ['drum-body'], 'bulk-bag': ['bag-body', 'bag-loop', 'bag-spout'],
};

describe('warehouse objects', () => {
  for (const [asset, variants] of Object.entries(VARIANTS)) for (const variant of variants) it(`${asset}${variant ? ` (${variant})` : ''} is grounded, finite and owns its resources`, () => {
    const options = variant ? { variant } : {}, first = build(asset, options), second = build(asset, options);
    expect(new THREE.Box3().setFromObject(first).min.y, asset).toBeCloseTo(0, 5);
    expect(meshes(first).every(mesh => [...mesh.geometry.getAttribute('position').array].every(Number.isFinite))).toBe(true);
    const before = transforms(first); animateAsset(first, { time: 3, delta: 1 });
    // Only a wrapping stretch wrapper has local motion: its turntable turns.
    if (asset === 'stretch-wrapper' && variant === 'wrapping') expect(transforms(first)).not.toEqual(before); else expect(transforms(first), asset).toEqual(before);
    const own = new Set(meshes(first).flatMap(mesh => [mesh.geometry, mesh.material as THREE.Material]));
    expect(meshes(second).some(mesh => own.has(mesh.geometry) || own.has(mesh.material as THREE.Material))).toBe(false);
    const release = [...own].map(resource => vi.spyOn(resource as THREE.Material, 'dispose'));
    disposeObject(first); release.forEach(spy => expect(spy).toHaveBeenCalledTimes(1)); disposeObject(second);
  });

  it('rejects unknown variants and stops the wrapper with localMotion', () => {
    for (const asset of ['stretch-wrapper', 'safety-barrier']) expect(() => build(asset, { variant: 'unknown' }), asset).toThrow(/Unknown/);
    const stopped = build('stretch-wrapper', { localMotion: false }), before = transforms(stopped); animateAsset(stopped, { time: 4, delta: 1 }); expect(transforms(stopped)).toEqual(before); disposeObject(stopped);
  });

  it('applies color to the documented parts only and inherits scene palette roles elsewhere', () => {
    for (const [asset, names] of Object.entries(COLOR_PARTS)) {
      const model = build(asset, { color: '#123456' }); expect(colored(model, '123456'), asset).toEqual(new Set(names)); disposeObject(model);
      const themed = build(asset, {}, { theme: 'midnight', palette: { structure: '#abcdef', trim: '#abcdef', screen: '#abcdef', accent: '#abcdef' } });
      expect(colored(themed, 'abcdef').size, asset).toBeGreaterThan(0); disposeObject(themed);
    }
  });

  it('stacks pallets of the size of the pallet object', () => {
    const size = (model: THREE.Object3D) => { const box = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()); disposeObject(model); return box; };
    const single = size(build('pallet', { count: 0 })), stack = size(build('pallet-stack', { count: 1 })), tall = size(build('pallet-stack', { count: 12 }));
    expect(stack.x).toBeCloseTo(single.x, 1); expect(stack.y).toBeCloseTo(single.y, 5); expect(stack.z).toBeCloseTo(single.z, 1);
    expect(tall.y).toBeCloseTo(single.y * 12, 5);
  });

  it('fills fixed count slots without moving existing parts or growing the frames', () => {
    for (const asset of ['pallet-rack', 'carton-flow-rack', 'pallet-stack', 'drum-pallet']) {
      const definition = assetCountDefinitions[asset]; if (definition.kind !== 'range') throw new Error('range expected');
      const full = build(asset, { count: definition.max }); full.updateMatrixWorld(true);
      const slots = parts(full).map(part => part.getWorldPosition(new THREE.Vector3()).toArray().map(value => value.toFixed(4)).join(','));
      expect(new Set(slots).size, asset).toBe(definition.max);
      for (let count = definition.min; count <= definition.max; count++) {
        const model = build(asset, { count }); model.updateMatrixWorld(true);
        expect(parts(model).map(part => part.getWorldPosition(new THREE.Vector3()).toArray().map(value => value.toFixed(4)).join(',')), `${asset} ${count}`).toEqual(slots.slice(0, count)); disposeObject(model);
      }
      for (const count of [definition.min - 1, definition.max + 1, 1.5]) expect(() => build(asset, { count }), asset).toThrow();
      disposeObject(full);
    }
    // Frames keep their width and height; pallet loads overhang the rack depth slightly, as real 1.2 m pallets do.
    for (const [asset, max] of [['pallet-rack', 6], ['carton-flow-rack', 12]] as const) {
      const empty = build(asset, { count: 0 }), full = build(asset, { count: max }), a = new THREE.Box3().setFromObject(empty), b = new THREE.Box3().setFromObject(full);
      [[a.min.x, b.min.x], [a.max.x, b.max.x], [a.min.y, b.min.y], [a.max.y, b.max.y]].forEach(([before, after]) => expect(after, asset).toBeCloseTo(before, 5)); [empty, full].forEach(disposeObject);
    }
  });

  it('lights flow-rack lanes only while they hold cartons', () => {
    const rack = build('carton-flow-rack', { count: 5 }), lit = meshes(rack).filter(mesh => mesh.name === 'flow-pick-led' && (mesh.material as THREE.MeshStandardMaterial).emissive.getHex() !== 0);
    expect(lit).toHaveLength(5); disposeObject(rack);
  });

  it('exposes anchors that follow the geometry', () => {
    const rack = build('pallet-rack'); expect(worldAnchor(rack, 'slot-4').y).toBeGreaterThan(3); expect(worldAnchor(rack, 'slot-0').z).toBeGreaterThan(.5); disposeObject(rack);
    const rail = build('safety-barrier'); expect(worldAnchor(rail, 'start').x).toBe(-1); expect(worldAnchor(rail, 'end').x).toBe(1); disposeObject(rail);
    const truck = build('reach-truck'); expect(worldAnchor(truck, 'load').z).toBeGreaterThan(.8); disposeObject(truck);
    const wrapper = build('stretch-wrapper'); expect(worldAnchor(wrapper, 'table').y).toBeGreaterThan(.1); disposeObject(wrapper);
  });

  it('keeps reach truck and wrapper geometry neutral under host alerts', () => {
    for (const asset of ['reach-truck', 'stretch-wrapper']) {
      const model = build(asset, { state: 'critical' }, { theme: 'light', palette: { critical: '#fedcba' } });
      expect(meshes(model).some(mesh => hex(mesh) === 'fedcba'), asset).toBe(false); disposeObject(model);
    }
  });

  it('declares interaction slots and the flow-rack label surface', () => {
    expect(resolveInteractionSlots({ id: 'rack', kind: 'asset', asset: 'pallet-rack' }, assetInteractionSlots['pallet-rack']).map(slot => slot.name)).toEqual(['load']);
    expect(resolveInteractionSlots({ id: 'flow', kind: 'asset', asset: 'carton-flow-rack' }, assetInteractionSlots['carton-flow-rack']).map(slot => slot.name)).toEqual(['pick', 'replenish']);
    expect(resolveInteractionSlots({ id: 'wrap', kind: 'asset', asset: 'stretch-wrapper' }, assetInteractionSlots['stretch-wrapper']).map(slot => slot.name)).toEqual(['operate']);
    expect(assetLabelSurfaces['carton-flow-rack'].position[2]).toBeGreaterThan(.62);
  });
});
