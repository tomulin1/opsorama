import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { resolveInteractionSlots, type AssetNode } from '@opsorama/core';
import { assetCountDefinitions, assetInteractionSlots, assetLabelSurfaces, basicAssets, disposeObject } from '@opsorama/renderer-three';
import { animateAsset } from '../packages/renderer-three/src/animation';

const build = (asset: string, options: Partial<AssetNode> = {}, context?: Parameters<typeof basicAssets[string]>[1]) => basicAssets[asset]({ id: asset, kind: 'asset', asset, ...options }, context);
const meshes = (object: THREE.Object3D) => { const list: THREE.Mesh[] = []; object.traverse(child => { if (child instanceof THREE.Mesh) list.push(child); }); return list; };
const hex = (mesh: THREE.Mesh) => (mesh.material as THREE.MeshStandardMaterial).color.getHexString();
const parts = (object: THREE.Object3D) => { const list: THREE.Object3D[] = []; object.traverse(child => { if (child.name.startsWith('count-part-')) list.push(child); }); return list; };
const transforms = (object: THREE.Object3D) => { const values: unknown[] = []; object.traverse(child => values.push([child.position.toArray(), child.rotation.toArray(), child.scale.toArray()])); return values; };
const colored = (object: THREE.Object3D, value: string) => new Set(meshes(object).filter(mesh => hex(mesh) === value).map(mesh => mesh.name));
const worldAnchor = (object: THREE.Object3D, name: string) => { object.updateMatrixWorld(true); return object.getObjectByName(`anchor-${name}`)!.getWorldPosition(new THREE.Vector3()); };
const size = (object: THREE.Object3D) => new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());

const VARIANTS: Readonly<Record<string, readonly (string | undefined)[]>> = {
  valve: ['open', 'closed'], 'tower-crane': [undefined], 'gantry-crane': [undefined], aircraft: [undefined], 'baggage-cart': [undefined], 'hospital-bed': [undefined],
  'service-cart': [undefined], 'kitchen-station': ['cooking', 'prep'], tractor: [undefined], 'grain-silo': [undefined], 'event-stage': [undefined], 'exhibition-booth': [undefined],
};
/** Parts that `color` changes; every other part keeps its palette role. */
const COLOR_PARTS: Readonly<Record<string, readonly string[]>> = {
  valve: ['valve-lever-arm'], 'tower-crane': ['crane-mast', 'crane-jib', 'crane-counter-jib', 'crane-cab', 'crane-cat-head'], 'gantry-crane': ['gantry-sill', 'gantry-leg', 'gantry-brace', 'gantry-girder'],
  aircraft: ['aircraft-stripe', 'aircraft-fin'], 'baggage-cart': ['cart-canopy', 'cart-back-panel', 'cart-curtain'], 'hospital-bed': ['bed-blanket'], 'service-cart': ['cart-drawer'],
  'kitchen-station': ['kitchen-backsplash'], tractor: ['tractor-fender', 'tractor-hood', 'tractor-cab-roof'], 'grain-silo': ['silo-shell', 'silo-roof'], 'event-stage': ['stage-skirt'],
  'exhibition-booth': ['booth-header', 'booth-counter-panel', 'booth-banner'],
};

describe('industry, airport, care, farm and event objects', () => {
  for (const [asset, variants] of Object.entries(VARIANTS)) for (const variant of variants) it(`${asset}${variant ? ` (${variant})` : ''} is grounded, finite, static and owns its resources`, () => {
    const options = variant ? { variant } : {}, first = build(asset, options), second = build(asset, options);
    expect(new THREE.Box3().setFromObject(first).min.y, asset).toBeCloseTo(0, 5);
    expect(meshes(first).every(mesh => [...mesh.geometry.getAttribute('position').array].every(Number.isFinite))).toBe(true);
    const before = transforms(first); animateAsset(first, { time: 3, delta: 1 }); expect(transforms(first), asset).toEqual(before);
    const own = new Set(meshes(first).flatMap(mesh => [mesh.geometry, mesh.material as THREE.Material]));
    expect(meshes(second).some(mesh => own.has(mesh.geometry) || own.has(mesh.material as THREE.Material))).toBe(false);
    const release = [...own].map(resource => vi.spyOn(resource as THREE.Material, 'dispose'));
    disposeObject(first); release.forEach(spy => expect(spy).toHaveBeenCalledTimes(1)); disposeObject(second);
  });

  it('rejects unknown variants', () => {
    for (const asset of Object.keys(VARIANTS).filter(key => VARIANTS[key][0] !== undefined)) expect(() => build(asset, { variant: 'unknown' }), asset).toThrow(/Unknown/);
  });

  it('applies color to the documented parts only and inherits scene palette roles elsewhere', () => {
    for (const [asset, names] of Object.entries(COLOR_PARTS)) {
      const model = build(asset, { color: '#123456' }); expect(colored(model, '123456'), asset).toEqual(new Set(names)); disposeObject(model);
      const themed = build(asset, {}, { theme: 'midnight', palette: { structure: '#abcdef', trim: '#abcdef', screen: '#abcdef' } });
      expect(colored(themed, 'abcdef').size, asset).toBeGreaterThan(0); disposeObject(themed);
    }
  });

  it('turns the valve lever across the pipe when closed', () => {
    const lever = (variant: string) => { const valve = build('valve', { variant }); valve.updateMatrixWorld(true); const arm = new THREE.Box3().setFromObject(valve.getObjectByName('valve-lever-arm')!).getSize(new THREE.Vector3()); disposeObject(valve); return arm; };
    expect(lever('open').x).toBeGreaterThan(lever('open').z); expect(lever('closed').z).toBeGreaterThan(lever('closed').x);
  });

  it('keeps disclosed sizes and anchors that follow the geometry', () => {
    const crane = build('tower-crane'); expect(size(crane).y).toBeGreaterThan(20); expect(worldAnchor(crane, 'hook').x).toBeCloseTo(9); disposeObject(crane);
    const plane = build('aircraft'), span = size(plane); expect(span.x).toBeGreaterThan(16); expect(span.z).toBeGreaterThan(18);
    expect(worldAnchor(plane, 'door').x).toBeLessThan(-1); expect(worldAnchor(plane, 'cargo').x).toBeGreaterThan(1); expect(worldAnchor(plane, 'nose').z).toBeGreaterThan(8); disposeObject(plane);
    const gantry = build('gantry-crane'); expect(size(gantry).x).toBeGreaterThan(8); expect(worldAnchor(gantry, 'hook').y).toBeGreaterThan(2.5); disposeObject(gantry);
    const tractor = build('tractor'); expect(worldAnchor(tractor, 'hitch').z).toBeLessThan(-1.5); disposeObject(tractor);
    const silo = build('grain-silo'); expect(worldAnchor(silo, 'inlet').y).toBeGreaterThan(7.5); disposeObject(silo);
    const stage = build('event-stage'); expect(worldAnchor(stage, 'stage').y).toBeCloseTo(1); expect(worldAnchor(stage, 'audience').z).toBeGreaterThan(5); disposeObject(stage);
    const bed = build('hospital-bed'); expect(worldAnchor(bed, 'patient').y).toBeGreaterThan(.7); disposeObject(bed);
  });

  it('fills fixed baggage slots without moving existing bags', () => {
    const definition = assetCountDefinitions['baggage-cart']; if (definition.kind !== 'range') throw new Error('range expected');
    const full = build('baggage-cart', { count: definition.max }), slots = parts(full).map(part => part.position.toArray().join(','));
    expect(new Set(slots).size).toBe(definition.max);
    for (let count = definition.min; count <= definition.max; count++) { const cart = build('baggage-cart', { count }); expect(parts(cart).map(part => part.position.toArray().join(','))).toEqual(slots.slice(0, count)); disposeObject(cart); }
    for (const count of [-1, definition.max + 1, 2.5]) expect(() => build('baggage-cart', { count })).toThrow();
    full.updateMatrixWorld(true); const boxes = parts(full).map(part => new THREE.Box3().setFromObject(part));
    for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) expect(boxes[a].intersectsBox(boxes[b])).toBe(false);
    disposeObject(full);
  });

  it('declares interaction slots and label surfaces', () => {
    for (const [asset, slot] of [['hospital-bed', 'care'], ['service-cart', 'push'], ['kitchen-station', 'cook'], ['exhibition-booth', 'visit']] as const) {
      expect(resolveInteractionSlots({ id: asset, kind: 'asset', asset }, assetInteractionSlots[asset]).map(item => item.name), asset).toEqual([slot]);
    }
    expect(assetLabelSurfaces['event-stage'].position[2]).toBeGreaterThan(-2.3); expect(assetLabelSurfaces['exhibition-booth'].position[2]).toBeGreaterThan(-1.38);
  });
});
